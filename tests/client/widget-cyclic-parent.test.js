import { createWidget, removeWidget } from './client-util.js';
import { dropTargets, getValidDropTargets } from '../../client/js/main.js';

// Regression test for the "Maximum call stack size exceeded" crash that happened
// when the room state contained a cycle in the parent chain (e.g. two widgets
// being each other's parent). Every method that walks the parent chain by
// following the 'parent' property must terminate instead of recursing forever.
//
// The cycle is manufactured directly in each widget's state: going through
// set('parent') would trigger geometry helpers that rely on DOMMatrix, which
// jsdom does not implement. The recursion guard being tested here is independent
// of that geometry, so a state-level cycle is enough to exercise it.

describe("Cyclic parent chains", () => {
  const testName = "cyclic-parent";
  let w1, w2, w3;

  beforeEach(() => {
    w1 = createWidget({ id: `${testName}-1`, type: "widget" });
    w2 = createWidget({ id: `${testName}-2`, type: "widget" });
    w3 = createWidget({ id: `${testName}-3`, type: "widget" });
    // mutual cycle w1 <-> w2 and a self-referencing widget w3
    w1.state.parent = w2.get('id');
    w2.state.parent = w1.get('id');
    w3.state.parent = w3.get('id');
  });
  afterEach(() => {
    for(const w of [ w1, w2, w3 ])
      removeWidget(w.get('id'));
  });

  test("ancestors() stops on the cycle and lists each widget once", () => {
    for(const w of [ w1, w2, w3 ]) {
      const chain = w.ancestors();
      expect(chain).toContain(w);
      // no widget appears twice - the walk terminated at the cycle
      expect(chain.length).toBe(new Set(chain).size);
    }
    expect(w1.ancestors()).toEqual([ w1, w2 ]);
    expect(w3.ancestors()).toEqual([ w3 ]);
  });

  test("parent-chain methods terminate instead of overflowing the stack", () => {
    for(const w of [ w1, w2, w3 ]) {
      expect(() => w.get('_absoluteRotation')).not.toThrow();
      expect(() => w.get('_absoluteScale')).not.toThrow();
      expect(() => w.get('_ancestor')).not.toThrow();
      expect(() => w.isDescendantOf(w2)).not.toThrow();
      expect(() => w.inheritSeatVisibility(null)).not.toThrow();
      expect(() => w.requiresHiddenCursor()).not.toThrow();
    }
    expect(w1.isDescendantOf(w2)).toBe(true);
    expect(w3.isDescendantOf(w3)).toBe(true);
  });

  test("drop-target checks terminate on cyclic target ancestry", () => {
    w1.state.dropTarget = {};
    w1.isVisible = () => true;
    dropTargets.set(w1.get('id'), w1);

    expect(getValidDropTargets(w3)).toContain(w1);
    expect(getValidDropTargets(w2)).not.toContain(w1);
  });
});
