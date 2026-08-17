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
});
