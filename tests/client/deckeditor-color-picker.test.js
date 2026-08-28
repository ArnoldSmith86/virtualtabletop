import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// The editor files are plain scripts that get concatenated by server/minify.mjs, so evaluate the source (up to
// the instance it creates at the end, which would need the whole editor around it) and grab the class.
const dir = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(dir, '../../client/js/editor/deckeditor.js'), 'utf8');
const classes = source.slice(0, source.indexOf('const deckEditor = new DeckEditor()'));
const DeckEditor = new Function('ToolbarButton', `${classes}\nreturn DeckEditor;`)(class {});

// The color helpers only need "this", not an editor: the one thing they reach for outside themselves is
// parseColor(), which probes a canvas jsdom doesn't paint - so answer the few keywords the tests use.
const editor = Object.create(DeckEditor.prototype);
const keywords = { red: 'rgb(255, 0, 0)', transparent: 'rgba(0, 0, 0, 0)' };
editor.parseColor = value=>keywords[String(value).trim()] || null;

describe('which deck editor property rows offer a color picker', () => {
  test('offers it for values that are colors, whatever the property is called', () => {
    expect(editor.shouldOfferColorPicker('color', '#ff0000')).toBe(true);
    expect(editor.shouldOfferColorPicker('strokeColor', 'rgba(0,0,0,0.5)')).toBe(true);
    expect(editor.shouldOfferColorPicker('backgroundColor', 'transparent')).toBe(true);
    expect(editor.shouldOfferColorPicker('background', 'red')).toBe(true);
  });

  test('keeps offering it while a color is being typed into a color-named property', () => {
    for(const halfTyped of [ '', '#', '#f0', 'rgb(255, 0', 'hsl(120,' ])
      expect(editor.shouldOfferColorPicker('color', halfTyped)).toBe(true);
  });

  test('does not offer it for a color-named property holding something that is no color', () => {
    // the standard deck sorts by these - one click in a picker would overwrite the sort key with a hex code
    expect(editor.shouldOfferColorPicker('suitColor', '♠')).toBe(false);
    expect(editor.shouldOfferColorPicker('suitColor', '🃏')).toBe(false);
    expect(editor.shouldOfferColorPicker('color', 'url(/i/cards-default/2S.svg)')).toBe(false);
  });

  test('does not offer it for a property that is neither named after a color nor holds one', () => {
    expect(editor.shouldOfferColorPicker('rankFixed', '02 S')).toBe(false);
    expect(editor.shouldOfferColorPicker('suitAlt', '3♠')).toBe(false);
  });

  test('a word typed over a value never arms the picker, whatever the row showed before', () => {
    // The answer must not depend on what the row showed a keystroke ago, or the picker would survive the whole
    // way from a color to a word and could still overwrite it. Both sequences are typed into the same row:
    const typeInto = (property, keystrokes)=>keystrokes.map(value=>editor.shouldOfferColorPicker(property, value));
    // over the standard deck's sort key, clearing the field first (empty offers one - see the test above)
    expect(typeInto('suitColor', [ '♠', '', 'S', 'Sp', 'Spa', 'Spades' ])).toEqual([ false, true, false, false, false, false ]);
    // over a real color, which is where a rule carrying its own result forward stayed armed to the end
    expect(typeInto('suitColor', [ 'red', 'S', 'Sp', 'Spades' ])).toEqual([ true, false, false, false ]);
    // while a hex is retyped the button stays put, so an open picker isn't closed between two keystrokes
    expect(typeInto('color', [ 'red', '', '#', '#f', '#ff0', '#ff000', '#ff0000' ])).toEqual([ true, true, true, true, true, true, true ]);
  });
});

describe('what the card type panel says about a sorting property', () => {
  const standard = { suit: 'S', suitColor: '♠', suitAlt: '3♠', rank: '02', rankA: '02', rankFixed: '02 S' };

  test('describes each sorting property of a standard deck card type', () => {
    for(const property of Object.keys(standard))
      expect(editor.cardTypePropertyHint(property, standard)).toMatch(/^Sorting property: /);
    expect(editor.cardTypePropertyHint('suitColor', standard)).toMatch(/no CSS color/);
    expect(editor.cardTypePropertyHint('image', standard)).toBe(null);
  });

  test('says nothing about a deck that uses the same names for its own readable values', () => {
    const spanish = { rank: '1', suit: 1, order: 1 }; // assets/decks/spanish.json
    for(const property of Object.keys(spanish))
      expect(editor.cardTypePropertyHint(property, spanish)).toBe(null);
  });

  test('says nothing about a card type that carries only part of the set', () => {
    // an author-defined "rank" is not the standard deck's ace-low sort key just because a "rankFixed" is around
    const own = { rank: 'high', rankFixed: 'custom', suitAlt: 'a' };
    for(const property of Object.keys(own))
      expect(editor.cardTypePropertyHint(property, own)).toBe(null);
    // the tarot deck's suitColor really is a color, and it carries none of the other sorting properties
    const tarot = { rank: '1', roman: 'I', suit: 5, suitColor: 'red', order: 15 }; // assets/decks/tarot.json
    expect(editor.cardTypePropertyHint('suitColor', tarot)).toBe(null);
    // one missing property is enough to stay quiet
    const { rankA, ...withoutRankA } = standard;
    expect(editor.cardTypePropertyHint('rank', withoutRankA)).toBe(null);
  });

  test('does not call a suitColor that really is a color a sorting property without saying so', () => {
    const withColor = { ...standard, suitColor: 'red' };
    expect(editor.cardTypePropertyHint('suitColor', withColor)).toMatch(/color of this card's suit/i);
  });
});
