import { widgets } from '../../client/js/serverstate.js';
import { asArray } from '../../client/js/domhelpers.js';

import { createWidget, removeWidget } from './client-util.js';

// statemanaged.js / widget.js reach for these as bundle-scope globals; the browser
// concatenates all client JS into one scope, but jest loads modules in isolation,
// so make them available on the global object the way the running app sees them.
globalThis.widgets = widgets;
globalThis.asArray = asArray;

// Regression tests for the get() cache (PR #2183). The cache must never outlive
// the value it holds: because get() can resolve a property from another widget
// (via inheritFrom), changing that other widget has to invalidate the cache of
// everything that inherits from it - directly or through a chain.
describe('get() caching invalidation', () => {
  const created = [];
  function make(def) {
    const w = createWidget(def);
    created.push(def.id);
    return w;
  }
  afterEach(() => {
    while(created.length)
      removeWidget(created.pop());
  });

  test('changing an inheritFrom source invalidates the inheriting widget', async () => {
    const src = make({ id: 'gc-src', type: 'widget', foo: 'A' });
    const inh = make({ id: 'gc-inh', type: 'widget', inheritFrom: { 'gc-src': '*' } });
    expect(inh.get('foo')).toBe('A'); // populate the cache
    await src.set('foo', 'B');
    expect(inh.get('foo')).toBe('B');
  });

  test('inheritFrom chains invalidate transitively', async () => {
    const c = make({ id: 'gc-c', type: 'widget', foo: 'A' });
    const b = make({ id: 'gc-b', type: 'widget', inheritFrom: { 'gc-c': '*' } });
    const a = make({ id: 'gc-a', type: 'widget', inheritFrom: { 'gc-b': '*' } });
    expect(a.get('foo')).toBe('A'); // populate the whole chain's caches
    await c.set('foo', 'B');
    expect(a.get('foo')).toBe('B');
  });

  test('removing an inheritFrom source falls back to the default', async () => {
    const src = make({ id: 'gc-rsrc', type: 'widget', foo: 'A' });
    const inh = make({ id: 'gc-rinh', type: 'widget', inheritFrom: { 'gc-rsrc': '*' } });
    expect(inh.get('foo')).toBe('A'); // populate the cache
    removeWidget('gc-rsrc');
    created.splice(created.indexOf('gc-rsrc'), 1);
    expect(inh.get('foo')).toBe(null); // no source, no default -> null
  });

  test('a plain property set invalidates its own cache', async () => {
    const w = make({ id: 'gc-plain', type: 'widget', foo: 'A' });
    expect(w.get('foo')).toBe('A');
    await w.set('foo', 'B');
    expect(w.get('foo')).toBe('B');
  });
});
