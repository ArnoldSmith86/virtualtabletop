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

test('a list of widget ids leaves no collection behind', async () => {
  // ids written into a parameter get a collection of their own for the operation to work
  // on - if those stayed, every CALL and FOREACH after them would carry a growing pile of
  // them along. The name they get counts up per routine, so the test asks for all of them.
  const log = console.log;
  console.log = ()=>{}; // asking for a collection that is not there is reported, 200 times
  try {
    const routine = [ { func: 'ROTATE', target: [ 'c1' ], angle: 90, count: 'all' } ];
    for(let i=1; i<=200; ++i)
      routine.push({ func: 'ROTATE', target: `$collection_${i}`, angle: 90, count: 'all' });
    expect(await rotations(routine)).toBe('90,0,0,0,0');
  } finally {
    console.log = log;
  }
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

describe('RECALL', () => {
  const decks = () => routineState({
    h1: { type: 'widget' },
    inHolder: { type: 'deck', parent: 'h1' },
    card1: { type: 'widget', deck: 'inHolder' },
    onTheBoard: { type: 'deck' },
    card2: { type: 'widget', deck: 'onTheBoard' }
  });

  test('target gathers the cards into whatever the deck lies in', async () => {
    const result = await runRoutine(decks(), [ { func: 'RECALL', target: 'inHolder' } ]);
    expect(result.state.card1.parent).toBe('h1');
  });

  test('a deck lying on no widget is reported instead of the cards being stacked on the deck', async () => {
    // the deck is not a holder, so gathering the cards onto it would leave them on a widget
    // that neither lays them out nor takes them anywhere
    const result = await runRoutine(decks(), [ { func: 'RECALL', target: 'onTheBoard' } ]);
    expect(result.state.card2.parent || '-').toBe('-');
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

  test('a leftover from: null still moves what target names', async () => {
    expect(await parents([
      { func: 'SELECT', property: 'parent', value: 'h1' },
      { func: 'MOVE', from: null, to: 'h2', count: 'all' }
    ])).toBe('h2,h2,h2,h2,-');
  });

  test('a leftover empty from still moves what target names', async () => {
    // the routine editor writes '' for a widget chip that was added but never filled in
    expect(await parents([
      { func: 'SELECT', property: 'parent', value: 'h1' },
      { func: 'MOVE', from: '', to: 'h2', count: 'all' }
    ])).toBe('h2,h2,h2,h2,-');
  });

  test('a fromHolder that names nothing moves nothing', async () => {
    expect(await parents([ { func: 'MOVE', fromHolder: null, toHolder: [ 'h2' ], count: 'all' } ])).toBe('h1,h1,h2,h2,-');
  });

  test('deals the next widgets to the next destination', async () => {
    // the count is spent on the destinations one after the other, so two destinations
    // asking for one widget each get one widget each and not twice the same one
    expect(await parents([
      { func: 'SELECT', property: 'id', relation: 'in', value: [ 'c1', 'c2' ] },
      { func: 'MOVE', target: 'DEFAULT', toHolder: [ 'h2', 'loose' ], count: 1 }
    ])).toBe('h2,loose,h2,h2,-');
  });

  test('deals the next widgets to the next destination under the old spelling too', async () => {
    expect(await parents([
      { func: 'SELECT', property: 'id', relation: 'in', value: [ 'c1', 'c2' ] },
      { func: 'MOVE', collection: 'DEFAULT', to: [ 'h2', 'loose' ], count: 1 }
    ])).toBe('h2,loose,h2,h2,-');
  });

  test('fillTo tops the destinations up one after the other', async () => {
    // h2 already holds two widgets, so filling to three takes one widget and leaves
    // the other for the empty destination
    expect(await parents([
      { func: 'SELECT', property: 'id', relation: 'in', value: [ 'c1', 'c2' ] },
      { func: 'MOVE', target: 'DEFAULT', toHolder: [ 'h2', 'loose' ], fillTo: 3 }
    ])).toBe('h2,loose,h2,h2,-');
  });

  test('takes a collection of holders on both sides', async () => {
    expect(await parents([
      { func: 'SELECT', property: 'id', value: 'h2', collection: 'destination' },
      { func: 'MOVE', fromHolder: [ 'h1' ], toHolder: 'destination', count: 'all' }
    ])).toBe('h2,h2,h2,h2,-');
  });
});
