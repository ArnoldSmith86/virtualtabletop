import { addWidget, widgetFilter } from '../../client/js/serverstate.js';
import { Button } from '../../client/js/widgets/button.js';
import { Widget } from '../../client/js/widgets/widget.js';

import { addButton, addLabel, removeWidget } from './client-util.js';

function createClickThisWidgets(testName, numWidgets, numWithClickThis) {
  const buttonDef = {
    "clickRoutine": [
      {
        "func": "LABEL",
        "label": `${testName}-test-label`,
        "value": 1,
        "mode": "inc"
      }
    ],
    "debug": false,
    "type": "button"
  }

  const widgets = [];
  let num = 0
  while (num++ < numWidgets) {
    buttonDef.id = `${testName}-button-${num}`;
    buttonDef.clickThis = num <= numWithClickThis ? true : false;
    let b = addButton(buttonDef);
    widgets.push(b);
  }
  return widgets;
}


describe("Scenarios: Clicking widgets", () => {
  const testName = "button-click";
  let testButton;
  let testLabel;
  beforeAll(() => {
    const testButtonDef = {
      id: `${testName}-test-button`,
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

  describe("Given a button that clicks widgets from an undefined collection", () => {
    beforeAll(() => {
      testButton.p('clickRoutine', [
        {
          "func": "CLICK",
          "collection": "undefined"
        }
      ]);
    });
    describe("When clicked", () => {
      test("Then it does not throw an error", () => {
        expect(async () => {
          await testButton.click();
        }).not.toThrow();
      });
    });
  });

  describe("Given a button that clicks widgets with property 'clickThis'", () => {
    beforeAll(() => {
      testButton.p('clickRoutine', [
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
          await testButton.click();
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
          await testButton.click();
          expect(testLabel.p('text')).toBe(0);
        });
      });
    });
  });

});
