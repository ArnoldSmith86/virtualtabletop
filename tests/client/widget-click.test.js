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
      debug: false,
      type: "widget"
    }
    testWidget = createWidget(testWidgetDef);

    testLabel = addLabel(`${testName}-test-label`);
  });
  afterAll(() => {
    removeWidget(testWidget.p('id'));
    removeWidget(testLabel.p('id'));
  });

  describe("Given a widget that clicks widgets from an undefined collection", () => {
    beforeAll(() => {
      testWidget.p('clickRoutine', [
        {
          "func": "CLICK",
          "collection": "undefined"
        }
      ]);
    });
    describe("When clicked", () => {
      test("Then it does not throw an error", async () => {
        expect(() => {
          await testWidget.click();
        }).not.toThrow()
      });
    });
  });

  describe("Given a widget that clicks widgets with property 'clickThis'", () => {
    beforeAll(() => {
      testWidget.p('clickRoutine', [
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
      beforeEach(() => {
        const numWidgets = 3;
        const numWithClickThis = 2;
        widgets = createClickThisWidgets(testName, numWidgets, numWithClickThis);
        testLabel.p('text', 0);
      });
      afterEach(() => {
        widgets.forEach(w => removeWidget(w.p('id')));
      });

      describe("When clicked", () => {
        test("Then it clicks 2 'clickThis' widgets", async () => {
          await testWidget.click();
          expect(testLabel.p('text')).toBe(2);
        });
      });
    });

    describe("And there are 0 widgets with 'clickThis'", () => {
      let widgets;
      beforeEach(() => {
        const numWidgets = 1;
        const numWithClickThis = 0;
        widgets = createClickThisWidgets(testName, numWidgets, numWithClickThis);
        testLabel.p('text', 0);
      });
      afterEach(() => {
        widgets.forEach(w => removeWidget(w.p('id')));
      });

      describe("When clicked", () => {
        test("Then it clicks 0 'clickThis' widgets", async () => {
          await testWidget.click();
          expect(testLabel.p('text')).toBe(0);
        });
      });
    });
  });

});
