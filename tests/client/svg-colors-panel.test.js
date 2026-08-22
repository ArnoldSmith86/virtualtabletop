import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { $, $a } from '../../client/js/domhelpers.js';
import { contrastAnyColor } from '../../client/js/color.js';

// jsonedit.js is a plain script that gets concatenated into the editor bundle, so evaluate just the
// SVG color panel out of its scope and hand it the globals it reaches through that bundle
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/js/jsonedit.js'), 'utf8');
const jsoneditSource = source.match(/^function jeSVGColors[\s\S]*?^}/m)[0];

// the same for the button's show(), which decides whether the panel is offered at all
const checkIfSVGSource = source.match(/^async function checkIfSVG[\s\S]*?^}/m)[0];
const showSource = source.match(/id: 'je_SVGColors'[\s\S]*?show: (function[\s\S]*?\n    })/)[1];

function panelFor(widgetState, fetchSVG, jeSetAndSelect = _=>{}) {
  return new Function('fetchSVG', 'jeStateNow', 'jeSetAndSelect', '$', '$a', 'contrastAnyColor', `${jsoneditSource};
    return jeSVGColors;
  `)(fetchSVG, widgetState, jeSetAndSelect, $, $a, contrastAnyColor);
}

function buttonShowFor(widgetState, fetchSVG, jeIsSVG, jeShowCommands = _=>{}) {
  return new Function('fetchSVG', 'jeStateNow', 'jeIsSVG', 'jeShowCommands', `${checkIfSVGSource};
    return ${showSource};
  `)(fetchSVG, widgetState, jeIsSVG, jeShowCommands);
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
  document.body.insertAdjacentHTML('beforeend', '<div id="w_w1" class="selectedInEdit"></div>');
  panelFor({ id: 'w1', image: '/assets/4_4' }, _=>Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#abcdef"/></svg>'))();
  await tick();

  $('#w_w1').classList.remove('selectedInEdit');
  await tick();
  expect($('#jeSVGColors')).toBe(null);

  // the panel reinserts itself whenever #jeCommands is rebuilt - that has to stop as well, or the
  // color buttons left over from one widget write svgReplaces onto whichever widget is selected next
  $('#jeCommands').appendChild(document.createElement('div'));
  await tick();
  expect($('#jeSVGColors')).toBe(null);

  $('#w_w1').remove();
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
  expect(jeIsSVG).toEqual({});

  fileArrives = true;
  expect(buttonShowFor(widget, fetchSVG, jeIsSVG)()).toBe(false);
  await tick();
  expect(jeIsSVG).toEqual({ '/assets/5_5': true });
  expect(buttonShowFor(widget, fetchSVG, jeIsSVG)()).toBe(true);
});

test('an image that could not be read is not requested over and over', async () => {
  // nothing is cached for a file that could not be read, so every redraw of the buttons asks for it
  // again - which means the failure itself must not redraw them, or the pane rebuilds and refetches
  // without ever stopping and the property list below cannot even be scrolled
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

  // the next redraw does try the file again, in step with the retry fetchSVG() does for it anyway
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
