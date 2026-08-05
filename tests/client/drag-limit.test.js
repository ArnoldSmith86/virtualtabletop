import { widgets } from '../../client/js/serverstate.js';

import { createWidget, removeWidget } from './client-util.js';

// dragLimitedCoord() is what move() puts every dragged position through, so it
// is exercised here directly: the rest of move() is DOM geometry that TestCafe
// covers, this is the rule about where a drag may end up.
afterEach(() => {
  for(const id of [ ...widgets.keys() ])
    removeWidget(id);
});

function widgetAt(x, y, dragLimit) {
  return createWidget({ id: 'w', type: 'basic', x, y, width: 50, height: 50, dragLimit });
}

describe('the dragLimit rectangle', () => {
  test('still keeps the corner inside plain numbers', () => {
    const w = widgetAt(0, 0, { minX: 10, maxX: 100, minY: 20, maxY: 200 });
    expect(w.dragLimitedCoord({ x: 5, y: 5 })).toMatchObject({ x: 10, y: 20 });
    expect(w.dragLimitedCoord({ x: 500, y: 500 })).toMatchObject({ x: 100, y: 200 });
    expect(w.dragLimitedCoord({ x: 50, y: 50 })).toMatchObject({ x: 50, y: 50 });
  });

  test('leaves a widget without a limit alone, whatever the property holds', () => {
    expect(widgetAt(0, 0, {}).dragLimitedCoord({ x: 5, y: 7 })).toMatchObject({ x: 5, y: 7 });
    expect(widgetAt(0, 0, 'nonsense').dragLimitedCoord({ x: 5, y: 7 })).toMatchObject({ x: 5, y: 7 });
    expect(widgetAt(0, 0, null).dragLimitedCoord({ x: 5, y: 7 })).toMatchObject({ x: 5, y: 7 });
  });

  test('takes an expression for a side, so the rectangle can follow the state', () => {
    createWidget({ id: 'board', type: 'basic', width: 400 });
    const w = widgetAt(0, 0, { minX: 0, maxX: '${PROPERTY width OF board} - ${PROPERTY width}' });
    expect(w.dragLimitedCoord({ x: 500, y: 5 })).toMatchObject({ x: 350, y: 5 });

    widgets.get('board').state.width = 200;
    expect(w.dragLimitedCoord({ x: 500, y: 5 })).toMatchObject({ x: 150, y: 5 });
  });

  test('ignores a side that cannot be read rather than clamping to nothing', () => {
    const w = widgetAt(0, 0, { minX: 10, maxX: '${PROPERTY nope OF gone}' });
    expect(w.dragLimitedCoord({ x: 5000, y: 5 })).toMatchObject({ x: 5000, y: 5 });
  });
});

describe('a dragLimit condition', () => {
  test('keeps the corner where the inequality holds', () => {
    const w = widgetAt(0, 200, { condition: 'y > x' });
    expect(w.dragLimitedCoord({ x: 100, y: 300 })).toMatchObject({ x: 100, y: 300 });
    // below the diagonal: x alone is refused, so it slides along it on y
    expect(w.dragLimitedCoord({ x: 100, y: 50 })).toMatchObject({ x: 0, y: 50 });
  });

  test('slides along the edge instead of sticking to it', () => {
    const w = widgetAt(10, 100, { condition: 'x < 200' });
    // the x is refused and the y is not, so the widget keeps moving downwards
    expect(w.dragLimitedCoord({ x: 300, y: 400 })).toMatchObject({ x: 10, y: 400 });
  });

  test('takes a list, all of which have to hold', () => {
    const w = widgetAt(100, 100, { condition: [ 'x > 50', 'y > 50' ] });
    expect(w.dragLimitedCoord({ x: 80, y: 80 })).toMatchObject({ x: 80, y: 80 });
    expect(w.dragLimitedCoord({ x: 10, y: 10 })).toMatchObject({ x: 100, y: 100 });
  });

  test('bounds an area a rectangle cannot describe', () => {
    // a disc of radius 100 around (200,200)
    const w = widgetAt(200, 200, { condition: '(x - 200)^2 + (y - 200)^2 < 100^2' });
    expect(w.dragLimitedCoord({ x: 250, y: 250 })).toMatchObject({ x: 250, y: 250 });
    expect(w.dragLimitedCoord({ x: 400, y: 400 })).toMatchObject({ x: 200, y: 200 });
    // 2x^2+y>4 and 2y+10>5x, the two the property was asked for
    const parabola = widgetAt(0, 10, { condition: [ '2x^2+y>4', '2y+10>5x' ] });
    expect(parabola.dragLimitedCoord({ x: 5, y: 20 })).toMatchObject({ x: 5, y: 20 });
    // under the parabola: (1,1) is refused, and so is giving up the x movement
    // (2*0^2+1 is not > 4), so the drag keeps the x and stays on the old y
    expect(parabola.dragLimitedCoord({ x: 1, y: 1 })).toMatchObject({ x: 1, y: 10 });
    // and the half-plane bounds it on the other side
    expect(parabola.dragLimitedCoord({ x: 20, y: 20 })).toMatchObject({ x: 0, y: 20 });
  });

  test('reads the widget and other widgets, not just x and y', () => {
    createWidget({ id: 'board', type: 'basic', size: 300 });
    const w = widgetAt(0, 0, { condition: 'x + width < ${PROPERTY size OF board}' });
    expect(w.dragLimitedCoord({ x: 200, y: 5 })).toMatchObject({ x: 200, y: 5 });
    expect(w.dragLimitedCoord({ x: 280, y: 5 })).toMatchObject({ x: 0, y: 5 });
  });

  test('does not hold a widget that starts outside its area in place', () => {
    const w = widgetAt(500, 500, { condition: 'x < 100' });
    expect(w.dragLimitedCoord({ x: 400, y: 400 })).toMatchObject({ x: 400, y: 400 });
    // and takes hold again as soon as it is inside
    w.state.x = 50;
    w.state.y = 50;
    expect(w.dragLimitedCoord({ x: 400, y: 60 })).toMatchObject({ x: 50, y: 60 });
  });

  test('is ignored while it cannot be read', () => {
    const w = widgetAt(0, 0, { condition: 'x <<< 100' });
    expect(w.dragLimitedCoord({ x: 900, y: 900 })).toMatchObject({ x: 900, y: 900 });
  });

  test('applies after the rectangle, so both bound the same drag', () => {
    const w = widgetAt(0, 0, { maxX: 300, condition: 'y > x' });
    expect(w.dragLimitedCoord({ x: 900, y: 400 })).toMatchObject({ x: 300, y: 400 });
    expect(w.dragLimitedCoord({ x: 900, y: 100 })).toMatchObject({ x: 0, y: 100 });
  });

  test('never falls back outside the rectangle, wherever the widget sits', () => {
    // a routine put the widget at 900 - outside its own maxX, which no drag may
    // hand back even though the condition is what refuses the drop
    const w = widgetAt(900, 100, { maxX: 300, condition: 'x > 500' });
    expect(w.dragLimitedCoord({ x: 400, y: 100 }).x).toBeLessThanOrEqual(300);
  });

  test('reads a missing condition as no condition', () => {
    const w = widgetAt(0, 0, { maxX: 300, condition: null });
    expect(w.dragLimitedCoord({ x: 900, y: 900 })).toMatchObject({ x: 300, y: 900 });
  });

  test('lets a condition guard against the widget it reads being gone', () => {
    // && stops at the left side, so the missing widget is never read
    const w = widgetAt(0, 0, { condition: '${PROPERTY size OF gone} > 0 && x < 100' });
    expect(w.dragLimitedCoord({ x: 900, y: 900 })).toMatchObject({ x: 900, y: 900 });
    createWidget({ id: 'gone', type: 'basic', size: 300 });
    expect(w.dragLimitedCoord({ x: 900, y: 900 })).toMatchObject({ x: 0, y: 900 });
  });
});

// what the editor's "Show on board" preview asks of every point it samples -
// not where a refused drag ends up, only whether the point is in the area
describe('dragLimitAllows', () => {
  test('answers for the rectangle and the conditions together', () => {
    const w = widgetAt(0, 0, { minX: 10, maxX: 100, condition: 'y > x' });
    expect(w.dragLimitAllows({ x: 50, y: 60 })).toBe(true);
    expect(w.dragLimitAllows({ x: 5, y: 60 })).toBe(false);   // left of minX
    expect(w.dragLimitAllows({ x: 200, y: 300 })).toBe(false); // right of maxX
    expect(w.dragLimitAllows({ x: 50, y: 40 })).toBe(false);   // above the diagonal
  });

  test('says yes everywhere when there is no limit', () => {
    expect(widgetAt(0, 0, {}).dragLimitAllows({ x: 9999, y: 9999 })).toBe(true);
    expect(widgetAt(0, 0, 'nonsense').dragLimitAllows({ x: 9999, y: 9999 })).toBe(true);
  });

  test('takes the rules it is given, so a drawing reads the sides once', () => {
    const w = widgetAt(0, 0, { maxX: 100 });
    const rules = w.dragLimitRules({ x: 0, y: 0 });
    expect(w.dragLimitAllows({ x: 50, y: 0 }, rules)).toBe(true);
    expect(w.dragLimitAllows({ x: 150, y: 0 }, rules)).toBe(false);
  });
});
