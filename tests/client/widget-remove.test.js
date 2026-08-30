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
