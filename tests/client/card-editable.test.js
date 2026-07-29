import { Widget } from '../../client/js/widgets/widget.js';
import { RESERVED_CARD_PROPERTIES, isReservedCardProperty } from '../../validator/validate_gamefile.js';

// card.js relies on the concatenated global scope of the shipped bundle rather than
// on imports, so expose the identifiers it references before importing it.
let Card;
beforeAll(async () => {
  globalThis.Widget = Widget;
  ({ Card } = await import('../../client/js/widgets/card.js'));
});

// a face object that asks to be editable and binds its value to the given card property
const boundTo = property => ({ type: 'text', editable: true, dynamicProperties: { value: property } });

describe('Card.editableProperty', () => {
  let card;
  beforeAll(() => {
    card = new Card('editableCard');
  });

  test('returns the bound property of a game author', () => {
    expect(card.editableProperty(boundTo('note'))).toBe('note');
    // an object without a type is rendered as text, and so is an editable one
    expect(card.editableProperty({ editable: true, dynamicProperties: { value: 'note' } })).toBe('note');
    // "editable" can be dynamic itself, which is how a card is locked while it is on the table
    expect(card.editableProperty({ type: 'text', dynamicProperties: { value: 'note', editable: 'unlocked' } })).toBe('note');
  });

  test('rejects the properties the engine owns, with and without a default', () => {
    // 'type' would replace the card with a different widget, 'parent' would make it vanish
    for(const property of [ 'type', 'id', 'clonedFrom', 'parent', 'width', 'height', 'display', 'movable', 'faceCycle', 'activeFace', 'deck', 'cardType', 'typeClasses' ])
      expect(card.editableProperty(boundTo(property))).toBe(null);
    for(const property of card.reservedProperties())
      expect(card.editableProperty(boundTo(property))).toBe(null);
  });

  test('rejects the computed read-only properties that routines are refused as well', () => {
    for(const property of card.readOnlyProperties())
      expect(card.editableProperty(boundTo(property))).toBe(null);
    // the whole underscore namespace is rejected, so a computed property added later stays covered
    expect(card.editableProperty(boundTo('_addedInAFutureRelease'))).toBe(null);
  });

  test('rejects everything that has nowhere to store what is typed', () => {
    // a static value overrides the dynamic one, so the typed text would be invisible
    expect(card.editableProperty({ type: 'text', editable: true, value: 'x', dynamicProperties: { value: 'note' } })).toBe(null);
    expect(card.editableProperty({ type: 'text', editable: true })).toBe(null);
    expect(card.editableProperty({ type: 'text', editable: true, dynamicProperties: { value: 42 } })).toBe(null);
  });

  test('only makes text objects editable, matching the type case-sensitively', () => {
    expect(card.editableProperty({ type: 'image', editable: true, dynamicProperties: { value: 'note' } })).toBe(null);
    expect(card.editableProperty({ type: 'Text', editable: true, dynamicProperties: { value: 'note' } })).toBe(null);
  });

  test('leaves objects that do not ask to be editable alone', () => {
    expect(card.editableProperty({ type: 'text', dynamicProperties: { value: 'note' } })).toBe(null);
    expect(card.editableProperty({ type: 'text', value: 'plain' })).toBe(null);
  });
});

describe('the game file validator and the engine reserve the same card properties', () => {
  let card;
  beforeAll(() => {
    card = new Card('validatedCard');
  });

  test('the named properties match', () => {
    // both sides are built from their own table, so this fails when a card default is added on one side only
    const named = list => [ ...new Set([ ...list ].filter(property=>property.charAt(0) != '_')) ].sort();
    expect(named(RESERVED_CARD_PROPERTIES)).toEqual(named(card.reservedProperties()));
  });

  test('both reject the computed read-only properties', () => {
    for(const property of card.readOnlyProperties())
      expect(isReservedCardProperty(property)).toBe(true);
    expect(isReservedCardProperty('_addedInAFutureRelease')).toBe(true);
    expect(isReservedCardProperty('note')).toBe(false);
  });
});
