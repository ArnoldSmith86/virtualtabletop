import { Selector } from 'testcafe';

import { getStateObject, setupTestEnvironment } from './test-util.js';
import { openRoom, stateWhen } from './interaction-util.js';

setupTestEnvironment();

// The object form of inheritFrom, which the Layer-A fixture cannot reach.
//
// tests/client/engine/inheritfrom.test.js covers `inheritFrom: '<id>'` under the full legacy
// matrix, and stops there on purpose: the object form goes through
// applyInheritedValuesToDOM(), which builds the widget's `inheritedProperties` map while it
// applies the values to the DOM, and getDefaultValue() only resolves a property that is in that
// map. A jsdom widget graph does not run that path faithfully, so the property list, the
// exclusion list and multiple sources have never been asserted anywhere.
//
// inheritFrom is the second largest cluster in the open issue list (#2854 removal does not
// update, #2731 classes, #2390 not always updating, #2958 CLONE recursive ignores it), and all
// four are about a chain being changed somewhere other than where it is read - so the cases
// below read at the bottom after changing something at the top.

const TIERS = [ 'modern', 'legacy-all' ];

// An inherited value is not in the widget's own state, so a routine has to copy it somewhere the
// test can see. Wrapped in an object so an inherited null is distinguishable from "SET wrote
// nothing": setting a property to null removes it, setting it to { value: null } does not.
function observe(pairs) {
  const value = {};
  for(const [ name, expression ] of Object.entries(pairs))
    value[name] = `\${PROPERTY ${expression}}`;
  return [
    { func: 'SELECT', property: 'id', value: 'log', collection: 'log' },
    { func: 'SET', collection: 'log', property: 'observed', value }
  ];
}

function chain(overrides = {}, observed = { text: 'text OF leaf', color: 'color OF leaf' }) {
  const state = {
    log:    { id: 'log', type: 'basic', x: 1300, y: 850, width: 100, height: 100 },
    go:     { id: 'go', type: 'button', x: 700, y: 420, width: 100, height: 60, text: 'go', clickRoutine: observe(observed) },
    base:   { id: 'base', type: 'label', x: 100, y: 100, width: 300, height: 40, text: 'from base', color: 'blue' },
    middle: { id: 'middle', type: 'label', x: 100, y: 200, width: 300, height: 40, inheritFrom: 'base' },
    leaf:   { id: 'leaf', type: 'label', x: 100, y: 300, width: 300, height: 40, inheritFrom: 'middle' }
  };
  for(const [ id, properties ] of Object.entries(overrides))
    state[id] = state[id] ? Object.assign(state[id], properties) : Object.assign({ id }, properties);
  return state;
}

async function observed(t) {
  await t.click('#w_go');
  const state = await stateWhen(s=>(s.log||{}).observed);
  return state.log.observed;
}

for(const combo of TIERS) {
  test(`A property list inherits exactly what it lists (${combo})`, async t => {
    await openRoom(t, combo, chain({ leaf: { inheritFrom: { middle: [ 'text' ] } } }));

    const values = await observed(t);
    await t.expect(values.text).eql('from base', `text is listed in combination ${combo}`);
    await t.expect(values.color).eql(null, `color is not in combination ${combo}`);
  });

  test(`An exclusion list inherits everything but what it names (${combo})`, async t => {
    await openRoom(t, combo, chain({ leaf: { inheritFrom: { middle: [ '!text' ] } } }));

    const values = await observed(t);
    // text is a label's own default, so excluding it from the chain leaves that default
    await t.expect(values.text).eql('', `text is excluded in combination ${combo}`);
    await t.expect(values.color).eql('blue', `color still arrives in combination ${combo}`);
  });
}

test('A star inherits everything except the properties that identify a widget', async t => {
  await openRoom(t, 'modern', chain({
    base: { deck: 'nonexistent', cardType: 'plain' },
    leaf: { inheritFrom: { middle: '*' } }
  }, { text: 'text OF leaf', type: 'type OF leaf', id: 'id OF leaf', deck: 'deck OF leaf', cardType: 'cardType OF leaf' }));

  const values = await observed(t);
  await t.expect(values.text).eql('from base', 'text is inherited');
  // statemanaged.js:89 - inheriting these would turn every widget in a chain into a copy of the
  // one above it
  await t.expect(values.type).eql('label', 'type is the widget\'s own');
  await t.expect(values.id).eql('leaf', 'id is the widget\'s own');
  await t.expect(values.deck).eql(null, 'deck is never inherited');
  await t.expect(values.cardType).eql(null, 'cardType is never inherited');
});

test('With two sources the first one listed wins', async t => {
  await openRoom(t, 'modern', chain({
    other: { type: 'label', x: 700, y: 100, width: 300, height: 40, text: 'from other' },
    leaf:  { inheritFrom: { middle: [ 'text' ], other: [ 'text' ] } }
  }));

  // applyInheritedValuesToDOM() walks the sources in reverse and lets each one overwrite what
  // the previous wrote, so the entry written first in the game file is the one that survives
  await t.expect((await observed(t)).text).eql('from base');
});

test('A change to the source reaches the bottom of the chain', async t => {
  await openRoom(t, 'modern', chain({
    leaf: { inheritFrom: { middle: [ 'text' ] } },
    change: { type: 'button', x: 700, y: 500, width: 100, height: 60, text: 'change', clickRoutine: [
      { func: 'SELECT', property: 'id', value: 'base' },
      { func: 'SET', property: 'text', value: 'changed' }
    ] }
  }));
  await t.click('#w_change');

  await t.expect(Selector('#w_leaf textarea').value).contains('changed', 'the rendered label follows');
  await t.expect((await observed(t)).text).eql('changed', 'and so does what a routine reads');
});

test('Removing the source leaves the inherited value behind', async t => {
  await openRoom(t, 'modern', chain({
    leaf: { inheritFrom: { base: [ 'text' ] } },
    remove: { type: 'button', x: 700, y: 500, width: 100, height: 60, text: 'remove', clickRoutine: [
      { func: 'SELECT', property: 'id', value: 'base' },
      { func: 'DELETE' }
    ] }
  }));
  await t.click('#w_remove');
  await t.expect(Selector('#w_base').exists).notOk('the source is gone');

  // #2854, and worse than the issue says: the two halves of the widget disagree. The DOM keeps
  // whatever applyInheritedDeltaToDOM() last wrote, because nothing tells the inheriting widget
  // that its source is gone - while get() resolves through widgets.has(id) and so returns the
  // widget's own default from the moment of the deletion. So the player reads 'from base' off
  // the table and a routine reading the same property gets ''.
  await t.expect(Selector('#w_leaf textarea').value).contains('from base', 'the leaf still renders it');
  await t.expect((await observed(t)).text).eql('', 'while a routine already sees it gone');
});

test('An inherited property is not part of the widget\'s own state', async t => {
  await openRoom(t, 'modern', chain({ leaf: { inheritFrom: { middle: [ 'text' ] } } }));
  await t.expect(Selector('#w_leaf textarea').value).contains('from base', 'the value is rendered');

  const state = await getStateObject();
  await t.expect(state.leaf.text).eql(undefined, 'and is not saved with the widget');
});
