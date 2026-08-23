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

  test('reads a side that depends on the position at the position it bounds', () => {
    // "maxX": "y" is a different rectangle at every point - together with the
    // condition, the triangle x <= y below y = 400. Reading it once where the
    // pointer is would let the drag end up outside that triangle, i.e. exactly
    // where the editor's drawing says a drag may not end.
    const w = widgetAt(0, 100, { maxX: 'y', condition: 'y < 400' });
    expect(w.dragLimitAllows({ x: 450, y: 380 })).toBe(false);
    const to = w.dragLimitedCoord({ x: 500, y: 500 });
    expect(w.dragLimitAllows(to)).toBe(true);
    expect(to.x).toBeLessThanOrEqual(to.y);
    expect(to.y).toBeLessThan(400);
  });

  test('says whether its sides have to be read again at every position', () => {
    // what both the drag and the editor's drawing ask before reading the four
    // sides once for thousands of positions
    const rules = dragLimit=>widgetAt(0, 0, dragLimit).dragLimitRules({ x: 0, y: 0 });
    expect(rules({ maxX: 100 }).varies).toBe(false);
    expect(rules({ maxX: '${PROPERTY width OF board} - 10' }).varies).toBe(false);
    // the same number at both ends of a 1600 wide parent and a different one in
    // between, so sampling two points could never answer this
    expect(rules({ maxX: '(x - 800)^2' }).varies).toBe(true);
    expect(rules({ minY: 'y / 2' }).varies).toBe(true);
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
    // below the diagonal: the drag is carried up to it and then along it
    expect(w.dragLimitedCoord({ x: 100, y: 50 })).toMatchObject({ x: 74, y: 75 });
  });

  test('slides along the edge instead of sticking to it', () => {
    const w = widgetAt(10, 100, { condition: 'x < 200' });
    // the x stops at the edge and the y is free, so the widget keeps moving down
    expect(w.dragLimitedCoord({ x: 300, y: 400 })).toMatchObject({ x: 199, y: 400 });
  });

  test('takes a list, all of which have to hold', () => {
    const w = widgetAt(100, 100, { condition: [ 'x > 50', 'y > 50' ] });
    expect(w.dragLimitedCoord({ x: 80, y: 80 })).toMatchObject({ x: 80, y: 80 });
    expect(w.dragLimitedCoord({ x: 10, y: 10 })).toMatchObject({ x: 51, y: 51 });
  });

  test('bounds an area a rectangle cannot describe', () => {
    // a disc of radius 100 around (200,200)
    const w = widgetAt(200, 200, { condition: '(x - 200)^2 + (y - 200)^2 < 100^2' });
    expect(w.dragLimitedCoord({ x: 250, y: 250 })).toMatchObject({ x: 250, y: 250 });
    // straight out of the disc: it comes to rest on the circle, not at the centre
    expect(w.dragLimitedCoord({ x: 400, y: 400 })).toMatchObject({ x: 270, y: 271 });
    // 2x^2+y>4 and 2y+10>5x, the two the property was asked for
    const parabola = widgetAt(0, 10, { condition: [ '2x^2+y>4', '2y+10>5x' ] });
    expect(parabola.dragLimitedCoord({ x: 5, y: 20 })).toMatchObject({ x: 5, y: 20 });
    // under the parabola: the x is reached and the y stops on the curve
    expect(parabola.dragLimitedCoord({ x: 1, y: 1 })).toMatchObject({ x: 2, y: 1 });
    // and the half-plane bounds it on the other side
    expect(parabola.dragLimitedCoord({ x: 20, y: 20 })).toMatchObject({ x: 11, y: 23 });
  });

  test('reads the widget and other widgets, not just x and y', () => {
    createWidget({ id: 'board', type: 'basic', size: 300 });
    const w = widgetAt(0, 0, { condition: 'x + ${PROPERTY width} < ${PROPERTY size OF board}' });
    expect(w.dragLimitedCoord({ x: 200, y: 5 })).toMatchObject({ x: 200, y: 5 });
    expect(w.dragLimitedCoord({ x: 280, y: 5 })).toMatchObject({ x: 249, y: 5 });
  });

  test('reads a property only where it is written as one', () => {
    // a bare word is a name of the limit itself (x and y) and nothing else, the
    // same way a routine only reads a property through ${PROPERTY ...}; "width"
    // therefore reads as nothing at all, which limits nothing
    const w = widgetAt(0, 0, { condition: 'x + width < 300' });
    expect(w.dragLimitedCoord({ x: 900, y: 5 })).toMatchObject({ x: 900, y: 5 });
    // and ${PROPERTY x} is this widget's x property rather than the position
    // being tested, so it is the same number wherever the drag goes
    const own = widgetAt(40, 0, { condition: '${PROPERTY x} < 100' });
    expect(own.dragLimitedCoord({ x: 900, y: 5 })).toMatchObject({ x: 900, y: 5 });
  });

  test('does not hold a widget that starts outside its area in place', () => {
    const w = widgetAt(500, 500, { condition: 'x < 100' });
    expect(w.dragLimitedCoord({ x: 400, y: 400 })).toMatchObject({ x: 400, y: 400 });
    // and takes hold again as soon as it is inside
    w.state.x = 50;
    w.state.y = 50;
    expect(w.dragLimitedCoord({ x: 400, y: 60 })).toMatchObject({ x: 99, y: 60 });
  });

  test('lets a widget sitting exactly on the edge move along it', () => {
    // 0 > 0 is false, so the widget is not inside its own area - letting it go
    // free there would be a limit that stops applying at its own boundary
    const w = widgetAt(0, 0, { condition: 'y > x' });
    expect(w.dragLimitedCoord({ x: 5, y: 300 })).toMatchObject({ x: 5, y: 300 });
    expect(w.dragLimitedCoord({ x: 300, y: 5 })).toMatchObject({ x: 152, y: 153 });
  });

  test('lets a widget on an axis parallel edge move along it too', () => {
    // 200 < 200 is false, so this widget is on the edge of its area rather than
    // inside it - and no position that keeps one of its coordinates is inside
    // it either, which used to make the limit stop applying here
    const w = widgetAt(200, 100, { condition: 'x < 200' });
    const to = w.dragLimitedCoord({ x: 300, y: 400 });
    expect(to.x).toBeLessThan(200);
    expect(to.y).toBe(400);
  });

  test('does not pull a widget outside the area back to it', () => {
    // both where the widget is and where the drag wants to go are outside the
    // disc, and so is every position around the widget: mixing one coordinate
    // of each gives (0,0), the centre, which says nothing about either
    const w = widgetAt(500, 0, { condition: 'x^2 + y^2 < 100^2' });
    expect(w.dragLimitedCoord({ x: 0, y: 500 })).toMatchObject({ x: 0, y: 500 });
  });

  test('is ignored while it cannot be read', () => {
    const w = widgetAt(0, 0, { condition: 'x <<< 100' });
    expect(w.dragLimitedCoord({ x: 900, y: 900 })).toMatchObject({ x: 900, y: 900 });
  });

  test('applies after the rectangle, so both bound the same drag', () => {
    const w = widgetAt(0, 0, { maxX: 300, condition: 'y > x' });
    expect(w.dragLimitedCoord({ x: 900, y: 400 })).toMatchObject({ x: 300, y: 400 });
    expect(w.dragLimitedCoord({ x: 900, y: 100 })).toMatchObject({ x: 200, y: 201 });
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
    expect(w.dragLimitedCoord({ x: 900, y: 900 })).toMatchObject({ x: 99, y: 900 });
  });
});

// What a drag against the edge of an area has to feel like: the widget ends up
// on the edge whatever the mouse did in between, and a slope carries it along
// instead of stopping it - the two things that made it look like the area was
// smaller than it is and that it moved in steps.
describe('a drag along the edge of an area', () => {
  test('reaches the edge however far the pointer jumps past it', () => {
    // a pointer one pixel outside the circle and one five hundred pixels
    // outside both leave the widget on the circle: a fast mouse, which reports
    // one long move rather than fifty short ones, must not stop it short
    for(const overshoot of [ 1, 5, 50, 500 ]) {
      const w = widgetAt(0, 0, { condition: 'x*x + y*y < 100^2' });
      const to = w.dragLimitedCoord({ x: 60 + overshoot, y: 80 });
      expect(Math.hypot(to.x, to.y)).toBeGreaterThan(99);
      expect(Math.hypot(to.x, to.y)).toBeLessThan(100);
    }
  });

  test('follows an inclined edge rather than stepping down it', () => {
    // a drag straight along a 45 degree edge, one mouse move after the other:
    // every one of them moves the widget on both axes, no staircase
    const w = widgetAt(0, 10, { condition: 'y > x' });
    for(let step = 1; step <= 5; ++step) {
      const before = { x: w.get('x'), y: w.get('y') };
      const to = w.dragLimitedCoord({ x: before.x + 40, y: before.y + 20 });
      expect(to.x).toBeGreaterThan(before.x);
      expect(to.y).toBeGreaterThan(before.y);
      expect(to.y - to.x).toBeLessThanOrEqual(11);
      w.state.x = to.x;
      w.state.y = to.y;
    }
  });

  test('slides around a curve without getting caught on it', () => {
    // pushed against a disc from the inside and dragged along it: a widget that
    // could only move towards the pointer on each axis would stop dead at the
    // top of the circle, where getting any further right means going down
    const w = widgetAt(0, -90, { condition: 'x^2 + y^2 < 100^2' });
    for(let step = 0; step < 20; ++step) {
      const to = w.dragLimitedCoord({ x: w.get('x') + 30, y: w.get('y') - 30 });
      expect(Math.hypot(to.x, to.y)).toBeLessThan(100);
      w.state.x = to.x;
      w.state.y = to.y;
    }
    // twenty moves up and to the right, every one of them refused by the
    // circle, and the widget has travelled round from the top of it to the
    // point that lies in the direction it is being pulled, (71,-71)
    expect(w.get('x')).toBeGreaterThan(65);
    expect(w.get('y')).toBeGreaterThan(-77);
  });
});

// alignX/alignY move the point of the widget the limit is about, the same
// fractions of the widget box a snap grid aligns to
describe('the dragLimit reference point', () => {
  test('limits the middle of the widget instead of its corner', () => {
    const w = widgetAt(0, 0, { maxX: 500, maxY: 500, alignX: 0.5, alignY: 0.5 });
    // the widget is 50 x 50, so its middle stops at 500 with the corner at 475
    expect(w.dragLimitedCoord({ x: 900, y: 900 })).toMatchObject({ x: 475, y: 475 });
    expect(w.dragLimitedCoord({ x: 100, y: 100 })).toMatchObject({ x: 100, y: 100 });
  });

  test('is what x and y are in a condition', () => {
    // a disc of radius 100 around (200,200) for the middle of the widget
    const w = widgetAt(175, 175, { condition: '(x - 200)^2 + (y - 200)^2 < 100^2', alignX: 0.5, alignY: 0.5 });
    const to = w.dragLimitedCoord({ x: 400, y: 175 });
    expect(Math.hypot(to.x + 25 - 200, to.y + 25 - 200)).toBeLessThan(100);
    expect(Math.hypot(to.x + 25 - 200, to.y + 25 - 200)).toBeGreaterThan(98);
  });

  test('leaves the corner on whole pixels', () => {
    // half of an odd width is half a pixel, which the widget must not end up on
    const w = createWidget({ id: 'odd', type: 'basic', x: 0, y: 0, width: 51, height: 51,
      dragLimit: { maxX: 300, condition: 'y > x', alignX: 0.5, alignY: 0.5 } });
    const to = w.dragLimitedCoord({ x: 900, y: 100 });
    expect(to.x).toBe(Math.round(to.x));
    expect(to.y).toBe(Math.round(to.y));
  });

  test('takes any other fraction of the widget box', () => {
    // 1/1 is the bottom right corner, so the whole widget stays left of maxX
    const w = widgetAt(0, 0, { maxX: 500, alignX: 1 });
    expect(w.dragLimitedCoord({ x: 900, y: 0 })).toMatchObject({ x: 450, y: 0 });
  });

  test('is the top left corner unless it says otherwise', () => {
    const w = widgetAt(0, 0, { maxX: 500, alignX: 0, alignY: 0 });
    expect(w.dragLimitedCoord({ x: 900, y: 0 })).toMatchObject({ x: 500, y: 0 });
  });
});

// An area does not have to be one piece: a ring, a track around the board or a
// box with a box cut out of it can only be crossed by going around. The widget
// follows the mouse rather than the pointer, so it never appears on the far
// side of a hole the pointer crossed.
describe('a drag across a hole in the area', () => {
  const ring = { condition: [ '(x - 500)^2 + (y - 500)^2 < 300^2', '(x - 500)^2 + (y - 500)^2 > 200^2' ] };

  test('does not jump over it, however the pointer got to the other side', () => {
    const w = createWidget({ id: 'w', type: 'basic', x: 250, y: 500, width: 0, height: 0, dragLimit: ring });
    // straight across the hole to the other side of the ring, which is inside
    // the area: the widget has to stay on the near side of the hole and wait
    // for the pointer to come back round to it
    const to = w.dragLimitedCoord({ x: 750, y: 500 });
    expect(w.dragLimitAllows(to)).toBe(true);
    expect(to.x).toBeLessThan(500);
  });

  test('follows a pointer that goes round it', () => {
    const w = createWidget({ id: 'w', type: 'basic', x: 250, y: 500, width: 0, height: 0, dragLimit: ring });
    // the pointer traces the ring over the top, a few degrees at a time, and
    // the widget travels with it - the drag along a track this is meant for
    let highest = 500;
    for(let degrees = 180; degrees >= 0; degrees -= 5) {
      const to = w.dragLimitedCoord({
        x: 500 + 250*Math.cos(degrees*Math.PI/180),
        y: 500 - 250*Math.sin(degrees*Math.PI/180)
      });
      expect(w.dragLimitAllows(to)).toBe(true);
      w.state.x = to.x;
      w.state.y = to.y;
      highest = Math.min(highest, to.y);
    }
    expect(w.get('x')).toBeGreaterThan(700);
    expect(highest).toBeLessThan(300);
  });
});

// Taking a widget out of a holder does not convert x and y out of the holder's
// coordinates, so between moveStart() and the first position a drag writes they
// are the holder's numbers read as the room's - for a score marker sitting in a
// track holder at the bottom right of the board, "2, 2". A drag is walked from
// where the widget is, so that one move used to be walked from the corner of
// the room and put the marker on the far side of the track. moveStart() takes
// down where the widget really is while its parent still says what x and y
// mean, and this is what dragLimitedCoord does with it.
describe('a drag that starts inside a holder', () => {
  // the shape of the Shell Game's score track: a ring around the board, holding
  // the middle of the marker, with a holder of the track at 700, 300
  const track = { minX: 0, maxX: 800, minY: 0, maxY: 600, alignX: 0.5, alignY: 0.5,
                  condition: 'x < 200 || x > 600 || y < 200 || y > 400' };

  test('is walked from where the widget is, not from the holder\'s numbers', () => {
    const w = widgetAt(5, 5, track);
    w.dragLimitStartCoord = { x: 705, y: 305 };
    // a step to the right stays on the arm of the ring the widget is on
    expect(w.dragLimitedCoord({ x: 745, y: 305 })).toMatchObject({ x: 745, y: 305 });
    // and the arm on the far side of the hole is still not reachable in one
    // move, however plainly the pointer asks for it
    expect(w.dragLimitedCoord({ x: 100, y: 305 }).x).toBeGreaterThan(400);
  });

  test('reads x and y again as soon as the drag has written them', () => {
    const w = widgetAt(705, 305, track);
    expect(w.dragLimitedCoord({ x: 745, y: 305 })).toMatchObject({ x: 745, y: 305 });
  });

  test('would otherwise be walked from wherever the holder puts the widget', () => {
    // the bug this guards against: "5, 5" reads as the top left corner of the
    // board, which is inside the ring as well, so the walk starts over there
    const w = widgetAt(5, 5, track);
    expect(w.dragLimitedCoord({ x: 745, y: 305 }).x).toBeLessThan(600);
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
