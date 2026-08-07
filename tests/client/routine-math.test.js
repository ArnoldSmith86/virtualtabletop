import { createWidget, removeWidget } from './client-util.js';

// The "var name = expression" form of a routine line is evaluated with eval. That has to happen in
// strict mode: a leading zero is a legacy octal literal in sloppy mode, so "var result = 010 + 1"
// would quietly come out as 9 instead of being reported as a problem - and the variables of the
// routine are spliced into the expression verbatim, so a zero padded value ("007") ends up there
// easily. The eval is the indirect form, which is sloppy mode by default, so widget.js prepends a
// "use strict" directive to keep this - these tests pin that it stays there.
describe("Scenarios: Math expressions in routines", () => {
  const testName = "routine-math";
  beforeAll(() => {
    window.jeRoutineLogging = false;
  });

  async function evaluate(expression) {
    const id = `${testName}-widget`;
    const widget = createWidget({ id, type: "widget", clickRoutine: [ `var result = ${expression}` ] });
    try {
      return (await widget.evaluateRoutine('clickRoutine', {}, {})).variable;
    } finally {
      removeWidget(id);
    }
  }

  test("evaluates a decimal expression", async () => {
    expect(await evaluate('1 + 2 * 3')).toBe(7);
    expect(await evaluate('(1 + 2) * 3')).toBe(9);
  });

  test("reports a leading zero instead of reading it as octal", async () => {
    const logged = [];  // an unlogged routine reports its problems through console.log
    const consoleLog = console.log;
    console.log = message => logged.push(message);
    try {
      expect(await evaluate('010 + 1')).toBe(null);
    } finally {
      console.log = consoleLog;
    }
    expect(JSON.stringify(logged)).toContain('SyntaxError');
  });
});
