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
