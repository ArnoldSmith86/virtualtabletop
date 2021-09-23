import { Widget } from '../../client/js/widgets/widget.js';

import { createWidget, addLabel, removeWidget } from './client-util.js';

function createClickThisWidgets(testName, numWidgets, numWithClickThis) {
  const widgetDef = {
    "clickRoutine": [
      {
        "func": "LABEL",
        "label": `${testName}-test-label`,
        "value": 1,
        "mode": "inc"
      }
    ],
    "clickable": true,
    "debug": false,
    "type": "widget"
  }

  const widgets = [];
  let num = 0
  while (num++ < numWidgets) {
    widgetDef.id = `${testName}-widget-${num}`;
    widgetDef.clickThis = num <= numWithClickThis ? true : false;
    let b = createWidget(widgetDef);
    widgets.push(b);
  }
  return widgets;
}


describe("Scenarios: Clicking widgets", () => {
  const testName = "widget-click";
  let testWidget;
  let testLabel;
  beforeAll(() => {
    const testWidgetDef = {
      id: `${testName}-test-widget`,
      clickable: true,
      debug: false,
      type: "widget"
    }
    testWidget = createWidget(testWidgetDef);

    testLabel = addLabel(`${testName}-test-label`);
    window.jeRoutineLogging = false;
  });
  afterAll(() => {
    removeWidget(testWidget.get('id'));
    removeWidget(testLabel.get('id'));
  });

  describe("Given a widget that clicks widgets from an undefined collection", () => {
    beforeAll(async () => {
      await testWidget.set('clickRoutine', [
        {
          "func": "CLICK",
          "collection": "undefined"
        }
      ]);
    });
    describe("When clicked", () => {
      test("Then it does not throw an error", async () => {
        await expect(testWidget.click()).resolves.toBe(true);
      });
    });
  });

  describe("Given a widget that clicks widgets with property 'clickThis'", () => {
    beforeAll(async () => {
      await testWidget.set('clickRoutine', [
        {
          "func": "SELECT",
          "property": "clickThis",
          "value": true
        },
        {
          "func": "CLICK"
        }
      ]);
    });

    describe("And there are 2 widgets with 'clickThis' and 1 without", () => {
      let widgets;
      beforeEach(async () => {
        const numWidgets = 3;
        const numWithClickThis = 2;
        widgets = createClickThisWidgets(testName, numWidgets, numWithClickThis);
        await testLabel.set('text', 0);
      });
      afterEach(() => {
        widgets.forEach(w => removeWidget(w.get('id')));
      });

      describe("When clicked", () => {
        test("Then it clicks 2 'clickThis' widgets", async () => {
          await testWidget.click();
          expect(testLabel.get('text')).toBe(2);
        });
      });
    });

    describe("And there are 0 widgets with 'clickThis'", () => {
      let widgets;
      beforeEach(async () => {
        const numWidgets = 1;
        const numWithClickThis = 0;
        widgets = createClickThisWidgets(testName, numWidgets, numWithClickThis);
        await testLabel.set('text', 0);
      });
      afterEach(() => {
        widgets.forEach(w => removeWidget(w.get('id')));
      });

      describe("When clicked", () => {
        test("Then it clicks 0 'clickThis' widgets", async () => {
          await testWidget.click();
          expect(testLabel.get('text')).toBe(0);
        });
      });
    });
  });

});
