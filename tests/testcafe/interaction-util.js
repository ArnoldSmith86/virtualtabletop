import { ClientFunction, Selector } from 'testcafe';

import { applyLegacy, getStateObject, prepareClient, setRoomState } from './test-util.js';

// Shared driving code for the Layer-E fixtures: opening a room in a named legacy-mode
// combination, turning board coordinates into the screen pixels a pointer moves through, and
// dispatching a mouse path step by step.
//
// interactions.js gets by with t.drag()/t.dragToElement(), which move the pointer from A to B in
// one gesture. Anything that depends on where the pointer went in between - a widget that leaves
// a holder and comes back before the button is released, a drag that crosses a second holder -
// needs the path itself, so the events are dispatched here instead.

export const boardScale = ClientFunction(_=>+getComputedStyle(document.documentElement).getPropertyValue('--scale'));

// The board is a fixed 1600x1000 space that the client scales (and zooms) into the window.
// Measuring the surface rather than reading the client's own scale variables keeps this correct
// at any zoom level: whatever transform is in effect, the surface is still 1600 units wide.
export const surfaceGeometry = ClientFunction(_=>{
  const rectangle = document.getElementById('topSurface').getBoundingClientRect();
  return { left: rectangle.left, top: rectangle.top, pixelsPerUnit: rectangle.width/1600 };
});

// Dispatching on the element under the point rather than on a fixed selector is what makes a
// path work: mousedown has to land on the widget, and the later moves have to be accepted
// wherever the pointer happens to be. The client listens on window, so the event only has to
// bubble - and it reads clientX/clientY, so nothing else about it matters.
const dispatchMouse = ClientFunction((type, clientX, clientY) => {
  const element = document.elementFromPoint(clientX, clientY) || document.body;
  element.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true, button: 0, buttons: type == 'mouseup' ? 0 : 1 }));
});

export async function openRoom(t, combo, state) {
  await ClientFunction(prepareClient)();
  // closing the states overlay is what makes the surface accept pointer events at all
  await t.click('#activeGameButton');
  // a state that is already in the room creates no widget, so empty it before every fixture
  await setRoomState({});
  // before setRoomState: a widget reads its legacy modes in the constructor
  await applyLegacy(combo);
  await setRoomState(state);
  // a cold room takes a while to render on a loaded machine, and every assertion below is
  // about what a pointer does to a widget that is already on screen
  await t.expect(Selector(`#w_${Object.keys(state)[0]}`).exists).ok('the room renders its widgets', { timeout: 30000 });
}

// Poll the room state until it looks like the interaction arrived, then hand it to the
// assertions. Returning the last state seen (rather than asserting inside the loop) keeps the
// failure message about the property the test cares about.
export async function stateWhen(predicate) {
  let state = null;
  for(let wait=50; wait<4000; wait*=2) {
    state = await getStateObject();
    if(predicate(state))
      break;
    await new Promise(resolve=>setTimeout(resolve, wait));
  }
  return state;
}

async function clientPoint(waypoint, start, geometry) {
  if(waypoint.onto) {
    const box = await Selector(`#w_${waypoint.onto}`).boundingClientRect;
    return { x: box.left + box.width/2, y: box.top + box.height/2 };
  }
  return { x: start.x + (waypoint.dx||0)*geometry.pixelsPerUnit, y: start.y + (waypoint.dy||0)*geometry.pixelsPerUnit };
}

// Drag a widget along a path. Every waypoint is either a board-unit offset from where the drag
// started ({ dx, dy }) or the centre of another widget ({ onto: id }); the pointer is pressed on
// the widget, moved through all of them and released on the last one.
//
// Each leg is walked in steps rather than jumped: the client picks its drop target by hit
// testing the *rendered* position of the dragged widget, and a widget that is animating towards
// a coordinate it was teleported to is still somewhere else when that test runs. A last
// repeated move after the widget has caught up makes the answer independent of the animation.
export async function dragPath(t, id, waypoints, { settle = 100, steps = 8 } = {}) {
  const geometry = await surfaceGeometry();
  const box = await Selector(`#w_${id}`).boundingClientRect;
  const start = { x: box.left + box.width/2, y: box.top + box.height/2 };

  await dispatchMouse('mousedown', start.x, start.y);
  await t.wait(settle);
  let last = start;
  for(const waypoint of waypoints) {
    const target = await clientPoint(waypoint, start, geometry);
    const from = last;
    for(let step=1; step<=steps; ++step) {
      last = { x: from.x + (target.x-from.x)*step/steps, y: from.y + (target.y-from.y)*step/steps };
      await dispatchMouse('mousemove', last.x, last.y);
    }
    await t.wait(settle);
    // the widget has arrived by now, so this move is the one whose hit test decides the drop
    await dispatchMouse('mousemove', last.x, last.y);
    await t.wait(settle);
  }
  await dispatchMouse('mouseup', last.x, last.y);
}
