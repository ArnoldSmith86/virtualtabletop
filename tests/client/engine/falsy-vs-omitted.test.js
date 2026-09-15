import { runRoutineCapturingVariables, routineState } from './harness.js';
import { forEachLegacyTier01 } from './matrix.js';

// A whole family of engine bugs is one mistake repeated: `a.x || fallback` and `if(a.x)` cannot
// tell "the game asked for 0 / '' / false" from "the game did not ask". #2990 (MOVE fillTo:0),
// #2588 (SELECT when text is 0) and half of #3059 are all this. Rather than write one test per
// occurrence, this generator runs every listed parameter with each falsy value and with the
// parameter omitted, and asserts which of those the engine is supposed to tell apart.
//
// `distinguishes: false` is not an opinion about what the operation should do - it records that
// the engine currently reads that falsy value as "not given". Every entry marked that way has
// an issue reference. Flipping one to true is how the fix for it gets pinned.

const FALSY_VALUES = [ 0, '', false, null ];

const state = () => routineState({
  h1: { type: 'widget' },
  h2: { type: 'widget' },
  c1: { type: 'widget', parent: 'h1', v: 0 },
  c2: { type: 'widget', parent: 'h1', v: '' },
  c3: { type: 'widget', parent: 'h1', v: false }
});

// Each case describes how to run one operation with a given value for one parameter, and how to
// reduce the result to something comparable. `answer` must depend on the parameter for the case
// to mean anything.
const CASES = [
  {
    op: 'SELECT', parameter: 'max',
    routine: value => [ withValue({ func: 'SELECT', type: 'widget', property: 'parent', value: 'h1' }, 'max', value), { func: 'COUNT', variable: 'n' } ],
    answer: result => result.captured.n,
    distinguishes: { 0: true, '': true, false: true, null: true }
  },
  {
    op: 'SELECT', parameter: 'value',
    routine: value => [ withValue({ func: 'SELECT', type: 'widget', property: 'v' }, 'value', value), { func: 'COUNT', variable: 'n' } ],
    answer: result => result.captured.n,
    // omitting value means null, so null is the one falsy value that cannot be distinguished
    distinguishes: { 0: true, '': true, false: true, null: false }
  },
  {
    op: 'COUNT', parameter: 'holder',
    routine: value => [ withValue({ func: 'COUNT', variable: 'n' }, 'holder', value) ],
    answer: result => result.captured.n === undefined ? 'no answer' : result.captured.n,
    distinguishes: { 0: true, '': true, false: true, null: true }
  },
  {
    op: 'COUNT', parameter: 'owner',
    routine: value => [ { func: 'SELECT', type: 'widget', property: 'parent', value: 'h1' }, withValue({ func: 'COUNT', variable: 'n' }, 'owner', value) ],
    answer: result => result.captured.n,
    // owner defaults to null and null means "do not filter", so only null coincides
    distinguishes: { 0: true, '': true, false: true, null: false }
  },
  {
    op: 'MOVE', parameter: 'count',
    routine: value => [ { func: 'SELECT', type: 'widget', property: 'parent', value: 'h1' }, withValue({ func: 'MOVE', to: 'h2' }, 'count', value) ],
    answer: result => [ 'c1', 'c2', 'c3' ].map(id => result.state[id].parent).join(','),
    distinguishes: { 0: true, '': true, false: true, null: true }
  },
  {
    op: 'MOVE', parameter: 'fillTo',
    routine: value => [ { func: 'SELECT', type: 'widget', property: 'parent', value: 'h1' }, withValue({ func: 'MOVE', to: 'h2' }, 'fillTo', value) ],
    answer: result => [ 'c1', 'c2', 'c3' ].map(id => result.state[id].parent).join(','),
    // https://github.com/ArnoldSmith86/virtualtabletop/issues/2990 - `a.fillTo || a.count`
    distinguishes: { 0: false, '': false, false: false, null: false }
  },
  {
    op: 'SET', parameter: 'value',
    routine: value => [
      { func: 'SELECT', type: 'widget', property: 'parent', value: 'h1' },
      withValue({ func: 'SET', property: 'p' }, 'value', value)
    ],
    answer: result => JSON.stringify(result.state.c1.p),
    // omitting value means null
    distinguishes: { 0: true, '': true, false: true, null: false }
  },
  {
    op: 'IF', parameter: 'condition',
    routine: value => [ 'var branch = -1', withValue({ func: 'IF', thenRoutine: [ 'var branch = 1' ], elseRoutine: [ 'var branch = 0' ] }, 'condition', value) ],
    answer: result => result.captured.branch,
    distinguishes: { 0: true, '': true, false: true, null: true }
  },
  {
    op: 'IF', parameter: 'operand1',
    routine: value => [ 'var branch = -1', withValue({ func: 'IF', operand2: 0, thenRoutine: [ 'var branch = 1' ], elseRoutine: [ 'var branch = 0' ] }, 'operand1', value) ],
    answer: result => result.captured.branch,
    distinguishes: { 0: true, '': true, false: true, null: true }
  },
  {
    op: 'FOREACH', parameter: 'in',
    routine: value => [
      'var iterations = 0',
      { func: 'SELECT', type: 'widget', property: 'parent', value: 'h1' },
      withValue({ func: 'FOREACH', loopRoutine: [ 'var iterations = + ${iterations} 1' ] }, 'in', value)
    ],
    answer: result => result.captured.iterations,
    // https://github.com/ArnoldSmith86/virtualtabletop/issues/3059 (6) - `if(a.in)`
    distinguishes: { 0: false, '': false, false: false, null: false }
  },
  {
    op: 'CALL', parameter: 'return',
    routine: value => [
      'var out = 1',
      withValue({ func: 'CALL', widget: 'trigger', routine: 'subRoutine' }, 'return', value),
      'var out = 2'
    ],
    answer: result => result.captured.out,
    // return defaults to true, so every falsy value has to abort the caller
    distinguishes: { 0: true, '': true, false: true, null: true }
  },
  {
    op: 'VAR', parameter: 'variables',
    routine: value => [ 'var a = -1', withValue({ func: 'VAR' }, 'variables', value), 'var out = ${a}' ],
    answer: result => result.captured.out,
    // an empty/falsy variables object legitimately means "assign nothing", same as omitting it
    distinguishes: { 0: false, '': false, false: false, null: false }
  }
];

function withValue(operation, parameter, value) {
  return value === undefined ? operation : Object.assign({}, operation, { [parameter]: value });
}

async function answerFor(testCase, value, legacy) {
  const routineState_ = state();
  routineState_.trigger.subRoutine = [ 'var called = 1' ];
  const names = [ 'n', 'branch', 'iterations', 'out' ];
  try {
    return testCase.answer(await runRoutineCapturingVariables(routineState_, testCase.routine(value), names, { legacy }));
  } catch(e) {
    return `threw: ${e.message}`;
  }
}

forEachLegacyTier01(({ name, legacy }) => {
  describe(`falsy vs omitted [${name}]`, () => {
    for(const testCase of CASES) {
      test(`${testCase.op}.${testCase.parameter}`, async () => {
        const omitted = await answerFor(testCase, undefined, legacy);
        for(const value of FALSY_VALUES) {
          const answer = await answerFor(testCase, value, legacy);
          const label = `${testCase.op}.${testCase.parameter} = ${JSON.stringify(value)} vs omitted`;
          if(testCase.distinguishes[String(value)])
            expect(`${label}: ${JSON.stringify(answer)}`).not.toBe(`${label}: ${JSON.stringify(omitted)}`);
          else
            expect(`${label}: ${JSON.stringify(answer)}`).toBe(`${label}: ${JSON.stringify(omitted)}`);
        }
      });
    }
  });
});
