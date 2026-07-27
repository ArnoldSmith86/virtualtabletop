import { widgets } from '../../client/js/serverstate.js';
import { asArray } from '../../client/js/domhelpers.js';

import { createWidget, removeWidget } from './client-util.js';

// statemanaged.js / widget.js reach for these as bundle-scope globals; the browser
// concatenates all client JS into one scope, but jest loads modules in isolation,
// so make them available on the global object the way the running app sees them.
globalThis.widgets = widgets;
globalThis.asArray = asArray;

// Regression tests for the get() cache (PR #2183). The cache must never outlive
// the value it holds: because get() can resolve a property from another widget,
// any state change has to invalidate cached values globally.
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

  test('a multi-key delta renders removed-property defaults against the fully-updated state', () => {
    const w = make({ id: 'gc-twophase', type: 'widget', kind: 'old', color: 'oldColor' });
    // the default for 'color' depends on the widget's own 'kind' (mirrors how a card's
    // default properties depend on its cardType)
    const orig = w.getDefaultValue.bind(w);
    w.getDefaultValue = property => property == 'color'
      ? (w.get('kind') == 'new' ? 'newColor' : 'oldColor')
      : orig(property);
    expect(w.get('color')).toBe('oldColor'); // prime the cache while kind is still 'old'
    expect(w.get('kind')).toBe('old');       // and cache 'kind', the dependency the default reads

    // capture what gets pushed to the DOM: the removed 'color' key must resolve to the
    // default for the *new* kind, not the value cached while kind was still 'old'
    let renderedDelta;
    const origApplyToDOM = w.applyDeltaToDOM.bind(w);
    w.applyDeltaToDOM = delta => { renderedDelta = delta; return origApplyToDOM(delta); };

    // a single delta both changes 'kind' and removes the explicit 'color' override
    w.applyDelta({ kind: 'new', color: null });
    expect(renderedDelta.color).toBe('newColor');
  });

  test('invalidateGetCache() picks up a direct state write that bypasses set()', () => {
    // mirrors the choose-overlay / card-type-preview paths that poke widget.state
    // directly and then re-read immediately (domhelpers.js, editor properties.js)
    const w = make({ id: 'gc-direct', type: 'widget', scale: 1 });
    expect(w.get('scale')).toBe(1); // prime the cache
    w.state.scale = 3;
    w.invalidateGetCache();
    expect(w.get('scale')).toBe(3);
  });

  test('a state change invalidates unregistered cross-widget dependencies', async () => {
    const src = make({ id: 'gc-custom-src', type: 'widget', foo: 'A' });
    const dependent = make({ id: 'gc-custom-dependent', type: 'widget' });
    const originalGetDefaultValue = dependent.getDefaultValue.bind(dependent);
    dependent.getDefaultValue = property => property == 'foo' ? src.get('foo') : originalGetDefaultValue(property);
    expect(dependent.get('foo')).toBe('A');
    await src.set('foo', 'B');
    expect(dependent.get('foo')).toBe('B');
  });
});
