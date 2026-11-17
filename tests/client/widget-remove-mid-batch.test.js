import { batchEnd, batchStart, flushDelta, sendPropertyUpdate, widgets } from '../../client/js/serverstate.js';
import { connectionStatus, resetDeltaMonitor, DELTA_CONFIRM_ICON_MS } from '../../client/js/deltamonitor.js';

import { createWidget } from './client-util.js';

describe("Scenarios: Removing a widget mid-batch", () => {
  const testName = "widget-remove-mid-batch";
  const widgetID = `${testName}-widget`;

  // every delta that goes out registers with the delta monitor, so its pending count tells
  // whether an update was sent to the server
  function sentDeltas() {
    return connectionStatus(Date.now() + DELTA_CONFIRM_ICON_MS).pendingCount;
  }

  // a routine can remove a widget and flush that removal before it ends, because the DELAY
  // action calls flushDelta() - a later property update then addresses a widget that is gone
  describe("Given a widget whose removal was flushed inside a batch", () => {
    beforeEach(() => {
      resetDeltaMonitor();
      createWidget({ id: widgetID, type: 'widget' });
      batchStart();
      sendPropertyUpdate(widgetID, null);
      flushDelta();
    });

    test("Then the widget is gone", () => {
      expect(widgets.has(widgetID)).toBe(false);
      expect(sentDeltas()).toBe(1);
      batchEnd();
    });

    describe("When a property of it is updated later in the same batch", () => {
      beforeEach(() => {
        sendPropertyUpdate(widgetID, 'text', 'update for an already removed widget');
      });

      test("Then ending the batch does not throw an error", () => {
        expect(() => batchEnd()).not.toThrow();
      });
      test("Then the widget is not resurrected", () => {
        batchEnd();
        expect(widgets.has(widgetID)).toBe(false);
      });
      test("Then the update is not sent to the server", () => {
        batchEnd();
        expect(sentDeltas()).toBe(1);
      });
    });
  });
});
