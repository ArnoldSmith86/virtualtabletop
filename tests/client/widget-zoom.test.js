import { Widget } from '../../client/js/widgets/widget.js';
import { getZoomLevel } from '../../client/js/zoom.js';

import { createWidget, removeWidget } from './client-util.js';

describe("Scenarios: ZOOM function", () => {
  const testName = "widget-zoom";
  let testWidget;

  beforeAll(() => {
    testWidget = createWidget({
      id: `${testName}-test-widget`,
      clickable: true,
      debug: false,
      type: "widget"
    });
    window.jeRoutineLogging = false;
    localStorage.setItem('allowGameZoomControl', 'true');
  });

  afterAll(() => {
    removeWidget(testWidget.get('id'));
  });

  describe("Given a widget with an out-of-range ZOOM level", () => {
    beforeAll(async () => {
      await testWidget.set('clickRoutine', [
        { "func": "ZOOM", "level": 20 }
      ]);
    });

    describe("When clicked", () => {
      test("Then it does not throw an error and leaves the zoom level unchanged", async () => {
        const levelBefore = getZoomLevel();
        await expect(testWidget.click()).resolves.toBe(true);
        expect(getZoomLevel()).toBe(levelBefore);
      });
    });
  });

  describe("Given a widget with non-numeric ZOOM panX/panY", () => {
    beforeAll(async () => {
      await testWidget.set('clickRoutine', [
        { "func": "ZOOM", "level": 2, "panX": "not-a-number", "panY": 0 }
      ]);
    });

    describe("When clicked", () => {
      test("Then it does not throw an error and leaves the zoom level unchanged", async () => {
        const levelBefore = getZoomLevel();
        await expect(testWidget.click()).resolves.toBe(true);
        expect(getZoomLevel()).toBe(levelBefore);
      });
    });
  });

  describe("Given a widget with a valid ZOOM level targeting a different player", () => {
    beforeAll(async () => {
      await testWidget.set('clickRoutine', [
        { "func": "ZOOM", "level": 5, "player": "someone-else-entirely" }
      ]);
    });

    describe("When clicked", () => {
      test("Then it does not change the local zoom level", async () => {
        const levelBefore = getZoomLevel();
        await expect(testWidget.click()).resolves.toBe(true);
        expect(getZoomLevel()).toBe(levelBefore);
      });
    });
  });

  describe("Given a widget with a valid ZOOM targeting all players", () => {
    beforeAll(async () => {
      await testWidget.set('clickRoutine', [
        { "func": "ZOOM", "level": 3, "panX": 0, "panY": 0, "player": null }
      ]);
    });

    describe("When clicked", () => {
      test("Then it applies the requested zoom level locally", async () => {
        await expect(testWidget.click()).resolves.toBe(true);
        expect(getZoomLevel()).toBe(3);
      });
    });

    describe("When clicked while in edit mode", () => {
      beforeAll(async () => {
        await testWidget.set('clickRoutine', [
          { "func": "ZOOM", "level": 7, "panX": 0, "panY": 0, "player": null }
        ]);
        window.edit = true;
      });
      afterAll(() => {
        window.edit = false;
      });

      test("Then it does not change the editor viewport", async () => {
        const levelBefore = getZoomLevel();
        await expect(testWidget.click()).resolves.toBe(true);
        expect(getZoomLevel()).toBe(levelBefore);
      });
    });
  });
});
