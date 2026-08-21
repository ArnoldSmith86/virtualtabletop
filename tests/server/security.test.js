import fs from 'fs';
import crypto from 'crypto';

import Collections from '../../server/collections.mjs';
import Config from '../../server/config.mjs';
import PublicRooms from '../../server/publicrooms.mjs';
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

  test('concurrent claims from two different collections cannot both succeed', async () => {
    room.players.push({ name: 'rival', collection: 'rival-collection', send() {} });
    const [ first, second ] = await Promise.allSettled([
      room.collectionAction('claim', { collection: 'admin-collection' }),
      room.collectionAction('claim', { collection: 'rival-collection' })
    ]);
    const outcomes = [ first.status, second.status ];
    expect(outcomes.filter(s => s == 'fulfilled').length).toBe(1); // exactly one claim wins
    expect(outcomes.filter(s => s == 'rejected').length).toBe(1);
    const winner = first.status == 'fulfilled' ? 'admin-collection' : 'rival-collection';
    expect(await room.isAdmin(winner)).toBe(true);
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

  test('only the admin can protect the content of a room, and releasing the claim releases it', async () => {
    expect(room.contentIsProtected()).toBe(false);
    await expect(room.collectionAction('setContentProtected', { collection: 'admin-collection', contentProtected: true })).rejects.toThrow(/not the admin/);

    await room.collectionAction('claim', { collection: 'admin-collection' });
    await room.collectionAction('setContentProtected', { collection: 'admin-collection', contentProtected: true });
    expect(room.contentIsProtected()).toBe(true);
    expect((await room.getRoomDetails('admin-collection')).contentProtected).toBe(true);

    room.players.push({ name: 'evil', collection: 'evil-collection', send() {} });
    await expect(room.collectionAction('setContentProtected', { collection: 'evil-collection', contentProtected: false })).rejects.toThrow(/not the admin/);
    expect(room.contentIsProtected()).toBe(true);

    await room.collectionAction('unclaim', { collection: 'admin-collection' });
    expect(room.contentIsProtected()).toBe(false);
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

describe('Copying and linking rooms', () => {
  const roomIDs = [ 'jest-test-copy-source', 'jest-test-copy-target' ];

  afterEach(() => {
    for(const id of roomIDs)
      if(fs.existsSync(savedir + '/rooms/' + id + '.json'))
        fs.unlinkSync(savedir + '/rooms/' + id + '.json');
  });

  function sourceAndTarget() {
    return roomIDs.map(testRoom);
  }

  test('a copy is named as requested and carries none of the source room ownership', async () => {
    const [ source, target ] = sourceAndTarget();
    source.state._meta.roomName = 'Original';
    source.state._meta.contentProtected = true;
    source.state._meta.locked = true;
    source.state._meta.security = { salt: 'abc', adminCollection: 'hash' };

    await target.copyFromRoom(source, 'The Copy');
    expect(target.state._meta.roomName).toBe('The Copy');
    expect(target.state._meta.contentProtected).toBeUndefined();
    expect(target.state._meta.locked).toBeUndefined();
    expect(target.state._meta.security).toBeUndefined();
  });

  test('an empty name leaves the new room showing its ID instead of "(copy)"', async () => {
    const [ source, target ] = sourceAndTarget();
    source.state._meta.roomName = 'Original';
    await target.copyFromRoom(source, '   ');
    expect(target.state._meta.roomName).toBeUndefined();
    expect((await target.getRoomDetails()).name).toBe(target.id);
  });

  test('without a name a copy keeps falling back to "<source> (copy)"', async () => {
    const [ source, target ] = sourceAndTarget();
    source.state._meta.roomName = 'Original';
    await target.copyFromRoom(source);
    expect(target.state._meta.roomName).toBe('Original (copy)');
  });

  test('a game added to the source room reaches a linked room that is already open', async () => {
    const [ source, target ] = sourceAndTarget();
    await target.linkFromRoom(source, true, 'Linked');
    expect(target.state._meta.roomName).toBe('Linked');
    expect(target.state._meta.linkSourceRoom).toBe(source.id);

    // the actual linking fetches the game over HTTP, so only the hand-over is checked here
    const handedOver = [];
    target.linkStatesFromRoomState = async (sourceState, sourceRoomID)=>{
      handedOver.push({ states: Object.keys(sourceState._meta.states), sourceRoomID });
      return false;
    };

    source.state._meta.states.newGame = { name: 'New Game', variants: [] };
    await source.pushToAutoLinkedRooms();
    // the live state of the source room, not the copy of it that is on disk
    expect(handedOver).toEqual([ { states: [ 'newGame' ], sourceRoomID: source.id } ]);
  });

  test('a room that does not auto-link is left alone when its source gains a game', async () => {
    const [ source, target ] = sourceAndTarget();
    await target.linkFromRoom(source, false);
    expect(target.state._meta.linkSourceRoom).toBeUndefined();

    let calls = 0;
    target.linkStatesFromRoomState = async ()=>(++calls, false);
    await source.pushToAutoLinkedRooms();
    expect(calls).toBe(0);
  });
});

describe('Public rooms', () => {
  const roomID = 'jest-test-public-room';
  let room;

  beforeEach(() => {
    room = testRoom(roomID);
    room.players.push({ name: 'admin', collection: 'admin-collection', send() {} });
  });

  afterEach(() => {
    PublicRooms.remove(roomID);
  });

  afterAll(() => {
    if(fs.existsSync(savedir + '/rooms/' + roomID + '.json'))
      fs.unlinkSync(savedir + '/rooms/' + roomID + '.json');
  });

  test('registry adds and removes rooms', () => {
    expect(PublicRooms.get()).not.toContain(roomID);
    expect(PublicRooms.add(roomID)).toBe(true);
    expect(PublicRooms.add(roomID)).toBe(true); // idempotent
    expect(PublicRooms.get()).toContain(roomID);
    PublicRooms.remove(roomID);
    expect(PublicRooms.get()).not.toContain(roomID);
  });

  test('only admins can publish a room', async () => {
    await expect(room.collectionAction('setPublic', { collection: 'other-collection', public: true, description: 'x' })).rejects.toThrow(/not the admin/);
    expect(room.isPublic()).toBe(false);
    await room.collectionAction('claim', { collection: 'admin-collection' });
    await room.collectionAction('setPublic', { collection: 'admin-collection', public: true, description: '  Come play with us!  ' });
    expect(room.isPublic()).toBe(true);
    expect(room.state._meta.public.description).toBe('Come play with us!');
    expect(PublicRooms.get()).toContain(roomID);
    expect((await room.getRoomDetails('admin-collection')).isPublic).toBe(true);
    expect((await room.getRoomDetails('admin-collection')).description).toBe('Come play with us!');
  });

  test('descriptions are capped at 500 characters', async () => {
    await room.collectionAction('claim', { collection: 'admin-collection' });
    await room.collectionAction('setPublic', { collection: 'admin-collection', public: true, description: 'x'.repeat(600) });
    expect(room.state._meta.public.description.length).toBe(500);
  });

  test('publishing requires a description', async () => {
    await room.collectionAction('claim', { collection: 'admin-collection' });
    await expect(room.collectionAction('setPublic', { collection: 'admin-collection', public: true, description: '   ' })).rejects.toThrow(/description/);
    expect(room.isPublic()).toBe(false);
    expect(PublicRooms.get()).not.toContain(roomID);
  });

  test('unpublishing and unclaiming remove the room from the public list', async () => {
    await room.collectionAction('claim', { collection: 'admin-collection' });
    await room.collectionAction('setPublic', { collection: 'admin-collection', public: true, description: 'x' });
    await room.collectionAction('setPublic', { collection: 'admin-collection', public: false });
    expect(room.isPublic()).toBe(false);
    expect(room.state._meta.public).toBeUndefined();
    expect(PublicRooms.get()).not.toContain(roomID);

    await room.collectionAction('setPublic', { collection: 'admin-collection', public: true, description: 'x' });
    await room.collectionAction('unclaim', { collection: 'admin-collection' });
    expect(room.isPublic()).toBe(false);
    expect(room.state._meta.public).toBeUndefined();
    expect(PublicRooms.get()).not.toContain(roomID);
  });

  test('deleting a room removes it from the public list', async () => {
    await room.collectionAction('claim', { collection: 'admin-collection' });
    await room.collectionAction('setPublic', { collection: 'admin-collection', public: true, description: 'x' });
    await room.collectionAction('delete', { collection: 'admin-collection' });
    expect(room.isPublic()).toBe(false);
    expect(PublicRooms.get()).not.toContain(roomID);
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
