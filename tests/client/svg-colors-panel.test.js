import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { $, $a, escapeID } from '../../client/js/domhelpers.js';
import { contrastAnyColor } from '../../client/js/color.js';

// jsonedit.js is a plain script that gets concatenated into the editor bundle, so evaluate just the
// SVG color panel out of its scope and hand it the globals it reaches through that bundle
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/js/jsonedit.js'), 'utf8');
const jsoneditSource = source.match(/^function jeSVGColors[\s\S]*?^}/m)[0];

// the same for the button's show(), which decides whether the panel is offered at all
const checkIfSVGSource = source.match(/^async function checkIfSVG[\s\S]*?^}/m)[0];
const showSource = source.match(/id: 'je_SVGColors'[\s\S]*?show: (function[\s\S]*?\n    })/)[1];
const jeSVGRetryDelay = +source.match(/const jeSVGRetryDelay = (\d+);/)[1];

function panelFor(widgetState, fetchSVG, jeWidget = null, jeSetAndSelect = _=>{}) {
  return new Function('fetchSVG', 'jeStateNow', 'jeWidget', 'jeSetAndSelect', '$', '$a', 'contrastAnyColor', `${jsoneditSource};
    return jeSVGColors;
  `)(fetchSVG, widgetState, jeWidget, jeSetAndSelect, $, $a, contrastAnyColor);
}

// the widget object the editor holds for the selection - the panel asks it for its DOM element
// rather than looking the element up by the id, because the DOM id is the escaped one
function widgetOnSurface(id) {
  const domElement = document.createElement('div');
  domElement.id = 'w_' + escapeID(id);
  domElement.className = 'selectedInEdit';
  document.body.appendChild(domElement);
  return { domElement };
}

function buttonShowFor(widgetState, fetchSVG, jeIsSVG, jeShowCommands = _=>{}) {
  return new Function('fetchSVG', 'jeStateNow', 'jeIsSVG', 'jeShowCommands', 'jeSVGRetryDelay', `${checkIfSVGSource};
    return ${showSource};
  `)(fetchSVG, widgetState, jeIsSVG, jeShowCommands, jeSVGRetryDelay);
}

const tick = _=>new Promise(resolve => setTimeout(resolve, 0));

// what the panel put where the color buttons go
const panelText = _=>$('#jeSVGColors .jeSVGColorsBody').textContent;
const colorButtons = _=>[ ...$a('#jeSVGColors .jeSVGColorList button') ].map(button => button.getAttribute('data-color'));
const markedAsMapped = _=>[ ...$a('#jeSVGColors .jeSVGColorList button.jeSVGColorMapped') ].map(button => button.getAttribute('data-color'));

beforeEach(() => {
  document.body.insertAdjacentHTML('beforeend', '<div id="jeCommands"><div id="jeTopButtons"></div></div>');
});

afterEach(() => {
  $('#jeCommands').remove();
});

test('the panel offers every color the SVG uses', async () => {
  const widget = { id: 'w1', image: '/assets/1_1' };
  panelFor(widget, _=>Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#3366cc" stroke="currentColor"/></svg>'))();
  await tick();

  expect(colorButtons()).toEqual([ '#3366cc', 'currentColor' ]);

  // clicking one maps it to a property the user then fills in
  $('#jeSVGColors .jeSVGColorList button').dispatchEvent(new Event('click'));
  expect(widget.svgReplaces).toEqual({ '#3366cc': '###SELECT ME###' });
});

test('an image that could not be loaded is reported in the panel', async () => {
  // fetch() rejects for a cross-origin image blocked by CORS, for a server that is not answering
  // and for a URL that 404s. An unhandled rejection is reported as a client crash and closes the
  // session, so the panel has to answer for it - tests/client/setup.js turns one into a failure.
  panelFor({ id: 'w1', image: 'https://example.com/blocked.svg' }, _=>Promise.reject(new TypeError('Failed to fetch')))();
  await tick();

  expect(colorButtons()).toEqual([]);
  expect(panelText()).toMatch(/could not be loaded/);
});

test('an image that is not an SVG is reported in the panel', async () => {
  // a file whose name ends in .svg but that is a bitmap: nothing in it can be replaced, and
  // scanning its bytes for color-shaped text would offer replacements that do nothing
  panelFor({ id: 'w1', image: 'https://example.com/board.svg' }, _=>Promise.resolve(null))();
  await tick();

  expect(colorButtons()).toEqual([]);
  expect(panelText()).toMatch(/not an SVG/);
});

test('an SVG without replaceable colors is reported in the panel', async () => {
  // named colors, rgb() and colors coming from a <style> block are common in hand-written SVGs and
  // none of them can be replaced - saying so beats an empty panel that looks like it is still loading
  panelFor({ id: 'w1', image: '/assets/2_2' }, _=>Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="red"/></svg>'))();
  await tick();

  expect(colorButtons()).toEqual([]);
  expect(panelText()).toMatch(/Only hex colors/);
});

test('the panel says it is loading while the image is on its way', async () => {
  let deliverSVG;
  panelFor({ id: 'w1', image: '/assets/3_3' }, _=>new Promise(resolve => deliverSVG = resolve))();

  expect(panelText()).toMatch(/Loading/);

  deliverSVG('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#abcdef"/></svg>');
  await tick();
  expect(colorButtons()).toEqual([ '#abcdef' ]);
});

test('deselecting the widget closes the panel for good', async () => {
  // an everyday id: the element is 'w_card__1', so '#w_card_1' would find nothing at all
  const widget = widgetOnSurface('card_1');
  panelFor({ id: 'card_1', image: '/assets/4_4' }, _=>Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#abcdef"/></svg>'), widget)();
  await tick();

  widget.domElement.classList.remove('selectedInEdit');
  await tick();
  expect($('#jeSVGColors')).toBe(null);

  // the panel reinserts itself whenever #jeCommands is rebuilt - that has to stop as well, or the
  // color buttons left over from one widget write svgReplaces onto whichever widget is selected next
  $('#jeCommands').appendChild(document.createElement('div'));
  await tick();
  expect($('#jeSVGColors')).toBe(null);

  widget.domElement.remove();
});

test('a widget id that is no valid selector does not break the panel', async () => {
  // '#w_Deck (red)' is a syntax error querySelector throws over, and that throw would reach the
  // caller as the unhandled rejection this panel exists to keep out of the session
  const widget = widgetOnSurface('Deck (red)');
  panelFor({ id: 'Deck (red)', image: '/assets/9_9' }, _=>Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#abcdef"/></svg>'), widget)();
  await tick();

  expect(colorButtons()).toEqual([ '#abcdef' ]);

  widget.domElement.classList.remove('selectedInEdit');
  await tick();
  expect($('#jeSVGColors')).toBe(null);

  widget.domElement.remove();
});

test('the panel closes when the widget is given another image', async () => {
  // it lists the colors of one file, names that file in its messages and retries that file
  const widget = { id: 'w1', image: '/assets/4_4' };
  panelFor(widget, _=>Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#abcdef"/></svg>'))();
  await tick();
  expect(colorButtons()).toEqual([ '#abcdef' ]);

  widget.image = '/assets/5_5';
  $('#jeCommands').appendChild(document.createElement('div'));
  await tick();
  expect($('#jeSVGColors')).toBe(null);
});

test('a swatch never writes into a widget showing another image', async () => {
  const widget = { id: 'w1', image: '/assets/4_4' };
  panelFor(widget, _=>Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#abcdef"/></svg>'))();
  await tick();

  widget.image = '/assets/5_5';
  $('#jeSVGColors .jeSVGColorList button').dispatchEvent(new Event('click'));
  expect(widget.svgReplaces).toBe(undefined);
});

test('hex colors with an alpha channel are offered as well', async () => {
  // getSVG() replaces the string it is handed, so #abcd and #33aabbcc are as replaceable as any
  // other color - saying the file uses none would be plain wrong for an SVG painted in them
  panelFor({ id: 'w1', image: '/assets/a_a' }, _=>Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#abcd"/><rect fill="#33aabbcc"/><rect fill="#abcdef"/></svg>'))();
  await tick();

  expect(colorButtons()).toEqual([ '#abcd', '#33aabbcc', '#abcdef' ]);
});

test('an image that could not be read does not hide the button for the session', async () => {
  // fetchSVG() retries a file it could not read, so a request that failed once must not be
  // remembered as "not an SVG" - only a definite answer is worth caching
  const jeIsSVG = {};
  const widget = { id: 'w1', image: '/assets/5_5' };
  let fileArrives = false;
  const fetchSVG = _=>fileArrives ? Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"/>') : Promise.reject(new TypeError('Failed to fetch'));

  expect(buttonShowFor(widget, fetchSVG, jeIsSVG)()).toBe(false);
  await tick();
  expect(typeof jeIsSVG['/assets/5_5'].failedAt).toBe('number');

  fileArrives = true;
  jeIsSVG['/assets/5_5'].failedAt -= 60000;
  expect(buttonShowFor(widget, fetchSVG, jeIsSVG)()).toBe(false);
  await tick();
  expect(jeIsSVG).toEqual({ '/assets/5_5': true });
  expect(buttonShowFor(widget, fetchSVG, jeIsSVG)()).toBe(true);
});

test('an image that could not be read is not requested over and over', async () => {
  // the buttons are redrawn by every keystroke in the JSON pane, so a file that could not be read
  // has to be remembered as unreadable until the retry delay is over - and the failure itself must
  // not redraw them either, or the pane rebuilds and refetches without ever stopping and the
  // property list below cannot even be scrolled
  const jeIsSVG = {};
  let fetches = 0;
  const fetchSVG = _=>{
    fetches++;
    return Promise.reject(new TypeError('Failed to fetch'));
  };
  let show;
  const redrawTheButtons = _=>{ if(fetches < 20) show(); };
  show = buttonShowFor({ id: 'w1', image: '/assets/6_6' }, fetchSVG, jeIsSVG, redrawTheButtons);

  show();
  show();
  for(let i=0; i<10; i++)
    await tick();
  expect(fetches).toBe(1);

  // every keystroke redraws the buttons, and none of those redraws asks for the file again
  for(let i=0; i<10; i++)
    show();
  await tick();
  expect(fetches).toBe(1);

  // once the retry delay is over it is tried again, in step with the retry the engine does for it
  jeIsSVG['/assets/6_6'].failedAt -= 60000;
  show();
  await tick();
  expect(fetches).toBe(2);
});

test('a color that already has a replacement is checked off in the palette', async () => {
  const widget = { id: 'w1', image: '/assets/7_7', svgReplaces: { '#3366cc': 'red' } };
  panelFor(widget, _=>Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#3366cc"/><rect fill="#abcdef"/></svg>'))();
  await tick();

  expect(markedAsMapped()).toEqual([ '#3366cc' ]);

  // a palette of a whole deck of cards is worked through one color at a time, so a click has to show
  $a('#jeSVGColors .jeSVGColorList button')[1].dispatchEvent(new Event('click'));
  expect(markedAsMapped()).toEqual([ '#3366cc', '#abcdef' ]);
});

test('a request that failed can be retried from the panel', async () => {
  // fetchSVG() forgets a request that failed, so the file really is asked for again
  let fileArrives = false;
  const fetchSVG = _=>fileArrives ? Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#abcdef"/></svg>') : Promise.reject(new TypeError('Failed to fetch'));
  panelFor({ id: 'w1', image: '/assets/8_8' }, fetchSVG)();
  await tick();

  expect(panelText()).toMatch(/could not be loaded/);

  fileArrives = true;
  $('#jeSVGColors .jeSVGColorsBody button').dispatchEvent(new Event('click'));
  await tick();
  expect(colorButtons()).toEqual([ '#abcdef' ]);
});

test('the panel names the image it is talking about', async () => {
  // the panel is a narrow column and the image property it answers for is easily scrolled out of
  // the JSON pane, so "this image" alone does not say which file did not load
  panelFor({ id: 'w1', image: 'https://example.com/pieces/blocked.svg' }, _=>Promise.reject(new TypeError('Failed to fetch')))();
  await tick();

  expect(panelText()).toMatch('https://example.com/pieces/blocked.svg');
});
