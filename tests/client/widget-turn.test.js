import { widgets } from '../../client/js/serverstate.js';

import { createWidget, removeWidget } from './client-util.js';

describe("Scenarios: TURN function", () => {
  const testName = "widget-turn";
  let button;
  let seatIds = [];

  function addSeat(id, index, turn) {
    createWidget({ id, type: 'seat', index, player: 'p', turn });
    seatIds.push(id);
  }

  function seat(id) {
    return widgets.get(id);
  }

  beforeAll(() => {
    button = createWidget({ id: `${testName}-button`, type: 'button' });
    window.jeRoutineLogging = false;
  });
  afterAll(() => {
    removeWidget(button.get('id'));
  });
  afterEach(() => {
    seatIds.forEach(removeWidget);
    seatIds = [];
  });

  describe("Given seats whose lowest index is shared by two seats that both have turn", () => {
    beforeAll(async () => {
      await button.set('clickRoutine', [ { func: 'TURN', turn: 1 } ]);
    });
    beforeEach(() => {
      addSeat(`${testName}-a`, 1, true);
      addSeat(`${testName}-b`, 1, true);
      addSeat(`${testName}-c`, 2, false);
    });
    describe("When TURN advances forward", () => {
      test("Then the turn moves to the next index instead of getting stuck", async () => {
        await button.click();
        expect(seat(`${testName}-a`).get('turn')).toBe(false);
        expect(seat(`${testName}-b`).get('turn')).toBe(false);
        expect(seat(`${testName}-c`).get('turn')).toBe(true);
      });
    });
  });

  describe("Given seats with a single seat per index", () => {
    beforeAll(async () => {
      await button.set('clickRoutine', [ { func: 'TURN', turn: 1 } ]);
    });
    beforeEach(() => {
      addSeat(`${testName}-x`, 1, true);
      addSeat(`${testName}-y`, 2, false);
      addSeat(`${testName}-z`, 3, false);
    });
    describe("When TURN advances forward", () => {
      test("Then the turn moves to the next seat", async () => {
        await button.click();
        expect(seat(`${testName}-x`).get('turn')).toBe(false);
        expect(seat(`${testName}-y`).get('turn')).toBe(true);
        expect(seat(`${testName}-z`).get('turn')).toBe(false);
      });
    });
  });

  describe("Given seats sharing the lowest backward-order index that both have turn", () => {
    beforeAll(async () => {
      await button.set('clickRoutine', [ { func: 'TURN', turn: 1, turnCycle: 'backward' } ]);
    });
    beforeEach(() => {
      addSeat(`${testName}-ba`, 3, true);
      addSeat(`${testName}-bb`, 3, true);
      addSeat(`${testName}-bc`, 2, false);
    });
    describe("When TURN advances backward", () => {
      test("Then the turn moves to the next index instead of getting stuck", async () => {
        await button.click();
        expect(seat(`${testName}-ba`).get('turn')).toBe(false);
        expect(seat(`${testName}-bb`).get('turn')).toBe(false);
        expect(seat(`${testName}-bc`).get('turn')).toBe(true);
      });
    });
  });

  describe("Given seats where none has turn", () => {
    beforeAll(async () => {
      await button.set('clickRoutine', [ { func: 'TURN', turn: 1 } ]);
    });
    beforeEach(() => {
      addSeat(`${testName}-m`, 1, false);
      addSeat(`${testName}-n`, 2, false);
    });
    describe("When TURN advances forward", () => {
      // the seat order is left untouched when nobody holds the turn, matching the
      // behavior that existed before the duplicate-index fix
      test("Then it advances relative to the unrotated seat order", async () => {
        await button.click();
        expect(seat(`${testName}-m`).get('turn')).toBe(false);
        expect(seat(`${testName}-n`).get('turn')).toBe(true);
      });
    });
  });
});
