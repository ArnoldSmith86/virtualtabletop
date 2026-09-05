import { addDeltaEntryToUndoProtocol, getUndoProtocol } from '../../client/js/serverstate.js';

import { createWidget, removeWidget } from './client-util.js';

describe("Scenarios: Adding a delta to the undo protocol", () => {
  const testName = "undo-protocol";
  const knownID = `${testName}-known`;
  const unknownID = `${testName}-unknown`;

  beforeEach(() => {
    getUndoProtocol().length = 0;
  });

  function lastUndoDelta() {
    const undoProtocol = getUndoProtocol();
    expect(undoProtocol.length).toBe(1);
    return undoProtocol[0].undoDelta;
  }

  describe("Given a widget this client has", () => {
    let testWidget;
    beforeEach(() => {
      testWidget = createWidget({ id: knownID, type: 'widget', x: 10 });
    });
    afterEach(() => {
      removeWidget(knownID);
    });

    describe("When a delta changes one of its properties", () => {
      test("Then the undo entry restores the previous value", () => {
        addDeltaEntryToUndoProtocol({ s: { [knownID]: { x: 20 } } });
        expect(lastUndoDelta()).toEqual({ [knownID]: { x: 10 } });
      });
    });
  });

  describe("Given a widget this client does not have", () => {
    describe("When a delta creates it", () => {
      test("Then the undo entry removes it again", () => {
        addDeltaEntryToUndoProtocol({ s: { [unknownID]: { id: unknownID, type: 'widget' } } });
        expect(lastUndoDelta()).toEqual({ [unknownID]: null });
      });
    });

    // this happens when adding the widget failed locally (e.g. a card whose deck is missing) or when
    // the server sends a partial widget - undoing must not delete a widget that other clients do have
    describe("When a delta only changes its properties", () => {
      test("Then it does not throw an error", () => {
        expect(() => addDeltaEntryToUndoProtocol({ s: { [unknownID]: { x: 20 } } })).not.toThrow();
      });
      test("Then the undo entry contains no removal for it", () => {
        addDeltaEntryToUndoProtocol({ s: { [unknownID]: { x: 20 } } });
        expect(lastUndoDelta()).toEqual({});
      });
    });
  });
});
