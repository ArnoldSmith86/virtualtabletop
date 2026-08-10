import { runRoutine, runRoutineCapturingVariables, routineState } from './harness.js';

// The parameters that name widgets are the same everywhere now: 'target' names the widgets an
// operation works on, 'holder' names widgets whose content it works on, and both take either the
// name of a collection or a list of widget ids. The old names (collection, label, from, to, ...)
// keep working - these tests pin both spellings so a future cleanup of the old ones is a visible
// decision rather than a silent break.

const state = () => routineState({
  h1: { type: 'widget' },
  h2: { type: 'widget' },
  c1: { type: 'widget', parent: 'h1' },
  c2: { type: 'widget', parent: 'h1' },
  d1: { type: 'widget', parent: 'h2' },
  d2: { type: 'widget', parent: 'h2' },
  loose: { type: 'widget' }
});

const rotations = async routine => {
  const result = await runRoutine(state(), routine);
  return [ 'c1', 'c2', 'd1', 'd2', 'loose' ].map(id => result.state[id].rotation || 0).join(',');
};
const parents = async routine => {
  const result = await runRoutine(state(), routine);
  return [ 'c1', 'c2', 'd1', 'd2', 'loose' ].map(id => result.state[id].parent || '-').join(',');
};

describe('target', () => {
  test('takes a list of widget ids', async () => {
    expect(await rotations([ { func: 'ROTATE', target: [ 'c1', 'd2' ], angle: 90, count: 'all' } ])).toBe('90,0,0,90,0');
  });

  test('takes the name of a collection', async () => {
    expect(await rotations([
      { func: 'SELECT', property: 'parent', value: 'h2', collection: 'picked' },
      { func: 'ROTATE', target: 'picked', angle: 90, count: 'all' }
    ])).toBe('0,0,90,90,0');
  });

  test('takes a single widget id as a string', async () => {
    expect(await rotations([ { func: 'ROTATE', target: 'c2', angle: 90, count: 'all' } ])).toBe('0,90,0,0,0');
  });

  test('defaults to the DEFAULT collection', async () => {
    expect(await rotations([
      { func: 'SELECT', property: 'parent', value: 'h1' },
      { func: 'ROTATE', angle: 90, count: 'all' }
    ])).toBe('90,90,0,0,0');
  });

  test('is what the old collection parameter fills in', async () => {
    expect(await rotations([ { func: 'ROTATE', collection: [ 'c1' ], angle: 90, count: 'all' } ])).toBe('90,0,0,0,0');
  });

  test('wins over the old name when both are given', async () => {
    expect(await rotations([ { func: 'ROTATE', target: [ 'c1' ], collection: [ 'd1' ], angle: 90, count: 'all' } ])).toBe('90,0,0,0,0');
  });
});

describe('holder', () => {
  test('works on the content of every widget it names', async () => {
    expect(await rotations([ { func: 'ROTATE', holder: [ 'h1', 'h2' ], angle: 90, count: 'all' } ])).toBe('90,90,90,90,0');
  });

  test('takes the name of a collection of holders', async () => {
    expect(await rotations([
      { func: 'SELECT', property: 'id', value: 'h2', collection: 'holders' },
      { func: 'ROTATE', holder: 'holders', angle: 90, count: 'all' }
    ])).toBe('0,0,90,90,0');
  });

  test('spends the count on each holder separately', async () => {
    expect(await rotations([ { func: 'ROTATE', holder: [ 'h1', 'h2' ], angle: 90, count: 1 } ])).toBe('90,0,90,0,0');
  });

  test('takes precedence over target', async () => {
    expect(await rotations([ { func: 'ROTATE', holder: [ 'h1' ], target: [ 'loose' ], angle: 90, count: 'all' } ])).toBe('90,90,0,0,0');
  });

  test('is reported and does nothing when it names neither a widget nor a collection', async () => {
    const result = await runRoutine(state(), [ { func: 'ROTATE', holder: 'nowhere', angle: 90, count: 'all' } ]);
    expect([ 'c1', 'c2', 'd1', 'd2' ].map(id => result.state[id].rotation || 0).join(',')).toBe('0,0,0,0');
  });
});

describe('the operations that gained target and holder', () => {
  test('COUNT counts the content of a collection of holders', async () => {
    const result = await runRoutineCapturingVariables(state(), [
      { func: 'SELECT', property: 'id', relation: 'in', value: [ 'h1', 'h2' ], collection: 'holders' },
      { func: 'COUNT', holder: 'holders', variable: 'n' }
    ], [ 'n' ]);
    expect(result.captured.n).toBe(4);
  });

  test('COUNT counts the widgets target names', async () => {
    const result = await runRoutineCapturingVariables(state(), [
      { func: 'COUNT', target: [ 'c1', 'c2', 'loose' ], variable: 'n' }
    ], [ 'n' ]);
    expect(result.captured.n).toBe(3);
  });

  test('SET writes to the content of a holder', async () => {
    const result = await runRoutine(state(), [ { func: 'SET', holder: [ 'h2' ], property: 'movable', value: false } ]);
    expect([ 'c1', 'd1', 'd2' ].map(id => String(result.state[id].movable)).join(',')).toBe('undefined,false,false');
  });

  test('GET reads from the content of a holder', async () => {
    const result = await runRoutineCapturingVariables(state(), [
      { func: 'GET', holder: [ 'h2' ], property: 'id', aggregation: 'array', variable: 'ids' }
    ], [ 'ids' ]);
    expect(result.captured.ids.sort().join(',')).toBe('d1,d2');
  });

  test('LABEL still accepts the old label parameter', async () => {
    const result = await runRoutine(routineState({ text: { type: 'label' } }), [
      { func: 'LABEL', label: 'text', value: 'hello' }
    ]);
    expect(result.state.text.text).toBe('hello');
  });

  test('LABEL writes to the widgets target names', async () => {
    const result = await runRoutine(routineState({ text: { type: 'label' }, other: { type: 'label' } }), [
      { func: 'LABEL', target: [ 'text', 'other' ], value: 'hello' }
    ]);
    expect([ 'text', 'other' ].map(id => result.state[id].text).join(',')).toBe('hello,hello');
  });
});

describe('MOVE', () => {
  test('moves the content of fromHolder into toHolder', async () => {
    expect(await parents([ { func: 'MOVE', fromHolder: [ 'h1' ], toHolder: [ 'h2' ], count: 'all' } ])).toBe('h2,h2,h2,h2,-');
  });

  test('moves the widgets target names into toHolder', async () => {
    expect(await parents([ { func: 'MOVE', target: [ 'loose', 'c1' ], toHolder: [ 'h2' ], count: 'all' } ])).toBe('h2,h1,h2,h2,h2');
  });

  test('still accepts the old from and to parameters', async () => {
    expect(await parents([ { func: 'MOVE', from: 'h1', to: 'h2', count: 'all' } ])).toBe('h2,h2,h2,h2,-');
  });

  test('takes a collection of holders on both sides', async () => {
    expect(await parents([
      { func: 'SELECT', property: 'id', value: 'h2', collection: 'destination' },
      { func: 'MOVE', fromHolder: [ 'h1' ], toHolder: 'destination', count: 'all' }
    ])).toBe('h2,h2,h2,h2,-');
  });
});
