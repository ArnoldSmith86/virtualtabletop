import { ClientFunction, Selector } from 'testcafe';

import { prepareClient, roomURL, setupTestEnvironment } from './test-util.js';
import { openRoom, stateWhen } from './interaction-util.js';

setupTestEnvironment();

// Layer E: a second player.
//
// Everything else in the suite is one browser in an empty room, which is the one configuration
// in which delta sync, per-seat visibility and an overlay opened by somebody else cannot be
// wrong. Four of the open crash issues live in exactly the configuration that is missing
// (#2924 #2978 #3037 #2672), and a game is a multiplayer program: a widget that is invisible to
// the player who owns it, or a state that converges to two different answers, is a bug no
// single-client assertion can see.
//
// TestCafe drives both windows from one test, so the cases below are precise about the order:
// each acts in one window and asserts in the other, which is exactly the direction a delta
// travels.
//
// The whole file needs --disable-native-automation, because TestCafe's native automation mode
// refuses to open a second window. The CI matrix passes that flag for this file only.

const boxDigest = ClientFunction(_=>{
  const nodes = document.querySelectorAll('#topSurface > [id^="w_"]');
  const surface = document.getElementById('topSurface').getBoundingClientRect();
  const scale = +getComputedStyle(document.documentElement).getPropertyValue('--scale') || 1;
  return Array.prototype.map.call(nodes, node => {
    const box = node.getBoundingClientRect();
    // in board units, so the two windows are comparable even if they are not the same size
    return `${node.id} ${Math.round((box.left-surface.left)/scale)},${Math.round((box.top-surface.top)/scale)}`;
  }).sort().join('\n');
});

const isForeign = ClientFunction(id => document.getElementById('w_' + id).className.split(/\s+/).indexOf('foreign') != -1);

const visibleOverlays = ClientFunction(_=>Array.prototype.map.call(document.querySelectorAll('.overlay'), o=>o.style.display != 'none' ? o.id : '').filter(id=>id).join(' '));

// The name a client joins under comes from localStorage, so it is put there before the room is
// loaded rather than typed into the Players table: renaming there is a round trip per keystroke,
// and with two clients in the room both of them work through every meta update that follows.
const storePlayerName = ClientFunction(name => localStorage.setItem('playerName', name));

// Load (or reload) the room in the current window as the named player.
async function openClient(t, name) {
  await storePlayerName(name);
  await t.navigateTo(roomURL());
  await ClientFunction(prepareClient)();
  await t.click('#activeGameButton');
}

// A second browser window on the same room, prepared the same way the first one is.
async function openSecondClient(t, name) {
  const second = await t.openWindow(roomURL());
  await openClient(t, name);
  return second;
}

function twoPlayerState(overrides = {}) {
  const state = {
    seatA: { id: 'seatA', type: 'seat', x: 40,  y: 40, index: 1 },
    seatB: { id: 'seatB', type: 'seat', x: 200, y: 40, index: 2 },
    probe: { id: 'probe', type: 'basic', x: 700, y: 300, width: 100, height: 100 },
    move:  { id: 'move', type: 'button', x: 700, y: 500, width: 120, height: 60, text: 'move', clickRoutine: [
      { func: 'SELECT', property: 'id', value: 'probe' },
      { func: 'SET', property: 'x', value: 1100 }
    ] }
  };
  for(const [ id, properties ] of Object.entries(overrides))
    state[id] = state[id] ? Object.assign(state[id], properties) : Object.assign({ id }, properties);
  return state;
}

test('A change made by one client arrives at the other', async t => {
  await openClient(t, 'Alice');
  await openRoom(t, 'modern', twoPlayerState());
  const first = await t.getCurrentWindow();
  const second = await openSecondClient(t, 'Bob');

  await t.switchToWindow(first);
  await t.click('#w_move');
  await stateWhen(s=>(s.probe||{}).x == 1100);

  await t.switchToWindow(second);
  await t.expect(Selector('#w_probe').exists).ok();
  // the assertion is on the rendered box rather than on the room state: the state is the
  // server's copy, and what this file is about is whether the second client was told
  await t.expect(boxDigest()).contains('w_probe 1100,300', 'the second client rendered the move');

  await t.closeWindow(second);
});

test('Two clients acting on different widgets converge on the same board', async t => {
  await openClient(t, 'Alice');
  await openRoom(t, 'modern', twoPlayerState({
    other: { type: 'basic', x: 300, y: 700, width: 100, height: 100 },
    moveOther: { type: 'button', x: 300, y: 500, width: 120, height: 60, text: 'other', clickRoutine: [
      { func: 'SELECT', property: 'id', value: 'other' },
      { func: 'SET', property: 'y', value: 850 }
    ] }
  }));
  const first = await t.getCurrentWindow();
  const second = await openSecondClient(t, 'Bob');

  await t.click('#w_moveOther');
  await t.switchToWindow(first);
  await t.click('#w_move');
  await stateWhen(s=>(s.probe||{}).x == 1100 && (s.other||{}).y == 850);
  await t.wait(500);

  const fromFirst = await boxDigest();
  await t.switchToWindow(second);
  await t.expect(boxDigest()).eql(fromFirst, 'both clients ended up with the same board');

  await t.closeWindow(second);
});

test('onlyVisibleForSeat hides the widget from the other player, not from its own', async t => {
  await openClient(t, 'Alice');
  await openRoom(t, 'modern', twoPlayerState());
  const first = await t.getCurrentWindow();
  const second = await openSecondClient(t, 'Bob');

  await t.switchToWindow(first);
  // seating is the seat's player property, whether a player clicked the seat or a game wrote it
  await openRoom(t, 'modern', twoPlayerState({
    seatA: { player: 'Alice' }, seatB: { player: 'Bob' },
    secret: { type: 'basic', x: 900, y: 700, width: 100, height: 100, onlyVisibleForSeat: 'seatA' }
  }));
  await t.expect(Selector('#w_secret').exists).ok();
  await t.expect(isForeign('secret')).eql(false, 'Alice, who sits in seatA, sees it');

  await t.switchToWindow(second);
  await t.expect(Selector('#w_secret').exists).ok();
  await t.expect(isForeign('secret')).eql(true, 'Bob does not');

  await t.closeWindow(second);
});

test('A card owned by one player is foreign to the other', async t => {
  await openClient(t, 'Alice');
  await openRoom(t, 'modern', twoPlayerState());
  const first = await t.getCurrentWindow();
  const second = await openSecondClient(t, 'Bob');

  await t.switchToWindow(first);
  await openRoom(t, 'modern', twoPlayerState({
    deck:  { type: 'deck', cardTypes: { plain: {} }, x: 1450, y: 20 },
    mine:  { type: 'card', deck: 'deck', cardType: 'plain', x: 500, y: 700, owner: 'Alice' }
  }));
  await t.expect(isForeign('mine')).eql(false, 'the owner sees her own card');

  await t.switchToWindow(second);
  await t.expect(Selector('#w_mine').exists).ok();
  await t.expect(isForeign('mine')).eql(true, 'the other player does not');

  await t.closeWindow(second);
});

test('An INPUT overlay opens on the client that triggered it and nowhere else', async t => {
  await openClient(t, 'Alice');
  await openRoom(t, 'modern', twoPlayerState({
    ask: { type: 'button', x: 1000, y: 500, width: 120, height: 60, text: 'ask', clickRoutine: [
      { func: 'INPUT', header: 'Pick one', fields: [ { type: 'string', variable: 'answer', label: 'answer', value: 'yes' } ] },
      { func: 'SELECT', property: 'id', value: 'probe' },
      { func: 'SET', property: 'answered', value: '${answer}' }
    ] }
  }));
  const first = await t.getCurrentWindow();
  const second = await openSecondClient(t, 'Bob');

  await t.switchToWindow(first);
  await t.click('#w_ask');
  await t.expect(visibleOverlays()).contains('buttonInputOverlay', 'the asking client gets the dialog');

  await t.switchToWindow(second);
  await t.expect(visibleOverlays()).eql('', 'and the other client does not');

  await t.switchToWindow(first);
  await t.click('#buttonInputGo');
  const state = await stateWhen(s=>(s.probe||{}).answered);
  await t.expect(state.probe.answered).eql('yes', 'the answer reached the state');

  await t.switchToWindow(second);
  await t.expect(boxDigest()).contains('w_probe', 'and the second client is still connected');

  await t.closeWindow(second);
});
