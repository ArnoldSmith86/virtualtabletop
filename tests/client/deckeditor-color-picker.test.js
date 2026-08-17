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
    for(const halfTyped of [ '', '#', '#f0', 'rgb(255, 0', 're' ])
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

  test('a row that has no picker does not get one from a half-typed value, only from a real color', () => {
    // typing a word into the standard deck's suitColor: "♠" must not arm the picker on the way
    for(const typed of [ 'S', 'Sp', 'Spades', '#', '#f' ])
      expect(editor.shouldOfferColorPicker('suitColor', typed, false)).toBe(false);
    expect(editor.shouldOfferColorPicker('suitColor', 'red', false)).toBe(true);
    expect(editor.shouldOfferColorPicker('suitColor', '', false)).toBe(true); // an empty one is waiting for a color
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

  test('does not call a suitColor that really is a color a sorting property without saying so', () => {
    const withColor = { ...standard, suitColor: 'red' };
    expect(editor.cardTypePropertyHint('suitColor', withColor)).toMatch(/color of this card's suit/i);
  });
});
