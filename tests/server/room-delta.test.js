import Room from '../../server/room.mjs';

const player = { name: 'room-delta-test-player', send: () => {} };

function createRoom(widgets) {
  const room = Object.create(Room.prototype);
  room.id = 'room-delta-test';
  room.state = Object.assign({ _meta: { players: {}, deltaID: 0 } }, widgets);
  room.deltaID = 0;
  room.broadcastedDeltas = [];
  room.broadcast = (func, args) => room.broadcastedDeltas.push({ func, args });
  room.sendMetaUpdate = () => {};
  return room;
}

// the server logs ignored delta data - keep that out of the test output
const originalLog = console.log;
beforeEach(() => {
  console.log = () => {};
});
afterEach(() => {
  console.log = originalLog;
});

describe("Scenarios: Applying a delta to the room state", () => {
  describe("Given a widget the room has", () => {
    test("Then a delta changing one of its properties is applied and broadcast", () => {
      const room = createRoom({ orig: { id: 'orig', type: 'widget', dropShadowWidget: 'shadow' } });
      room.receiveDelta(player, { s: { orig: { dropShadowWidget: null } } });
      expect(room.state.orig).toEqual({ id: 'orig', type: 'widget' });
      expect(room.broadcastedDeltas[0].args.s).toEqual({ orig: { dropShadowWidget: null } });
    });
  });

  describe("Given a widget the room does not have", () => {
    test("Then a delta creating it adds it to the state", () => {
      const room = createRoom({});
      room.receiveDelta(player, { s: { orig: { id: 'orig', type: 'widget' } } });
      expect(room.state.orig).toEqual({ id: 'orig', type: 'widget' });
    });

    // adding it would create a widget without id and type which crashes every client that receives it
    test("Then a delta changing one of its properties neither adds it nor gets broadcast", () => {
      const room = createRoom({});
      room.receiveDelta(player, { s: { orig: { dropShadowWidget: null } } });
      expect(room.state.orig).toBeUndefined();
      expect(room.broadcastedDeltas[0].args.s).toEqual({});
    });
  });
});

describe("Scenarios: Cleaning up drop shadows after a delta conflict", () => {
  describe("Given a drop shadow whose original widget still exists", () => {
    test("Then the cleanup removes the shadow and unsets dropShadowWidget on the original", () => {
      const room = createRoom({
        orig: { id: 'orig', type: 'widget', dropShadowWidget: 'shadow' },
        shadow: { id: 'shadow', type: 'widget', clonedFrom: 'orig', dropShadowOwner: player.name }
      });
      room.receiveInvalidDelta(player, { s: {} }, 'orig', 'x');
      expect(room.state.shadow).toBeUndefined();
      expect(room.state.orig).toEqual({ id: 'orig', type: 'widget' });
    });
  });

  describe("Given a drop shadow whose original widget was deleted", () => {
    test("Then the cleanup does not bring the original back", () => {
      const room = createRoom({
        shadow: { id: 'shadow', type: 'widget', clonedFrom: 'orig', dropShadowOwner: player.name }
      });
      room.receiveInvalidDelta(player, { s: {} }, 'orig', 'x');
      expect(room.state.shadow).toBeUndefined();
      expect(room.state.orig).toBeUndefined();
    });
  });
});
