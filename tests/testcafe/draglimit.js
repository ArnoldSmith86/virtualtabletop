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

test('A dragLimit side written as an expression is evaluated while dragging', async t => {
  await t.resizeWindow(1280, 800);
  const before = await roomWith(t, { maxX: '${PROPERTY width OF piece} * 4' });
  await t.drag('#w_piece', 400, 100);
  const clamped = await position(before);
  await t.expect(clamped.x).eql(200);
  await t.expect(clamped.y).gt(300);
});
