import { widgets, addWidget, batchStart, batchEnd, widgetFilter, flushDelta } from '../../client/js/serverstate.js';
import { Widget } from '../../client/js/widgets/widget.js';
import { compareDropTarget } from '../../client/js/main.js';

import { removeWidget } from './client-util.js';

// line.js relies on the concatenated global scope of the shipped bundle rather than
// on imports, so expose the identifiers it references before importing it.
let Line;
beforeAll(async () => {
  globalThis.Widget = Widget;
  globalThis.widgets = widgets;
  globalThis.widgetFilter = widgetFilter;
  globalThis.batchStart = batchStart;
  globalThis.batchEnd = batchEnd;
  globalThis.flushDelta = flushDelta;
  globalThis.compareDropTarget = compareDropTarget;
  globalThis.setDeltaCause = () => {};
  globalThis.getMaxZ = () => 0;
  globalThis.updateMaxZ = () => {};
  globalThis.playerName = 'jestPlayer';
  ({ Line } = await import('../../client/js/widgets/line.js'));
});

function createLine(def) {
  const line = new Line(def.id);
  addWidget({ ...def, type: 'line' }, line);
  // jsdom does not implement DOMMatrix. These fixtures deliberately exercise
  // lines in the room's untransformed coordinate frame, so model that frame
  // directly while leaving browser transform coverage to TestCafe.
  line.coordGlobalFromCoordLocal = coord => ({ x: line.get('x') + coord.x, y: line.get('y') + coord.y });
  line.coordLocalFromCoordGlobal = coord => ({ x: coord.x - line.get('x'), y: coord.y - line.get('y') });
  return line;
}

const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;

describe('Line widget geometry', () => {
  describe('pointAtPosition on a straight line', () => {
    let line;
    beforeAll(() => {
      line = createLine({ id: 'straight', x: 100, y: 100, lineStart: { x: 0, y: 0 }, lineEnd: { x: 100, y: 0 } });
    });
    afterAll(() => removeWidget('straight'));

    test('maps the ends and the midpoint exactly', () => {
      expect(line.pointAtPosition(0)).toEqual({ x: 0, y: 0 });
      expect(line.pointAtPosition(1)).toEqual({ x: 100, y: 0 });
      const mid = line.pointAtPosition(0.5);
      expect(near(mid.x, 50)).toBe(true);
      expect(near(mid.y, 0)).toBe(true);
    });

    test('clamps out-of-range positions to the ends', () => {
      expect(line.pointAtPosition(-1)).toEqual({ x: 0, y: 0 });
      expect(line.pointAtPosition(2).x).toBe(100);
    });

    test('positionAtPoint projects onto the path instead of snapping to a sample', () => {
      // a straight line is sampled by its two ends only, so this has to project
      expect(line.positionAtPoint({ x: 30, y: 12 })).toBe(0.3);
      expect(line.positionAtPoint({ x: -50, y: 0 })).toBe(0);
      expect(line.positionAtPoint({ x: 150, y: 0 })).toBe(1);
    });
  });

  describe('linePoints / pointAtPosition on a curved (Bezier) line', () => {
    let line;
    beforeAll(() => {
      // symmetric arch: both control points pull straight up by 90
      line = createLine({ id: 'curved', x: 0, y: 0,
        lineStart: { x: 0, y: 0 }, lineEnd: { x: 100, y: 0 },
        controlStart: { x: 0, y: -90 }, controlEnd: { x: 100, y: -90 } });
    });
    afterAll(() => removeWidget('curved'));

    test('isCurved is true and endpoints are still exact', () => {
      expect(line.isCurved()).toBe(true);
      expect(line.pointAtPosition(0)).toEqual({ x: 0, y: 0 });
      const end = line.pointAtPosition(1);
      expect(near(end.x, 100)).toBe(true);
      expect(near(end.y, 0)).toBe(true);
    });

    test('linePoints samples an increasing arc length', () => {
      const pts = line.linePoints(20);
      expect(pts.length).toBe(21);
      expect(pts[0].len).toBe(0);
      for (let i = 1; i < pts.length; ++i)
        expect(pts[i].len).toBeGreaterThanOrEqual(pts[i - 1].len);
      // a symmetric arch is longer than the straight chord between its ends
      expect(line.lineLength()).toBeGreaterThan(100);
    });

    test('the arc-length midpoint sits at the top of the symmetric arch', () => {
      const mid = line.pointAtPosition(0.5);
      expect(near(mid.x, 50, 2)).toBe(true);
      expect(mid.y).toBeLessThan(-40); // pulled upward by the control points
    });
  });

  describe('pointProperty accepts both {x,y} and [x,y]', () => {
    let line;
    beforeAll(() => {
      line = createLine({ id: 'ptfmt', x: 0, y: 0, lineStart: [ 10, 20 ], lineEnd: { x: 30, y: 40 } });
    });
    afterAll(() => removeWidget('ptfmt'));

    test('reads array and object point formats identically', () => {
      expect(line.pointProperty('lineStart')).toEqual({ x: 10, y: 20 });
      expect(line.pointProperty('lineEnd')).toEqual({ x: 30, y: 40 });
    });
  });

  test('the legacy rotation setting overrides the new default when present', () => {
    const line = createLine({ id: 'legacy-rotation', rotateAttachedWidgets: false });
    expect(line.shouldRotateStops()).toBe(false);
    removeWidget('legacy-rotation');
  });

  test('auto-rotation restores an explicit stop rotation after reload', async () => {
    const rotationStops = [ { widget: 'rotation-stop', position: 0.5 }, { widget: 'rotation-follower', position: 0.75 } ];
    let line = createLine({ id: 'rotation-line', x: 0, y: 0, lineStart: { x: 0, y: 0 }, lineEnd: { x: 100, y: 100 }, autoSpaceStops: false, stops: rotationStops });
    let stop = new Widget('rotation-stop');
    addWidget({ id: 'rotation-stop', type: 'basic', parent: line.id, width: 80, height: 20, rotation: 25 }, stop);
    let follower = new Widget('rotation-follower');
    addWidget({ id: 'rotation-follower', type: 'basic', parent: line.id, inheritFrom: stop.id }, follower);

    await line.updateAttachedWidgets();
    expect(Math.round(stop.get('rotation'))).toBe(45);
    expect(stop.get('lineOriginalRotation')).toEqual({ value: 25, explicit: true });
    expect(follower.get('lineOriginalRotation')).toEqual({ value: 45, explicit: false });

    const savedStop = JSON.parse(JSON.stringify(stop.state));
    const savedFollower = JSON.parse(JSON.stringify(follower.state));
    removeWidget(follower.id);
    removeWidget(stop.id);
    removeWidget(line.id);
    line = createLine({ id: 'rotation-line', x: 0, y: 0, lineStart: { x: 0, y: 0 }, lineEnd: { x: 100, y: 100 }, autoSpaceStops: false, stops: rotationStops });
    stop = new Widget('rotation-stop');
    addWidget(savedStop, stop);
    follower = new Widget('rotation-follower');
    addWidget(savedFollower, follower);

    await line.set('rotateStops', false);
    expect(stop.get('rotation')).toBe(25);
    expect(stop.get('lineOriginalRotation')).toBeNull();
    expect(follower.get('rotation')).toBe(25);
    expect(follower.get('lineOriginalRotation')).toBeNull();
    removeWidget(follower.id);
    removeWidget(stop.id);
    removeWidget(line.id);
  });

  test('direct and inherited stop geometry changes reposition the stop', async () => {
    const line = createLine({ id: 'stop-line', x: 0, y: 0, lineStart: { x: 0, y: 0 }, lineEnd: { x: 100, y: 0 }, rotateStops: false, autoSpaceStops: false,
      stops: [ { widget: 'reactive-stop', position: 0.25 } ] });
    const source = new Widget('stop-source');
    addWidget({ id: 'stop-source', type: 'basic', width: 20, height: 20 }, source);
    const stop = new Widget('reactive-stop');
    addWidget({ id: 'reactive-stop', type: 'basic', parent: line.id, inheritFrom: source.id }, stop);

    await line.setStopPosition(stop.id, 0.75);
    expect(stop.get('x')).toBe(65);
    await source.set('width', 40);
    expect(stop.get('x')).toBe(55);

    removeWidget(stop.id);
    removeWidget(source.id);
    removeWidget(line.id);
  });

  test('renaming a stop keeps a single entry in place, at its own position', async () => {
    const line = createLine({ id: 'rename-line', x: 0, y: 0, lineStart: { x: 0, y: 0 }, lineEnd: { x: 300, y: 0 }, autoSpaceStops: true,
      stops: [ 'rename-a', 'rename-b', 'rename-c' ].map((widget, i) => ({ widget, position: i / 2 })) });
    const stops = [ 'rename-a', 'rename-b', 'rename-c' ].map(id => {
      const stop = new Widget(id);
      addWidget({ id, type: 'basic', parent: line.id, width: 20, height: 20 }, stop);
      return stop;
    });
    await line.distributeAttachedWidgetsEvenly();
    const before = line.stopList();

    // what serverstate's updateWidgetId does: flag the old object, detach and
    // remove it, add a brand-new instance under the new id, then rename the
    // entry. The new instance carries no flag, so the stop list must not be
    // rebuilt from the re-add - only the id in the existing entry changes.
    stops[1].isBeingRenamed = true;
    await line.onChildRemove(stops[1]);
    const state = { ...stops[1].state, id: 'rename-b2' };
    removeWidget('rename-b');
    addWidget(state, new Widget('rename-b2'));
    await line.renameStop('rename-b', 'rename-b2');

    expect(line.stopList()).toEqual(before.map(entry => entry.widget == 'rename-b' ? { ...entry, widget: 'rename-b2' } : entry));

    for(const id of [ 'rename-a', 'rename-b2', 'rename-c' ])
      removeWidget(id);
    removeWidget(line.id);
  });

  test.each([ true, false ])('swapStops exchanges two neighbours (autoSpaceStops: %s)', async autoSpaceStops => {
    const line = createLine({ id: 'swap-line', x: 0, y: 0, lineStart: { x: 0, y: 0 }, lineEnd: { x: 300, y: 0 }, rotateStops: false, autoSpaceStops,
      stops: [ 'swap-a', 'swap-b', 'swap-c' ].map((widget, i) => ({ widget, position: i / 2 })) });
    const stops = [ 'swap-a', 'swap-b', 'swap-c' ].map(id => {
      const stop = new Widget(id);
      addWidget({ id, type: 'basic', parent: line.id, width: 20, height: 20 }, stop);
      return stop;
    });
    const positions = () => line.stopList().map(entry => entry.position);
    const before = positions();

    await line.swapStops(0, 1);
    expect(line.attachedWidgets().map(stop => stop.id)).toEqual([ 'swap-b', 'swap-a', 'swap-c' ]);
    // the stops trade places, the positions along the line stay where they were
    expect(positions()).toEqual(before);

    // out of range: no neighbour to swap with, so nothing changes
    await line.swapStops(2, 1);
    expect(line.attachedWidgets().map(stop => stop.id)).toEqual([ 'swap-b', 'swap-a', 'swap-c' ]);

    for(const stop of stops)
      removeWidget(stop.id);
    removeWidget(line.id);
  });

  describe('the stops list', () => {
    test('keeps the chain order and drops entries whose widget is gone', async () => {
      const line = createLine({ id: 'list-line', x: 0, y: 0, lineStart: { x: 0, y: 0 }, lineEnd: { x: 100, y: 0 }, autoSpaceStops: false,
        stops: [ { widget: 'list-b', position: 0.8 }, { widget: 'list-ghost', position: 0.5 }, { widget: 'list-a', position: 0.2 } ] });
      for(const id of [ 'list-a', 'list-b' ])
        addWidget({ id, type: 'basic', parent: line.id, width: 20, height: 20 }, new Widget(id));

      // list order, not position order, and the dangling entry is ignored
      expect(line.attachedWidgets().map(stop => stop.id)).toEqual([ 'list-b', 'list-a' ]);
      expect(line.stopPosition(widgets.get('list-a'))).toBe(0.2);

      await line.addStop('list-a', 0.6);
      expect(line.stopPosition(widgets.get('list-a'))).toBe(0.6);
      expect(line.attachedWidgets().length).toBe(2); // moved, not duplicated

      await line.removeStop('list-b');
      expect(line.attachedWidgets().map(stop => stop.id)).toEqual([ 'list-a' ]);

      removeWidget('list-a');
      removeWidget('list-b');
      removeWidget(line.id);
    });

    test('positions a stop that is not a child of the line in its own parent frame', async () => {
      const line = createLine({ id: 'ext-line', x: 500, y: 300, lineStart: { x: 0, y: 0 }, lineEnd: { x: 100, y: 0 }, rotateStops: false, autoSpaceStops: false,
        stops: [ { widget: 'ext-stop', position: 0.5 } ] });
      const board = new Widget('ext-board');
      addWidget({ id: 'ext-board', type: 'basic', x: 400, y: 200, width: 400, height: 400 }, board);
      board.coordLocalFromCoordGlobal = coord => ({ x: coord.x - 400, y: coord.y - 200 });
      const stop = new Widget('ext-stop');
      addWidget({ id: 'ext-stop', type: 'basic', parent: 'ext-board', width: 20, height: 20 }, stop);

      await line.updateAttachedWidgets();
      // path midpoint is global (550, 300), so board-local (150, 100), minus half the stop
      expect(stop.get('x')).toBe(140);
      expect(stop.get('y')).toBe(90);
      expect(line.hasExternalStops()).toBe(true);

      removeWidget('ext-stop');
      removeWidget('ext-board');
      removeWidget(line.id);
    });
  });
  describe('normalizeGeometry re-fits the box while keeping the path in place', () => {
    let line;
    beforeAll(async () => {
      // points far outside the widget's own box
      line = createLine({ id: 'norm', x: 500, y: 500, width: 10, height: 10,
        lineStart: { x: -300, y: -200 }, lineEnd: { x: 40, y: 60 }, lineWidth: 10 });
      await line.normalizeGeometry();
    });
    afterAll(() => removeWidget('norm'));

    test('the widget box wraps the path with padding', () => {
      // start global was 500 + -300 = 200, end global 540/560
      const s = { x: line.get('x') + line.pointProperty('lineStart').x, y: line.get('y') + line.pointProperty('lineStart').y };
      const e = { x: line.get('x') + line.pointProperty('lineEnd').x, y: line.get('y') + line.pointProperty('lineEnd').y };
      expect(s).toEqual({ x: 200, y: 300 }); // 500-300, 500-200
      expect(e).toEqual({ x: 540, y: 560 });
      // box now covers min..max of the two points plus padding (lineWidth/2 + 10 = 15)
      expect(line.get('width')).toBe((40 - -300) + 2 * 15);
      expect(line.get('height')).toBe((60 - -200) + 2 * 15);
      // and the local points are within the box
      expect(line.pointProperty('lineStart').x).toBeGreaterThanOrEqual(0);
      expect(line.pointProperty('lineStart').y).toBeGreaterThanOrEqual(0);
    });
  });

});

describe('Line widget closed shapes', () => {
  const ellipse = def => createLine({ lineShape: 'ellipse', lineStart: { x: 0, y: 0 }, lineEnd: { x: 200, y: 100 }, ...def });

  test('samples the perimeter clockwise from 12 o\'clock', () => {
    const line = ellipse({ id: 'ell', x: 0, y: 0 });
    expect(line.isClosed()).toBe(true);
    expect(line.isCurved()).toBe(false);
    const top = line.pointAtPosition(0);
    expect(near(top.x, 100)).toBe(true);
    expect(near(top.y, 0)).toBe(true);
    const right = line.pointAtPosition(0.25);
    expect(near(right.x, 200, 1)).toBe(true);
    expect(near(right.y, 50, 1)).toBe(true);
    const bottom = line.pointAtPosition(0.5);
    expect(near(bottom.x, 100, 1)).toBe(true);
    expect(near(bottom.y, 100, 1)).toBe(true);
    // a circle's perimeter, not the chord between the two corner points
    expect(line.lineLength()).toBeGreaterThan(400);
    removeWidget('ell');
  });

  test('positions wrap instead of clamping, so the tangent at the seam is real', () => {
    const line = ellipse({ id: 'seam', x: 0, y: 0, lineEnd: { x: 200, y: 200 } });
    expect(line.normalizePosition(1.25)).toBeCloseTo(0.25);
    expect(line.normalizePosition(-0.25)).toBeCloseTo(0.75);
    // at 12 o'clock a clockwise circle runs to the right: 0 degrees
    expect(Math.abs(line.tangentAngleAtPosition(0))).toBeLessThan(5);
    removeWidget('seam');
  });

  test('spreads stops all the way round with an equal gap', async () => {
    const line = ellipse({ id: 'ring', x: 0, y: 0, lineEnd: { x: 200, y: 200 }, rotateStops: false,
      stops: [ 'r0', 'r1', 'r2', 'r3' ].map((widget, i) => ({ widget, position: i / 8 })) });
    for(const id of [ 'r0', 'r1', 'r2', 'r3' ])
      addWidget({ id, type: 'basic', parent: line.id, width: 20, height: 20 }, new Widget(id));

    await line.distributeAttachedWidgetsEvenly();
    const positions = line.stopList().map(entry => entry.position);
    // four stops on a loop sit a quarter apart - none of them is pinned to the seam
    expect(positions[0]).toBe(0);
    for(let i = 1; i < positions.length; ++i)
      expect(near(positions[i] - positions[i-1], 0.25, 0.01)).toBe(true);

    // the next stop goes into the gap that wraps past the seam
    expect(near(line.nextStopPosition(), 0.875, 0.01)).toBe(true);

    for(const id of [ 'r0', 'r1', 'r2', 'r3' ])
      removeWidget(id);
    removeWidget(line.id);
  });

  test('resizing the widget box stretches the ellipse into it', async () => {
    const line = ellipse({ id: 'resize', x: 0, y: 0, width: 220, height: 120, lineWidth: 10 });
    await line.set('width', 420);
    const box = line.ellipseBox();
    // pad is lineWidth/2 + 10 = 15 on every side
    expect(box.rx).toBe((420 - 30) / 2);
    expect(box.ry).toBe((120 - 30) / 2);
    removeWidget('resize');
  });

  test('has no end points to connect, but can still be connected to', async () => {
    const target = ellipse({ id: 'ring-target', x: 100, y: 100, lineEnd: { x: 200, y: 200 } });
    const line = ellipse({ id: 'ring-dep', x: 0, y: 0, connectStart: { line: 'ring-target', position: 0 } });
    const before = line.pointProperty('lineStart');
    await line.applyConnections();
    expect(line.pointProperty('lineStart')).toEqual(before);

    // the other way round works: a plain line glues onto the ring's perimeter
    const dep = createLine({ id: 'plain-dep', x: 0, y: 0, lineStart: { x: 0, y: 0 }, lineEnd: { x: 50, y: 50 },
      connectStart: { line: 'ring-target', position: 0 } });
    await dep.applyConnections();
    const global = dep.coordGlobalFromCoordLocal(dep.pointProperty('lineStart'));
    const targetTop = target.coordGlobalFromCoordLocal(target.pointAtPosition(0));
    expect(Math.round(global.x)).toBe(Math.round(targetTop.x));
    expect(Math.round(global.y)).toBe(Math.round(targetTop.y));

    for(const id of [ 'ring-target', 'ring-dep', 'plain-dep' ])
      removeWidget(id);
  });

});

describe('Line widget connections', () => {
  afterEach(() => {
    for (const w of widgetFilter(w => w.get('type') === 'line'))
      removeWidget(w.get('id'));
  });

  test('a connected end point glues onto the target line (global position preserved)', async () => {
    const target = createLine({ id: 'tgt', x: 800, y: 300, lineStart: { x: 20, y: 20 }, lineEnd: { x: 380, y: 180 } });
    const dep = createLine({ id: 'dep', x: 100, y: 100, lineStart: { x: 0, y: 0 }, lineEnd: { x: 200, y: 200 },
      connectEnd: { line: 'tgt', position: 0 } });

    await dep.applyConnections();

    const depEndGlobal = { x: dep.get('x') + dep.pointProperty('lineEnd').x, y: dep.get('y') + dep.pointProperty('lineEnd').y };
    const targetStartGlobal = { x: target.get('x') + target.pointProperty('lineStart').x, y: target.get('y') + target.pointProperty('lineStart').y };
    expect(depEndGlobal).toEqual(targetStartGlobal); // 820, 320
  });

  test('an offset from a rotated non-line target follows its global direction', async () => {
    const target = new Widget('target');
    addWidget({ id: 'target', type: 'basic', x: 300, y: 200, width: 100, height: 40, rotation: 90 }, target);
    target.coordGlobalFromCoordLocal = p => ({ x: target.get('x')+70-p.y, y: target.get('y')-30+p.x });
    const dep = createLine({ id: 'dep', x: 0, y: 0, lineStart: { x: 0, y: 0 }, lineEnd: { x: 100, y: 0 },
      connectStart: { line: 'target', position: 0.5, offset: 20 } });

    await dep.applyConnections();

    const connected = dep.coordGlobalFromCoordLocal(dep.pointProperty('lineStart'));
    const center = target.coordGlobalFromCoordLocal({ x: 50, y: 20 });
    expect(Math.round(connected.x-center.x)).toBe(-20);
    expect(Math.round(connected.y-center.y)).toBe(0);
    removeWidget('target');
  });

  test('transforming an ancestor re-applies connections to its descendants', async () => {
    const ancestor = new Widget('ancestor');
    addWidget({ id: 'ancestor', type: 'basic' }, ancestor);
    const target = new Widget('nested-target');
    addWidget({ id: 'nested-target', type: 'basic', parent: ancestor.id }, target);
    const dep = createLine({ id: 'dep', connectStart: { line: target.id, position: 0.5 } });
    let applyCount = 0;
    dep.applyConnections = async () => ++applyCount;

    await ancestor.set('rotation', 30);
    expect(applyCount).toBe(1);

    removeWidget(target.id);
    removeWidget(ancestor.id);
  });

  test('moving the target and re-applying keeps the dependent glued', async () => {
    const target = createLine({ id: 'tgt', x: 800, y: 300, lineStart: { x: 20, y: 20 }, lineEnd: { x: 380, y: 180 } });
    const dep = createLine({ id: 'dep', x: 100, y: 100, lineStart: { x: 0, y: 0 }, lineEnd: { x: 200, y: 200 },
      connectEnd: { line: 'tgt', position: 0 } });
    await dep.applyConnections();

    await target.set('y', 500); // this re-applies connections on dependents via onPropertyChange

    const depEndGlobal = { x: dep.get('x') + dep.pointProperty('lineEnd').x, y: dep.get('y') + dep.pointProperty('lineEnd').y };
    const targetStartGlobal = { x: target.get('x') + target.pointProperty('lineStart').x, y: target.get('y') + target.pointProperty('lineStart').y };
    expect(depEndGlobal).toEqual(targetStartGlobal);
  });

  test('a curved connected line keeps its shape (control points follow the ends) when the target moves', async () => {
    const target = createLine({ id: 'tgt', x: 300, y: 300, width: 400, height: 40,
      lineStart: { x: 20, y: 20 }, lineEnd: { x: 380, y: 20 } });
    // a curved dependent glued at both ends to the target
    const dep = createLine({ id: 'dep', x: 300, y: 300, width: 400, height: 200,
      lineStart: { x: 20, y: 20 }, lineEnd: { x: 380, y: 20 },
      controlStart: { x: 120, y: 160 }, controlEnd: { x: 280, y: 160 },
      connectStart: { line: 'tgt', position: 0 }, connectEnd: { line: 'tgt', position: 1 } });
    await dep.applyConnections();

    const globals = () => {
      const g = p => { const pt = dep.pointProperty(p); return { x: dep.get('x') + pt.x, y: dep.get('y') + pt.y }; };
      const m = dep.pointAtPosition(0.5);
      return { start: g('lineStart'), end: g('lineEnd'), cStart: g('controlStart'), cEnd: g('controlEnd'), mid: { x: dep.get('x') + m.x, y: dep.get('y') + m.y } };
    };
    const before = globals();

    // translate the target rigidly by (100, 60)
    await target.set('x', target.get('x') + 100);
    await target.set('y', target.get('y') + 60);

    const after = globals();
    const delta = (a, b) => ({ x: Math.round(b.x - a.x), y: Math.round(b.y - a.y) });
    // every point of the dependent curve — including the control points and the arc
    // midpoint — shifts by the same (100, 60): the curve translated rigidly, not stretched
    expect(delta(before.start, after.start)).toEqual({ x: 100, y: 60 });
    expect(delta(before.end, after.end)).toEqual({ x: 100, y: 60 });
    expect(delta(before.cStart, after.cStart)).toEqual({ x: 100, y: 60 });
    expect(delta(before.cEnd, after.cEnd)).toEqual({ x: 100, y: 60 });
    expect(delta(before.mid, after.mid)).toEqual({ x: 100, y: 60 });
  });

  test('a straight connected line has no control points to shift and still glues', async () => {
    const target = createLine({ id: 'tgt', x: 800, y: 300, lineStart: { x: 20, y: 20 }, lineEnd: { x: 380, y: 180 } });
    const dep = createLine({ id: 'dep', x: 100, y: 100, lineStart: { x: 0, y: 0 }, lineEnd: { x: 200, y: 200 },
      connectEnd: { line: 'tgt', position: 0 } });
    await dep.applyConnections();

    expect(dep.pointProperty('controlEnd')).toBeNull();
    const depEndGlobal = { x: dep.get('x') + dep.pointProperty('lineEnd').x, y: dep.get('y') + dep.pointProperty('lineEnd').y };
    const targetStartGlobal = { x: target.get('x') + target.pointProperty('lineStart').x, y: target.get('y') + target.pointProperty('lineStart').y };
    expect(depEndGlobal).toEqual(targetStartGlobal);
  });

  test('an end point ignores a target that sits inside the line itself', async () => {
    const line = createLine({ id: 'dep', x: 100, y: 100, width: 200, height: 40, autoSpaceStops: false,
      lineStart: { x: 0, y: 20 }, lineEnd: { x: 200, y: 20 },
      stops: [ { widget: 'stop', position: 0 } ],
      connectStart: { line: 'piece', position: 0.5 } });
    const stop = new Widget('stop');
    addWidget({ id: 'stop', type: 'basic', parent: line.id, width: 40, height: 40 }, stop);
    // a piece dropped into that stop moves along with the line, so gluing the
    // end point to it would chase its own tail and send the line off the surface
    const piece = new Widget('piece');
    addWidget({ id: 'piece', type: 'basic', parent: stop.id, x: 100, y: 0, width: 40, height: 40 }, piece);
    piece.coordGlobalFromCoordLocal = p => ({ x: line.get('x')+stop.get('x')+piece.get('x')+p.x, y: line.get('y')+stop.get('y')+piece.get('y')+p.y });

    const globalStart = () => { const p = line.coordGlobalFromCoordLocal(line.pointProperty('lineStart')); return { x: Math.round(p.x), y: Math.round(p.y) }; };
    const before = globalStart();
    await line.applyConnections();

    expect(globalStart()).toEqual(before);
    removeWidget('piece');
    removeWidget('stop');
  });

  test('mutually connected lines terminate (no infinite recursion)', async () => {
    const a = createLine({ id: 'la', x: 0, y: 0, lineStart: { x: 0, y: 0 }, lineEnd: { x: 100, y: 0 },
      connectStart: { line: 'lb', position: 1 } });
    const b = createLine({ id: 'lb', x: 300, y: 0, lineStart: { x: 0, y: 0 }, lineEnd: { x: 100, y: 0 },
      connectStart: { line: 'la', position: 1 } });

    // if the cycle guard failed this would recurse forever / throw
    await expect(a.applyConnections()).resolves.toBeUndefined();
    await expect(b.applyConnections()).resolves.toBeUndefined();
    expect(globalThis.Line ?? Line).toBeTruthy();
  });
});

describe('dragging a widget onto a line to make it a stop', () => {
  let line, token;

  beforeEach(() => {
    // a line takes nothing by default, so this one opts in with the dropTarget
    // the editor's "Basic widgets" target writes
    line = createLine({ id: 'drop-line', x: 100, y: 100, width: 200, height: 40, autoSpaceStops: false,
      lineStart: { x: 0, y: 0 }, lineEnd: { x: 200, y: 0 }, dropTarget: { type: null } });
    token = new Widget('drop-token');
    // a plain widget has no type, which is what that dropTarget takes
    addWidget({ id: 'drop-token', x: 130, y: 80, width: 40, height: 40 }, token);
    token.coordGlobalFromCoordLocal = coord => ({ x: token.get('x') + coord.x, y: token.get('y') + coord.y });
    // the candidate lines are collected once when the drag starts
    token.stopDropLines = [ line ];
  });

  afterEach(() => {
    removeWidget('drop-token');
    removeWidget('drop-line');
  });

  test('a drop on the path reports the position it landed on', () => {
    // the token's center is global (150, 100), a quarter along the path
    const target = token.lineStopDropTarget();
    expect(target.line).toBe(line);
    expect(target.position).toBe(0.25);
    expect(target.distance).toBe(0);
  });

  test('a drop away from the path is not a stop drop', async () => {
    await token.set('y', 300);
    expect(token.lineStopDropTarget()).toBeNull();
  });

  test('a line whose dropTarget matches nothing never takes a dropped widget', async () => {
    // null is not storable, so this falls back to the default: an empty list
    await line.set('dropTarget', null);
    expect(line.get('dropTarget')).toEqual([]);
    expect(line.stopDropTarget(token, { x: 150, y: 100 })).toBeNull();
    expect(token.lineStopDropTarget()).toBeNull();
  });

  test('a line only takes what its dropTarget matches', async () => {
    await line.set('dropTarget', { type: 'card' });
    expect(line.stopDropTarget(token, { x: 150, y: 100 })).toBeNull();
    await line.set('dropTarget', {});
    expect(line.stopDropTarget(token, { x: 150, y: 100 })).not.toBeNull();
  });

  test('a drop aimed at a holder wins over the line below it', () => {
    token.hoverTarget = line; // any drop target is enough to rule the line out
    expect(token.lineStopDropTarget()).toBeNull();
    token.hoverTarget = null;
  });

  test('dropping puts the widget into the line and applies onEnter', async () => {
    await line.set('onEnter', { classes: 'onTheLine' });
    await token.applyLineStopDrop(token.lineStopDropTarget());
    expect(line.stopList()).toEqual([ { widget: 'drop-token', position: 0.25 } ]);
    // entering changes parentage like a holder does
    expect(token.get('parent')).toBe('drop-line');
    expect(token.get('classes')).toBe('onTheLine');
    // and it is snapped onto the path: center on the point, so half its size back
    expect(token.get('x')).toBe(30);
    expect(token.get('y')).toBe(-20);
  });

  test('dragging it off the line takes it out again and applies onLeave', async () => {
    await line.set('onLeave', { classes: 'offTheLine' });
    await token.applyLineStopDrop(token.lineStopDropTarget());

    await token.set('y', 300);
    await token.applyLineStopDrop(token.lineStopDropTarget());
    expect(line.stopList()).toEqual([]);
    expect(token.get('parent')).toBe(null);
    expect(token.get('classes')).toBe('offTheLine');
  });

  test('dragging a rotated stop off leaves it where it was dropped, unrotated', async () => {
    const diagonal = createLine({ id: 'off-line', x: 0, y: 0, width: 400, height: 300, autoSpaceStops: false,
      lineStart: { x: 0, y: 0 }, lineEnd: { x: 400, y: 300 }, dropTarget: { type: null },
      stops: [ { widget: 'off-stop', position: 0.5 } ] });
    // landscape, so the line rotates it to its tangent while it rides on it
    const stop = new Widget('off-stop');
    addWidget({ id: 'off-stop', parent: 'off-line', width: 80, height: 30 }, stop);
    await diagonal.layoutStops();
    expect(Math.round(stop.get('rotation'))).toBe(37);
    expect(stop.get('lineOriginalRotation')).toEqual({ value: 0, explicit: false });

    // the drag put it down in the room, well off the path
    await stop.set('x', 600);
    await stop.set('y', 20);
    stop.currentParent = diagonal;
    await stop.checkParent(true);

    expect(diagonal.stopList()).toEqual([]);
    expect(stop.get('parent')).toBe(null);
    // it stays where it was dropped instead of being pulled back onto the path
    expect(stop.get('x')).toBe(600);
    expect(stop.get('y')).toBe(20);
    // and it gets its own rotation back, without keeping the bookkeeping
    expect(stop.get('rotation')).toBe(0);
    expect(stop.get('lineOriginalRotation')).toBeNull();

    removeWidget('off-stop');
    removeWidget('off-line');
  });

  test('a widget that cannot change parent rides on the line instead', async () => {
    await token.set('fixedParent', true);
    await token.applyLineStopDrop(token.lineStopDropTarget());
    expect(line.stopList()).toEqual([ { widget: 'drop-token', position: 0.25 } ]);
    expect(token.get('parent')).toBe(null);

    await token.set('y', 300);
    await token.applyLineStopDrop(token.lineStopDropTarget());
    expect(line.stopList()).toEqual([]);
  });

  test('a line that does not accept drops keeps its stops when one is dragged away', async () => {
    await line.addStop('drop-token', 0.5);
    await line.set('dropTarget', []);
    await token.set('y', 300);
    await token.applyLineStopDrop(token.lineStopDropTarget());
    expect(line.stopList().length).toBe(1);
  });
});
