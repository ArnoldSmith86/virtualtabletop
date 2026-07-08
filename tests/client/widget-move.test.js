import { jest } from '@jest/globals';

import { Widget } from '../../client/js/widgets/widget.js';

import { createWidget, removeWidget } from './client-util.js';

describe("Scenarios: Moving widgets with fillTo", () => {
  const testName = "widget-move";
  let testWidget;
  let holder;
  let movables;

  beforeAll(() => {
    const testWidgetDef = {
      id: `${testName}-test-widget`,
      clickable: true,
      debug: false,
      type: "widget"
    }
    testWidget = createWidget(testWidgetDef);
    window.jeRoutineLogging = false;
    window.getMaxZ = () => 0;
    window.updateMaxZ = () => {};
    // onChildAddAlign positions the moved widget via getElementTransform, which needs
    // DOMMatrix/DOMPoint that jsdom doesn't implement; moving/counting children doesn't
    // depend on that positioning, so it's stubbed out here.
    jest.spyOn(Widget.prototype, 'onChildAddAlign').mockImplementation(async () => {});
  });
  afterAll(() => {
    removeWidget(testWidget.get('id'));
  });

  function moveRoutine(fillTo) {
    const move = { func: "MOVE", collection: "DEFAULT", to: holder.get('id') };
    if(fillTo !== undefined)
      move.fillTo = fillTo;
    return [
      { func: "SELECT", property: "text", value: "moveThis" },
      move
    ];
  }

  function createMovables(count) {
    const widgets = [];
    for(let i = 0; i < count; i++) {
      const w = createWidget({ id: `${testName}-movable-${i}`, type: "widget", text: "moveThis" });
      widgets.push(w);
    }
    return widgets;
  }

  describe("Given 3 widgets available to move and an empty holder", () => {
    beforeEach(() => {
      holder = createWidget({ id: `${testName}-holder`, type: "widget" });
      movables = createMovables(3);
    });
    afterEach(() => {
      movables.forEach(w => removeWidget(w.get('id')));
      removeWidget(holder.get('id'));
    });

    describe("When fillTo is 0", () => {
      test("Then no widgets are moved", async () => {
        await testWidget.set('clickRoutine', moveRoutine(0));
        await testWidget.click();
        expect(holder.children().length).toBe(0);
      });
    });

    describe("When fillTo is unset", () => {
      test("Then all widgets are moved", async () => {
        await testWidget.set('clickRoutine', moveRoutine(undefined));
        await testWidget.click();
        expect(holder.children().length).toBe(3);
      });
    });

    describe("When fillTo is 2", () => {
      test("Then widgets are moved until the holder has 2 children", async () => {
        await testWidget.set('clickRoutine', moveRoutine(2));
        await testWidget.click();
        expect(holder.children().length).toBe(2);
      });
    });
  });
});
