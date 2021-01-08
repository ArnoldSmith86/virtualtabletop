import { mockConnection } from '../../client/js/connection.js';
import { dropTargets } from '../../client/js/main.js';
import { addWidget, widgetFilter, widgets } from '../../client/js/serverstate.js';
import { Button } from '../../client/js/widgets/button.js';
import { Label } from '../../client/js/widgets/label.js';
import { Widget } from '../../client/js/widgets/widget.js';

//start: copied from serverstate.js due to circular imports
function removeWidget(widgetID) {
  widgets.get(widgetID).applyRemove();
  widgets.delete(widgetID);
  dropTargets.delete(widgetID);
}
//end: copied from serverstate.js

beforeAll(async () => {
  await new Promise(resolve =>
    window.addEventListener("load", resolve)
  );
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
    const testButtonDef = {
      id: "test-button",
      debug: false,
      type: "button"
    }
    testButton = new Button(testButtonDef.id);
    addWidget(testButtonDef, testButton);

    testLabel = addLabel("test-label");
  });
  afterEach(() => {
    removeWidget(testButton.p('id'));
    removeWidget(testLabel.p('id'));
  });

  describe("Given a button that counts widgets from an undefined collection", () => {
    beforeEach(() => {
      testButton.p('clickRoutine', [
        {
          "func": "COUNT",
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

  describe("Given a button that counts widgets with property 'countThis'", () => {
    beforeEach(() => {
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
      const widgets = [];
      beforeEach(() => {
        widgets[0] = addLabel('one');
        widgets[1] = addLabel('two');
        widgets[2] = addLabel('three');
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
