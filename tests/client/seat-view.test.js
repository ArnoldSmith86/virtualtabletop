import { widgets } from '../../client/js/serverstate.js';
import { refreshSeatViews, setSeatViewPreview } from '../../client/js/seatview.js';
import { createWidget, removeWidget } from './client-util.js';

function createSeat(id, properties) {
  return createWidget(Object.assign({ id, type: 'seat', player: '', index: 1 }, properties));
}

// look at the room through a given seat, the way the editor preview does
function viewAs(seatID) {
  setSeatViewPreview(seatID);
  refreshSeatViews(true);
}

afterEach(function() {
  setSeatViewPreview(null);
  for(const id of Array.from(widgets.keys()))
    removeWidget(id);
});

describe('rotateForViewer', function() {
  test('turns a container so the viewing seat ends up at the bottom', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createSeat('south', { player: 'Bob', index: 2 });
    const table = createWidget({ id: 'table', rotateForViewer: true });

    viewAs('north');
    expect(table.seatViewDelta).toBe(-180);

    viewAs('south');
    expect(table.seatViewDelta).toBe(0);
  });

  test('the seat viewRotation wins over its rotation and is rounded to quarter turns', function() {
    createSeat('east', { player: 'Alice', rotation: 180, viewRotation: 85 });
    const table = createWidget({ id: 'table', rotateForViewer: true });

    viewAs('east');
    expect(table.seatViewDelta).toBe(-90);
  });

  test('can read the angle from another seat property', function() {
    createSeat('north', { player: 'Alice', rotation: 180, sideRotation: 90 });
    const table = createWidget({ id: 'table', rotateForViewer: 'sideRotation' });

    viewAs('north');
    expect(table.seatViewDelta).toBe(-90);
  });

  test('children ride along instead of being turned a second time', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    const table = createWidget({ id: 'table', rotateForViewer: true });
    const card = createWidget({ id: 'card', parent: 'table' });

    viewAs('north');
    expect(table.seatViewDelta).toBe(-180);
    expect(card.seatViewDelta).toBe(0);
    expect(card.seatViewInherited).toBe(-180);
  });

  test('a viewer without a seat gets the room exactly as it is stored', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    const table = createWidget({ id: 'table', rotateForViewer: true });

    viewAs(null);
    expect(table.seatViewDelta).toBe(0);
  });
});

describe('facing', function() {
  test('viewer keeps a widget readable while its container turns', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    const table = createWidget({ id: 'table', rotateForViewer: true });
    const label = createWidget({ id: 'label', parent: 'table', facing: 'viewer' });

    viewAs('north');
    expect(label.seatViewDelta).toBe(180);
  });

  test('viewer cancels the turn of every container above it', function() {
    createSeat('north', { player: 'Alice', rotation: 90 });
    createWidget({ id: 'table', rotateForViewer: true });
    createWidget({ id: 'board', parent: 'table', rotation: 45 });
    const label = createWidget({ id: 'label', parent: 'board', facing: 'viewer' });

    viewAs('north');
    // only the per-seat turn is taken back out, the authored rotation of the
    // board is part of the game and stays
    expect(label.seatViewDelta).toBe(90);
  });

  test('owner keeps a widget readable for the seat it belongs to, from every chair', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createSeat('south', { player: 'Bob', index: 2 });
    const table = createWidget({ id: 'table', rotateForViewer: true });
    const mat = createWidget({ id: 'mat', parent: 'table', owner: 'Alice', facing: 'owner' });

    // Alice looks at the turned table: her mat reads upright for her
    viewAs('north');
    expect(mat.seatViewDelta + mat.seatViewInherited).toBe(0);

    // Bob looks at the same mat across the table: upside down, as it should be
    viewAs('south');
    expect(mat.seatViewDelta + mat.seatViewInherited).toBe(180);
  });

  test('a widget is tied to a seat by linkedToSeat as well as by owner', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createSeat('south', { player: 'Bob', index: 2 });
    const mat = createWidget({ id: 'mat', linkedToSeat: 'north', facing: 'owner' });

    viewAs('south');
    expect(mat.seatViewDelta).toBe(180);
  });

  test('a widget that belongs to nobody is left alone', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    const mat = createWidget({ id: 'mat', facing: 'owner' });

    viewAs('north');
    expect(mat.seatViewDelta).toBe(0);
  });
});

// A drag detaches a widget to room level, where nothing above it turns any
// more. It borrows the view of the container it is being dragged in so that it
// keeps looking the way it looked when it was picked up - and, because that
// container turns the table around a point, it has to be moved to where that
// turn puts it as well.
describe('a widget being dragged', function() {
  // A 1000x1000 container at the room origin. jsdom has no DOMMatrix to measure
  // a real transform with, so the two views the frame offset is worked out from
  // are modelled directly: the stored layout, and the same square after the half
  // turn the per-seat view gives it.
  function createContainer(id, properties) {
    const container = createWidget(Object.assign({ id, width: 1000, height: 1000 }, properties));
    container.coordGlobalFromCoordLocal = function(coord, shared = false) {
      if(shared || !this.seatViewDelta)
        return { x: coord.x, y: coord.y };
      return { x: 1000 - coord.x, y: 1000 - coord.y };
    };
    return container;
  }

  function dragOut(id, from, hoverTarget) {
    const widget = widgets.get(id);
    widget.state.parent = null;
    widget.state.dragging = 'Alice';
    widget.state.hoverParent = from;
    if(hoverTarget)
      widget.state.hoverTarget = hoverTarget;
    // a 100x100 widget turns around its centre - jsdom does not lay out, so the
    // transform origin a browser would compute is set explicitly
    widget.domElement.style.transformOrigin = '50px 50px';
    return widget;
  }

  test('keeps the view of the table it was picked up from', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createContainer('table', { rotateForViewer: true });
    createWidget({ id: 'card', parent: 'table' });
    const card = dragOut('card', 'table');

    viewAs('north');
    // the same total turn the table gave it before it was picked up
    expect(card.seatViewRotation()).toBe(-180);
  });

  test('follows the drop target it is held over, so the drop changes nothing', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createContainer('table', { rotateForViewer: true });
    createContainer('sideboard');
    createWidget({ id: 'card', parent: 'table' });
    const card = dragOut('card', 'table', 'sideboard');

    viewAs('north');
    expect(card.seatViewRotation()).toBe(0);
    expect(card.seatViewOffset).toBe(null);
  });

  test('is still kept readable by facing', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createContainer('table', { rotateForViewer: true });
    createWidget({ id: 'card', parent: 'table', facing: 'viewer' });
    const card = dragOut('card', 'table');

    viewAs('north');
    expect(card.seatViewRotation()).toBe(0);
  });

  test('borrows nothing once the drag is over', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createContainer('table', { rotateForViewer: true });
    createWidget({ id: 'card', parent: 'table' });
    const card = dragOut('card', 'table');
    // dropped where no container took it: it is a room level widget now, and
    // every client has to see it the same way
    card.state.dragging = null;

    viewAs('north');
    expect(card.seatViewRotation()).toBe(0);
    expect(card.seatViewOffset).toBe(null);
  });

  test('is drawn on the table point it sits on, not at the shared position', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createSeat('south', { player: 'Bob', index: 2 });
    const table = createContainer('table', { rotateForViewer: true });
    createWidget({ id: 'card', parent: 'table', x: 30, y: 40 });
    const card = dragOut('card', 'table');

    // Alice looks at the table from the far side: the card is drawn where she
    // sees the table point it is being dragged over, not where the shared
    // coordinates would put it on an unturned table
    viewAs('north');
    const rendered = card.seatViewRenderedCoord();
    expect({ x: rendered.x + 50, y: rendered.y + 50 }).toEqual(table.coordGlobalFromCoordLocal({ x: 80, y: 90 }));
    expect(card.cssTransform()).toBe('translate(870px, 860px) rotate(-180deg)');

    // Bob's table is not turned, so for him the two are the same
    viewAs('south');
    expect(card.cssTransform()).toBe('translate(30px, 40px)');
  });

  test('does not move in the shared coordinates while it is dragged', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createContainer('table', { rotateForViewer: true });
    createWidget({ id: 'card', parent: 'table', x: 30, y: 40 });
    const card = dragOut('card', 'table');

    viewAs('north');
    expect(card.get('x')).toBe(30);
    expect(card.get('y')).toBe(40);
    expect(card.cssTransform(true)).toBe('translate(30px, 40px)');
  });

  test('the position a drag measures on screen goes back into the shared one', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createContainer('table', { rotateForViewer: true });
    createWidget({ id: 'card', parent: 'table', x: 30, y: 40 });
    const card = dragOut('card', 'table');

    viewAs('north');
    // what a drag reads out of the DOM is this client's view of the widget, and
    // what it stores has to be the position every client agrees on
    expect(card.seatViewSharedCoord(card.seatViewRenderedCoord())).toEqual({ x: 30, y: 40 });
  });
});

describe('the per-seat view is presentation only', function() {
  test('the stored properties and the shared transform never change', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    const table = createWidget({ id: 'table', x: 100, y: 200, rotation: 10, rotateForViewer: true });

    viewAs('north');
    expect(table.get('rotation')).toBe(10);
    expect(table.get('rotateForViewer')).toBe(true);
    expect(table.cssTransform(true)).toBe('translate(100px, 200px) rotate(10deg)');
    expect(table.cssTransform()).toBe('translate(100px, 200px) rotate(-170deg)');
  });

  test('a rotation stored as a string is passed through untouched', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    const plain = createWidget({ id: 'plain', rotation: '45' });
    const table = createWidget({ id: 'table', rotation: '45', rotateForViewer: true });

    viewAs('north');
    // a widget the per-seat view does not turn renders exactly like before
    expect(plain.cssTransform()).toBe('translate(0px, 0px) rotate(45deg)');
    // and one it does turn is added up as a number instead of concatenated
    expect(table.cssTransform()).toBe('translate(0px, 0px) rotate(-135deg)');
  });
});
