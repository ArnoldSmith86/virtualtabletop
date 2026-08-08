import { widgets } from '../../client/js/serverstate.js';

import { createWidget, removeWidget } from './client-util.js';

// A grid entry can be limited to the area a condition describes, next to the
// rectangle minX/maxX/minY/maxY bounds it to. gridConditionsHold() is the
// question snapToGrid() asks of every entry before it is tried at all, and the
// question the editor's outline asks of every position it samples.
afterEach(() => {
  for(const id of [ ...widgets.keys() ])
    removeWidget(id);
});

function widgetWithGrid(grid, position = {}) {
  return createWidget(Object.assign({ id: 'w', type: 'basic', x: 0, y: 0, width: 50, height: 50, grid }, position));
}

async function snappedTo(grid, x, y) {
  const w = widgetWithGrid(grid, { x, y });
  await w.snapToGrid();
  return { x: w.get('x'), y: w.get('y') };
}

describe('a condition on a snap grid', () => {
  test('applies the grid where it holds and leaves the widget alone where it does not', async () => {
    const grid = [ { x: 100, y: 100, condition: 'x < 500' } ];
    expect(await snappedTo(grid, 130, 130)).toEqual({ x: 100, y: 100 });
    // outside the area this grid is not one of the grids tried, so nothing
    // moves the widget at all
    expect(await snappedTo(grid, 630, 130)).toEqual({ x: 630, y: 130 });
  });

  test('hands the position over to whichever other grid does cover it', async () => {
    const grid = [
      { x: 100, y: 100, condition: 'x < 500' },
      { x: 250, y: 250, condition: 'x >= 500' }
    ];
    expect(await snappedTo(grid, 130, 130)).toEqual({ x: 100, y: 100 });
    expect(await snappedTo(grid, 630, 130)).toEqual({ x: 750, y: 250 });
  });

  test('describes an area that is not a rectangle', async () => {
    // a disc of radius 200 around 400,400 - the middle of the widget box is
    // what alignX/alignY put on the lattice, x and y stay its corner
    const grid = [ { x: 100, y: 100, condition: '(x - 400)^2 + (y - 400)^2 < 200^2' } ];
    expect(await snappedTo(grid, 430, 430)).toEqual({ x: 400, y: 400 });
    expect(await snappedTo(grid, 30, 430)).toEqual({ x: 30, y: 430 });
  });

  test('is checked next to the rectangle rather than instead of it', async () => {
    const grid = [ { x: 100, y: 100, minX: 300, maxX: 900, condition: 'y > 300' } ];
    expect(await snappedTo(grid, 430, 430)).toEqual({ x: 400, y: 400 });
    // inside the rectangle, but the condition says no
    expect(await snappedTo(grid, 430, 130)).toEqual({ x: 430, y: 130 });
    // the condition holds, but the rectangle says no
    expect(await snappedTo(grid, 130, 430)).toEqual({ x: 130, y: 430 });
  });

  test('takes a list of conditions, all of which have to hold', async () => {
    const grid = [ { x: 100, y: 100, condition: [ 'x > 200', 'y > x' ] } ];
    expect(await snappedTo(grid, 430, 630)).toEqual({ x: 400, y: 600 });
    expect(await snappedTo(grid, 130, 630)).toEqual({ x: 130, y: 630 });
    expect(await snappedTo(grid, 630, 430)).toEqual({ x: 630, y: 430 });
  });

  test('reads the state, so the area can follow the game', async () => {
    createWidget({ id: 'board', type: 'basic', width: 400 });
    const grid = [ { x: 100, y: 100, condition: 'x < ${PROPERTY width OF board}' } ];
    expect(await snappedTo(grid, 330, 130)).toEqual({ x: 300, y: 100 });

    widgets.get('board').state.width = 200;
    expect(await snappedTo(grid, 330, 130)).toEqual({ x: 330, y: 130 });
  });

  test('is not copied onto the widget when it snaps there', async () => {
    const w = widgetWithGrid([ { x: 100, y: 100, condition: 'x < 500', rotation: 45 } ], { x: 130, y: 130 });
    await w.snapToGrid();
    expect(w.get('rotation')).toBe(45);
    // everything an entry holds beyond its geometry is a property to set when
    // something snaps there - the condition is geometry, so it stays unset
    // (null being what an unset property reads as)
    expect(w.get('condition')).toBe(null);
  });

  test('keeps the grid working when it cannot be read at all', async () => {
    // a typo or a widget that is gone would otherwise stop a game snapping
    // without anything saying so
    expect(await snappedTo([ { x: 100, y: 100, condition: 'x <<< 500' } ], 130, 130)).toEqual({ x: 100, y: 100 });
    expect(await snappedTo([ { x: 100, y: 100, condition: 'x < ${PROPERTY width OF gone}' } ], 130, 130)).toEqual({ x: 100, y: 100 });
  });

  test('answers on its own what snapToGrid asks it', () => {
    const w = widgetWithGrid([]);
    expect(w.gridConditionsHold({ x: 100, y: 100 }, { x: 10, y: 10 })).toBe(true);
    expect(w.gridConditionsHold({ x: 100, y: 100, condition: null }, { x: 10, y: 10 })).toBe(true);
    expect(w.gridConditionsHold({ x: 100, y: 100, condition: 'x > y' }, { x: 20, y: 10 })).toBe(true);
    expect(w.gridConditionsHold({ x: 100, y: 100, condition: 'x > y' }, { x: 10, y: 20 })).toBe(false);
  });
});
