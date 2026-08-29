import { widgets } from '../../client/js/serverstate.js';

import { createWidget, removeWidget } from './client-util.js';

// `deck` is a deck reference on cards only. Every other widget can carry a property of that
// name without it meaning anything - routines and the JSON editor set arbitrary properties on
// arbitrary widgets - so removing one must not touch whatever the property happens to name.
describe('Removing a widget that carries a deck property', () => {
  // Deck is not a module of its own, so a stub stands in for it: these tests are about who
  // gets deregistered from a deck, not about how a deck counts its cards.
  function deckStub(id) {
    const deck = createWidget({ id, type: 'deck' });
    deck.removedCards = [];
    deck.removeCard = card => deck.removedCards.push(card);
    return deck;
  }

  afterEach(() => {
    for(const id of [ ...widgets.keys() ])
      removeWidget(id);
  });

  test('does not fail when the property names a widget that is not a deck', () => {
    createWidget({ id: 'notADeck', type: 'holder' });
    const widget = createWidget({ id: 'namesAHolder', type: 'button', deck: 'notADeck' });

    expect(() => removeWidget('namesAHolder')).not.toThrow();
    expect(widget.domElement.parentNode).toBe(null);
  });

  test('does not deregister the widget from a deck it never joined', () => {
    const deck = deckStub('aDeck');
    createWidget({ id: 'namesADeck', type: 'button', deck: 'aDeck' });

    removeWidget('namesADeck');

    expect(deck.removedCards).toEqual([]);
  });

  test('still deregisters a card from the deck it joined', () => {
    const deck = deckStub('realDeck');
    const card = createWidget({ id: 'aCard', type: 'card', deck: 'realDeck' });
    card.deck = deck; // what Card does when it applies its deck property

    removeWidget('aCard');

    expect(deck.removedCards).toEqual([ card ]);
  });
});

// A widget can outlive its dom element: the editor takes preview widgets out of the room again
// and a game's html can replace the children of a widget it renders into. Removing such a widget
// has to stay harmless - the room state load that follows removes every widget of the old room
// and would otherwise leave it half torn down and mixed into the new state.
describe('Removing a widget whose element already left the dom', () => {
  afterEach(() => {
    for(const id of [ ...widgets.keys() ])
      removeWidget(id);
  });

  test('does not throw', () => {
    const widget = createWidget({ id: 'detached', type: 'holder' });
    widget.domElement.remove();

    expect(() => removeWidget('detached')).not.toThrow();
  });

  test('does not stop its parent from removing its other children', () => {
    const parent = createWidget({ id: 'aParent', type: 'holder' });
    const detached = createWidget({ id: 'detachedChild', type: 'holder', parent: 'aParent' });
    const sibling = createWidget({ id: 'siblingChild', type: 'holder', parent: 'aParent' });
    detached.domElement.remove();

    expect(() => parent.applyRemoveRecursive()).not.toThrow();
    expect(sibling.domElement.parentNode).toBe(null);
    expect(parent.domElement.parentNode).toBe(null);
  });
});

// A room state load tears down the whole old room before the new state is applied, so a
// widget the client cannot remove has to be the only thing that is left behind.
describe('Removing a tree of widgets', () => {
  afterEach(() => {
    for(const id of [ ...widgets.keys() ]) {
      delete widgets.get(id).applyRemove; // the stubs below would fail the cleanup itself
      removeWidget(id);
    }
  });

  function breakRemovalOf(widget) {
    widget.applyRemove = () => {
      throw new Error(`${widget.id} refuses to be removed`);
    };
  }

  test('a child that throws leaves its siblings and its parent removed', () => {
    const parent = createWidget({ id: 'aParent', type: 'holder' });
    const first = createWidget({ id: 'firstChild', type: 'holder', parent: 'aParent' });
    const broken = createWidget({ id: 'brokenChild', type: 'holder', parent: 'aParent' });
    const last = createWidget({ id: 'lastChild', type: 'holder', parent: 'aParent' });
    breakRemovalOf(broken);

    expect(() => parent.applyRemoveRecursive()).not.toThrow();

    for(const widget of [ first, last, parent ])
      expect(widget.domElement.parentNode).toBe(null);
  });

  test('a grandchild that throws leaves the widgets above it removed', () => {
    const parent = createWidget({ id: 'aParent', type: 'holder' });
    const child = createWidget({ id: 'aChild', type: 'holder', parent: 'aParent' });
    const broken = createWidget({ id: 'brokenGrandchild', type: 'holder', parent: 'aChild' });
    breakRemovalOf(broken);

    expect(() => parent.applyRemoveRecursive()).not.toThrow();

    expect(child.domElement.parentNode).toBe(null);
    expect(parent.domElement.parentNode).toBe(null);
  });

  test('a widget already removed as a child is not removed a second time', () => {
    const parent = createWidget({ id: 'aParent', type: 'holder' });
    const child = createWidget({ id: 'aChild', type: 'holder', parent: 'aParent' });
    let removals = 0;
    child.applyRemove = () => ++removals;

    const removed = new Set();
    parent.applyRemoveRecursive(removed);
    child.applyRemoveRecursive(removed);

    expect(removals).toBe(1);
  });

  test('widgets that are each other\'s parent do not recurse forever', () => {
    const first = createWidget({ id: 'firstOfCycle', type: 'holder', parent: 'secondOfCycle' });
    const second = createWidget({ id: 'secondOfCycle', type: 'holder', parent: 'firstOfCycle' });

    expect(() => first.applyRemoveRecursive()).not.toThrow();

    expect(first.domElement.parentNode).toBe(null);
    expect(second.domElement.parentNode).toBe(null);
  });
});
