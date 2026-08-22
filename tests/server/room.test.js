import fs from 'fs';
import os from 'os';
import path from 'path';
import * as fflate from 'fflate';

import Room from '../../server/room.mjs';

let directory = null;
let source = null;
let saveDirectory = null;

const moveFile = (from, to)=>Room.prototype.moveFile.call(null, from, to);

// a room object with just the state and the callback addState needs, writing its variant files
// into the temporary save directory
function testRoom() {
  const room = Object.create(Room.prototype);
  room.id = 'testroom';
  room.state = { _meta: { states: {} } };
  room.sendMetaUpdate = ()=>{};
  return room;
}

function gameFile(files) {
  const entries = {};
  for(const [ filename, content ] of Object.entries(files))
    entries[filename] = fflate.strToU8(typeof content == 'string' ? content : JSON.stringify(content));
  return Buffer.from(fflate.zipSync(entries));
}

beforeEach(function() {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-room-'));
  source = path.join(directory, '0.json');
  fs.writeFileSync(source, '{"a":1}');

  saveDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-room-save-'));
  fs.mkdirSync(path.join(saveDirectory, 'states'));
  process.env.VTT_SAVE_DIR = saveDirectory;
});

afterEach(function() {
  delete process.env.VTT_SAVE_DIR;
  fs.rmSync(directory, { recursive: true, force: true });
  fs.rmSync(saveDirectory, { recursive: true, force: true });
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

  // the tile the client shows while the file is uploading is named after the file the same way,
  // so a game that is named after its file here must not rename itself once this answers
  test('addState names a game after its file without the extension', async function() {
    const room = testRoom();
    const noMeta = { '0.json': { _meta: { version: 8 } } };

    await room.addState('a', 'file', gameFile(noMeta), 'My Game.vtt');
    await room.addState('b', 'file', gameFile(noMeta), 'My Game.VTTS');
    await room.addState('c', 'file', gameFile(noMeta), 'My Game v1.2.vtt');
    await room.addState('d', 'file', gameFile(noMeta), 'My Game.data');

    expect(Object.values(room.state._meta.states).map(state=>state.name)).toEqual([ 'My Game', 'My Game', 'My Game v1.2', 'My Game.data' ]);
  });

  // metadata written by hand or by another tool can hold anything, and assigning something that
  // is not an object into the game spreads it in one property per character or element
  test('addState reads the metadata of a variant only when it is an object', async function() {
    const room = testRoom();

    await room.addState('a', 'file', gameFile({ '0.json': { _meta: { version: 8, info: 'bad metadata' } } }), 'Odd.vtt');
    await room.addState('b', 'file', gameFile({ '0.json': { _meta: { version: 8, info: [ 'bad', 'metadata' ] } } }), 'Odd.vtt');
    await room.addState('c', 'file', gameFile({ '0.json': { _meta: { version: 8, info: { name: 'Good', variant: 'Advanced' } } } }), 'Odd.vtt');

    expect(room.state._meta.states.a.name).toEqual('Odd');
    expect(Object.keys(room.state._meta.states.a)).not.toContain('0');
    expect(room.state._meta.states.a.variants).toEqual([ { players: '', language: '', variant: '', variantImage: undefined } ]);

    expect(room.state._meta.states.b.name).toEqual('Odd');
    expect(Object.keys(room.state._meta.states.b)).not.toContain('0');

    expect(room.state._meta.states.c.name).toEqual('Good');
    expect(room.state._meta.states.c.variants[0].variant).toEqual('Advanced');
  });

  // a client whose optimistic variant rows got ahead of the game sends input for a variant that
  // does not exist - dropping the rest of the edit over that loses everything the user typed
  test('editState ignores input for a variant that does not exist', function() {
    const room = testRoom();
    room.state._meta.states.a = { name: 'Game', variants: [ { variant: '' } ] };

    room.editState({ name: 'player' }, 'a', { name: 'Renamed' }, [ { variant: 'Basic' }, { variant: 'Ghost' } ], []);

    expect(room.state._meta.states.a.name).toEqual('Renamed');
    expect(room.state._meta.states.a.variants).toEqual([ { variant: 'Basic' } ]);
  });
});
