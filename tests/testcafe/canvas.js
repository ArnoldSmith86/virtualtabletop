import { ClientFunction } from 'testcafe';

import { getStateObject, setName, setupTestEnvironment } from './test-util.js';
import { openRoom, stateWhen } from './interaction-util.js';

setupTestEnvironment();

// Layer E: drawing on a canvas.
//
// The canvas is the one widget whose player interaction is neither a click nor a drag: it takes
// the raw pointer stream (passthroughMouse), turns it into pixels, and stores those in a
// run-length encoded string per tenth of the surface. Nothing has ever asserted either half -
// which pixels a stroke sets, or what the encoding of those pixels looks like when it reaches
// the save file.
//
// Both are asserted here, because they fail differently: the rendered pixel is read back out of
// the 2D context, so it covers the decode path in applyDeltaToDOM(), while the region string is
// read out of the room state, so it covers the encode path a save file depends on.

const TIERS = [ 'modern', 'legacy-all' ];

const RESOLUTION = 100;
// colorMap[0] is a colour like any other, not transparency: an unpainted pixel is drawn in it
const EMPTY = '240,240,240,255';

function canvasState(canvasProperties = {}, extra = {}) {
  return Object.assign({
    paper: Object.assign({
      id: 'paper', type: 'canvas', x: 300, y: 200, width: 400, height: 400,
      resolution: RESOLUTION, lineWidth: 1, activeColor: 1
    }, canvasProperties)
  }, extra);
}

// The canvas keeps its pixels in its own coordinate system, so a stroke is expressed in canvas
// pixels and converted here - via the element's box, which makes it independent of the window
// size and of the board scale.
const canvasGeometry = ClientFunction(_=>{
  const rectangle = document.querySelector('#w_paper canvas').getBoundingClientRect();
  return { left: rectangle.left, top: rectangle.top, width: rectangle.width, height: rectangle.height };
});

const dispatchMouse = ClientFunction((type, clientX, clientY) => {
  const element = document.elementFromPoint(clientX, clientY) || document.body;
  element.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true, button: 0, buttons: type == 'mouseup' ? 0 : 1 }));
});

// The colour the canvas element actually shows at a pixel, as `r,g,b,a`. Reading it back out of
// the 2D context is the only assertion that covers the decode half of the round trip.
const renderedPixel = ClientFunction((x, y) => {
  const canvas = document.querySelector('#w_paper canvas');
  const data = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
  return [ data[0], data[1], data[2], data[3] ].join(',');
});

const canvasSize = ClientFunction(_=>{
  const canvas = document.querySelector('#w_paper canvas');
  return `${canvas.width}x${canvas.height}`;
});

async function stroke(t, points) {
  const geometry = await canvasGeometry();
  const at = point => ({
    x: geometry.left + (point[0]+0.5)/RESOLUTION*geometry.width,
    y: geometry.top  + (point[1]+0.5)/RESOLUTION*geometry.height
  });

  let last = at(points[0]);
  await dispatchMouse('mousedown', last.x, last.y);
  for(const point of points.slice(1)) {
    last = at(point);
    await dispatchMouse('mousemove', last.x, last.y);
    await t.wait(60);
  }
  await dispatchMouse('mouseup', last.x, last.y);
  // the pixel cache is flushed on an interval and once more on mouseup, so the state the
  // assertions read is written a moment after the pointer is released
  await t.wait(400);
}

// Every region a canvas has not been drawn on is its default, and a property that equals its
// default is not stored - so the state of an untouched canvas has no c** keys at all.
function drawnRegions(state) {
  return Object.keys(state.paper||{}).filter(key=>key.match(/^c[0-9][0-9]$/)).sort();
}

for(const combo of TIERS) {
  test(`A stroke sets the pixels it went through (${combo})`, async t => {
    await openRoom(t, combo, canvasState());
    // a horizontal line across the second region row, well away from any region border
    await stroke(t, [ [ 12, 15 ], [ 20, 15 ], [ 28, 15 ] ]);

    const blue = '31,92,166,255'; // colorMap[1], the default active colour
    await t.expect(await renderedPixel(12, 15)).eql(blue, `the first pixel in combination ${combo}`);
    await t.expect(await renderedPixel(20, 15)).eql(blue, `a pixel in the middle in combination ${combo}`);
    await t.expect(await renderedPixel(28, 15)).eql(blue, `the last pixel in combination ${combo}`);
    await t.expect(await renderedPixel(20, 40)).eql(EMPTY, `and nothing below it in combination ${combo}`);

    const state = await getStateObject();
    await t.expect(drawnRegions(state)).eql([ 'c11', 'c21' ], `the regions the line crossed in combination ${combo}`);
  });
}

test('An untouched canvas stores no regions at all', async t => {
  await openRoom(t, 'modern', canvasState());

  const state = await getStateObject();
  await t.expect(drawnRegions(state)).eql([]);
  await t.expect(await renderedPixel(50, 50)).eql(EMPTY);
});

test('CANVAS setPixel writes one pixel, and writes it run-length encoded', async t => {
  await openRoom(t, 'modern', canvasState({}, {
    go: { id: 'go', type: 'button', x: 1000, y: 200, width: 100, height: 60, text: 'go', clickRoutine: [
      { func: 'CANVAS', canvas: 'paper', mode: 'setPixel', x: 3, y: 2, value: 4 }
    ] }
  }));
  await t.click('#w_go');

  const state = await stateWhen(s=>drawnRegions(s).length);
  // one pixel: lineWidth 1 means the circle of radius 1 around the point, which is the point.
  // The region is 10x10 read row by row, so pixel (3,2) is offset 23 - written as a run of 23
  // zeros ('/.'), the colour, and a run of 76 more ('0') that the encoder folds into one
  // character because it reaches the end of the region.
  await t.expect(drawnRegions(state)).eql([ 'c00' ]);
  await t.expect(state.paper.c00).eql('/.40');
  await t.expect(await renderedPixel(3, 2)).eql('0,128,0,255', 'colorMap[4] is green');
});

test('CANVAS reset takes the canvas back to empty', async t => {
  await openRoom(t, 'modern', canvasState({}, {
    go: { id: 'go', type: 'button', x: 1000, y: 200, width: 100, height: 60, text: 'go', clickRoutine: [
      { func: 'CANVAS', canvas: 'paper', mode: 'reset' }
    ] }
  }));
  await stroke(t, [ [ 12, 15 ], [ 28, 15 ] ]);
  await t.expect(drawnRegions(await getStateObject())).notEql([], 'the stroke arrived');

  await t.click('#w_go');
  const state = await stateWhen(s=>!drawnRegions(s).length);
  await t.expect(drawnRegions(state)).eql([], 'and the reset removed it');
  await t.expect(await renderedPixel(20, 15)).eql(EMPTY, 'including on screen');
});

test('CANVAS set chooses the colour the next stroke draws in', async t => {
  await openRoom(t, 'modern', canvasState({}, {
    go: { id: 'go', type: 'button', x: 1000, y: 200, width: 100, height: 60, text: 'go', clickRoutine: [
      { func: 'CANVAS', canvas: 'paper', mode: 'set', value: 3 }
    ] }
  }));
  await t.click('#w_go');
  await stateWhen(s=>(s.paper||{}).activeColor == 3);
  await stroke(t, [ [ 12, 15 ], [ 28, 15 ] ]);

  await t.expect(await renderedPixel(20, 15)).eql('255,0,0,255', 'colorMap[3] is red');
});

test('lineWidth widens the stroke', async t => {
  await openRoom(t, 'modern', canvasState({ lineWidth: 3 }));
  await stroke(t, [ [ 12, 15 ], [ 28, 15 ] ]);

  const blue = '31,92,166,255';
  await t.expect(await renderedPixel(20, 15)).eql(blue, 'the line itself');
  await t.expect(await renderedPixel(20, 17)).eql(blue, 'two pixels below it are part of it');
  await t.expect(await renderedPixel(20, 20)).eql(EMPTY, 'five are not');
});

test('artist keeps everyone else from drawing', async t => {
  await openRoom(t, 'modern', canvasState({ artist: 'Someone else' }));
  await setName(t, 'Alice');
  await stroke(t, [ [ 12, 15 ], [ 28, 15 ] ]);

  await t.expect(drawnRegions(await getStateObject())).eql([]);
  await t.expect(await renderedPixel(20, 15)).eql(EMPTY);
});

test('A canvas that is not clickable is not drawable either', async t => {
  await openRoom(t, 'modern', canvasState({ clickable: false }));
  await stroke(t, [ [ 12, 15 ], [ 28, 15 ] ]);

  await t.expect(drawnRegions(await getStateObject())).eql([]);
});

test('The resolution is rounded to a multiple of ten and clamped', async t => {
  await openRoom(t, 'modern', canvasState({ resolution: 137 }));
  await t.expect(await canvasSize()).eql('140x140', '137 rounds to 140');

  await openRoom(t, 'modern', canvasState({ resolution: 4000 }));
  await t.expect(await canvasSize()).eql('500x500', 'and 500 is the ceiling');
});
