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

test('INPUT resolves inputSeatID separately for each active player and keeps the invoking seat', async t => {
  await openClient(t, 'Alice');
  await openRoom(t, 'modern', twoPlayerState({
    seatA: { player: 'Alice', hand: 'handA' }, seatB: { player: 'Bob', hand: 'handB' },
    ask: { type: 'button', x: 1000, y: 500, width: 120, height: 60, text: 'ask', clickRoutine: [
      { func: 'INPUT', player: '${activePlayers}', header: 'Your seat: ${inputSeatID}', fields: [
        { type: 'string', variable: 'answer', value: '${PROPERTY hand OF $inputSeatID}' },
        { type: 'text', text: 'Invoking seat: ${seatID}' }
      ] },
      { func: 'SET', collection: 'thisButton', property: 'answers', value: '${answer}' },
      { func: 'SET', collection: 'thisButton', property: 'invokingSeat', value: '${seatID}' }
    ] }
  }));
  const first = await t.getCurrentWindow();
  const second = await openSecondClient(t, 'Bob');
  await t.switchToWindow(first);
  await t.click('#w_ask');
  await t.expect(Selector('#buttonInputFields').innerText).contains('Your seat: seatA');
  await t.expect(Selector('#buttonInputFields input').value).eql('handA');
  await t.click('#buttonInputGo');
  await t.switchToWindow(second);
  await t.expect(Selector('#buttonInputFields').innerText).contains('Your seat: seatB');
  await t.expect(Selector('#buttonInputFields').innerText).contains('Invoking seat: seatA');
  await t.expect(Selector('#buttonInputFields input').value).eql('handB');
  await t.click('#buttonInputGo');
  const state = await stateWhen(s=>(s.ask||{}).answers);
  await t.expect(state.ask.answers).eql({ Alice: 'handA', Bob: 'handB' });
  await t.expect(state.ask.invokingSeat).eql('seatA');
  await t.closeWindow(second);
});

for(const seat of [ 'seatB', 2 ]) {
  test(`INPUT addresses a remote player by seat ${JSON.stringify(seat)}`, async t => {
    await openClient(t, 'Alice');
    await openRoom(t, 'modern', twoPlayerState({
      seatA: { player: 'Alice' }, seatB: { player: 'Bob' },
      ask: { type: 'button', x: 1000, y: 500, width: 120, height: 60, text: 'ask', clickRoutine: [
        { func: 'INPUT', seat, fields: [ { type: 'string', variable: 'answer', value: '${inputSeatID}' } ] },
        { func: 'SET', collection: 'thisButton', property: 'answer', value: '${answer}' }
      ] }
    }));
    const first = await t.getCurrentWindow();
    const second = await openSecondClient(t, 'Bob');
    await t.switchToWindow(first);
    await t.click('#w_ask');
    await t.expect(visibleOverlays()).eql('');
    await t.switchToWindow(second);
    await t.expect(Selector('#buttonInputFields input').value).eql('seatB');
    await t.click('#buttonInputGo');
    const state = await stateWhen(s=>(s.ask||{}).answer);
    await t.expect(state.ask.answer).eql('seatB');
    await t.closeWindow(second);
  });
}

for(const seat of [ [ 'seatA', 2, 'seatB' ], '${activeSeats}' ]) {
  test(`INPUT addresses occupied seats using ${JSON.stringify(seat)}`, async t => {
    await openClient(t, 'Alice');
    await openRoom(t, 'modern', twoPlayerState({
      seatA: { player: 'Alice' }, seatB: { player: 'Bob' },
      ask: { type: 'button', x: 1000, y: 500, width: 120, height: 60, text: 'ask', clickRoutine: [
        { func: 'INPUT', seat, fields: [ { type: 'string', variable: 'answer', value: '${inputSeatID}' } ] },
        { func: 'SET', collection: 'thisButton', property: 'answers', value: '${answer}' }
      ] }
    }));
    const first = await t.getCurrentWindow();
    const second = await openSecondClient(t, 'Bob');
    await t.switchToWindow(first);
    await t.click('#w_ask');
    await t.expect(Selector('#buttonInputFields input').value).eql('seatA');
    await t.click('#buttonInputGo');
    await t.switchToWindow(second);
    await t.expect(Selector('#buttonInputFields input').value).eql('seatB');
    await t.click('#buttonInputGo');
    const state = await stateWhen(s=>(s.ask||{}).answers);
    await t.expect(state.ask.answers).eql({ Alice: 'seatA', Bob: 'seatB' });
    await t.expect(visibleOverlays()).eql('');
    await t.closeWindow(second);
  });
}

test('INPUT preserves answers with recipient-dependent variable names', async t => {
  await openClient(t, 'Alice');
  await openRoom(t, 'modern', twoPlayerState({
    seatA: { player: 'Alice' }, seatB: { player: 'Bob' },
    ask: { type: 'button', x: 1000, y: 500, width: 120, height: 60, text: 'ask', clickRoutine: [
      { func: 'INPUT', player: '${activePlayers}', fields: [
        { type: 'string', variable: 'answer_${inputSeatID}', value: '${inputSeatID}' }
      ] },
      { func: 'SET', collection: 'thisButton', property: 'answerA', value: '${answer_seatA}' },
      { func: 'SET', collection: 'thisButton', property: 'answerB', value: '${answer_seatB}' }
    ] }
  }));
  const first = await t.getCurrentWindow();
  const second = await openSecondClient(t, 'Bob');
  await t.switchToWindow(first);
  await t.click('#w_ask');
  await t.expect(Selector('#buttonInputFields input').value).eql('seatA');
  await t.click('#buttonInputGo');
  await t.switchToWindow(second);
  await t.expect(Selector('#buttonInputFields input').value).eql('seatB');
  await t.click('#buttonInputGo');
  const state = await stateWhen(s=>(s.ask||{}).answerA);
  await t.expect(state.ask.answerA).eql({ Alice: 'seatA' });
  await t.expect(state.ask.answerB).eql({ Bob: 'seatB' });
  await t.closeWindow(second);
});

test('INPUT block strings replace guidance, reset for true and keep cancellation behavior', async t => {
  const custom = "Please wait for ${seatID}.\n<b>Cancel ends everyone's choices.</b>";
  const state = twoPlayerState({ seatA: { player: 'Alice' } });
  for(const [i, block] of [ custom, true, '', false ].entries())
    state[`ask${i}`] = { id: `ask${i}`, type: 'button', x: 850 + i*150, y: 500, width: 120, height: 60, text: 'ask', clickRoutine: [
      { func: 'INPUT', player: 'Bob', block, fields: [ { type: 'string', variable: 'answer', value: 'yes' } ] },
      { func: 'SET', collection: 'thisButton', property: 'answered', value: '${answer}' }
    ] };
  await openClient(t, 'Alice');
  await openRoom(t, 'modern', state);
  const first = await t.getCurrentWindow();
  const second = await openSecondClient(t, 'Bob');
  const expected = [ "Please wait for seatA.\n<b>Cancel ends everyone's choices.</b>",
    'No action required. Pressing the Cancel button will force close the input for everyone and all choices will be lost.', '' ];
  for(let i=0; i<4; i++) {
    await t.switchToWindow(first);
    await t.click(`#w_ask${i}`);
    if(i<3) {
      await t.expect(visibleOverlays()).contains('inputBlockOverlay');
      await t.expect(Selector('#inputBlockGuidance').textContent).eql(expected[i]);
      await t.expect(Selector('#inputBlockGuidance b').exists).notOk();
    } else
      await t.expect(visibleOverlays()).eql('');
    await t.switchToWindow(second);
    await t.expect(visibleOverlays()).contains('buttonInputOverlay');
    if(i<3) {
      await t.switchToWindow(first);
      await t.click('#inputBlockCancel');
      await t.switchToWindow(second);
      await t.expect(visibleOverlays()).eql('');
    } else
      await t.click('#buttonInputCancel');
    await t.switchToWindow(first);
    await t.expect(visibleOverlays()).eql('');
  }
  await t.click('#w_ask0');
  await t.switchToWindow(second);
  await t.expect(visibleOverlays()).contains('buttonInputOverlay');
  await t.click('#buttonInputGo');
  const answered = await stateWhen(s=>(s.ask0||{}).answered);
  await t.expect(answered.ask0.answered).eql('yes');
  await t.switchToWindow(first);
  await t.expect(visibleOverlays()).eql('');
  await t.closeWindow(second);
});

test('INPUT can address one remote unseated player without changing the invoking seat', async t => {
  await openClient(t, 'Alice');
  await openRoom(t, 'modern', twoPlayerState({
    seatA: { player: 'Alice' },
    ask: { type: 'button', x: 1000, y: 500, width: 120, height: 60, text: 'ask', clickRoutine: [
      { func: 'INPUT', player: 'Bob', fields: [ { type: 'string', variable: 'answer', value: 'Seat: ${inputSeatID}' } ] },
      { func: 'SET', collection: 'thisButton', property: 'text', value: '${seatID}; ${answer}' }
    ] }
  }));
  const first = await t.getCurrentWindow();
  const second = await openSecondClient(t, 'Bob');
  await t.switchToWindow(first);
  await t.click('#w_ask');
  await t.expect(visibleOverlays()).eql('');
  await t.switchToWindow(second);
  await t.expect(Selector('#buttonInputFields input').value).eql('Seat: null');
  await t.click('#buttonInputGo');
  const state = await stateWhen(s=>(s.ask||{}).text != 'ask');
  await t.expect(state.ask.text).eql('seatA; Seat: null');
  await t.closeWindow(second);
});
