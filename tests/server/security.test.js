import fs from 'fs';
import crypto from 'crypto';

import Collections from '../../server/collections.mjs';
import Config from '../../server/config.mjs';
import Room from '../../server/room.mjs';
import Player from '../../server/player.mjs';

const savedir = Config.directory('save');

function collectionFilename(collectionID) {
  return savedir + '/collections/' + crypto.createHash('sha256').update(String(collectionID)).digest('hex') + '.json';
}

function fakeConnection() {
  const messages = [];
  return {
    messages,
    addMessageHandler() {},
    addCloseHandler() {},
    removeMessageHandler() {},
    removeCloseHandler() {},
    toClient(func, args) { messages.push({ func, args }); }
  };
}

function testRoom(id) {
  const room = new Room(id, ()=>{}, ()=>{});
  clearTimeout(room.unloadTimeout);
  room.state = { _meta: { version: 1, metaVersion: 1, players: {}, states: {}, starred: {} } };
  return room;
}

beforeAll(() => {
  fs.mkdirSync(savedir + '/collections', { recursive: true });
  fs.mkdirSync(savedir + '/rooms', { recursive: true });
});

describe('Collections', () => {
  const id = 'jest-test-collection';

  afterAll(() => {
    if(fs.existsSync(collectionFilename(id)))
      fs.unlinkSync(collectionFilename(id));
  });

  test('validates collection IDs', () => {
    expect(Collections.isValidID('abcdef')).toBe(true);
    expect(Collections.isValidID('a'.repeat(64))).toBe(true);
    expect(Collections.isValidID('short')).toBe(false);
    expect(Collections.isValidID('a'.repeat(65))).toBe(false);
    expect(Collections.isValidID('invalid chars!')).toBe(false);
    expect(Collections.isValidID(null)).toBe(false);
  });

  test('returns an empty collection for unknown IDs', () => {
    expect(Collections.get(id)).toEqual({ rooms: [] });
  });

  test('adds and removes rooms', () => {
    expect(Collections.addRoom(id, 'room1')).toBe(true);
    expect(Collections.addRoom(id, 'room1')).toBe(true); // idempotent
    expect(Collections.addRoom(id, 'room2')).toBe(true);
    expect(Collections.get(id).rooms).toEqual([ 'room1', 'room2' ]);
    Collections.removeRoom(id, 'room1');
    expect(Collections.get(id).rooms).toEqual([ 'room2' ]);
  });

  test('caps collections at 100 rooms', () => {
    for(let i = Collections.get(id).rooms.length; i < 100; ++i)
      expect(Collections.addRoom(id, `filler${i}`)).toBe(true);
    expect(Collections.addRoom(id, 'oneTooMany')).toBe(false);
    expect(Collections.get(id).rooms.length).toBe(100);
    expect(Collections.addRoom(id, 'room2')).toBe(true); // already contained rooms still return true
  });
});

describe('Room security', () => {
  const roomID = 'jest-test-security-room';
  let room;
  let adminPlayer;

  beforeEach(() => {
    room = testRoom(roomID);
    adminPlayer = { name: 'admin', collection: 'admin-collection', sent: [], send(func, args) { this.sent.push({ func, args }); } };
    room.players.push(adminPlayer);
  });

  afterAll(() => {
    if(fs.existsSync(savedir + '/rooms/' + roomID + '.json'))
      fs.unlinkSync(savedir + '/rooms/' + roomID + '.json');
  });

  test('claiming requires a connected player with that collection', async () => {
    await expect(room.collectionAction('claim', { collection: 'other-collection' })).rejects.toThrow(/player in the room/);
    await room.collectionAction('claim', { collection: 'admin-collection' });
    expect(await room.isAdmin('admin-collection')).toBe(true);
    expect(await room.isAdmin('other-collection')).toBe(false);
    expect(await room.isAdmin(undefined)).toBe(false);
  });

  test('secrets are stored as salted hashes and stripped from public meta', async () => {
    await room.collectionAction('claim', { collection: 'admin-collection' });
    await room.collectionAction('setPassword', { collection: 'admin-collection', password: 'hunter2' });
    const security = room.state._meta.security;
    expect(security.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(security)).not.toContain('admin-collection');
    expect(JSON.stringify(security)).not.toContain('hunter2');
    expect(security.joinPassword).not.toBe(crypto.createHash('sha256').update('hunter2').digest('hex')); // salted
    expect(room.publicMeta(room.state._meta).security).toBeUndefined();
  });

  test('claimed rooms cannot be claimed or managed by another collection', async () => {
    await room.collectionAction('claim', { collection: 'admin-collection' });
    room.players.push({ name: 'evil', collection: 'evil-collection', send() {} });
    await expect(room.collectionAction('claim', { collection: 'evil-collection' })).rejects.toThrow(/already claimed/);
    await expect(room.collectionAction('setName', { collection: 'evil-collection', name: 'Hacked' })).rejects.toThrow(/not the admin/);
    await expect(room.collectionAction('setLocked', { collection: 'evil-collection', locked: true })).rejects.toThrow(/not the admin/);
    await expect(room.collectionAction('delete', { collection: 'evil-collection' })).rejects.toThrow(/not the admin/);
    await expect(room.collectionAction('delete', {})).rejects.toThrow(/not the admin/);
  });

  test('admins can rename, lock and unclaim', async () => {
    await room.collectionAction('claim', { collection: 'admin-collection' });
    await room.collectionAction('setName', { collection: 'admin-collection', name: 'My Room' });
    expect(room.state._meta.roomName).toBe('My Room');
    await room.collectionAction('setLocked', { collection: 'admin-collection', locked: true });
    expect(room.state._meta.locked).toBe(true);
    await room.collectionAction('unclaim', { collection: 'admin-collection' });
    expect(room.state._meta.security).toBeUndefined();
    expect(room.state._meta.locked).toBeUndefined();
  });

  test('mayJoin enforces the join password', async () => {
    expect(await room.mayJoin(undefined, undefined)).toBe(true); // no password set
    await room.collectionAction('claim', { collection: 'admin-collection' });
    await room.collectionAction('setPassword', { collection: 'admin-collection', password: 'hunter2' });
    expect(await room.mayJoin(undefined, undefined)).toBe(false);
    expect(await room.mayJoin(undefined, 'wrong')).toBe(false);
    expect(await room.mayJoin(undefined, 'hunter2')).toBe(true);
    expect(await room.mayJoin('admin-collection', undefined)).toBe(true); // admins bypass the password
    await room.collectionAction('setPassword', { collection: 'admin-collection', password: '' });
    expect(await room.mayJoin(undefined, undefined)).toBe(true);
  });
});

describe('Locked room enforcement', () => {
  const roomID = 'jest-test-locked-room';
  let room;

  beforeEach(async () => {
    room = testRoom(roomID);
    room.state._meta.security = { salt: 'abc' };
    room.state._meta.security.adminCollection = await room.hashSecret('admin-collection');
    room.state._meta.locked = true;
  });

  afterAll(() => {
    if(fs.existsSync(savedir + '/rooms/' + roomID + '.json'))
      fs.unlinkSync(savedir + '/rooms/' + roomID + '.json');
  });

  test('state-changing messages from non-admins are rejected', async () => {
    const connection = fakeConnection();
    const player = new Player(connection, 'guest', room, 'other-collection');
    for(const func of [ 'loadState', 'editState', 'removeState', 'saveState', 'setGameSettings', 'setRedirect', 'toggleStateStar', 'unlinkState' ]) {
      connection.messages.length = 0;
      await player.messageReceived(func, {});
      expect(connection.messages).toEqual([ { func: 'error', args: 'This room is locked. Only the room admin can do this.' } ]);
    }
  });

  test('deltas (playing) still work for non-admins', async () => {
    const connection = fakeConnection();
    const player = new Player(connection, 'guest', room, 'other-collection');
    room.players.push(player);
    await player.messageReceived('delta', { s: {}, id: 0 });
    expect(connection.messages.filter(m=>m.func == 'error')).toEqual([]);
  });

  test('admins are not blocked by the lock', async () => {
    const connection = fakeConnection();
    const player = new Player(connection, 'admin', room, 'admin-collection');
    await player.messageReceived('unknownTestFunc', {}); // passes the lock gate without side effects
    expect(connection.messages).toEqual([]);
  });
});
