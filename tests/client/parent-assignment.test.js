import { validateParentAssignment, widgets } from '../../client/js/serverstate.js';

import { createWidget, removeWidget } from './client-util.js';

// Removing a widget can cascade to descendants, so guard against ids that a
// previous removal already took out (relevant for the corrupt-cycle fixtures).
function removeWidgetIfPresent(id) {
  if(widgets.has(id))
    removeWidget(id);
}

describe("validateParentAssignment", () => {
  const testName = "parent-assignment";
  const ids = [ `${testName}-A`, `${testName}-B`, `${testName}-C` ];

  beforeAll(() => {
    // Build a parent chain A <- B <- C (A is the top-most ancestor).
    createWidget({ id: ids[0], type: 'widget' });
    createWidget({ id: ids[1], type: 'widget', parent: ids[0] });
    createWidget({ id: ids[2], type: 'widget', parent: ids[1] });
  });

  afterAll(() => {
    for(const id of ids.slice().reverse())
      removeWidgetIfPresent(id);
  });

  test("returns null when no parent is proposed", () => {
    expect(validateParentAssignment(ids[0], null)).toBe(null);
    expect(validateParentAssignment(ids[0], undefined)).toBe(null);
  });

  test("flags setting a widget as its own parent", () => {
    expect(validateParentAssignment(ids[0], ids[0])).toBe('self');
  });

  test("flags setting the parent to a direct descendant", () => {
    expect(validateParentAssignment(ids[0], ids[1])).toBe('descendant');
  });

  test("flags setting the parent to an indirect descendant", () => {
    expect(validateParentAssignment(ids[0], ids[2])).toBe('descendant');
  });

  test("allows setting the parent to a non-descendant ancestor", () => {
    expect(validateParentAssignment(ids[2], ids[0])).toBe(null);
    expect(validateParentAssignment(ids[1], ids[0])).toBe(null);
  });
});

describe("validateParentAssignment with a pre-existing cycle", () => {
  const testName = "parent-cycle";
  const ids = [ `${testName}-X`, `${testName}-Y` ];

  beforeAll(() => {
    // Force a corrupt state: X and Y are each other's parent (a cycle that this
    // very bug could have written to a save before the fix existed).
    const x = createWidget({ id: ids[0], type: 'widget', parent: ids[1] });
    const y = createWidget({ id: ids[1], type: 'widget', parent: ids[0] });
  });

  afterAll(() => {
    for(const id of ids.slice().reverse())
      removeWidgetIfPresent(id);
  });

  test("terminates instead of hanging when the ancestor chain already loops", () => {
    // Neither id appears as its own ancestor, so the result is null, but the
    // point is that the walk stops (the visited-set breaks the cycle).
    expect(validateParentAssignment(`${testName}-unrelated`, ids[0])).toBe(null);
  });
});
