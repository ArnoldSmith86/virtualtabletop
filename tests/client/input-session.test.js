import Room from '../../server/room.mjs';

// Unit tests for the remote-INPUT server routing (Room.requestInput / inputResult /
// abortInput / cancelInput). We build a bare Room via the prototype and mock the
// Player connections so we can assert exactly which messages get sent where.

function mockPlayer(name) {
  return { name, sent: [], send(func, args) { this.sent.push({ func, args }); } };
}

function makeRoom(players) {
  const room = Object.create(Room.prototype);
  room.players = players;
  return room;
}

function sentTo(player, func) {
  return player.sent.filter(m => m.func === func);
}

describe('Room remote INPUT routing', () => {
  test('all targets reachable: each gets showInput, no early cancel', () => {
    const init = mockPlayer('Init'), a = mockPlayer('A'), b = mockPlayer('B');
    const room = makeRoom([ init, a, b ]);
    room.requestInput(init, { sessionID: 's1', targets: [ 'A', 'B' ], widgetID: 'w', overlay: {}, variables: {}, collections: {} });
    expect(sentTo(a, 'showInput').length).toBe(1);
    expect(sentTo(b, 'showInput').length).toBe(1);
    expect(sentTo(init, 'inputResult').length).toBe(0);
    expect(room.inputRequests['s1'].remaining.map(t => t.name).sort()).toEqual([ 'A', 'B' ]);
  });

  test('a partially unreachable target list cancels the whole session (no hang)', () => {
    const init = mockPlayer('Init'), a = mockPlayer('A');
    const room = makeRoom([ init, a ]);
    room.requestInput(init, { sessionID: 's2', targets: [ 'A', 'Ghost' ], widgetID: 'w', overlay: {}, variables: {}, collections: {} });
    // Initiator is told the session is cancelled, nothing is left pending, and the
    // reachable target is never asked (all-or-nothing).
    expect(sentTo(init, 'inputResult')).toEqual([ { func: 'inputResult', args: { sessionID: 's2', cancelled: true } } ]);
    expect(sentTo(a, 'showInput').length).toBe(0);
    expect(room.inputRequests && room.inputRequests['s2']).toBeFalsy();
  });

  test('duplicate names in the target list only ask the connection once', () => {
    const init = mockPlayer('Init'), a = mockPlayer('A');
    const room = makeRoom([ init, a ]);
    room.requestInput(init, { sessionID: 's3', targets: [ 'A', 'A' ], widgetID: 'w', overlay: {}, variables: {}, collections: {} });
    expect(sentTo(a, 'showInput').length).toBe(1);
    expect(room.inputRequests['s3'].remaining.length).toBe(1);
  });

  test('one target cancelling closes the others and ends the session', () => {
    const init = mockPlayer('Init'), a = mockPlayer('A'), b = mockPlayer('B');
    const room = makeRoom([ init, a, b ]);
    room.requestInput(init, { sessionID: 's4', targets: [ 'A', 'B' ], widgetID: 'w', overlay: {}, variables: {}, collections: {} });
    room.inputResult(a, { sessionID: 's4', cancelled: true });
    // Initiator learns of the cancel, B's overlay is closed, request is gone.
    expect(sentTo(init, 'inputResult').some(m => m.args.cancelled)).toBe(true);
    expect(sentTo(b, 'hideInput').length).toBe(1);
    expect(room.inputRequests['s4']).toBeFalsy();
  });

  test('results are echoed to the initiator under the requested name and complete when all answer', () => {
    const init = mockPlayer('Init'), a = mockPlayer('A'), b = mockPlayer('B');
    const room = makeRoom([ init, a, b ]);
    room.requestInput(init, { sessionID: 's5', targets: [ 'A', 'B' ], widgetID: 'w', overlay: {}, variables: {}, collections: {} });
    room.inputResult(a, { sessionID: 's5', cancelled: false, variables: { n: 1 }, collections: {} });
    expect(room.inputRequests['s5'].remaining.map(t => t.name)).toEqual([ 'B' ]);
    room.inputResult(b, { sessionID: 's5', cancelled: false, variables: { n: 2 }, collections: {} });
    const results = sentTo(init, 'inputResult');
    expect(results.map(m => m.args.player)).toEqual([ 'A', 'B' ]);
    expect(room.inputRequests['s5']).toBeFalsy();
  });

  test('block overlay: a player who answered joins the waiting overlay for the rest', () => {
    const init = mockPlayer('Init'), a = mockPlayer('A'), b = mockPlayer('B'), spectator = mockPlayer('S');
    const room = makeRoom([ init, a, b, spectator ]);
    // Client starts the block (waiting on A and B) then requests input from them.
    room.inputBlock(init, { blockID: 's7', show: true, waitingFor: [ 'A', 'B' ], header: 'Pass' });
    room.requestInput(init, { sessionID: 's7', targets: [ 'A', 'B' ], widgetID: 'w', overlay: {}, variables: {}, collections: {} });
    // Initially only non-participants (Init, spectator) see the wait overlay.
    expect(sentTo(a, 'inputBlock').filter(m => m.args.show).length).toBe(0);
    expect(sentTo(spectator, 'inputBlock').some(m => m.args.show)).toBe(true);

    // A answers -> A now sees the wait overlay, listing only B.
    room.inputResult(a, { sessionID: 's7', cancelled: false, variables: {}, collections: {} });
    const aShow = sentTo(a, 'inputBlock').filter(m => m.args.show);
    expect(aShow.length).toBe(1);
    expect(aShow[0].args.waitingFor).toEqual([ 'B' ]);
    // B is still answering, so B is never shown the wait overlay.
    expect(sentTo(b, 'inputBlock').some(m => m.args.show)).toBe(false);
  });

  test('block overlay: cancel from a waiting player routes to the initiator', () => {
    const init = mockPlayer('Init'), a = mockPlayer('A'), spectator = mockPlayer('S');
    const room = makeRoom([ init, a, spectator ]);
    room.inputBlock(init, { blockID: 's8', show: true, waitingFor: [ 'A' ], header: 'x' });
    room.cancelInput(spectator, { blockID: 's8' });
    expect(sentTo(init, 'inputCancelled')).toEqual([ { func: 'inputCancelled', args: { sessionID: 's8' } } ]);
  });

  test('rename mid-session still delivers the result (connection-keyed tracking)', () => {
    const init = mockPlayer('Init'), a = mockPlayer('A');
    const room = makeRoom([ init, a ]);
    room.requestInput(init, { sessionID: 's6', targets: [ 'A' ], widgetID: 'w', overlay: {}, variables: {}, collections: {} });
    a.name = 'Renamed';   // player renames while the overlay is open
    room.inputResult(a, { sessionID: 's6', cancelled: false, variables: { n: 9 }, collections: {} });
    // Echoed back under the name the initiator originally used, session completes.
    expect(sentTo(init, 'inputResult')[0].args.player).toBe('A');
    expect(room.inputRequests['s6']).toBeFalsy();
  });
});
