import { ClientFunction } from 'testcafe';

import { getMeta, prepareClient, setName, setRoomState, setupTestEnvironment, waitForStableState } from './test-util.js';

setupTestEnvironment();

// where the widget ended up, which is what move() writes while it is dragged
async function position(before) {
  return JSON.parse(await waitForStableState({ differentFrom: before })).piece;
}

// A drag is measured in screen pixels, the limit in room coordinates, and the
// factor between them depends on the window - so every drag below overshoots
// its limit by far and the expectations only say what the limit itself decides.
async function roomWith(t, dragLimit) {
  const version = (await getMeta()).version;
  await setRoomState({
    _meta: { version },
    piece: { id: 'piece', type: 'basic', x: 100, y: 300, width: 50, height: 50, dragLimit }
  });
  await ClientFunction(prepareClient)();
  // the game list covers the room until a player has joined
  await setName(t);
  return await waitForStableState();
}

test('A dragLimit rectangle stops a drag at its sides', async t => {
  await t.resizeWindow(1280, 800);
  const before = await roomWith(t, { minX: 0, maxX: 200, minY: 0, maxY: 400 });
  await t.drag('#w_piece', 300, 300);
  const dropped = await position(before);
  await t.expect(dropped.x).eql(200);
  await t.expect(dropped.y).eql(400);
});

test('A dragLimit condition bounds a drag to an area no rectangle can describe', async t => {
  await t.resizeWindow(1280, 800);
  // a disc of radius 200 around where the piece sits, and a drag that leaves it:
  // the piece ends up against the edge of the disc - not inside it where the
  // last mouse move before the edge happened to fall - and not outside it
  const before = await roomWith(t, { condition: '(x - 100)^2 + (y - 300)^2 < 200^2' });
  await t.drag('#w_piece', 400, 50);
  const slid = await position(before);
  await t.expect(Math.hypot(slid.x - 100, slid.y - 300)).lte(200);
  await t.expect(Math.hypot(slid.x - 100, slid.y - 300)).gte(195);
  await t.expect(slid.x).gt(100);
});

test('A dragLimit with alignX/alignY limits that point of the widget', async t => {
  await t.resizeWindow(1280, 800);
  // the same rectangle as the first test, but about the middle of the 50 x 50
  // piece - so the corner stops 25 short of each side
  const before = await roomWith(t, { minX: 0, maxX: 200, minY: 0, maxY: 400, alignX: 0.5, alignY: 0.5 });
  await t.drag('#w_piece', 300, 300);
  const dropped = await position(before);
  await t.expect(dropped.x).eql(175);
  await t.expect(dropped.y).eql(375);
});

test('A drag does not jump across a hole in the area', async t => {
  await t.resizeWindow(1280, 800);
  // a ring around (400,300) with the piece on its left edge: the pointer crosses
  // the hole in the middle towards the far side of the ring, and the piece has
  // to stop at the near edge of the hole rather than appear over there
  const before = await roomWith(t, { condition: [ '(x - 400)^2 + (y - 300)^2 < 400^2', '(x - 400)^2 + (y - 300)^2 > 200^2' ] });
  await t.drag('#w_piece', 400, 0);
  const stopped = await position(before);
  await t.expect(stopped.x).lt(400);
  await t.expect(Math.hypot(stopped.x - 400, stopped.y - 300)).gte(199);
});

test('A dragLimit side that reads the position is evaluated where that position is', async t => {
  await t.resizeWindow(1280, 800);
  // "maxX": "y" is a different rectangle at every point - together with the
  // condition the triangle x <= y below y = 400. Reading it once where the
  // pointer is would let the drag end up outside that triangle.
  const before = await roomWith(t, { maxX: 'y', condition: 'y < 400' });
  await t.drag('#w_piece', 400, 400);
  const dropped = await position(before);
  await t.expect(dropped.y).lt(400);
  await t.expect(dropped.x).lte(dropped.y);
});

test('A drag out of a parent starts where the widget is, not where its coordinates read', async t => {
  await t.resizeWindow(1280, 800);
  // Taking a widget out of its parent leaves x and y in that parent's
  // coordinates until the drag writes the first position, so for one move they
  // read as the room's - "5, 5" for a piece sitting in a holder at 700, 300.
  // A drag is walked from where the widget is, so that move used to be walked
  // from the top left corner of this ring and put the piece over there.
  const version = (await getMeta()).version;
  await setRoomState({
    _meta: { version },
    frame: { id: 'frame', type: 'basic', x: 700, y: 300, width: 60, height: 60, movable: false, clickable: false, layer: -3 },
    piece: { id: 'piece', type: 'basic', x: 5, y: 5, width: 50, height: 50, parent: 'frame', dragLimit: {
      minX: 0, maxX: 800, minY: 0, maxY: 600, alignX: 0.5, alignY: 0.5,
      condition: 'x < 200 || x > 600 || y < 200 || y > 400'
    } }
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  const before = await waitForStableState();
  await t.drag('#w_piece', 40, 0);
  const dropped = await position(before);
  // still on the arm of the ring it was dragged on, and moved with the pointer
  await t.expect(dropped.x).gt(700);
  await t.expect(dropped.y).gt(280);
  await t.expect(dropped.y).lt(380);
});

test('A dragLimit side written as an expression is evaluated while dragging', async t => {
  await t.resizeWindow(1280, 800);
  const before = await roomWith(t, { maxX: '${PROPERTY width OF piece} * 4' });
  await t.drag('#w_piece', 400, 100);
  const clamped = await position(before);
  await t.expect(clamped.x).eql(200);
  await t.expect(clamped.y).gt(300);
});
