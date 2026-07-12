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
          "order": containers.map(c => c.get('id')),
          "widgets": "all",
          "steps": 1
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

  describe("Given a container with two tokens and a reverse SHIFT without wrap", () => {
    beforeEach(async () => {
      await createTokens(testName, containers[0].get('id'), 2);

      await button.set('clickRoutine', [
        {
          "func": "SHIFT",
          "order": containers.map(c => c.get('id')),
          "widgets": "all",
          "steps": 1,
          "reverse": true,
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
          "order": containers.map(c => c.get('id')),
          "widgets": "all",
          "steps": 1
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
          "order": containers.map(c => c.get('id')),
          "widgets": "all",
          "steps": 2
        }
      ]);
    });

    describe("When clicked", () => {
      test("Then the token moves two positions along the order", async () => {
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
          "order": containers.map(c => c.get('id')),
          "widgets": "top",
          "steps": 1
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

  function createSeat(id, handId, player) {
    const seat = createWidget({ id, type: 'seat', hand: handId, player });
    created.push(seat);
    return seat;
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
      [ token ] = await createTokens(testName, handA.get('id'), 1);

      await button.set('clickRoutine', [
        {
          "func": "SHIFT",
          "order": [ seatA.get('id'), seatB.get('id') ],
          "widgets": "all",
          "steps": 1
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

  describe("Given a three-entry shift whose middle target seat is empty", () => {
    let holderX, holderZ, tokenX, tokenZ;
    beforeEach(async () => {
      // order = [ holderX, emptySeat, holderZ ] with a token in each holder.
      // The empty seat is the target of holderX's move; holderZ wraps around to
      // holderX. A non-atomic implementation would commit holderZ's move before
      // discovering the empty seat, leaving the table half-rotated.
      holderX = createHand(`${testName}-holderX`);
      createHand(`${testName}-handEmpty`);
      holderZ = createHand(`${testName}-holderZ`);
      const seatEmpty = createSeat(`${testName}-seatEmpty`, `${testName}-handEmpty`, null);
      [ tokenX ] = await createTokens(testName, holderX.get('id'), 1);
      [ tokenZ ] = await createTokens(testName, holderZ.get('id'), 1);

      await button.set('clickRoutine', [
        {
          "func": "SHIFT",
          "order": [ holderX.get('id'), seatEmpty.get('id'), holderZ.get('id') ],
          "widgets": "all",
          "steps": 1
        }
      ]);
    });

    describe("When clicked", () => {
      test("Then nothing moves (the shift aborts atomically)", async () => {
        await button.click();
        expect(tokenX.get('parent')).toBe(`${testName}-holderX`);
        expect(tokenZ.get('parent')).toBe(`${testName}-holderZ`);
      });
    });
  });

  describe("Given a seat in the order without a valid hand", () => {
    let holder, token;
    beforeEach(async () => {
      holder = createHand(`${testName}-holder`);
      const seatNoHand = createSeat(`${testName}-seatNoHand`, null, 'Alice');
      [ token ] = await createTokens(testName, holder.get('id'), 1);

      await button.set('clickRoutine', [
        {
          "func": "SHIFT",
          "order": [ holder.get('id'), seatNoHand.get('id') ],
          "widgets": "all",
          "steps": 1
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
