import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { Widget } from '../../client/js/widgets/widget.js';

// deck.js relies on the concatenated global scope of the shipped bundle rather than on imports, and it
// exports nothing - so evaluate its source with the names it reaches for and take the class back out.
const dir = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(dir, '../../client/js/widgets/deck.js'), 'utf8');
const Deck = new Function('Widget', 'mapAssetURLs', `${source}\nreturn Deck;`)(Widget, str=>String(str).replace(/^\//, ''));

// card.js reaches for the same global scope, so expose what it names before importing it.
let cardFaceObjectFont;
beforeAll(async () => {
  globalThis.Widget = Widget;
  ({ cardFaceObjectFont } = await import('../../client/js/widgets/card.js'));
});

function deckWithFonts(fonts) {
  const deck = Object.create(Deck.prototype);
  deck.get = property=>property == 'fonts' ? fonts : undefined;
  return deck;
}

describe('the @font-face rules a deck declares for its imported fonts', () => {
  test('declares one rule per font file, with the asset URL the client uses', () => {
    expect(deckWithFonts([
      { family: 'Lobster', src: '/assets/12_34', weight: 400, style: 'normal' },
      { family: 'Lobster', src: '/assets/56_78', weight: 700, style: 'italic' }
    ]).fontFaceCSS()).toEqual(
      '@font-face { font-family: "Lobster"; src: url("assets/12_34"); font-weight: 400; font-style: normal; font-display: swap; }\n' +
      '@font-face { font-family: "Lobster"; src: url("assets/56_78"); font-weight: 700; font-style: italic; font-display: swap; }'
    );
  });

  test('has nothing to declare for a deck without fonts', () => {
    expect(deckWithFonts([]).fontFaceCSS()).toEqual('');
    expect(deckWithFonts(undefined).fontFaceCSS()).toEqual('');
  });

  // the values end up inside a style element, so an entry that tries to close the rule and start something
  // of its own has to come out harmless rather than as extra css
  test('drops what would break out of the rule', () => {
    const css = deckWithFonts([
      { family: 'Evil"; } body { display: none; } @font-face { font-family: "X', src: '/assets/12_34', weight: '400; }', style: 'oblique' }
    ]).fontFaceCSS();
    expect(css).toEqual('@font-face { font-family: "Evil  body  display: none  @font-face  font-family: X"; src: url("assets/12_34"); font-weight: 400; font-style: normal; font-display: swap; }');
    expect(css.match(/[{}]/g)).toEqual([ '{', '}' ]); // only the braces of the one rule this makes
  });

  test('skips entries that name no family or no file', () => {
    expect(deckWithFonts([ { family: 'Lobster' }, { src: '/assets/12_34' }, null ]).fontFaceCSS()).toEqual('');
  });
});

describe('the font of a face object', () => {
  test('is the family name it is set to', () => {
    expect(cardFaceObjectFont({ font: 'Lobster Two' })).toEqual('Lobster Two');
    expect(cardFaceObjectFont({ font: 'Lobster, serif' })).toEqual('Lobster, serif');
  });

  test('is empty when the object does not name one', () => {
    expect(cardFaceObjectFont({})).toEqual('');
    expect(cardFaceObjectFont({ font: '' })).toEqual('');
  });

  test('can not add declarations of its own to the box it styles', () => {
    expect(cardFaceObjectFont({ font: 'Lobster; display: none' })).toEqual('Lobster display: none');
  });
});
