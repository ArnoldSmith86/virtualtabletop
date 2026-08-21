import { widgets } from '../../client/js/serverstate.js';

import { legacyMode } from '../../client/js/legacymodes.js';

import { createWidget, removeWidget } from './client-util.js';

// updatePiles() reads pile.js's defaultPileSnapRange and creates a new pile
// through addWidgetLocal. Both live in the concatenated bundle rather than in a
// module, so they are globals here - and a stub pile keeps the real Pile class,
// which the bundle would have to provide, out of the picture.
let createdPiles;
beforeAll(() => {
  globalThis.defaultPileSnapRange = 10;
  globalThis.addWidgetLocal = async definition => {
    const id = definition.id || `created-pile-${createdPiles.length}`;
    createdPiles.push({ ...definition, id });
    place({ ...definition, id });
    return id;
  };
  globalThis.playerName = 'jestPlayer';
  globalThis.legacyMode = legacyMode;
  globalThis.getMaxZ = () => 0;
  globalThis.updateMaxZ = () => {};
});

// jsdom implements no DOMMatrix, so model the room's untransformed coordinate
// frame directly the way the line fixtures do - these tests are about which
// widget takes the drop, not about where it lands.
function place(definition) {
  // pileSnapRange is a Pile default, and the real Pile says no to supportsPiles,
  // which is what stops a card that just joined a pile from immediately piling
  // up with its new siblings
  const widget = createWidget(definition.type == 'pile' ? { pileSnapRange: 10, ...definition } : definition);
  if(definition.type == 'pile')
    widget.supportsPiles = () => false;
  widget.coordGlobalFromCoordLocal = coord => ({ x: widget.get('x') + coord.x, y: widget.get('y') + coord.y });
  widget.coordLocalFromCoordGlobal = coord => ({ x: coord.x - widget.get('x'), y: coord.y - widget.get('y') });
  return widget;
}

// A pile at (100,100) holding the given number of cards. Everything else the
// tests drop is placed at the same spot, close enough for updatePiles() to want
// to merge them.
function pileWith(childCount, pileProperties = {}) {
  const pile = place({ id: 'pile', type: 'pile', x: 100, y: 100, ...pileProperties });
  for(let i=0; i<childCount; ++i)
    place({ id: `held-${i}`, type: 'card', parent: 'pile' });
  return pile;
}

describe('dropLimit when a drag piles cards up', () => {
  beforeEach(() => {
    createdPiles = [];
  });

  afterEach(() => {
    for(const id of [ ...widgets.keys() ])
      removeWidget(id);
  });

  describe('a card dropped onto a pile', () => {
    test('is refused once the pile is at its dropLimit', async () => {
      pileWith(2, { dropLimit: 2 });
      const card = place({ id: 'dropped', type: 'card', x: 100, y: 100 });

      card.pileUpdateFromDrag = true;
      await card.updatePiles();
      expect(card.get('parent')).toBe(null);
    });

    test('joins the pile while it still has room', async () => {
      pileWith(1, { dropLimit: 2 });
      const card = place({ id: 'dropped', type: 'card', x: 100, y: 100 });

      card.pileUpdateFromDrag = true;
      await card.updatePiles();
      expect(card.get('parent')).toBe('pile');
    });

    test('joins a full pile when the update does not come from a drag', async () => {
      pileWith(2, { dropLimit: 2 });
      const card = place({ id: 'dropped', type: 'card', x: 100, y: 100 });

      // a routine MOVE, "Split the pile" and the JSON editor all end up here
      await card.updatePiles();
      expect(card.get('parent')).toBe('pile');
    });

    test('joins a pile that has no limit', async () => {
      pileWith(5);
      const card = place({ id: 'dropped', type: 'card', x: 100, y: 100 });

      card.pileUpdateFromDrag = true;
      await card.updatePiles();
      expect(card.get('parent')).toBe('pile');
    });

    test('is refused by a full pile but taken by another one that has room', async () => {
      pileWith(2, { dropLimit: 2 });
      place({ id: 'roomy', type: 'pile', x: 100, y: 100, dropLimit: 5 });
      place({ id: 'held-roomy', type: 'card', parent: 'roomy' });
      const card = place({ id: 'dropped', type: 'card', x: 100, y: 100 });

      card.pileUpdateFromDrag = true;
      await card.updatePiles();
      expect(card.get('parent')).toBe('roomy');
    });
  });

  describe('a pile dropped onto a pile', () => {
    test('is refused when its cards would not all fit', async () => {
      pileWith(2, { dropLimit: 3 });
      const dragged = place({ id: 'dragged', type: 'pile', x: 100, y: 100 });
      place({ id: 'moved-0', type: 'card', parent: 'dragged' });
      place({ id: 'moved-1', type: 'card', parent: 'dragged' });

      dragged.pileUpdateFromDrag = true;
      await dragged.updatePiles();
      expect(widgets.get('moved-0').get('parent')).toBe('dragged');
      expect(widgets.get('moved-1').get('parent')).toBe('dragged');
    });

    test('hands its cards over when they all fit', async () => {
      pileWith(2, { dropLimit: 4 });
      const dragged = place({ id: 'dragged', type: 'pile', x: 100, y: 100 });
      place({ id: 'moved-0', type: 'card', parent: 'dragged' });
      place({ id: 'moved-1', type: 'card', parent: 'dragged' });

      dragged.pileUpdateFromDrag = true;
      await dragged.updatePiles();
      expect(widgets.get('moved-0').get('parent')).toBe('pile');
      expect(widgets.get('moved-1').get('parent')).toBe('pile');
    });
  });

  describe('a pile dropped onto a loose card', () => {
    test('does not swallow the card once the pile is full', async () => {
      pileWith(2, { dropLimit: 2 });
      const card = place({ id: 'lying', type: 'card', x: 100, y: 100 });

      widgets.get('pile').pileUpdateFromDrag = true;
      await widgets.get('pile').updatePiles();
      expect(card.get('parent')).toBe(null);
    });
  });

  describe('two cards forming a pile', () => {
    const onPileCreation = limit => ({ onPileCreation: { dropLimit: limit } });

    test('make no pile when the pile they would create takes less than two', async () => {
      place({ id: 'lying', type: 'card', x: 100, y: 100, ...onPileCreation(1) });
      const card = place({ id: 'dropped', type: 'card', x: 100, y: 100, ...onPileCreation(1) });

      card.pileUpdateFromDrag = true;
      await card.updatePiles();
      expect(createdPiles).toEqual([]);
      expect(card.get('parent')).toBe(null);
    });

    test('make a pile when it takes both of them', async () => {
      place({ id: 'lying', type: 'card', x: 100, y: 100, ...onPileCreation(2) });
      const card = place({ id: 'dropped', type: 'card', x: 100, y: 100, ...onPileCreation(2) });

      card.pileUpdateFromDrag = true;
      await card.updatePiles();
      expect(createdPiles.length).toBe(1);
      expect(createdPiles[0].dropLimit).toBe(2);
      expect(card.get('parent')).toBe(createdPiles[0].id);
    });

    test('make a pile from a routine even below that limit', async () => {
      place({ id: 'lying', type: 'card', x: 100, y: 100, ...onPileCreation(1) });
      const card = place({ id: 'dropped', type: 'card', x: 100, y: 100, ...onPileCreation(1) });

      await card.updatePiles();
      expect(createdPiles.length).toBe(1);
    });
  });
});
