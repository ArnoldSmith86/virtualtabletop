import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { emojiSkinToneVariants } from '../../client/js/emojivariants.js';
import { emojiToFilename } from '../../client/js/symbols.js';

// the real thing the picker asks the server for: every emoji file that carries a tone modifier
const dir = path.dirname(fileURLToPath(import.meta.url));
const available = new Set(fs.readdirSync(path.join(dir, '../../assets/noto-emoji'))
  .filter(file => file.match(/^emoji_u[0-9a-f_]*1f3f[b-f][0-9a-f_]*\.svg$/))
  .map(file => file.slice(7, -4)));

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

  test('every offered form exists as a file', () => {
    for(const emoji of [ '👍', '☝️', '🤝', '💑', '👫', '🧑‍🤝‍🧑', '🤷', '👩‍❤️‍👨', '🧑‍🦰', '🏋️' ]) {
      const cells = variants(emoji).cells.flat();
      expect(cells.length).toBeGreaterThan(0);
      for(const cell of cells)
        expect(available.has(emojiToFilename(cell))).toBe(true);
    }
  });
});
