import { createWidget, removeWidget } from './client-util.js';
import { dropTargets, getValidDropTargets } from '../../client/js/main.js';
import { removeWidgetLocal, widgets } from '../../client/js/serverstate.js';

// Regression test for the "Maximum call stack size exceeded" crash that happened
// when the room state contained a cycle in the parent chain (e.g. two widgets
// being each other's parent). Every method that walks the parent chain by
// following the 'parent' property must terminate instead of recursing forever.
//
// Most tests manufacture the cycle directly in each widget's state because the
// parent-walk guards are independent of geometry. The runtime graph regressions
// apply the same parent changes through applyDelta() and set() instead, because
// both have to keep the parent/childArray graph acyclic.

describe("Cyclic parent chains", () => {
  const testName = "cyclic-parent";
  let w1, w2, w3;
  let copyCount = 0;

  beforeEach(() => {
    window.jeRoutineLogging = false;
    window.removeWidgetLocal = removeWidgetLocal;
    window.dropTargets = dropTargets;
    window.generateUniqueWidgetID = ()=>`${testName}-copy-${++copyCount}`;
    // the widget classes are globals provided by main.js at runtime, none of the test widgets is a card
    window.Card = class Card {};
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
      if(widgets.has(w.get('id')))
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

  test("cyclic parent deltas keep the runtime child graph acyclic", () => {
    delete w1.state.parent;
    delete w2.state.parent;

    w2.applyDelta({ parent: w1.get('id') });
    w1.applyDelta({ parent: w2.get('id') });

    expect(w1.get('parent')).toBe(w2.get('id'));
    expect(w2.get('parent')).toBe(w1.get('id'));
    expect(w1.parent).toBeUndefined();
    expect(w2.parent).toBe(w1);
    expect(w1.childArray).toEqual([ w2 ]);
    expect(w2.childArray).toEqual([]);
    expect(() => w1.applyRemoveRecursive()).not.toThrow();
    widgets.delete(w1.get('id'));
    widgets.delete(w2.get('id'));
  });

  test("setting a cyclic parent keeps the runtime child graph acyclic", async () => {
    delete w1.state.parent;
    delete w2.state.parent;

    await w2.set('parent', w1.get('id'));
    await w1.set('parent', w2.get('id'));

    expect(w1.get('parent')).toBe(w2.get('id'));
    expect(w2.get('parent')).toBe(w1.get('id'));
    // the edge closing the cycle is not linked into the child graph on the client that set the property either
    expect(w1.childArray).toEqual([ w2 ]);
    expect(w2.childArray).toEqual([]);

    // replacing the room state tears every top level widget down recursively
    const removed = new Set();
    for(const w of [ w1, w2 ])
      expect(() => w.applyRemoveRecursive(removed)).not.toThrow();
    widgets.delete(w1.get('id'));
    widgets.delete(w2.get('id'));
  });

  test("recursive readonly copies terminate on a cyclic parent chain", () => {
    for(const w of [ w1, w3 ])
      expect(() => w.renderReadonlyCopy({}, document.body, 'all').domElement.remove()).not.toThrow();
  });

  test("DELETE terminates on cyclic parent state", async () => {
    await expect(w1.evaluateRoutine(
      [{ func: 'DELETE', collection: 'cyclicWidgets' }],
      {},
      { cyclicWidgets: [ w1 ] }
    )).resolves.toEqual(expect.any(Object));

    expect(widgets.has(w1.get('id'))).toBe(false);
    expect(widgets.has(w2.get('id'))).toBe(false);
  });
});
