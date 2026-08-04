import { playerName } from '../../client/js/overlays/players.js';

import { createWidget, addLabel, removeWidget } from './client-util.js';

const testName = 'widget-select';

// jsdom does not implement DOMMatrix, so model the room's untransformed coordinate
// frame directly - these fixtures are about parents and selections, not about geometry
function createHolder(definition) {
  const holder = createWidget(Object.assign({ type: 'holder' }, definition));
  holder.coordLocalFromCoordGlobal = coord => ({ x: coord.x - holder.get('x'), y: coord.y - holder.get('y') });
  return holder;
}

function createHand(multiSelectMax, numCards, handProperties = {}) {
  const hand = createHolder(Object.assign({ id: `${testName}-hand`, multiSelectMax }, handProperties));
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
    // z bookkeeping lives in the concatenated global scope of the shipped bundle
    globalThis.getMaxZ = () => 0;
    globalThis.updateMaxZ = () => {};
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

  describe('Given a holder with multiSelectMax as a string', () => {
    let hand, cards;
    beforeEach(async () => {
      ({ hand, cards } = createHand('2', 3));
    });
    afterEach(() => {
      cards.concat(hand).forEach(w => removeWidget(w.get('id')));
    });

    describe('When a widget in it is clicked', () => {
      test('Then it is selected just like with a number', async () => {
        await cards[0].click();
        expect(selectedIDs(cards)).toEqual([ cards[0].get('id') ]);
      });
    });
  });

  describe('Given a selected widget inside a pile inside the holder', () => {
    let hand, cards, pile;
    beforeEach(async () => {
      ({ hand, cards } = createHand('all', 2));
      pile = createWidget({ id: `${testName}-pile`, type: 'pile', parent: hand.get('id') });
      await cards[0].set('parent', pile.get('id'));
      await cards[0].click();
    });
    afterEach(() => {
      cards.concat(hand, pile).forEach(w => removeWidget(w.get('id')));
    });

    describe('When it is selected by clicking', () => {
      test('Then the holder around the pile governs the selection', async () => {
        expect(selectedIDs(cards)).toEqual([ cards[0].get('id') ]);
      });
    });

    describe('When a routine moves it out of the pile', () => {
      test('Then it is no longer selected', async () => {
        const table = createHolder({ id: `${testName}-table`, dropTarget: {} });
        await cards[0].moveToHolder(table);
        expect(cards[0].get('parent')).toBe(table.get('id'));
        expect(cards[0].get('selectedBy')).toEqual([]);
        removeWidget(table.get('id'));
      });
    });
  });

  describe('Given a dragged widget that the rest of the selection follows', () => {
    let hand, cards, target;
    beforeEach(async () => {
      ({ hand, cards } = createHand('all', 3, { x: 0, y: 0 }));
      for(const card of cards)
        await card.set('cardType', 'plain');
      await cards[2].set('cardType', 'other');
      for(const card of cards)
        await card.click();
    });
    afterEach(() => {
      cards.concat(hand, target).filter(w=>w).forEach(w => removeWidget(w.get('id')));
      target = null;
    });

    // the followers are not dragged themselves, so moveMultiSelectionAlong has to apply
    // the drop checks that getValidDropTargets applies to the widget under the mouse
    async function dropInto(holder) {
      cards[0].multiSelectSource = hand;
      cards[0].multiSelectDrag = cards.slice(1);
      await finishDrop(holder);
    }

    async function finishDrop(holder) {
      target = holder;
      if(holder)
        await cards[0].moveToHolder(holder);
      else
        await cards[0].set('parent', null);
      await cards[0].moveMultiSelectionAlong();
    }

    // what a drag does once it has carried the widget out of the holder: move() takes
    // the rest of the selection out as well and keeps it next to the dragged widget
    async function dragOutOfHolder(x = 500, y = 300) {
      cards[0].multiSelectSource = hand;
      cards[0].multiSelectDrag = cards.slice(1);
      cards[0].multiSelectPicked = [];
      cards[0].currentParent = hand;
      await cards[0].checkParent(true);
      await cards[0].setPosition(x, y, 5);
      await cards[0].dragMultiSelectionAlong();
    }

    describe('When the drag carries it out of the holder', () => {
      test('Then the rest of the selection is carried along with it', async () => {
        await dragOutOfHolder();
        expect(cards.map(c=>c.get('parent'))).toEqual([ null, null, null ]);
        expect(cards.map(c=>c.get('x'))).toEqual([ 500, 500+cards[0].get('width'), 500+2*cards[0].get('width') ]);
        expect(cards.slice(1).map(c=>c.get('dragging'))).toEqual([ playerName, playerName ]);
        expect(selectedIDs(cards)).toEqual([]);
      });
    });

    describe('When the drag carries it towards the right edge of the surface', () => {
      test('Then the followers fan out to the other side instead of off the surface', async () => {
        const width = cards[0].get('width');
        await dragOutOfHolder(1600-width, 300);
        expect(cards.map(c=>c.get('x'))).toEqual([ 1600-width, 1600-2*width, 1600-3*width ]);
        expect(cards.every(c=>c.get('x') >= 0 && c.get('x') + width <= 1600)).toBe(true);
      });
    });

    describe('When the holder it is dropped into refuses one of the carried ones', () => {
      test('Then that one goes back into the holder it was picked from, still selected', async () => {
        await dragOutOfHolder();
        await finishDrop(createHolder({ id: `${testName}-target`, dropTarget: { cardType: 'plain' } }));
        expect(cards.map(c=>c.get('parent'))).toEqual([ target.get('id'), target.get('id'), hand.get('id') ]);
        expect(selectedIDs(cards)).toEqual([ cards[2].get('id') ]);
        expect(cards[1].get('dragging')).toBe(null);
      });
    });

    describe('When the drag ends back in the holder it started in', () => {
      test('Then the whole selection is put back and stays selected', async () => {
        await dragOutOfHolder();
        await finishDrop(hand);
        expect(cards.map(c=>c.get('parent'))).toEqual([ hand.get('id'), hand.get('id'), hand.get('id') ]);
        expect(selectedIDs(cards)).toEqual(cards.map(c=>c.get('id')));
        target = null;
      });
    });

    describe('When the target rejects one of them', () => {
      test('Then that one stays in the holder', async () => {
        await dropInto(createHolder({ id: `${testName}-target`, dropTarget: { cardType: 'plain' } }));
        expect(cards.map(c=>c.get('parent'))).toEqual([ target.get('id'), target.get('id'), hand.get('id') ]);
      });
    });

    describe('When the target has a dropLimit that is already used up', () => {
      test('Then no follower is forced into it', async () => {
        await dropInto(createHolder({ id: `${testName}-target`, dropTarget: {}, dropLimit: 1 }));
        expect(cards.map(c=>c.get('parent'))).toEqual([ target.get('id'), hand.get('id'), hand.get('id') ]);
      });
    });

    describe('When the widget is dropped on the table and the holder does not space its children', () => {
      test('Then the followers are spread out instead of landing on one spot', async () => {
        await cards[0].setPosition(500, 300, 5);
        await dropInto(null);
        expect(cards.map(c=>c.get('parent'))).toEqual([ null, null, null ]);
        expect(cards.map(c=>c.get('x'))).toEqual([ 500, 500+cards[0].get('width'), 500+2*cards[0].get('width') ]);
        expect(cards.map(c=>c.get('y'))).toEqual([ 300, 300, 300 ]);
      });
    });
  });

  describe('Given a holder that spreads its widgets further apart than the surface allows', () => {
    let hand, cards;
    beforeEach(async () => {
      ({ hand, cards } = createHand('all', 3, { x: 0, y: 0, stackOffsetX: 800 }));
      for(const card of cards)
        await card.click();
    });
    afterEach(() => {
      cards.concat(hand).forEach(w => removeWidget(w.get('id')));
    });

    describe('When a drag carries the selection out of it', () => {
      test('Then the followers move closer together so that they stay on the surface', async () => {
        cards[0].multiSelectSource = hand;
        cards[0].multiSelectDrag = cards.slice(1);
        cards[0].multiSelectPicked = [];
        cards[0].currentParent = hand;
        await cards[0].checkParent(true);
        await cards[0].setPosition(100, 300, 5);
        await cards[0].dragMultiSelectionAlong();
        expect(cards.map(c=>c.get('x'))).toEqual([ 100, 800, 1500 ]);
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
