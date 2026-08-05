import { jest } from '@jest/globals';

import { Widget } from '../../client/js/widgets/widget.js';

import { createWidget, loadWidgetClasses, removeWidget } from './client-util.js';

describe("Scenarios: Moving widgets with fillTo", () => {
  const testName = "widget-move";
  let testWidget;
  let holder;
  let movables;

  beforeAll(() => {
    const testWidgetDef = {
      id: `${testName}-test-widget`,
      clickable: true,
      debug: false,
      type: "widget"
    }
    testWidget = createWidget(testWidgetDef);
    window.jeRoutineLogging = false;
    window.getMaxZ = () => 0;
    window.updateMaxZ = () => {};
    // onChildAddAlign positions the moved widget via getElementTransform, which needs
    // DOMMatrix/DOMPoint that jsdom doesn't implement; moving/counting children doesn't
    // depend on that positioning, so it's stubbed out here.
    jest.spyOn(Widget.prototype, 'onChildAddAlign').mockImplementation(async () => {});
  });
  afterAll(() => {
    removeWidget(testWidget.get('id'));
  });

  function moveRoutine(fillTo) {
    const move = { func: "MOVE", collection: "DEFAULT", to: holder.get('id') };
    if(fillTo !== undefined)
      move.fillTo = fillTo;
    return [
      { func: "SELECT", property: "text", value: "moveThis" },
      move
    ];
  }

  function createMovables(count) {
    const widgets = [];
    for(let i = 0; i < count; i++) {
      const w = createWidget({ id: `${testName}-movable-${i}`, type: "widget", text: "moveThis" });
      widgets.push(w);
    }
    return widgets;
  }

  describe("Given 3 widgets available to move and an empty holder", () => {
    beforeEach(() => {
      holder = createWidget({ id: `${testName}-holder`, type: "widget" });
      movables = createMovables(3);
    });
    afterEach(() => {
      movables.forEach(w => removeWidget(w.get('id')));
      removeWidget(holder.get('id'));
    });

    describe("When fillTo is 0", () => {
      test("Then no widgets are moved", async () => {
        await testWidget.set('clickRoutine', moveRoutine(0));
        await testWidget.click();
        expect(holder.children().length).toBe(0);
      });
    });

    describe("When fillTo is unset", () => {
      test("Then all widgets are moved", async () => {
        await testWidget.set('clickRoutine', moveRoutine(undefined));
        await testWidget.click();
        expect(holder.children().length).toBe(3);
      });
    });

    describe("When fillTo is 2", () => {
      test("Then widgets are moved until the holder has 2 children", async () => {
        await testWidget.set('clickRoutine', moveRoutine(2));
        await testWidget.click();
        expect(holder.children().length).toBe(2);
      });
    });
  });
});

describe("Scenarios: Moving widgets to a seat with fillTo", () => {
  const testName = "widget-move-seat";
  const player = "player one";
  let Holder, Seat;
  let testWidget;
  let hand, seat, source, cards;

  beforeAll(async () => {
    ({ Holder, Seat } = await loadWidgetClasses());
    testWidget = createWidget({ id: `${testName}-test-widget`, clickable: true, type: "widget" });
    window.jeRoutineLogging = false;
    window.getMaxZ = () => 0;
    window.updateMaxZ = () => {};
    jest.spyOn(Widget.prototype, 'onChildAddAlign').mockImplementation(async () => {});
  });
  afterAll(() => {
    removeWidget(testWidget.get('id'));
  });

  // the default dropTarget of a holder only accepts cards, so accept everything instead of
  // setting up a deck just to have widgets that count as the contents of the hand
  function createHolder(id, properties) {
    return createWidget(Object.assign({ id, type: "holder", dropTarget: {} }, properties), Holder);
  }

  async function addToHand(id, owner, parent) {
    const card = createWidget({ id, type: "widget" });
    await card.set('parent', parent || hand.get('id'));
    await card.set('owner', owner);
    return card;
  }

  // a real pile would have to be imported as a global like the other widget classes - all
  // that Holder.children() looks at is the type and the children, so a stand-in will do
  async function addPileToHand(id, owner, cardCount) {
    const pile = createWidget({ id, type: "pile" });
    await pile.set('parent', hand.get('id'));
    await pile.set('owner', owner);
    const piled = [ pile ];
    for(let i = 0; i < cardCount; i++)
      piled.push(await addToHand(`${id}-card-${i}`, owner, id));
    return piled;
  }

  async function moveToSeat(fillTo) {
    await testWidget.set('clickRoutine', [
      { func: "MOVE", from: source.get('id'), to: seat.get('id'), fillTo }
    ]);
    await testWidget.click();
  }

  function setUpSeat(handProperties) {
    beforeEach(async () => {
      hand = createHolder(`${testName}-hand`, handProperties);
      seat = createWidget({ id: `${testName}-seat`, type: "seat", hand: hand.get('id'), player }, Seat);
      source = createHolder(`${testName}-source`);
      cards = [];
      for(let i = 0; i < 6; i++) {
        const card = createWidget({ id: `${testName}-card-${i}`, type: "widget" });
        await card.set('parent', source.get('id'));
        cards.push(card);
      }
    });
    afterEach(() => {
      cards.forEach(c => removeWidget(c.get('id')));
      [ source, seat, hand ].forEach(w => removeWidget(w.get('id')));
    });
  }

  describe("Given a seat whose hand keeps its children per owner", () => {
    setUpSeat({ childrenPerOwner: true });

    describe("When 2 cards are moved to the empty hand with fillTo 2", () => {
      test("Then the seat's player owns 2 cards", async () => {
        await moveToSeat(2);
        expect(seat.children().length).toBe(2);
        expect(hand.children().length).toBe(2);
      });
    });

    describe("When the hand already holds 2 cards of another player", () => {
      beforeEach(async () => {
        cards.push(await addToHand(`${testName}-foreign-0`, 'somebody else'));
        cards.push(await addToHand(`${testName}-foreign-1`, 'somebody else'));
      });

      test("Then fillTo 2 still gives the seat's player 2 cards", async () => {
        await moveToSeat(2);
        expect(seat.children().length).toBe(2);
        expect(hand.children().length).toBe(4);
      });
    });

    describe("When the seat's player already holds 2 cards", () => {
      beforeEach(async () => {
        cards.push(await addToHand(`${testName}-owned-0`, player));
        cards.push(await addToHand(`${testName}-owned-1`, player));
      });

      test("Then fillTo 3 tops the player up to 3 cards", async () => {
        await moveToSeat(3);
        expect(seat.children().length).toBe(3);
      });

      test("Then fillTo 0 moves nothing", async () => {
        await moveToSeat(0);
        expect(seat.children().length).toBe(2);
        expect(source.children().length).toBe(6);
      });

    });

    describe("When the seat's player keeps their 3 cards in a pile", () => {
      beforeEach(async () => {
        cards.push(...await addPileToHand(`${testName}-own-pile`, player, 3));
      });

      test("Then the pile counts as the one widget the player owns", async () => {
        await moveToSeat(2);
        expect(seat.children().length).toBe(2);
      });

      test("Then another player's pile in the hand does not change that count", async () => {
        cards.push(...await addPileToHand(`${testName}-foreign-pile`, 'somebody else', 3));
        await moveToSeat(2);
        expect(seat.children().length).toBe(2);
      });
    });
  });

  describe("Given a seat whose hand keeps its children per owner and only accepts cards", () => {
    setUpSeat({ childrenPerOwner: true, dropTarget: { type: "card" } });

    describe("When the seat's player owns 2 widgets the hand's dropTarget rejects", () => {
      beforeEach(async () => {
        cards.push(await addToHand(`${testName}-rejected-0`, player));
        cards.push(await addToHand(`${testName}-rejected-1`, player));
      });

      test("Then they still count towards fillTo 2", async () => {
        await moveToSeat(2);
        expect(seat.children().length).toBe(2);
        expect(source.children().length).toBe(6);
      });
    });
  });

  describe("Given a seat whose hand is a regular holder", () => {
    setUpSeat({ childrenPerOwner: false });

    describe("When 2 cards are moved to the empty hand with fillTo 2", () => {
      test("Then the hand holds 2 cards", async () => {
        await moveToSeat(2);
        expect(hand.children().length).toBe(2);
      });
    });

    describe("When the hand already holds 2 cards", () => {
      beforeEach(async () => {
        cards.push(await addToHand(`${testName}-held-0`, null));
        cards.push(await addToHand(`${testName}-held-1`, null));
      });

      test("Then fillTo 5 tops the hand up to 5 cards", async () => {
        await moveToSeat(5);
        expect(hand.children().length).toBe(5);
      });

      test("Then fillTo 2 moves nothing", async () => {
        await moveToSeat(2);
        expect(hand.children().length).toBe(2);
        expect(source.children().length).toBe(6);
      });

      test("Then a MOVE without from tops the collection up to fillTo 5 as well", async () => {
        await testWidget.set('clickRoutine', [
          { func: "SELECT", property: "parent", value: source.get('id') },
          { func: "MOVE", to: seat.get('id'), fillTo: 5 }
        ]);
        await testWidget.click();
        expect(hand.children().length).toBe(5);
      });

      test("Then the legacy mode keeps the old behavior of ignoring the hand's contents", async () => {
        window.legacyMode = name => name == 'seatFillToIgnoresHandContents';
        try {
          await moveToSeat(5);
        } finally {
          window.legacyMode = () => false;
        }
        expect(hand.children().length).toBe(7);
      });
    });
  });
});
