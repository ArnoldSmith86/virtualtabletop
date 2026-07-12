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
