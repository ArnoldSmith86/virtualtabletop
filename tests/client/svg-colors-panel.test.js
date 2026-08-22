import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { $, $a } from '../../client/js/domhelpers.js';
import { contrastAnyColor } from '../../client/js/color.js';

// jsonedit.js is a plain script that gets concatenated into the editor bundle, so evaluate just the
// SVG color panel out of its scope and hand it the globals it reaches through that bundle
const jsoneditSource = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/js/jsonedit.js'), 'utf8').match(/^function jeSVGColors[\s\S]*?^}/m)[0];

function panelFor(widgetState, fetchSVG, jeSetAndSelect = _=>{}) {
  return new Function('fetchSVG', 'jeStateNow', 'jeSetAndSelect', '$', '$a', 'contrastAnyColor', `${jsoneditSource};
    return jeSVGColors;
  `)(fetchSVG, widgetState, jeSetAndSelect, $, $a, contrastAnyColor);
}

// what the panel put where the color buttons go
const panelText = _=>$('#jeSVGColors > div').textContent;
const colorButtons = _=>[ ...$a('#jeSVGColors > div button') ].map(button => button.getAttribute('data-color'));

beforeEach(() => {
  document.body.insertAdjacentHTML('beforeend', '<div id="jeCommands"><div id="jeTopButtons"></div></div>');
});

afterEach(() => {
  $('#jeCommands').remove();
});

test('the panel offers every color the SVG uses', async () => {
  const widget = { id: 'w1', image: '/assets/1_1' };
  panelFor(widget, _=>Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#3366cc" stroke="currentColor"/></svg>'))();
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(colorButtons()).toEqual([ '#3366cc', 'currentColor' ]);

  // clicking one maps it to a property the user then fills in
  $('#jeSVGColors > div button').dispatchEvent(new Event('click'));
  expect(widget.svgReplaces).toEqual({ '#3366cc': '###SELECT ME###' });
});

test('an image that could not be loaded is reported in the panel', async () => {
  // fetch() rejects for a cross-origin image blocked by CORS, for a server that is not answering
  // and for a URL that 404s. An unhandled rejection is reported as a client crash and closes the
  // session, so the panel has to answer for it - tests/client/setup.js turns one into a failure.
  panelFor({ id: 'w1', image: 'https://example.com/blocked.svg' }, _=>Promise.reject(new TypeError('Failed to fetch')))();
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(colorButtons()).toEqual([]);
  expect(panelText()).toMatch(/could not be loaded/);
});

test('an image that is not an SVG is reported in the panel', async () => {
  // a file whose name ends in .svg but that is a bitmap: nothing in it can be replaced, and
  // scanning its bytes for color-shaped text would offer replacements that do nothing
  panelFor({ id: 'w1', image: 'https://example.com/board.svg' }, _=>Promise.resolve(null))();
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(colorButtons()).toEqual([]);
  expect(panelText()).toMatch(/not an SVG/);
});
