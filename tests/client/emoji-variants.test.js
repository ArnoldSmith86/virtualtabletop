import path from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals'; // the ES module build has no globals of its own

import { enableEmojiVariantFlyouts, closeEmojiVariantFlyout, emojiSkinToneVariants, collapseEmojiVariants, expandEmojiVariants, loadEmojiVariants } from '../../client/js/emojivariants.js';
import { emojiToFilename } from '../../client/js/symbols.js';
import { readEmojiVariants } from '../../server/emojivariants.mjs';

// the real thing the picker asks the server for, from the server's own code rather than from a
// second listing of the same directory that could drift away from it
const dir = path.dirname(fileURLToPath(import.meta.url));
const variantList = readEmojiVariants(path.join(dir, '../../assets/noto-emoji'));
const available = new Set(variantList);

const variants = emoji => emojiSkinToneVariants(emoji, available);

describe('emoji skin tone variants', () => {
  test('an emoji without toned artwork has no variants', () => {
    expect(variants('😀')).toBe(null);       // no modifier base at all
    expect(variants('👪')).toBe(null);       // a modifier base, but no toned files
    expect(variants('👨‍👩‍👧')).toBe(null); // family sequences are not toned either
    expect(variants('🏳️‍🌈')).toBe(null);
    expect(variants(null)).toBe(null);
  });

  test('one person gives a row of five tones', () => {
    const thumbsUp = variants('👍');
    expect(thumbsUp.twoDimensional).toBe(false);
    expect(thumbsUp.cells).toEqual([[ '👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿' ]]);
  });

  test('the modifier replaces the variation selector of the character it tones', () => {
    expect(variants('☝️').cells[0][0]).toBe('☝🏻');
  });

  test('two people give the full 5x5 matrix', () => {
    const holdingHands = variants('🧑‍🤝‍🧑');
    expect(holdingHands.twoDimensional).toBe(true);
    expect(holdingHands.cells.length).toBe(5);
    expect(holdingHands.cells[0][4]).toBe('🧑🏻‍🤝‍🧑🏿');
  });

  test('a mixed tone form that is encoded differently is used for the off-diagonal cells', () => {
    const handshake = variants('🤝');
    expect(handshake.twoDimensional).toBe(true);
    expect(handshake.cells[0][0]).toBe('🤝🏻');        // both hands light: the short form
    expect(handshake.cells[0][4]).toBe('🫱🏻‍🫲🏿');    // light and dark: a sequence of its own
    expect(variants('💑').cells[4][0]).toBe('🧑🏿‍❤️‍🧑🏻');
  });

  test('an emoji that already carries a tone offers the same set and marks its own form', () => {
    const toned = variants('👍🏽');
    expect(toned.base).toBe('👍');
    expect(toned.selected).toBe('👍🏽');
    expect(toned.cells).toEqual(variants('👍').cells);
    expect(variants('🫱🏻‍🫲🏿').base).toBe('🤝'); // a mixed form leads back to the base as well
  });

  test('the list the server hands out is named the way the client looks a form up', () => {
    expect(variantList.length).toBeGreaterThan(1000);
    for(const sequence of variantList)
      expect(sequence).toMatch(/^[0-9a-f]{4,5}(_[0-9a-f]{4,5})*$/);
    expect(available.has(emojiToFilename('👍🏽'))).toBe(true);
    expect(available.has(emojiToFilename('👍'))).toBe(false); // untoned forms are not in it
  });

  // this is read once, when the server starts, so a missing artwork directory has to cost the
  // flyouts rather than the server
  test('a missing artwork directory means no variants, not an exception', () => {
    expect(readEmojiVariants(path.join(dir, '../../assets/no-such-directory'))).toEqual([]);
  });

  test('every offered form exists as a file', () => {
    for(const emoji of [ '👍', '☝️', '🤝', '💑', '👫', '🧑‍🤝‍🧑', '🤷', '👩‍❤️‍👨', '🧑‍🦰', '🏋️' ]) {
      const cells = variants(emoji).cells.flat();
      expect(cells.length).toBeGreaterThan(0);
      for(const cell of cells)
        expect(available.has(emojiToFilename(cell))).toBe(true);
    }
  });
});

// the flyout the pickers hang on a marked icon: it opens on a click, and the file list it needs is
// fetched, so every step here waits for the microtasks of that fetch to settle
describe('the skin tone flyout', () => {
  const flyout = _=>document.querySelector('.emojiVariantFlyout');
  const cells = _=>[ ...document.querySelectorAll('.emojiVariantCell') ];
  const settled = _=>new Promise(resolve => setTimeout(resolve, 0));

  // the pickers hand a whole container over, not one icon at a time - one handler has to serve
  // every icon in it
  async function decorate(emojis, onPick=_=>null, parent=document.body) {
    const grid = parent.appendChild(document.createElement('div'));
    for(const emoji of [].concat(emojis))
      grid.appendChild(document.createElement('i')).dataset.emoji = emoji;
    enableEmojiVariantFlyouts(grid, {
      selector: '[data-emoji]',
      emoji: element=>element.dataset.emoji,
      onPick: (element, variant)=>onPick(variant),
      label: _=>'thumbs up'
    });
    await settled(); // the file list is fetched before the icons are marked
    return [ ...grid.children ];
  }

  // a click that reaches the icon the way the pickers see it, which is how the flyout is opened
  const clickOn = element => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  const mouseDownOn = element => element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

  beforeAll(() => {
    // emojivariants.js is part of the room bundle, so it uses html() as a global (see audio.js)
    globalThis.html = string => String(string).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    globalThis.fetch = async _=>({ json: async _=>variantList });
  });

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    closeEmojiVariantFlyout();
  });

  test('an emoji with toned artwork is marked and opens its variants when clicked', async () => {
    const [ icon ] = await decorate('👍');
    expect(icon.classList.contains('hasEmojiVariants')).toBe(true);
    expect(flyout()).toBe(null);

    clickOn(icon);
    expect(flyout()).not.toBe(null);
    expect(cells().length).toBe(6); // the untoned form plus the five tones
  });

  test('an emoji without toned artwork is not marked and never opens one', async () => {
    const [ icon ] = await decorate('😀');
    expect(icon.classList.contains('hasEmojiVariants')).toBe(false);
    clickOn(icon);
    expect(flyout()).toBe(null);
  });

  // the picker underneath picks the icon that is clicked, which would take the untoned form and
  // close the picker on top of the flyout that just opened
  test('the click that opens a flyout does not reach the picker, an unmarked one does', async () => {
    const picked = [];
    const [ marked, plain ] = await decorate([ '👍', '😀' ]);
    marked.parentNode.onclick = e=>picked.push(e.target.dataset.emoji);

    clickOn(marked);
    expect(picked).toEqual([]);
    expect(flyout()).not.toBe(null);

    closeEmojiVariantFlyout();
    clickOn(plain);
    expect(picked).toEqual([ '😀' ]);
  });

  test('clicking the icon again takes its flyout back', async () => {
    const [ icon ] = await decorate('👍');
    clickOn(icon);
    expect(flyout()).not.toBe(null);

    mouseDownOn(icon); // the mousedown of that same click must not close it first
    clickOn(icon);
    expect(flyout()).toBe(null);
  });

  test('clicking anywhere else closes the flyout', async () => {
    const [ icon ] = await decorate('👍');
    clickOn(icon);

    mouseDownOn(document.body);
    expect(flyout()).toBe(null);
  });

  test('the flyout of an icon is built once and reused', async () => {
    const [ icon, other ] = await decorate([ '👍', '👎' ]);
    clickOn(icon);
    const first = flyout();

    clickOn(other);
    expect(flyout()).not.toBe(first);      // a different emoji, so a different flyout

    clickOn(icon);
    expect(flyout()).toBe(first);          // back to the first one: the same box, not a new one
  });

  // The flyout goes into #editor whenever its icon does, so that a mousedown on it counts as one on
  // the editor. Its colours cannot follow from that: the deck editor moves the always-light "Pick
  // icon" overlay into #editor as well (deckeditor.js), and a flyout of an icon in there has to stay
  // light - which .inSymbolPicker is what tells the stylesheet (fonts.css).
  test('a flyout of the picker overlay is marked as such wherever the overlay sits', async () => {
    const editor = document.body.appendChild(document.createElement('div'));
    editor.id = 'editor';
    const overlay = editor.appendChild(document.createElement('div'));
    overlay.id = 'symbolPickerOverlay';

    const [ pickerIcon ] = await decorate('👍', _=>null, overlay);
    clickOn(pickerIcon);
    expect(flyout().parentNode).toBe(editor);
    expect(flyout().classList.contains('inSymbolPicker')).toBe(true);

    const [ sidebarIcon ] = await decorate('👎', _=>null, editor); // a chip of the editor sidebar
    clickOn(sidebarIcon);
    expect(flyout().parentNode).toBe(editor);
    expect(flyout().classList.contains('inSymbolPicker')).toBe(false);
  });

  test('the cells are buttons that say which tone they stand for', async () => {
    const [ icon ] = await decorate('👍');
    clickOn(icon);
    expect(cells().every(cell => cell.tagName == 'BUTTON')).toBe(true);
    expect(cells()[0].getAttribute('aria-label')).toBe('No skin tone');
    expect(cells()[3].getAttribute('aria-label')).toBe('Medium skin tone');
  });

  test('a matrix cell names both of its tones', async () => {
    const [ handshake ] = await decorate('🤝');
    clickOn(handshake);
    expect(cells().length).toBe(26);
    expect(cells()[1].getAttribute('aria-label')).toBe('Light + Light skin tone');
    expect(cells()[5].getAttribute('aria-label')).toBe('Light + Dark skin tone');
  });

  test('a nudge of the grid keeps the flyout, scrolling away closes it', async () => {
    const [ icon ] = await decorate('👍');
    const scroller = icon.parentNode;
    clickOn(icon);

    for(const position of [ 2, 5 ]) {   // the pixel or two a tap moves the list it is on
      scroller.scrollTop = position;
      scroller.dispatchEvent(new Event('scroll'));
    }
    expect(flyout()).not.toBe(null);

    scroller.scrollTop = 200;
    scroller.dispatchEvent(new Event('scroll'));
    expect(flyout()).toBe(null);
  });

  // a flick of the wheel arrives as one scroll event that is already far along, so the position the
  // flyout opened at is what the movement is measured against
  test('a single scroll event that jumps the grid closes the flyout', async () => {
    const [ icon ] = await decorate('👍');
    const scroller = icon.parentNode;
    clickOn(icon);

    scroller.scrollTop = 547;
    scroller.dispatchEvent(new Event('scroll'));
    expect(flyout()).toBe(null);
  });

  // a 5x5 matrix that does not fit the viewport is capped and scrolls itself (fonts.css), so
  // scrolling it is how its lower rows are reached - not a sign that its anchor moved away
  test('scrolling the flyout itself keeps it open and its lower rows pickable', async () => {
    const picked = [];
    const [ handshake ] = await decorate('🤝', emoji => picked.push(emoji));
    clickOn(handshake);
    const dom = flyout();

    for(const position of [ 4, 40, 120 ]) {
      dom.scrollTop = position;
      dom.dispatchEvent(new Event('scroll'));
    }
    expect(flyout()).toBe(dom);

    const dark = cells().find(cell => cell.getAttribute('aria-label') == 'Dark + Dark skin tone');
    dark.click();
    expect(picked).toEqual([ '🤝🏿' ]);
  });

  test('clicking a cell reports the toned emoji and closes the flyout', async () => {
    const picked = [];
    const [ icon ] = await decorate('👍', emoji => picked.push(emoji));
    clickOn(icon);

    cells()[3].click(); // the untoned form, then light, med-light, medium
    expect(picked).toEqual([ '👍🏽' ]);
    expect(flyout()).toBe(null);
  });

  test('Escape closes the flyout and leaves the picker behind it alone', async () => {
    const pickerKeyDown = jest.fn();
    const pickerKeyUp = jest.fn();
    document.addEventListener('keydown', pickerKeyDown, true); // InlinePopup.onKeyDown
    window.addEventListener('keyup', pickerKeyUp);             // window.onkeyup in main.js
    const [ icon ] = await decorate('👍');
    clickOn(icon);

    icon.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    icon.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
    expect(flyout()).toBe(null);
    expect(pickerKeyDown).not.toHaveBeenCalled();
    expect(pickerKeyUp).not.toHaveBeenCalled();

    // and with no flyout open the picker gets its Escape back
    icon.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    icon.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
    expect(pickerKeyDown).toHaveBeenCalledTimes(1);
    expect(pickerKeyUp).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', pickerKeyDown, true);
    window.removeEventListener('keyup', pickerKeyUp);
  });

  // The pickers rebuild their list and hand it over again on every keystroke of their search. A
  // second handler on the same container would see the same click as the first one and read it as
  // the second click on an icon whose flyout is open - which takes the flyout straight back again.
  test('enabling the same container again replaces its handler instead of stacking another', async () => {
    const [ icon ] = await decorate('👍');
    enableEmojiVariantFlyouts(icon.parentNode, {
      selector: '[data-emoji]',
      emoji: element=>element.dataset.emoji,
      onPick: _=>null,
      label: _=>'thumbs up'
    });
    await settled();

    clickOn(icon);
    expect(flyout()).not.toBe(null);
  });
});

// The flyout is what a grid of 13000 icons needs; a search that has narrowed it down to a handful
// puts the forms into the grid itself instead (see the search handler in client/js/symbols.js).
describe('the toned forms in the grid itself', () => {
  const inline = (root=document) => [ ...root.querySelectorAll('.emojiVariantInline') ];
  const symbols = _=>[ ...document.querySelectorAll('i') ].map(icon => icon.dataset.symbol);

  // the picker copies the icon a form belongs to, so that its own click handling and its search
  // treat the form as one of its icons
  const create = (icon, form, description) => {
    const element = icon.cloneNode(false);
    element.dataset.symbol = form;
    element.title = description;
    return element;
  };
  const expand = (grid, budget=50) => expandEmojiVariants(grid, grid.querySelectorAll('i'), {
    emoji: icon=>icon.dataset.symbol,
    create,
    budget
  });

  function gridOf(emojis) {
    const grid = document.body.appendChild(document.createElement('div'));
    for(const emoji of [].concat(emojis))
      grid.appendChild(document.createElement('i')).dataset.symbol = emoji;
    return grid;
  }

  // an argument would be taken for jest's done() callback, so these have to be written out
  beforeAll(async () => {
    globalThis.fetch = async _=>({ json: async _=>variantList });
    await loadEmojiVariants();
  });

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('the five tones of an emoji follow the icon they belong to', () => {
    const grid = gridOf([ '👍', '👎' ]);
    expect(expand(grid)).toBe(true);
    expect(symbols()).toEqual([ '👍', '👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿', '👎', '👎🏻', '👎🏼', '👎🏽', '👎🏾', '👎🏿' ]);
    expect(inline().length).toBe(10);
    expect(grid.classList.contains('emojiVariantsExpanded')).toBe(true);
  });

  test('a form says which tone it stands for', () => {
    const row = gridOf('👍');
    expand(row);
    expect(inline(row)[2].title).toBe('Medium skin tone');

    const matrix = gridOf('🤝');
    expand(matrix);
    expect(inline(matrix)[4].title).toBe('Light + Dark skin tone');
  });

  test('an emoji that can be toned twice goes in as its whole matrix', () => {
    const grid = gridOf('🤝');
    expect(expand(grid)).toBe(true);
    expect(inline().length).toBe(25);
    expect(symbols()[5]).toBe('🫱🏻‍🫲🏿');
  });

  test('an emoji without toned artwork is left as it is', () => {
    const grid = gridOf([ '😀', '🏳️‍🌈' ]);
    expect(expand(grid)).toBe(false);
    expect(inline().length).toBe(0);
    expect(grid.classList.contains('emojiVariantsExpanded')).toBe(false);
  });

  // all of them or none: a grid where some of the emoji show their tones and others only hint at
  // them says nothing about which is which
  test('a result too long for the budget keeps every one of its forms out', () => {
    const grid = gridOf([ '👍', '👎', '🤝' ]);
    expect(expand(grid, 25)).toBe(false);
    expect(inline().length).toBe(0);
    expect(expand(grid, 35)).toBe(true);
    expect(inline().length).toBe(35);
  });

  test('expanding again replaces the forms instead of stacking another set on them', () => {
    const grid = gridOf('👍');
    expand(grid);
    expand(grid);
    expect(inline().length).toBe(5);
  });

  test('collapsing takes the forms back out of the grid', () => {
    const grid = gridOf([ '👍', '😀' ]);
    expand(grid);
    collapseEmojiVariants(grid);
    expect(symbols()).toEqual([ '👍', '😀' ]);
    expect(grid.classList.contains('emojiVariantsExpanded')).toBe(false);
  });

  test('an icon whose forms are in the grid opens no flyout, and opens one again once they are gone', async () => {
    const grid = gridOf('👍');
    enableEmojiVariantFlyouts(grid, {
      selector: 'i',
      emoji: icon=>icon.dataset.symbol,
      onPick: _=>null,
      label: _=>'thumbs up'
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const icon = grid.firstChild;
    expand(grid);

    icon.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.emojiVariantFlyout')).toBe(null);

    collapseEmojiVariants(grid);
    icon.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.emojiVariantFlyout')).not.toBe(null);
    closeEmojiVariantFlyout();
  });
});
