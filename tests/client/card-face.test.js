import { $, getNestedValue, mapAssetURLs } from '../../client/js/domhelpers.js';
import { widgets } from '../../client/js/serverstate.js';
import { Widget } from '../../client/js/widgets/widget.js';

// card.js relies on the concatenated global scope of the shipped bundle rather than
// on imports, so expose the identifiers it references before importing it.
let Card;
beforeAll(async () => {
  globalThis.$ = $;
  globalThis.Widget = Widget;
  globalThis.widgets = widgets;
  globalThis.mapAssetURLs = mapAssetURLs;
  globalThis.getNestedValue = getNestedValue;
  globalThis.DOMPurify = { sanitize: html=>html };
  globalThis.legacyMode = () => false;
  globalThis.getSVG = url => url;
  globalThis.generateSymbolsDiv = () => {};
  ({ Card } = await import('../../client/js/widgets/card.js'));
});

describe('Reading values inside widget properties from an html card face', () => {
  // a card needs a deck to be added to the room, but a face is rendered from the card's own
  // properties - so drive createFaces directly instead of building a whole deck around it
  let card;
  beforeAll(() => card = new Card('card-face-test-card'));

  function renderHtmlFace(value, properties) {
    Object.assign(card.state, properties);
    card.domElement.innerHTML = '';
    card.createFaces([ { objects: [ { type: 'html', x: 0, y: 0, width: 10, height: 10, value } ] } ]);
    return $('.cardFaceObject', card.domElement).innerHTML;
  }

  test('a nested value is substituted', () => {
    expect(renderHtmlFace('score: ${PROPERTY counters.score}', { counters: { score: 12 } })).toBe('score: 12');
  });

  test('a nested 0 renders as 0 instead of empty', () => {
    expect(renderHtmlFace('score: ${PROPERTY counters.score}', { counters: { score: 0 } })).toBe('score: 0');
  });

  test('a missing nested key renders empty', () => {
    expect(renderHtmlFace('score: ${PROPERTY counters.other}', { counters: { score: 12 } })).toBe('score: ');
  });

  test('a top level property keeps rendering as before', () => {
    expect(renderHtmlFace('${PROPERTY cardType}', { cardType: 'Ace' })).toBe('Ace');
  });
});
