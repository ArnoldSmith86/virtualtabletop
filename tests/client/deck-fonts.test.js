import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { Widget } from '../../client/js/widgets/widget.js';

// deck.js relies on the concatenated global scope of the shipped bundle rather than on imports, and it
// exports nothing - so evaluate its source with the names it reaches for and take the class back out.
const dir = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(dir, '../../client/js/widgets/deck.js'), 'utf8');
const Deck = new Function('Widget', 'mapAssetURLs', '$', 'removeFromDOM', `${source}\nreturn Deck;`)(
  Widget, str=>String(str).replace(/^\//, ''), selector=>document.querySelector(selector), node=>node.remove());

// the deck editor is a plain script too, evaluated up to the instance it creates at the end
const editorSource = fs.readFileSync(path.join(dir, '../../client/js/editor/deckeditor.js'), 'utf8');
const DeckEditor = new Function('ToolbarButton', `${editorSource.slice(0, editorSource.indexOf('const deckEditor = new DeckEditor()'))}\nreturn DeckEditor;`)(class {});

// card.js reaches for the same global scope, so expose what it names before importing it.
let cardFaceObjectFont;
beforeAll(async () => {
  globalThis.Widget = Widget;
  ({ cardFaceObjectFont } = await import('../../client/js/widgets/card.js'));
});

function deckWithFonts(fonts) {
  const deck = Object.create(Deck.prototype);
  deck.fonts = fonts;
  deck.cards = {};
  deck.cssScope = 'testdeck';
  deck.get = property=>property == 'fonts' ? deck.fonts : undefined;
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
  test('is the family name it is set to, quoted', () => {
    expect(cardFaceObjectFont({ font: 'Lobster Two' })).toEqual('"Lobster Two"');
    expect(cardFaceObjectFont({ font: 'Lobster, serif' })).toEqual('"Lobster", serif');
  });

  // an unquoted family has to be a sequence of css identifiers, so a browser throws the whole declaration
  // away for the families whose name contains a word starting with a digit
  test('quotes families a browser would not accept unquoted', () => {
    expect(cardFaceObjectFont({ font: 'Press Start 2P' })).toEqual('"Press Start 2P"');
    expect(cardFaceObjectFont({ font: 'Exo 2, Baloo 2, monospace' })).toEqual('"Exo 2", "Baloo 2", monospace');
  });

  test('leaves the keywords that stand for a font rather than name one alone', () => {
    expect(cardFaceObjectFont({ font: 'serif' })).toEqual('serif');
    expect(cardFaceObjectFont({ font: 'Lobster, SANS-SERIF' })).toEqual('"Lobster", SANS-SERIF');
  });

  test('is empty when the object does not name one', () => {
    expect(cardFaceObjectFont({})).toEqual('');
    expect(cardFaceObjectFont({ font: '' })).toEqual('');
    expect(cardFaceObjectFont({ font: ' , ' })).toEqual('');
  });

  test('can not add declarations of its own to the box it styles', () => {
    expect(cardFaceObjectFont({ font: 'Lobster; display: none' })).toEqual('"Lobster display: none"');
  });
});

// A card is created from the deck's face templates once and then only follows the card properties its objects
// are bound to - which the fonts of the deck are not. Everything on the page reads the @font-face rules the
// deck declares in the document, so it follows them by itself; a frame is a document of its own and carries a
// copy, so it is the one thing that has to be built again.
describe('the fonts of a deck on the cards that already exist', () => {
  const lobster = { family: 'Lobster', src: '/assets/12_34', weight: 400, style: 'normal' };
  const bangers = { family: 'Bangers', src: '/assets/56_78', weight: 400, style: 'normal' };
  let Card, deck, card;

  beforeAll(async () => {
    globalThis.mapAssetURLs = str=>String(str).replace(/^\//, '');
    // an object on the page goes through the sanitizer, which the bundle brings along as a global
    globalThis.DOMPurify = { sanitize: html=>html };
    ({ Card } = await import('../../client/js/widgets/card.js'));
  });

  beforeEach(() => {
    globalThis.legacyMode = mode=>mode == 'useIframeForHtmlCards';
    deck = deckWithFonts([ lobster ]);
    card = new Card('card1');
    card.deck = deck;
    deck.cards.card1 = card;
    // a static text: no ${PROPERTY} in it and no binding, so nothing about the card ever rebuilds it
    card.createFaces([ { objects: [ { type: 'html', value: '<b>Hello</b>', font: 'Lobster', x: 0, y: 0, width: 100, height: 40 } ] } ]);
  });

  afterEach(() => {
    delete globalThis.legacyMode;
    for(const style of document.querySelectorAll('style'))
      style.remove();
  });

  const frameHTML = _=>card.domElement.querySelector('iframe').srcdoc;

  test('is written into the frame of an html object when the card is built', () => {
    expect(frameHTML()).toContain('@font-face { font-family: "Lobster"; src: url("assets/12_34")');
    expect(frameHTML()).toContain('font-family: "Lobster", \'Roboto\'');
  });

  test('follows a family the deck imports afterwards', () => {
    deck.fonts = [ lobster, bangers ];
    deck.applyFonts();
    expect(frameHTML()).toContain('src: url("assets/56_78")');
    expect(frameHTML()).toContain('src: url("assets/12_34")');
  });

  test('follows a file the deck replaces the family with', () => {
    deck.fonts = [ { ...lobster, src: '/assets/99_11' } ];
    deck.applyFonts();
    expect(frameHTML()).toContain('src: url("assets/99_11")');
    expect(frameHTML()).not.toContain('assets/12_34');
  });

  test('is gone from the frame when the family is removed from the deck', () => {
    deck.fonts = [];
    deck.applyFonts();
    expect(frameHTML()).not.toContain('@font-face');
    // the object still names the family, so what it falls back to is up to the browser rather than stale
    expect(frameHTML()).toContain('font-family: "Lobster", \'Roboto\'');
  });

  test('leaves an html object that is not a frame to the rules the deck declares in the document', () => {
    globalThis.legacyMode = _=>false;
    const onThePage = new Card('card2');
    onThePage.deck = deck;
    deck.cards.card2 = onThePage;
    onThePage.createFaces([ { objects: [ { type: 'html', value: 'Hello', font: 'Lobster', x: 0, y: 0, width: 100, height: 40 } ] } ]);
    deck.fonts = [];
    deck.applyFonts();
    expect(onThePage.domElement.querySelector('iframe')).toBe(null);
    expect(document.querySelector('#FONTS_testdeck')).toBe(null);
  });
});

// The deck's font list offers to remove a family and says what that costs. A text can name the family itself
// or read it from a card property, which is how one text is drawn in a different font per card type.
describe('how many texts of a deck a font is used by', () => {
  const editor = (faceTemplates, cardTypes, cardDefaults) => {
    const e = Object.create(DeckEditor.prototype);
    e.faceTemplates = faceTemplates;
    e.cardTypes = cardTypes || {};
    e.cardDefaults = cardDefaults || {};
    return e;
  };
  const text = font=>({ type: 'text', font });
  const bound = property=>({ type: 'text', dynamicProperties: { font: property } });

  test('counts the texts naming the family', () => {
    const e = editor([ { objects: [ text('Lobster'), text('Bangers') ] }, { objects: [ text('Lobster') ] } ]);
    expect(e.fontUsage('Lobster')).toEqual({ direct: 2, bound: 0 });
    expect(e.fontUsageText('Lobster')).toEqual('used by 2 texts');
    expect(e.fontUsageText('Bangers')).toEqual('used by 1 text');
    expect(e.fontUsageText('Cabin')).toEqual('used by 0 texts');
  });

  test('counts a text that reads the family from a card type', () => {
    const e = editor([ { objects: [ bound('cardFont') ] } ], {
      plain: {},
      fancy: { cardFont: 'Lobster' }
    });
    expect(e.fontUsage('Lobster')).toEqual({ direct: 0, bound: 1 });
    expect(e.fontUsageText('Lobster')).toEqual('used by 1 text through a card type');
  });

  test('counts the family a face or the deck defaults put into the bound property', () => {
    const fromFace = editor([ { properties: { cardFont: 'Lobster' }, objects: [ bound('cardFont') ] } ], { plain: {} });
    expect(fromFace.fontUsage('Lobster')).toEqual({ direct: 0, bound: 1 });
    const fromDefaults = editor([ { objects: [ bound('cardFont') ] } ], { plain: {} }, { cardFont: 'Lobster' });
    expect(fromDefaults.fontUsage('Lobster')).toEqual({ direct: 0, bound: 1 });
    // a card type that names a font of its own is what the text is drawn in there, not the default
    const overridden = editor([ { objects: [ bound('cardFont') ] } ], { plain: { cardFont: 'Bangers' } }, { cardFont: 'Lobster' });
    expect(overridden.fontUsage('Lobster')).toEqual({ direct: 0, bound: 0 });
  });

  test('says both when the family is used in both ways', () => {
    const e = editor([ { objects: [ text('Lobster'), bound('cardFont'), bound('cardFont') ] } ], {
      fancy: { cardFont: 'Lobster' }
    });
    expect(e.fontUsageText('Lobster')).toEqual('used by 3 texts, 2 of them through a card type');
  });

  test('does not count a binding a font of its own shadows, which is what the card is drawn in', () => {
    const e = editor([ { objects: [ { type: 'text', font: 'Bangers', dynamicProperties: { font: 'cardFont' } } ] } ], {
      fancy: { cardFont: 'Lobster' }
    });
    expect(e.fontUsage('Lobster')).toEqual({ direct: 0, bound: 0 });
    expect(e.fontUsage('Bangers')).toEqual({ direct: 1, bound: 0 });
  });
});

// Adding a family writes the styles that are checked and drops the rest, so what the boxes open on decides
// what a deck keeps when a family it already carries is picked from the catalog again.
describe('the styles the font dialog opens a family on', () => {
  const editor = fonts => {
    const e = Object.create(DeckEditor.prototype);
    e.fonts = fonts;
    return e;
  };
  const catalogEntry = { family: 'Cabin', styles: [ '400', '700', '400i', '700i' ] };

  test('is the previewed style alone for a family the deck does not have', () => {
    expect(editor([]).initialFontStyles(catalogEntry).chosen).toEqual([ '400' ]);
  });

  test('is the first style a family without a Regular offers', () => {
    expect(editor([]).initialFontStyles({ family: 'Molle', styles: [ '400i' ] }).chosen).toEqual([ '400i' ]);
  });

  test('keeps the styles the deck already has for that family', () => {
    const e = editor([
      { family: 'Cabin', src: '/assets/1_1', weight: 400, style: 'normal' },
      { family: 'Cabin', src: '/assets/2_2', weight: 700, style: 'normal' },
      { family: 'Cabin', src: '/assets/3_3', weight: 700, style: 'italic' },
      { family: 'Bangers', src: '/assets/4_4', weight: 400, style: 'normal' }
    ]);
    expect(e.initialFontStyles(catalogEntry)).toEqual({ owned: [ '400', '700', '700i' ], chosen: [ '400', '700', '700i' ] });
    expect(e.deckFontStyles('Bangers')).toEqual([ '400' ]);
  });

  test('adds the previewed style to a family the deck only has other styles of', () => {
    const e = editor([ { family: 'Cabin', src: '/assets/1_1', weight: 700, style: 'normal' } ]);
    expect(e.initialFontStyles(catalogEntry).chosen).toEqual([ '400', '700' ]);
  });

  test('ignores a style of the deck the catalog no longer offers', () => {
    const e = editor([ { family: 'Cabin', src: '/assets/1_1', weight: 700, style: 'italic' } ]);
    expect(e.initialFontStyles({ family: 'Cabin', styles: [ '400', '700' ] })).toEqual({ owned: [], chosen: [ '400' ] });
  });
});

// The dialog stays open while another player edits the same deck, and a reload deep-clones the working
// copies - so the face objects it applies the family to are looked up again rather than held on to.
describe('the face objects the font dialog writes the family to', () => {
  const editor = faceTemplates => {
    const e = Object.create(DeckEditor.prototype);
    e.faceTemplates = faceTemplates;
    return e;
  };

  test('are the ones the working copy holds now, not the ones the dialog was opened on', () => {
    const e = editor([ { objects: [ { type: 'text' }, { type: 'text' } ] } ]);
    e.fontTarget = { face: 0, indices: [ 1 ], args: [] };
    e.faceTemplates = JSON.parse(JSON.stringify(e.faceTemplates)); // what reload() does
    e.fontTargetObjects()[0].font = 'Lobster';
    expect(e.faceTemplates[0].objects[1].font).toEqual('Lobster');
  });

  test('are none when the dialog was opened from the JSON editor', () => {
    const e = editor([ { objects: [ { type: 'text' } ] } ]);
    e.fontTarget = { face: 0, indices: [], args: [] };
    expect(e.fontTargetObjects()).toEqual([]);
    e.fontTarget = null;
    expect(e.fontTargetObjects()).toEqual([]);
  });

  test('are none when the objects went away while the dialog was open', () => {
    const e = editor([ { objects: [ { type: 'text' } ] } ]);
    e.fontTarget = { face: 0, indices: [ 0, 1 ], args: [] };
    e.faceTemplates = [ { objects: [] } ];
    expect(e.fontTargetObjects()).toEqual([]);
  });
});
