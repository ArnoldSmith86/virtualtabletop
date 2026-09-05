import fs from 'fs';
import os from 'os';
import path from 'path';

import Room from '../../server/room.mjs';
import { VERSION } from '../../server/fileupdater.mjs';

let directory = null;
let source = null;

const moveFile = (from, to)=>Room.prototype.moveFile.call(null, from, to);

const player = { name: 'Player' };

// a room that keeps its games in the temporary directory and talks to nobody
function roomWithStates(states) {
  const room = Object.create(Room.prototype);
  room.state = { _meta: { states } };
  room.variantFilename = (stateID, variantID)=>path.join(directory, `${stateID}-${variantID}.json`);
  room.sendMetaUpdate = ()=>{};
  return room;
}

// a room that loads the given games from a file in the temporary directory, like a real room load
function roomLoadingStates(states) {
  const room = roomWithStates({});
  room.id = 'room';
  room.roomFilename = ()=>path.join(directory, 'room.json');
  room.getPublicLibraryGames = ()=>({});
  room.broadcast = ()=>{};
  fs.writeFileSync(room.roomFilename(), JSON.stringify({ _meta: { version: VERSION, metaVersion: 2, players: {}, starred: {}, states } }));
  return room;
}

// a room that applies deltas and talks to nobody
function roomReceivingDeltas(state) {
  const room = Object.create(Room.prototype);
  room.state = state;
  room.deltaID = 0;
  room.broadcast = ()=>{};
  return room;
}

function writeVariantFiles(stateID, count) {
  for(let i=0; i<count; ++i)
    fs.writeFileSync(path.join(directory, `${stateID}-${i}.json`), `{"variant":${i}}`);
}

beforeEach(function() {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-room-'));
  source = path.join(directory, '0.json');
  fs.writeFileSync(source, '{"a":1}');
});

afterEach(function() {
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('server/room.mjs', function() {
  test('moveFile moves a file to its new name', function() {
    moveFile(source, path.join(directory, '1.json'));
    expect(fs.readdirSync(directory)).toEqual([ '1.json' ]);
    expect(fs.readFileSync(path.join(directory, '1.json'), 'utf8')).toEqual('{"a":1}');
  });

  test('moveFile keeps the file when source and target are the same', function() {
    moveFile(source, source);
    expect(fs.readFileSync(source, 'utf8')).toEqual('{"a":1}');
  });

  test('editState removes the game when its last variant is deleted', function() {
    const states = { game: { name: 'Game', variants: [ {} ] } };
    const room = roomWithStates(states);
    writeVariantFiles('game', 1);

    room.editState(player, 'game', states.game, [], [ { operation: 'delete', variantID: 0 } ]);

    expect(states.game).toBeUndefined();
    expect(fs.existsSync(path.join(directory, 'game-0.json'))).toBe(false);
  });

  test('editState keeps the game when a variant is left', function() {
    const states = { game: { name: 'Game', variants: [ {}, {} ] } };
    const room = roomWithStates(states);
    writeVariantFiles('game', 2);

    room.editState(player, 'game', states.game, [ {} ], [ { operation: 'delete', variantID: 0 } ]);

    expect(states.game.variants.length).toEqual(1);
    expect(fs.readFileSync(path.join(directory, 'game-0.json'), 'utf8')).toEqual('{"variant":1}');
  });

  test('removeInvalidPublicLibraryLinks removes a game whose links are all gone', function() {
    const states = {
      'PL:games/Alive': { name: 'Alive', variants: [ {} ] },
      linksOnly:        { name: 'Links', variants: [ { plStateID: 'PL:games/Gone', plVariantID: 0 } ] },
      mixed:            { name: 'Mixed', variants: [ { plStateID: 'PL:games/Alive', plVariantID: 0 }, { plStateID: 'PL:games/Gone', plVariantID: 0 } ] }
    };
    const room = roomWithStates(states);

    room.removeInvalidPublicLibraryLinks();

    expect(states.linksOnly).toBeUndefined();
    expect(states.mixed.variants.length).toEqual(1);
    expect(states['PL:games/Alive']).toBeDefined();
  });

  test('removeInvalidPublicLibraryLinks removes several dead links and keeps the surviving variant', function() {
    const states = {
      'PL:games/Alive': { name: 'Alive', variants: [ {} ] },
      several:          { name: 'Several', variants: [ { plStateID: 'PL:games/Gone', plVariantID: 0 }, { plStateID: 'PL:games/AlsoGone', plVariantID: 0 }, {} ] }
    };
    const room = roomWithStates(states);
    writeVariantFiles('several', 3);

    room.removeInvalidPublicLibraryLinks();

    expect(states.several.variants).toEqual([ {} ]);
    expect(fs.readFileSync(path.join(directory, 'several-0.json'), 'utf8')).toEqual('{"variant":2}');
  });

  test('load repairs games with dead public library links and games without variants', async function() {
    const room = roomLoadingStates({
      mixed:     { name: 'Mixed', variants: [ { plStateID: 'PL:games/Gone', plVariantID: 0 }, { plStateID: 'PL:games/AlsoGone', plVariantID: 0 }, {} ] },
      linksOnly: { name: 'Links', variants: [ { plStateID: 'PL:games/Gone', plVariantID: 0 } ] },
      empty:     { name: 'Empty', variants: [] },
      filled:    { name: 'Filled', variants: [ {} ] }
    });
    writeVariantFiles('mixed', 3);

    await room.load();

    expect(room.state._meta.states.mixed.variants).toEqual([ {} ]);
    expect(fs.readFileSync(path.join(directory, 'mixed-0.json'), 'utf8')).toEqual('{"variant":2}');
    expect(room.state._meta.states.linksOnly).toBeUndefined();
    expect(room.state._meta.states.empty).toBeUndefined();
    expect(room.state._meta.states.filled).toBeDefined();
  });

  test('removeStatesWithoutVariants removes games that have no variant left', function() {
    const states = {
      empty:            { name: 'Empty', variants: [] },
      filled:           { name: 'Filled', variants: [ {} ] },
      'PL:games/Empty': { name: 'Library', variants: [] }
    };
    const room = roomWithStates(states);

    room.removeStatesWithoutVariants();

    expect(states.empty).toBeUndefined();
    expect(states.filled).toBeDefined();
    expect(states['PL:games/Empty']).toBeDefined();
  });

  test('receiveDelta does not store null properties of a widget it creates', function() {
    const room = roomReceivingDeltas({ _meta: {} });

    room.receiveDelta(player, { s: { card1: { id: 'card1', type: 'card', x: null, y: null, z: 3 } } });

    expect(room.state.card1).toEqual({ id: 'card1', type: 'card', z: 3 });
  });

  test('receiveDelta removes null properties of a widget that already exists', function() {
    const room = roomReceivingDeltas({ _meta: {}, card1: { id: 'card1', type: 'card', x: 10, z: 3 } });

    room.receiveDelta(player, { s: { card1: { x: null, z: 4 } } });

    expect(room.state.card1).toEqual({ id: 'card1', type: 'card', z: 4 });
  });
});
