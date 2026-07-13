import { widgets, addWidget, batchStart, batchEnd, widgetFilter } from '../../client/js/serverstate.js';
import { Widget } from '../../client/js/widgets/widget.js';

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
  globalThis.setDeltaCause = () => {};
  globalThis.playerName = 'jestPlayer';
  ({ Line } = await import('../../client/js/widgets/line.js'));
});

function createLine(def) {
  const line = new Line(def.id);
  addWidget({ ...def, type: 'line' }, line);
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
