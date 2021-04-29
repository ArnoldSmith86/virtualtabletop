import { addWidget, widgetFilter } from '../../client/js/serverstate.js';
import { Widget } from '../../client/js/widgets/widget.js';

import { createWidget, addLabel, removeWidget } from './client-util.js';

describe("Scenarios: Counting widgets", () => {
  const testName = "widget-count";
  let testWidget;
  let testLabel;
  beforeAll(() => {
    const testWidgetDef = {
      id: `${testName}test-widget`,
      clickable: true,
      debug: false,
      type: "widget"
    }
    testWidget = createWidget(testWidgetDef);

    testLabel = addLabel(`${testName}-test-label`);
  });
  afterAll(() => {
    removeWidget(testWidget.get('id'));
    removeWidget(testLabel.get('id'));
  });

  describe("Given a widget that counts widgets from an undefined collection", () => {
    beforeAll(async () => {
      await testWidget.set('clickRoutine', [
        {
          "func": "COUNT",
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

  describe("Given a widget that counts widgets with property 'countThis'", () => {
    beforeAll(async () => {
      await testWidget.set('clickRoutine', [
        {
          "func": "SELECT",
          "property": "text",
          "value": "countThis"
        },
        {
          "func": "COUNT"
        },
        {
          "func": "LABEL",
          "label": `${testName}-test-label`,
          "applyVariables": [
            {
              "parameter": "value",
              "variable": "COUNT"
            }
          ]
        }
      ]);
    });

    describe("And there are 2 widgets with 'countThis' and 1 without", () => {
      const widgets = [];
      beforeEach(async () => {
        widgets[0] = addLabel(`${testName}-label-one`);
        widgets[1] = addLabel(`${testName}-label-two`);
        widgets[2] = addLabel(`${testName}-label-three`);
        await widgets[0].set("text", "countThis");
        await widgets[2].set("text", "countThis");
      });
      afterEach(() => {
        widgets.forEach(w => removeWidget(w.get('id')));
      });

      describe("When clicked", () => {
        test("Then it reports 2 'countThis' widgets found", async () => {
          await testWidget.click();
          expect(testLabel.get('text')).toBe(2);
        });
      });
    });

    describe("And there are no widgets with 'countThis'", () => {
      beforeEach(() => {
        const matches = widgetFilter(w => w.countThis != undefined);
        expect(matches.length == 0);
      });

      describe("When clicked", () => {
        test("Then it reports 0 'countThis' widgets found", async () => {
          await testWidget.click();
          expect(testLabel.get('text')).toBe(0);
        });
      });
    });
  });

});
