import { JSDOM } from 'jsdom';
//import { jest } from '@jest/globals';

import { mockConnection } from '../../client/js/connection.js';
import { addWidget } from '../../client/js/serverstate.js';
import { Button } from '../../client/js/widgets/button.js';
import { Label } from '../../client/js/widgets/label.js';

const loadWindow = async () => {
  await new Promise(resolve =>
    window.addEventListener("load", resolve)
  );
}

beforeAll(async () => {
  await loadWindow();
  mockConnection();

  document.body.insertAdjacentHTML('beforeend', '<div id="roomArea"> <div id="room"> <div id="topSurface" class="surface"></div> </div></div> <div id="debugButtonOverlay"><pre id="debugButtonOutput"></pre></div> <div id="enlarged"></div>');
});

function addLabel(id) {
  const labelDef = { id: id, type: 'label' }
  const label = new Label(labelDef.id);
  addWidget(labelDef, label);
  return label
}

describe("Scenarios: Counting widgets", () => {
  let testButton;
  let testLabel;
  beforeEach(() => {
    const testButtonDef = { id: "test-button", type: "button" }
    testButton = new Button(testButtonDef.id);
    addWidget(testButtonDef, testButton);

    testLabel = addLabel("test-label");
  });

  describe("Given a button that counts widgets with property 'countThis'", () => {
    beforeEach(() => {
      testButton.p('id', "test-button");
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
          "label": "test-label",
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
      beforeEach(() => {
        const l1 = addLabel('one');
        const l2 = addLabel('two');
        const l3 = addLabel('three');
        l1.p("text", "countThis");
        l3.p("text", "countThis");
      });

      describe("When clicked", () => {
        test("Then it reports 2 'countThis' widgets found", async () => {
          await testButton.click();
          expect(testLabel.p('text')).toBe(2);
        });
      });
    });
  });
});
