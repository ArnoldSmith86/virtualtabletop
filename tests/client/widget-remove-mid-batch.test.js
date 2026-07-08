import { batchStart, batchEnd, flushDelta, receiveDelta, sendPropertyUpdate, widgets } from '../../client/js/serverstate.js';

import { createWidget, removeWidget } from './client-util.js';

// Regression tests for a crash reported from production: a routine can remove a widget
// and, via the DELAY action, flush that removal (client/js/widgets/widget.js's DELAY
// action calls flushDelta()) before the routine finishes. If the routine then queues a
// property update for that same widget later in the same batch, the update used to
// reach addDeltaEntryToUndoProtocol() for a widget no longer in the `widgets` map,
// throwing "Cannot read properties of undefined (reading 'unalteredState')".
describe("Scenarios: Removing a widget mid-batch", () => {
  const testName = "widget-remove-mid-batch";

  describe("Given a widget removed mid-batch (e.g. by a DELETE action flushed via DELAY)", () => {
    let testWidget;

    beforeEach(() => {
      testWidget = createWidget({ id: `${testName}-sender-widget`, type: "widget" });
    });

    afterEach(() => {
      if(widgets.has(testWidget.get('id')))
        removeWidget(testWidget.get('id'));
    });

    describe("When a property update for it is queued later in the same batch", () => {
      test("Then processing the batch does not throw and the widget stays removed", () => {
        const id = testWidget.get('id');

        batchStart();
        sendPropertyUpdate(id, null); // queue removal, not yet flushed (still inside the batch)
        flushDelta(); // e.g. the DELAY action: force the removal to be applied now
        expect(widgets.has(id)).toBe(false);

        sendPropertyUpdate(id, 'text', 'stray update for an already-removed widget');

        expect(() => batchEnd()).not.toThrow();
        expect(widgets.has(id)).toBe(false);
      });
    });
  });

  // sendPropertyUpdate() (covered above) keeps this client from ever building such a
  // delta itself, but a delta shaped like this can still arrive over the wire from a
  // client that hasn't been updated yet, going straight through receiveDelta() without
  // passing through sendPropertyUpdate() at all. This covers the addDeltaEntryToUndoProtocol()
  // and setLimbo() guards in receiveDelta() directly.
  describe("Given a widget removed by a previously received delta", () => {
    let testWidget;

    beforeEach(() => {
      testWidget = createWidget({ id: `${testName}-receiver-widget`, type: "widget" });
    });

    afterEach(() => {
      if(widgets.has(testWidget.get('id')))
        removeWidget(testWidget.get('id'));
    });

    describe("When a delta received afterwards contains a stray property update (e.g. 'parent') for that same widget ID", () => {
      test("Then receiving it does not throw and the widget is not resurrected", () => {
        const id = testWidget.get('id');

        expect(() => receiveDelta({ s: { [id]: null } })).not.toThrow();
        expect(widgets.has(id)).toBe(false);

        expect(() => receiveDelta({ s: { [id]: { parent: 'someOtherWidget' } } })).not.toThrow();
        expect(widgets.has(id)).toBe(false);
      });
    });
  });
});
