import path from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals'; // the ES module build has no globals of its own

import { addEmojiVariantFlyout, closeEmojiVariantFlyout, emojiSkinToneVariants } from '../../client/js/emojivariants.js';
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

  test('every offered form exists as a file', () => {
    for(const emoji of [ '👍', '☝️', '🤝', '💑', '👫', '🧑‍🤝‍🧑', '🤷', '👩‍❤️‍👨', '🧑‍🦰', '🏋️' ]) {
      const cells = variants(emoji).cells.flat();
      expect(cells.length).toBeGreaterThan(0);
      for(const cell of cells)
        expect(available.has(emojiToFilename(cell))).toBe(true);
    }
  });
});

// the flyout the pickers hang on a marked icon: opening it is a hover, so the timers are driven by
// hand here instead of waiting for them
describe('the skin tone flyout', () => {
  const flyout = _=>document.querySelector('.emojiVariantFlyout');
  const cells = _=>[ ...document.querySelectorAll('.emojiVariantCell') ];

  async function decorate(emoji, onPick=_=>null) {
    const icon = document.createElement('i');
    document.body.appendChild(icon);
    addEmojiVariantFlyout(icon, emoji, onPick, 'thumbs up');
    await jest.advanceTimersByTimeAsync(0); // the file list is fetched before the icon is marked
    return icon;
  }

  const hover = async icon => {
    icon.dispatchEvent(new MouseEvent('mouseenter'));
    await jest.advanceTimersByTimeAsync(250);
  };

  beforeAll(() => {
    // emojivariants.js is part of the room bundle, so it uses html() as a global (see audio.js)
    globalThis.html = string => String(string).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    globalThis.fetch = async _=>({ json: async _=>variantList });
  });

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    closeEmojiVariantFlyout();
    jest.useRealTimers();
  });

  test('an emoji with toned artwork is marked and opens its variants on hover', async () => {
    const icon = await decorate('👍');
    expect(icon.classList.contains('hasEmojiVariants')).toBe(true);
    expect(flyout()).toBe(null);

    await hover(icon);
    expect(flyout()).not.toBe(null);
    expect(cells().length).toBe(6); // the untoned form plus the five tones
  });

  test('an emoji without toned artwork is not marked and never opens one', async () => {
    const icon = await decorate('😀');
    expect(icon.classList.contains('hasEmojiVariants')).toBe(false);
    await hover(icon);
    expect(flyout()).toBe(null);
  });

  test('leaving the icon closes the flyout after the grace period', async () => {
    const icon = await decorate('👍');
    await hover(icon);

    icon.dispatchEvent(new MouseEvent('mouseleave'));
    await jest.advanceTimersByTimeAsync(100);
    expect(flyout()).not.toBe(null); // still crossable towards the flyout
    await jest.advanceTimersByTimeAsync(300);
    expect(flyout()).toBe(null);
  });

  test('moving from the icon into the flyout keeps it open', async () => {
    const icon = await decorate('👍');
    await hover(icon);

    icon.dispatchEvent(new MouseEvent('mouseleave'));
    flyout().dispatchEvent(new MouseEvent('mouseenter'));
    await jest.advanceTimersByTimeAsync(1000);
    expect(flyout()).not.toBe(null);

    flyout().dispatchEvent(new MouseEvent('mouseleave'));
    await jest.advanceTimersByTimeAsync(300);
    expect(flyout()).toBe(null);
  });

  test('clicking a cell reports the toned emoji and closes the flyout', async () => {
    const picked = [];
    const icon = await decorate('👍', emoji => picked.push(emoji));
    await hover(icon);

    cells()[3].click(); // the untoned form, then light, med-light, medium
    expect(picked).toEqual([ '👍🏽' ]);
    expect(flyout()).toBe(null);
  });

  test('Escape closes the flyout and leaves the picker behind it alone', async () => {
    const pickerKeyDown = jest.fn();
    const pickerKeyUp = jest.fn();
    document.addEventListener('keydown', pickerKeyDown, true); // InlinePopup.onKeyDown
    window.addEventListener('keyup', pickerKeyUp);             // window.onkeyup in main.js
    const icon = await decorate('👍');
    await hover(icon);

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

  test('a long press that ends without a click does not swallow a later one', async () => {
    const icon = await decorate('👍');
    const clicked = jest.fn();
    document.body.appendChild(document.createElement('button')).onclick = clicked;

    icon.dispatchEvent(new TouchEvent('touchstart'));
    await jest.advanceTimersByTimeAsync(500);
    expect(flyout()).not.toBe(null);

    // the finger slid off the icon, so the click that would have been swallowed never comes
    await jest.advanceTimersByTimeAsync(1000);
    document.querySelector('button').click();
    expect(clicked).toHaveBeenCalledTimes(1);
  });
});
