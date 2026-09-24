import { receiveDelta, widgets } from '../../client/js/serverstate.js';

import { createWidget, removeWidget } from './client-util.js';

describe("Scenarios: Receiving a delta", () => {
  const testName = "receive-delta";
  const holderID = `${testName}-holder`;
  const unknownID = `${testName}-unknown`;

  let errors;
  const originalConsoleError = console.error;
  beforeEach(() => {
    errors = [];
    console.error = (...args) => errors.push(args);
    createWidget({ id: holderID, type: 'holder' });
  });
  afterEach(() => {
    console.error = originalConsoleError;
    removeWidget(holderID);
  });

  // this is what undoing a move produces once the widget is gone from this client (e.g. because adding
  // it back after a type change failed for a card without a deck) while the server still has it
  describe("Given a delta that changes properties of a widget this client does not have", () => {
    const delta = { s: { [unknownID]: { parent: holderID, x: 5, y: 5 } } };

    test("Then it does not throw an error", () => {
      expect(() => receiveDelta(delta)).not.toThrow();
    });
    test("Then the widget is not added", () => {
      receiveDelta(delta);
      expect(widgets.has(unknownID)).toBe(false);
    });
    test("Then it is reported once", () => {
      receiveDelta(delta);
      expect(errors.length).toBe(1);
    });
  });

  // an entry with an empty id does not create a widget either, so the widget it addresses has to go
  // through limbo just like one addressed without an id at all
  describe("Given a delta that re-parents a widget this client has and carries an empty id", () => {
    const childID = `${testName}-child`;
    let limboCalls;
    beforeEach(() => {
      const child = createWidget({ id: childID, type: 'widget' });
      limboCalls = [];
      child.setLimbo = isLimbo => limboCalls.push(isLimbo);
    });
    afterEach(() => {
      removeWidget(childID);
    });

    test("Then the widget is moved to the top level before the new parent is applied", () => {
      receiveDelta({ s: { [childID]: { id: null, parent: holderID } } });
      expect(limboCalls[0]).toBe(true);
    });
  });
});
