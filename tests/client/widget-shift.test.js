import { Widget } from '../../client/js/widgets/widget.js';
import { createWidget, removeWidget } from './client-util.js';

// getMaxZ/updateMaxZ are attached to window only during browser startup, which
// doesn't run under jsdom. Provide minimal per-layer implementations so the real
// bringToFront (z = max + 1) works and stacking-order assertions hold.
const maxZ = {};
global.getMaxZ = layer => maxZ[layer] || 0;
global.updateMaxZ = (layer, z) => { maxZ[layer] = Math.max(maxZ[layer] || 0, z); };
global.resetMaxZ = layer => { maxZ[layer] = 0; };

function createContainers(testName, count) {
  const containers = [];
  for(let i = 0; i < count; i++) {
    const container = createWidget({ id: `${testName}-container-${i}`, type: 'widget' });
    // jsdom has no DOMMatrix, which the real coordinate-alignment path needs;
    // SHIFT doesn't care about x/y, so skip alignment when adding children.
    container.onChildAddAlign = async () => {};
    containers.push(container);
  }
  return containers;
}

async function createTokens(testName, containerId, count) {
  const tokens = [];
  for(let i = 0; i < count; i++) {
    const token = createWidget({ id: `${testName}-token-${containerId}-${i}`, type: 'widget' });
    await token.set('parent', containerId);
    await token.set('z', i);
    tokens.push(token);
  }
  return tokens;
}

function idsOf(containers) {
  return containers.map(c => c.children().map(w => w.get('id')));
}

describe("Scenarios: Shifting widgets between containers", () => {
  const testName = "widget-shift";
  let containers;
  let button;

  beforeEach(async () => {
    containers = createContainers(testName, 3);
    button = createWidget({ id: `${testName}-button`, type: 'widget' });
    window.jeRoutineLogging = false;
  });

  afterEach(() => {
    containers.forEach(c => c.children().forEach(w => removeWidget(w.get('id'))));
    containers.forEach(c => removeWidget(c.get('id')));
    removeWidget(button.get('id'));
  });

  describe("Given three containers each with one token and a wrap-around SHIFT", () => {
    beforeEach(async () => {
      await createTokens(testName, containers[0].get('id'), 1);
      await createTokens(testName, containers[1].get('id'), 1);
      await createTokens(testName, containers[2].get('id'), 1);

      await button.set('clickRoutine', [
        {
          "func": "SHIFT",
          "holders": containers.map(c => c.get('id')),
          "widgets": "all",
          "interval": 1
        }
      ]);
    });

    describe("When clicked", () => {
      test("Then every token moves one step forward, wrapping to the first container", async () => {
        const before = idsOf(containers);
        await button.click();
        const after = idsOf(containers);

        expect(after[1]).toEqual(before[0]);
        expect(after[2]).toEqual(before[1]);
        expect(after[0]).toEqual(before[2]);
      });
    });
  });

  describe("Given a container with two tokens and a backward SHIFT without wrap", () => {
    beforeEach(async () => {
      await createTokens(testName, containers[0].get('id'), 2);

      await button.set('clickRoutine', [
        {
          "func": "SHIFT",
          "holders": containers.map(c => c.get('id')),
          "widgets": "all",
          "interval": 1,
          "direction": "backward",
          "wrap": false
        }
      ]);
    });

    describe("When clicked", () => {
      test("Then tokens in the first container stay put instead of wrapping to the last", async () => {
        const before = idsOf(containers);
        await button.click();
        const after = idsOf(containers);

        expect(after[0].sort()).toEqual(before[0].sort());
        expect(after[1]).toEqual([]);
        expect(after[2]).toEqual([]);
      });
    });
  });

  describe("Given a container with a three-widget stack and a wrap-around SHIFT", () => {
    let stack;
    beforeEach(async () => {
      stack = await createTokens(testName, containers[0].get('id'), 3);

      await button.set('clickRoutine', [
        {
          "func": "SHIFT",
          "holders": containers.map(c => c.get('id')),
          "widgets": "all",
          "interval": 1
        }
      ]);
    });

    describe("When clicked", () => {
      test("Then the whole stack moves and keeps its stacking order", async () => {
        const before = containers[0].children().map(w => w.get('id'));
        await button.click();
        const after = containers[1].children().map(w => w.get('id'));

        expect(containers[0].children()).toEqual([]);
        expect(after).toEqual(before);
      });
    });
  });

  describe("Given three containers each with one token and a two-step SHIFT", () => {
    beforeEach(async () => {
      await createTokens(testName, containers[0].get('id'), 1);

      await button.set('clickRoutine', [
        {
          "func": "SHIFT",
          "holders": containers.map(c => c.get('id')),
          "widgets": "all",
          "interval": 2
        }
      ]);
    });

    describe("When clicked", () => {
      test("Then the token moves two positions along the holders", async () => {
        const before = idsOf(containers);
        await button.click();
        const after = idsOf(containers);

        expect(after[2]).toEqual(before[0]);
        expect(after[0]).toEqual([]);
      });
    });
  });

  describe("Given containers with two tokens each and widgets set to 'top'", () => {
    beforeEach(async () => {
      await createTokens(testName, containers[0].get('id'), 2);
      await createTokens(testName, containers[1].get('id'), 2);

      await button.set('clickRoutine', [
        {
          "func": "SHIFT",
          "holders": containers.map(c => c.get('id')),
          "widgets": "top",
          "interval": 1
        }
      ]);
    });

    describe("When clicked", () => {
      test("Then only the top token of each container moves", async () => {
        expect(containers[0].children().length).toBe(2);
        await button.click();

        expect(containers[0].children().length).toBe(1);
        expect(containers[1].children().length).toBe(2);
        expect(containers[2].children().length).toBe(1);
      });
    });
  });
});

describe("Scenarios: Shifting widgets through seats", () => {
  const testName = "widget-shift-seat";
  let button;
  let created;

  // A seat resolves (in SHIFT) to its `hand` holder. Model that with a base
  // widget for the seat plus a holder for the hand; the holder emulates a real
  // Holder's `childrenPerOwner` behavior (owner = the arriving child's
  // targetPlayer) so the ownership-assignment path can be asserted.
  function createHand(id) {
    const hand = createWidget({ id, type: 'widget', childrenPerOwner: true });
    hand.onChildAddAlign = async () => {};
    hand.onChildAdd = async function(child, oldParentID) {
      await Widget.prototype.onChildAdd.call(this, child, oldParentID);
      if(this.get('childrenPerOwner'))
        await child.set('owner', child.targetPlayer || null);
    };
    created.push(hand);
    return hand;
  }

  function createSeat(id, handId, player, index) {
    const seat = createWidget({ id, type: 'seat', hand: handId, player, index });
    created.push(seat);
    return seat;
  }

  // a real childrenPerOwner hand stamps the owner onto everything that arrives in
  // it, so widgets placed there directly for a test need the same owner
  async function createOwnedTokens(handId, count, player) {
    const tokens = await createTokens(testName, handId, count);
    for(const token of tokens)
      await token.set('owner', player);
    return tokens;
  }

  beforeEach(() => {
    created = [];
    button = createWidget({ id: `${testName}-button`, type: 'widget' });
    window.jeRoutineLogging = false;
  });

  afterEach(() => {
    created.forEach(w => w.children().forEach(c => removeWidget(c.get('id'))));
    created.forEach(w => removeWidget(w.get('id')));
    removeWidget(button.get('id'));
  });

  describe("Given two occupied seats and a token in the first seat's hand", () => {
    let handA, token;
    beforeEach(async () => {
      handA = createHand(`${testName}-handA`);
      createHand(`${testName}-handB`);
      const seatA = createSeat(`${testName}-seatA`, handA.get('id'), 'Alice');
      const seatB = createSeat(`${testName}-seatB`, `${testName}-handB`, 'Bob');
      [ token ] = await createOwnedTokens(handA.get('id'), 1, 'Alice');

      await button.set('clickRoutine', [
        {
          "func": "SHIFT",
          "holders": [ seatA.get('id'), seatB.get('id') ],
          "widgets": "all",
          "interval": 1
        }
      ]);
    });

    describe("When clicked", () => {
      test("Then the token moves into the other seat's hand and is owned by that seat's player", async () => {
        expect(token.get('parent')).toBe(`${testName}-handA`);
        await button.click();

        expect(token.get('parent')).toBe(`${testName}-handB`);
        expect(token.get('owner')).toBe('Bob');
      });
    });
  });

  describe("Given three seats where the middle seat is unoccupied", () => {
    let handA, token;
    beforeEach(async () => {
      handA = createHand(`${testName}-handA`);
      createHand(`${testName}-handEmpty`);
      createHand(`${testName}-handC`);
      const seatA = createSeat(`${testName}-seatA`, handA.get('id'), 'Alice');
      const seatEmpty = createSeat(`${testName}-seatEmpty`, `${testName}-handEmpty`, null);
      const seatC = createSeat(`${testName}-seatC`, `${testName}-handC`, 'Carol');
      [ token ] = await createOwnedTokens(handA.get('id'), 1, 'Alice');

      await button.set('clickRoutine', [
        {
          "func": "SHIFT",
          "holders": [ seatA.get('id'), seatEmpty.get('id'), seatC.get('id') ],
          "widgets": "all",
          "interval": 1
        }
      ]);
    });

    describe("When clicked", () => {
      test("Then the hand passes to the next occupied seat, skipping the empty one", async () => {
        await button.click();
        expect(token.get('parent')).toBe(`${testName}-handC`);
        expect(token.get('owner')).toBe('Carol');
      });
    });
  });

  describe("Given a three-entry shift whose middle seat is empty", () => {
    let holderX, holderZ, tokenX, tokenZ;
    beforeEach(async () => {
      // order = [ holderX, emptySeat, holderZ ] with a token in each holder.
      // The empty seat is ignored, so the shift cycles through [holderX, holderZ]:
      // holderX's token goes to holderZ and holderZ's token wraps to holderX.
      holderX = createHand(`${testName}-holderX`);
      createHand(`${testName}-handEmpty`);
      holderZ = createHand(`${testName}-holderZ`);
      const seatEmpty = createSeat(`${testName}-seatEmpty`, `${testName}-handEmpty`, null);
      [ tokenX ] = await createTokens(testName, holderX.get('id'), 1);
      [ tokenZ ] = await createTokens(testName, holderZ.get('id'), 1);

      await button.set('clickRoutine', [
        {
          "func": "SHIFT",
          "holders": [ holderX.get('id'), seatEmpty.get('id'), holderZ.get('id') ],
          "widgets": "all",
          "interval": 1
        }
      ]);
    });

    describe("When clicked", () => {
      test("Then the empty seat is skipped and the other entries still shift", async () => {
        await button.click();
        expect(tokenX.get('parent')).toBe(`${testName}-holderZ`);
        expect(tokenZ.get('parent')).toBe(`${testName}-holderX`);
      });
    });
  });

  describe("Given three seats that share one childrenPerOwner hand", () => {
    let hand, cardA, cardB, cardC;
    beforeEach(async () => {
      // the layout a PCIO import produces: every seat points at the same hand and
      // ownership alone says whose cards are whose
      hand = createHand(`${testName}-sharedHand`);
      const seatA = createSeat(`${testName}-seatA`, hand.get('id'), 'Alice');
      const seatB = createSeat(`${testName}-seatB`, hand.get('id'), 'Bob');
      const seatC = createSeat(`${testName}-seatC`, hand.get('id'), 'Carol');
      [ cardA, cardB, cardC ] = await createTokens(testName, hand.get('id'), 3);
      await cardA.set('owner', 'Alice');
      await cardB.set('owner', 'Bob');
      await cardC.set('owner', 'Carol');

      await button.set('clickRoutine', [
        {
          "func": "SHIFT",
          "holders": [ seatA.get('id'), seatB.get('id'), seatC.get('id') ],
          "widgets": "all",
          "interval": 1
        }
      ]);
    });

    describe("When clicked", () => {
      test("Then each card is handed to the next seat's player and stays in the shared hand", async () => {
        await button.click();

        expect(cardA.get('owner')).toBe('Bob');
        expect(cardB.get('owner')).toBe('Carol');
        expect(cardC.get('owner')).toBe('Alice');
        expect([ cardA, cardB, cardC ].map(c => c.get('parent'))).toEqual([ hand.get('id'), hand.get('id'), hand.get('id') ]);
      });
    });
  });

  // the seats are created in an order that does not match their index property, so
  // passing to handC rather than handB shows that the default follows the index
  describe("Given occupied and empty seats out of index order and a SHIFT without holders", () => {
    let handA, token;
    beforeEach(async () => {
      handA = createHand(`${testName}-handA`);
      createHand(`${testName}-handB`);
      createHand(`${testName}-handC`);
      createHand(`${testName}-handEmpty`);
      createSeat(`${testName}-seatA`, handA.get('id'), 'Alice', 1);
      createSeat(`${testName}-seatB`, `${testName}-handB`, 'Bob', 3);
      createSeat(`${testName}-seatC`, `${testName}-handC`, 'Carol', 2);
      createSeat(`${testName}-seatEmpty`, `${testName}-handEmpty`, null, 4);
      [ token ] = await createOwnedTokens(handA.get('id'), 1, 'Alice');

      await button.set('clickRoutine', [ { "func": "SHIFT" } ]);
    });

    describe("When clicked", () => {
      test("Then the hand is passed on to the occupied seat with the next index", async () => {
        await button.click();
        expect(token.get('parent')).toBe(`${testName}-handC`);
        expect(token.get('owner')).toBe('Carol');
      });
    });
  });

  describe("Given two occupied seats and a random SHIFT", () => {
    let handA, token;
    beforeEach(async () => {
      handA = createHand(`${testName}-handA`);
      createHand(`${testName}-handB`);
      const seatA = createSeat(`${testName}-seatA`, handA.get('id'), 'Alice');
      const seatB = createSeat(`${testName}-seatB`, `${testName}-handB`, 'Bob');
      [ token ] = await createOwnedTokens(handA.get('id'), 1, 'Alice');

      await button.set('clickRoutine', [
        {
          "func": "SHIFT",
          "holders": [ seatA.get('id'), seatB.get('id') ],
          "direction": "random"
        }
      ]);
    });

    describe("When clicked", () => {
      // whichever way two entries are shuffled, one step along them is a swap
      test("Then the token still ends up in the other seat's hand", async () => {
        await button.click();
        expect(token.get('parent')).toBe(`${testName}-handB`);
        expect(token.get('owner')).toBe('Bob');
      });
    });
  });

  describe("Given a seat in the holders without a valid hand", () => {
    let holder, token;
    beforeEach(async () => {
      holder = createHand(`${testName}-holder`);
      const seatNoHand = createSeat(`${testName}-seatNoHand`, null, 'Alice');
      [ token ] = await createTokens(testName, holder.get('id'), 1);

      await button.set('clickRoutine', [
        {
          "func": "SHIFT",
          "holders": [ holder.get('id'), seatNoHand.get('id') ],
          "widgets": "all",
          "interval": 1
        }
      ]);
    });

    describe("When clicked", () => {
      test("Then nothing moves", async () => {
        await button.click();
        expect(token.get('parent')).toBe(`${testName}-holder`);
      });
    });
  });
});
