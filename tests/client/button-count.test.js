import { addWidget, widgetFilter } from '../../client/js/serverstate.js';
import { Button } from '../../client/js/widgets/button.js';
import { Widget } from '../../client/js/widgets/widget.js';

import { addButton, addLabel, removeWidget } from './client-util.js';

describe("Scenarios: Counting widgets", () => {
  const testName = "button-count";
  let testButton;
  let testLabel;
  beforeAll(() => {
    const testButtonDef = {
      id: `${testName}test-button`,
      debug: false,
      type: "button"
    }
    testButton = addButton(testButtonDef);

    testLabel = addLabel(`${testName}-test-label`);
  });
  afterAll(() => {
    removeWidget(testButton.p('id'));
    removeWidget(testLabel.p('id'));
  });

  describe("Given a button that counts widgets from an undefined collection", () => {
    beforeAll(() => {
      testButton.p('clickRoutine', [
        {
          "func": "COUNT",
          "collection": "undefined"
        }
      ]);
    });
    describe("When clicked", () => {
      test("Then it does not throw an error", async () => {
        await expect(testButton.click()).resolves.toBeUndefined();
      });
    });
  });

  describe("Given a button that counts widgets with property 'countThis'", () => {
    beforeAll(() => {
      testButton.p('clickRoutine', [
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
      beforeEach(() => {
        widgets[0] = addLabel(`${testName}-label-one`);
        widgets[1] = addLabel(`${testName}-label-two`);
        widgets[2] = addLabel(`${testName}-label-three`);
        widgets[0].p("text", "countThis");
        widgets[2].p("text", "countThis");
      });
      afterEach(() => {
        widgets.forEach(w => removeWidget(w.p('id')));
      });

      describe("When clicked", () => {
        test("Then it reports 2 'countThis' widgets found", async () => {
          await testButton.click();
          expect(testLabel.p('text')).toBe(2);
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
          await testButton.click();
          expect(testLabel.p('text')).toBe(0);
        });
      });
    });
  });

});
