import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// symbols.js belongs to the room bundle, which server/minify.mjs concatenates - so it uses the helpers of
// the other files as globals instead of importing them. Evaluate its source with stubs for the ones the
// picker needs, the way the sound picker tests do for audio.js.
const dir = path.dirname(fileURLToPath(import.meta.url));
const symbolsSource = fs.readFileSync(path.join(dir, '../../client/js/symbols.js'), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/^export /gm, '');

function loadPicker(symbolData, fetchGate=Promise.resolve()) {
  document.body.innerHTML = `
    <button id="statesButton"></button>
    <div id="symbolPickerOverlay">
      <button icon="close"></button>
      <input placeholder="Search icons" />
      <div id="symbolList"></div>
      <div id="symbolNoResults"></div>
    </div>
  `;

  const scope = new Function('$', '$a', 'showOverlay', 'toggleClass', 'fetch', 'detailsOverlay', `
    ${symbolsSource};
    return { pickSymbol, loadSymbolPicker };
  `)(
    (selector, parent=document) => parent.querySelector(selector),
    (selector, parent=document) => [ ...parent.querySelectorAll(selector) ],
    () => {},
    (element, className, active) => element.classList.toggle(className, !!active),
    async () => { await fetchGate; return { json: async () => symbolData }; },
    null
  );

  const overlay = document.getElementById('symbolPickerOverlay');
  return Object.assign(scope, {
    overlay,
    input: overlay.querySelector('input'),
    // the filter waits for a pause in the typing, so give it one
    search: async query => {
      overlay.querySelector('input').value = query;
      overlay.querySelector('input').onkeyup();
      await new Promise(resolve => setTimeout(resolve, 200));
    },
    icon: symbol => document.querySelector(`#symbolList i[data-symbol="${symbol}"]`),
    // what the user sees: the flex order first, then the order of the list itself
    visibleOrder: _=>[ ...document.querySelectorAll('#symbolList i:not(.hidden)') ]
      .map((el, index) => ({ el, index, order: parseInt(el.style.order) || 0 }))
      .sort((a, b) => a.order - b.order || a.index - b.index)
      .map(entry => entry.el.dataset.symbol)
  });
}

const smallSymbolData = {
  'Material Symbols - Common Actions': {
    'grade': [ 'star', 'rate' ],
    'star_rate': [ 'star' ],
    'star (FILL+NOFILL)': [ 'favorite', 'rating' ],
    'stadium': [ 'star' ]
  },
  'game-icons.net - Shapes': {
    'lorc/star': [ 0, 'star', 'shiny' ],
    'delapouite/sun': [ 1, 'light' ]
  }
};

describe('the icon picker overlay', () => {
  test('a search puts the icon named like the query first, then name matches, then keyword matches', async () => {
    const picker = loadPicker(smallSymbolData);
    const picked = picker.pickSymbol();
    await new Promise(resolve => setTimeout(resolve, 0)); // symbols.json is fetched
    expect(picker.visibleOrder()).toEqual([ 'grade', 'star_rate', 'star', 'star_NOFILL', 'stadium', 'lorc/star', 'delapouite/sun' ]);

    await picker.search('star');
    // both variants of the icon called "star" and the game-icon of that name, then "star_rate", then the
    // icons that only have it as a keyword - each group in the order of symbols.json
    expect(picker.visibleOrder()).toEqual([ 'star', 'star_NOFILL', 'lorc/star', 'star_rate', 'grade', 'stadium' ]);
    expect(picker.icon('delapouite/sun').classList.contains('hidden')).toBe(true);

    picker.icon('star').click();
    expect((await picked).symbol).toBe('star');
  });

  test('opening the picker while the background preload is still running still binds the icons', async () => {
    let symbolsJsonArrived;
    const picker = loadPicker(smallSymbolData, new Promise(resolve => symbolsJsonArrived = resolve));

    picker.loadSymbolPicker();          // the unawaited preload of addRichtextControls()
    const picked = picker.pickSymbol(); // the author opens the picker before symbols.json is there
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(picker.icon('star')).toBe(null); // the list has not been built yet

    symbolsJsonArrived();
    await new Promise(resolve => setTimeout(resolve, 0));
    picker.icon('star').click();
    expect((await picked).symbol).toBe('star');
  });

  test('clearing the search brings back the categories and the original order', async () => {
    const picker = loadPicker(smallSymbolData);
    picker.pickSymbol();
    await new Promise(resolve => setTimeout(resolve, 0));

    await picker.search('star');
    expect([ ...document.querySelectorAll('#symbolList h2:not(#symbolMoreMatches)') ].every(h2 => h2.classList.contains('hidden'))).toBe(true);

    await picker.search('');
    expect(picker.visibleOrder()).toEqual([ 'grade', 'star_rate', 'star', 'star_NOFILL', 'stadium', 'lorc/star', 'delapouite/sun' ]);
    expect([ ...document.querySelectorAll('#symbolList i') ].some(icon => icon.style.order || icon.classList.contains('bigPreview'))).toBe(false);
    expect([ ...document.querySelectorAll('#symbolList h2:not(#symbolMoreMatches)') ].some(h2 => h2.classList.contains('hidden'))).toBe(false);
  });

  test('a search says how it found nothing, and the outlined variant explains itself', async () => {
    const picker = loadPicker(smallSymbolData);
    picker.pickSymbol();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(picker.icon('star_NOFILL').title).toBe('material-symbols: star (outlined)');

    await picker.search('nothing');
    expect(picker.overlay.classList.contains('noResults')).toBe(true);
    expect(document.getElementById('symbolNoResults').textContent).toBe('No icons match "nothing".');
  });

  test('only the best 100 matches get the large previews, the rest goes below "More matches"', async () => {
    const many = { 'Material Symbols - Many': {} };
    for(let i = 0; i < 120; i++)
      many['Material Symbols - Many'][`icon_${i}`] = [ 'save' ];
    many['Material Symbols - Many']['save'] = [ 'disk' ];
    const picker = loadPicker(many);
    picker.pickSymbol();
    await new Promise(resolve => setTimeout(resolve, 0));

    await picker.search('save');
    expect(picker.visibleOrder()[0]).toBe('save'); // last in symbols.json, first in the list
    expect(picker.icon('save').classList.contains('bigPreview')).toBe(true);
    expect(picker.icon('icon_98').classList.contains('bigPreview')).toBe(true);
    expect(picker.icon('icon_99').classList.contains('bigPreview')).toBe(false);
    expect(picker.icon('icon_99').style.order).toBe('4'); // below the heading, which is 3
    expect(document.getElementById('symbolMoreMatches').classList.contains('hidden')).toBe(false);
    expect(picker.overlay.classList.contains('fewResults')).toBe(false);

    // a search everything fits into keeps the big previews and hides the heading again
    await picker.search('icon_11');
    expect(document.getElementById('symbolMoreMatches').classList.contains('hidden')).toBe(true);
    expect(picker.overlay.classList.contains('fewResults')).toBe(true);
    expect(picker.icon('icon_119').classList.contains('bigPreview')).toBe(true);
  });
});
