//"use strict";

/**
 * @jest-environment jsdom
 */

import {jest} from '@jest/globals';

import { Button } from './button.js';

const element = document.createElement('div');

describe("Button", () => {
  let testButton;
  beforeEach(() => {
    testButton = new Button("test-button")
  });

  describe("COUNT", () => {
    beforeEach(() => {
      testButton.p.clickRoutine = [
        {
          "func": "SELECT",
          "value": "countedWidget"
        },
        {
          "func": "COUNT"
        }
      ];
    });

    describe("Given a collection exists", () => {
      let countedWidgets;
      beforeEach(() => {
        countedWidgets = new Array();
        //countedwidgets.add(new
      });

      it("counts the number of widgets in the collection", () => {
        testButton.click();
        expect(testButton.variables.COUNT).toBeGreaterThan(0)
      });
    });
  });
});
