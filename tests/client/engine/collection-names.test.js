import { runRoutine, routineState } from './harness.js';

// A collection name and a widget id live in different namespaces, but both are written into the
// same parameters, and a list of ids is put into a collection of its own behind the scenes. These
// tests pin what happens when the two namespaces collide, because getting it wrong makes an
// operation work on widgets nobody named.

const state = () => routineState({
  card: { type: 'widget' },
  other1: { type: 'widget' },
  other2: { type: 'widget' },
  loose: { type: 'widget' }
});

const rotated = result => [ 'card', 'other1', 'other2' ].filter(id => result.state[id].rotation).join(',');

// The name the engine gives a list of ids counts up from $collection_1, so guarding a handful of
// them covers whatever the counter of this test file happens to be at.
const generatedNames = Array.from({ length: 12 }, (_, i) => `$collection_${i+1}`);

describe('a widget id that is also a collection name', () => {
  test('a list of ids names the widgets, not the collection of the same name', async () => {
    const result = await runRoutine(state(), [
      { func: 'SELECT', property: 'id', relation: 'in', value: [ 'other1', 'other2' ], collection: 'card' },
      { func: 'SET', target: [ 'card' ], property: 'rotation', value: 90 }
    ]);
    expect(rotated(result)).toBe('card');
  });

  test('the same id written as a string still names the collection', async () => {
    // a plain string is read as a collection first and only as a widget when no collection has
    // that name - a routine that made one relies on it, so the order stays as it is
    const result = await runRoutine(state(), [
      { func: 'SELECT', property: 'id', relation: 'in', value: [ 'other1', 'other2' ], collection: 'card' },
      { func: 'SET', target: 'card', property: 'rotation', value: 90 }
    ]);
    expect(rotated(result)).toBe('other1,other2');
  });
});

// The parameters that named widgets and nothing else keep doing that when a collection carries
// the same name, because a game written before they took collections at all must not change its
// mind about which widget it meant.
const holders = () => routineState({
  h1: { type: 'widget' },
  h2: { type: 'widget' },
  c1: { type: 'widget', parent: 'h1' },
  c2: { type: 'widget', parent: 'h1' },
  e1: { type: 'widget', parent: 'h2' },
  e2: { type: 'widget', parent: 'h2' }
});

// a collection named h1 that holds anything but h1: naming it instead of the widget shows up as
// the wrong widgets being worked on
const collectionCalledH1 = { func: 'SELECT', property: 'parent', value: 'h2', collection: 'h1' };
const contentRotated = result => [ 'c1', 'c2', 'e1', 'e2' ].filter(id => result.state[id].rotation).join(',');

describe('a widget id that is also a collection name in a parameter that only ever took widgets', () => {
  test('holder names the widget', async () => {
    const result = await runRoutine(holders(), [
      collectionCalledH1,
      { func: 'ROTATE', holder: 'h1', angle: 90, count: 'all' }
    ]);
    expect(contentRotated(result)).toBe('c1,c2');
  });

  test('the old from/to spellings of MOVE name the widgets', async () => {
    const result = await runRoutine(holders(), [
      collectionCalledH1,
      { func: 'MOVE', from: 'h1', to: 'h2', count: 'all' }
    ]);
    expect([ 'c1', 'c2' ].map(id => result.state[id].parent).join(',')).toBe('h2,h2');
  });

  test('the reading does not change when the same operation runs a second time', async () => {
    // renamedParameters writes the current name onto the operation, so the old spelling it came
    // from is only visible on the first run - the second one has to read the same value the same way
    const result = await runRoutine(holders(), [
      collectionCalledH1,
      { func: 'FOREACH', range: [ 1, 2, 1 ], loopRoutine: [ { func: 'MOVE', from: 'h1', to: 'h2', count: 1 } ] }
    ]);
    expect([ 'c1', 'c2' ].map(id => result.state[id].parent).join(',')).toBe('h2,h2');
  });
});

describe('the old collection spellings', () => {
  test('do not take a widget id, so a name nobody collected stays the error it was', async () => {
    const result = await runRoutine(state(), [ { func: 'ROTATE', collection: 'card', angle: 90, count: 'all' } ]);
    expect(rotated(result)).toBe('');
  });

  test('while the current name reads it as that widget', async () => {
    const result = await runRoutine(state(), [ { func: 'ROTATE', target: 'card', angle: 90, count: 'all' } ]);
    expect(rotated(result)).toBe('card');
  });
});

describe('a collection named like a generated one', () => {
  test('survives an operation that passes a list of ids', async () => {
    // every guarded collection holds 'loose', so the rotation counts how many of them were still
    // there after the list of ids got a collection of its own
    const result = await runRoutine(state(), [
      ...generatedNames.map(name => ({ func: 'SELECT', property: 'id', value: 'loose', collection: name })),
      { func: 'ROTATE', target: [ 'card' ], angle: 90, count: 'all' },
      ...generatedNames.map(name => ({ func: 'ROTATE', target: name, angle: 1, count: 'all' }))
    ]);
    expect(result.state.loose.rotation).toBe(generatedNames.length);
    expect(result.state.card.rotation).toBe(90);
  });
});
