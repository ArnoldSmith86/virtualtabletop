import { ClientFunction } from 'testcafe';

import { getStateObject, setupTestEnvironment } from './test-util.js';
import { dragPath, openRoom, stateWhen } from './interaction-util.js';

setupTestEnvironment();

// Layer E, the last two input paths: the keyboard and the zoom transform.
//
// A hotkey is the only way to reach a routine without a pointer at all, and it has rules
// nothing else has - which widget wins when two share a key, and when the room is supposed to
// ignore the key entirely because the player is typing or an overlay is open.
//
// Zoom is here for a different reason: it is a coordinate transform sitting between the pointer
// and the engine, so every drag is a different arithmetic problem at every zoom level. The
// interaction fixtures all run at 1x, which is exactly the level at which the transform cannot
// be wrong. #2977 (piles at zoom) is the open issue in this corner, and the cases below are the
// coordinate half of it.

const TIERS = [ 'modern', 'legacy-all' ];

const zoomLevel = ClientFunction(_=>+getComputedStyle(document.documentElement).getPropertyValue('--zoom') || 1);

// The slider is the one zoom control that takes an exact level; the key path is asserted
// separately below. Setting the value alone changes nothing - zoom.js listens for 'input'.
const setZoom = ClientFunction(level => {
  const slider = document.getElementById('zoomSlider');
  slider.value = Math.round(level*10);
  slider.dispatchEvent(new Event('input', { bubbles: true }));
});

const widgetBox = ClientFunction(id => {
  const rectangle = document.getElementById('w_' + id).getBoundingClientRect();
  return { width: rectangle.width, height: rectangle.height };
});

function counterState(overrides = {}) {
  const state = {
    log: { id: 'log', type: 'basic', x: 700, y: 900, width: 80, height: 80, pressed: '' },
    a:   { id: 'a', type: 'button', x: 100, y: 100, width: 100, height: 60, text: 'a', hotkey: 'a', clickRoutine: press('a') },
    b:   { id: 'b', type: 'button', x: 300, y: 100, width: 100, height: 60, text: 'b', hotkey: 'b', clickRoutine: press('b') }
  };
  for(const [ id, properties ] of Object.entries(overrides))
    state[id] = state[id] ? Object.assign(state[id], properties) : Object.assign({ id }, properties);
  return state;
}

// Appending rather than overwriting: the interesting part of a hotkey with two listeners is the
// order they run in, which a counter would hide.
function press(tag) {
  return [
    { func: 'SELECT', property: 'id', value: 'log', collection: 'log' },
    { func: 'SET', collection: 'log', property: 'pressed', value: `\${PROPERTY pressed OF log}${tag}` }
  ];
}

async function pressed(t, expected) {
  const state = await stateWhen(s=>String((s.log||{}).pressed||'').length >= expected.length);
  await t.wait(300);
  await t.expect(String(((await getStateObject()).log||{}).pressed||'')).eql(expected);
}

for(const combo of TIERS) {
  test(`A hotkey runs the widget's click routine (${combo})`, async t => {
    await openRoom(t, combo, counterState());
    await t.pressKey('a');

    await pressed(t, 'a');
  });
}

test('Two widgets sharing a hotkey both fire, in id order', async t => {
  await openRoom(t, 'modern', counterState({
    a: { id: 'a', hotkey: 'x' },
    b: { id: 'b', hotkey: 'x' },
    // ids are compared with localeCompare, so this one goes first despite being added last
    A: { type: 'button', x: 500, y: 100, width: 100, height: 60, text: 'A', hotkey: 'x', clickRoutine: press('A') }
  }));
  await t.pressKey('x');

  await pressed(t, 'aAb');
});

test('A hotkey on a widget outside the room does not fire', async t => {
  await openRoom(t, 'modern', counterState({ b: { x: 2400, y: 1600 } }));
  await t.pressKey('a').pressKey('b');

  // widgetFilter(...isVisible()) in mousehandling.js: a widget the player cannot see cannot be
  // triggered by its hotkey either
  await pressed(t, 'a');
});

test('A hotkey pressed while typing into a label goes into the label', async t => {
  await openRoom(t, 'modern', counterState({
    input: { type: 'label', x: 700, y: 300, width: 300, height: 40, editable: true, text: '' }
  }));
  await t.typeText('#w_input textarea', 'a', { replace: true });

  const state = await stateWhen(s=>s.input && s.input.text !== undefined && s.input.text !== '');
  await t.expect(state.input.text).eql('a', 'the key reached the label');
  await t.expect((state.log||{}).pressed).eql('', 'and did not run the hotkey routine');
});

test('A hotkey pressed while an overlay is open does nothing', async t => {
  await openRoom(t, 'modern', counterState());
  await t.click('#playersButton');
  await t.pressKey('a');
  await t.wait(500);

  await t.expect(((await getStateObject()).log||{}).pressed).eql('', 'no hotkey routine ran');
  await t.click('#activeGameButton');
});

// ---------------------------------------------------------------------------------------------
// Zoom
// ---------------------------------------------------------------------------------------------

test('PageUp and PageDown step through the zoom levels', async t => {
  await openRoom(t, 'modern', counterState());
  await t.expect(await zoomLevel()).eql(1);

  await t.pressKey('pageup');
  await t.expect(await zoomLevel()).eql(1.1, 'PageUp is one step in');
  await t.pressKey('pagedown');
  await t.expect(await zoomLevel()).eql(1, 'PageDown is one step back');
  await t.pressKey('pagedown');
  await t.expect(await zoomLevel()).eql(1, 'and 1x is the floor');
});

test('ignoreZoom keeps a widget the size it was while the board grows', async t => {
  await openRoom(t, 'modern', counterState({
    a: { ignoreZoom: true },
    b: {}
  }));
  const before = { a: await widgetBox('a'), b: await widgetBox('b') };

  await setZoom(2);
  await t.expect(await zoomLevel()).eql(2);
  const after = { a: await widgetBox('a'), b: await widgetBox('b') };

  await t.expect(Math.round(after.b.width/before.b.width)).eql(2, 'the plain widget doubles');
  await t.expect(Math.round(after.a.width/before.a.width)).eql(1, 'the ignoreZoom widget does not');
});

for(const combo of TIERS) {
  test(`A drag at 2x zoom lands on the board coordinate the pointer went to (${combo})`, async t => {
    // zoom is around the centre of the board, so everything the test touches has to be in the
    // half that stays visible - a widget outside it is not a valid drop target any more
    await openRoom(t, combo, {
      probe: { id: 'probe', type: 'basic', x: 700, y: 400, width: 100, height: 100 }
    });
    await setZoom(2);
    await t.expect(await zoomLevel()).eql(2);
    await dragPath(t, 'probe', [ { dx: 120, dy: 80 } ]);

    const state = await stateWhen(s=>s.probe && s.probe.x != 700);
    // the pointer moves whole screen pixels and one board unit is two of them at this zoom
    // level, so the landing coordinate is exact to within half a unit
    await t.expect(state.probe.x).within(819, 821, `x in combination ${combo}`);
    await t.expect(state.probe.y).within(479, 481, `y in combination ${combo}`);
  });

  test(`A card dropped into a holder at 2x zoom still lands in it (${combo})`, async t => {
    await openRoom(t, combo, {
      deck:  { id: 'deck', type: 'deck', cardTypes: { plain: {} }, x: 760, y: 300 },
      card1: { id: 'card1', type: 'card', deck: 'deck', cardType: 'plain', x: 620, y: 330 },
      // the classic layout, so the assertion below can pin the drop offset
      // (the auto default would center the card instead)
      hand:  { id: 'hand', type: 'holder', layout: 'custom', x: 620, y: 520, width: 350, height: 200,
               onEnter: { entered: true },
               enterRoutine: [ { func: 'SELECT', property: 'id', value: 'deck', collection: 'deck' },
                               { func: 'SET', collection: 'deck', property: 'arrived', value: true } ] }
    });
    await setZoom(2);
    await dragPath(t, 'card1', [ { onto: 'hand' } ]);

    const state = await stateWhen(s=>s.card1 && s.card1.parent == 'hand');
    await t.expect(state.card1.parent).eql('hand', `parent in combination ${combo}`);
    await t.expect(state.card1.x).eql(4, `dropOffsetX applied in combination ${combo}`);
    await t.expect(state.card1.entered).eql(true, `onEnter applied in combination ${combo}`);
    await t.expect((state.deck||{}).arrived).eql(true, `enterRoutine ran in combination ${combo}`);
  });
}
