import { playerName } from '../../client/js/overlays/players.js';

import { createWidget, addLabel, removeWidget } from './client-util.js';

const testName = 'widget-select';

function createHand(multiSelectMax, numCards) {
  const hand = createWidget({ id: `${testName}-hand`, type: 'widget', multiSelectMax });
  const cards = [];
  for(let i=1; i<=numCards; ++i)
    cards.push(createWidget({
      id: `${testName}-card-${i}`,
      type: 'widget',
      clickable: true,
      parent: hand.get('id'),
      clickRoutine: [
        { func: 'LABEL', label: `${testName}-label`, value: 1, mode: 'inc' }
      ]
    }));
  return { hand, cards };
}

function selectedIDs(cards) {
  return cards.filter(c=>c.get('selectedBy').indexOf(playerName) != -1).map(c=>c.get('id'));
}

describe('Scenarios: Selecting widgets by clicking them', () => {
  let label;

  beforeAll(() => {
    label = addLabel(`${testName}-label`);
    window.jeRoutineLogging = false;
  });
  afterAll(() => {
    removeWidget(label.get('id'));
  });

  describe('Given a holder without multiSelectMax', () => {
    let hand, cards;
    beforeEach(async () => {
      ({ hand, cards } = createHand(0, 2));
      await label.set('text', 0);
    });
    afterEach(() => {
      cards.concat(hand).forEach(w => removeWidget(w.get('id')));
    });

    describe('When a widget in it is clicked', () => {
      test('Then it is not selected and its clickRoutine runs', async () => {
        await cards[0].click();
        expect(selectedIDs(cards)).toEqual([]);
        expect(label.get('text')).toBe(1);
      });
    });
  });

  describe('Given a holder with multiSelectMax 2', () => {
    let hand, cards;
    beforeEach(async () => {
      ({ hand, cards } = createHand(2, 3));
      await label.set('text', 0);
    });
    afterEach(() => {
      cards.concat(hand).forEach(w => removeWidget(w.get('id')));
    });

    describe('When a widget in it is clicked', () => {
      test('Then it is selected instead of running its clickRoutine', async () => {
        await cards[0].click();
        expect(selectedIDs(cards)).toEqual([ cards[0].get('id') ]);
        expect(label.get('text')).toBe(0);
      });
    });

    describe('When a selected widget is clicked again', () => {
      test('Then it is deselected', async () => {
        await cards[0].click();
        await cards[0].click();
        expect(selectedIDs(cards)).toEqual([]);
        expect(cards[0].get('selectedBy')).toEqual([]);
      });
    });

    describe('When more widgets are clicked than the limit allows', () => {
      test('Then the selection stays at the limit', async () => {
        for(const card of cards)
          await card.click();
        expect(selectedIDs(cards)).toEqual([ cards[0].get('id'), cards[1].get('id') ]);
      });
    });

    describe('When a selected widget is taken out of the holder', () => {
      test('Then it is no longer selected', async () => {
        await cards[0].click();
        cards[0].currentParent = hand;
        await cards[0].checkParent(true);
        expect(cards[0].get('selectedBy')).toEqual([]);
        expect(cards[0].get('parent')).toBe(null);
      });
    });
  });

  describe('Given a holder with multiSelectMax 1', () => {
    let hand, cards;
    beforeEach(async () => {
      ({ hand, cards } = createHand(1, 2));
    });
    afterEach(() => {
      cards.concat(hand).forEach(w => removeWidget(w.get('id')));
    });

    describe('When a second widget is clicked', () => {
      test('Then it replaces the first one', async () => {
        await cards[0].click();
        await cards[1].click();
        expect(selectedIDs(cards)).toEqual([ cards[1].get('id') ]);
      });
    });
  });

  describe("Given widgets selected by different players", () => {
    let widgets;
    beforeEach(async () => {
      widgets = [ 1, 2, 3 ].map(i => createWidget({
        id: `${testName}-mixed-${i}`,
        type: 'widget',
        clickable: true,
        selectedBy: i == 3 ? [ 'Bob' ] : [ 'Alice' ],
        clickRoutine: [
          { func: 'LABEL', label: `${testName}-label`, value: 1, mode: 'inc' }
        ]
      }));
      await label.set('text', 0);
    });
    afterEach(() => {
      widgets.forEach(w => removeWidget(w.get('id')));
    });

    describe("When a routine SELECTs the ones whose selectedBy contains a player", () => {
      test('Then only that player\'s widgets are collected', async () => {
        const button = createWidget({
          id: `${testName}-button`,
          type: 'widget',
          clickable: true,
          clickRoutine: [
            { func: 'SELECT', property: 'selectedBy', relation: 'contains', value: 'Alice' },
            { func: 'CLICK' }
          ]
        });
        await button.click();
        expect(label.get('text')).toBe(2);
        removeWidget(button.get('id'));
      });
    });
  });
});
