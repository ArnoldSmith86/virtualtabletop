import { addWidget, widgets, widgetFilter } from '../../client/js/serverstate.js';
import { isSeatViewRotationDelta, refreshSeatViews, scheduleSeatViewRefresh, seatsChanged, setSeatViewPreview } from '../../client/js/seatview.js';
import { Widget } from '../../client/js/widgets/widget.js';
import { asArray, setText } from '../../client/js/domhelpers.js';
import { createWidget, removeWidget } from './client-util.js';

// seat.js and holder.js rely on the concatenated global scope of the shipped
// bundle rather than on imports, so expose the identifiers they reference before
// importing them.
let Seat, Holder;
beforeAll(async function() {
  globalThis.Widget = Widget;
  globalThis.widgets = widgets;
  globalThis.widgetFilter = widgetFilter;
  globalThis.asArray = asArray;
  globalThis.setText = setText;
  globalThis.scheduleSeatViewRefresh = scheduleSeatViewRefresh;
  globalThis.isSeatViewRotationDelta = isSeatViewRotationDelta;
  globalThis.seatsChanged = seatsChanged;
  globalThis.viewingPlayerName = _=>'jestPlayer';
  globalThis.playerName = 'jestPlayer';
  globalThis.legacyMode = _=>false;
  globalThis.compareDropTarget = _=>true;
  globalThis.mapAssetURLs = url=>url;
  globalThis.tracingEnabled = false;
  ({ Seat } = await import('../../client/js/widgets/seat.js'));
  ({ ImageWidget: globalThis.ImageWidget } = await import('../../client/js/widgets/imagewidget.js'));
  ({ Holder } = await import('../../client/js/widgets/holder.js'));
});

function createSeat(id, properties) {
  const definition = Object.assign({ id, type: 'seat', player: '', index: 1 }, properties);
  const seat = new Seat(id);
  addWidget(definition, seat);
  return seat;
}

// a seat change refreshes the view at the end of the tick, not right away
function settle() {
  return new Promise(resolve=>setTimeout(resolve, 0));
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

  test('the seat viewRotation wins over its rotation', function() {
    createSeat('east', { player: 'Alice', rotation: 180, viewRotation: 90 });
    const table = createWidget({ id: 'table', rotateForViewer: true });

    viewAs('east');
    expect(table.seatViewDelta).toBe(-90);
  });

  test('turns by any angle, not only by quarter turns', function() {
    // a six player board has to come round by sixths
    createSeat('third', { player: 'Alice', rotation: 120 });
    const table = createWidget({ id: 'table', rotateForViewer: true });

    viewAs('third');
    expect(table.seatViewDelta).toBe(-120);
    expect(table.cssTransform()).toBe('translate(0px, 0px) rotate(-120deg)');
  });

  test('can read the angle from another seat property', function() {
    createSeat('north', { player: 'Alice', rotation: 180, sideRotation: 90 });
    const table = createWidget({ id: 'table', rotateForViewer: 'sideRotation' });

    viewAs('north');
    expect(table.seatViewDelta).toBe(-90);
  });

  test('follows a change to that custom property', async function() {
    const seat = createSeat('north', { player: 'Alice', rotation: 0, sideRotation: 90 });
    const table = createWidget({ id: 'table', rotateForViewer: 'sideRotation' });

    viewAs('north');
    expect(table.seatViewDelta).toBe(-90);
    await settle(); // the sweep building the room scheduled

    // the refresh is scheduled for the end of the tick, the way every other
    // seat change is, so the whole room is swept once instead of per property
    seat.applyDelta({ sideRotation: 180 });
    await settle();
    expect(table.seatViewDelta).toBe(-180);
  });

  test('a turning container inside another one turns once, not twice', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    const table = createWidget({ id: 'table', rotateForViewer: true });
    const area = createWidget({ id: 'area', parent: 'table', rotateForViewer: true });

    viewAs('north');
    // the property says where the viewer's side of it has to end up, which is
    // the same place at every depth
    expect(table.seatViewDelta + table.seatViewInherited).toBe(-180);
    expect(area.seatViewDelta + area.seatViewInherited).toBe(-180);
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

  test('owner is measured against the same seat property its container turns by', function() {
    createSeat('north', { player: 'Alice', rotation: 0, sideRotation: 180 });
    createSeat('south', { player: 'Bob', index: 2, rotation: 0, sideRotation: 0 });
    createWidget({ id: 'table', rotateForViewer: 'sideRotation' });
    const mat = createWidget({ id: 'mat', parent: 'table', owner: 'Alice', facing: 'owner' });

    viewAs('north');
    expect(mat.seatViewDelta + mat.seatViewInherited).toBe(0);

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

  test('applies to the contents of a container that turns for the viewer, not to the container', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    const table = createWidget({ id: 'table', rotateForViewer: true, facing: 'viewer' });
    const piece = createWidget({ id: 'piece', parent: 'table' });

    viewAs('north');
    // the table still turns, which is what rotateForViewer is there for
    expect(table.seatViewDelta).toBe(-180);
    // and the piece on it reads upright without a property of its own
    expect(piece.seatViewDelta + piece.seatViewInherited).toBe(0);
  });

  test('reaches every depth of the subtree', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createWidget({ id: 'table', rotateForViewer: true, facing: 'viewer' });
    createWidget({ id: 'captures', parent: 'table' });
    const piece = createWidget({ id: 'piece', parent: 'captures' });

    viewAs('north');
    expect(piece.seatViewDelta + piece.seatViewInherited).toBe(0);
  });

  test('table turns a widget with the table again inside a readable subtree', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createWidget({ id: 'table', rotateForViewer: true, facing: 'viewer' });
    const arrow = createWidget({ id: 'arrow', parent: 'table', facing: 'table' });
    const inArrow = createWidget({ id: 'inArrow', parent: 'arrow' });

    viewAs('north');
    expect(arrow.seatViewDelta + arrow.seatViewInherited).toBe(-180);
    // and what is inside it turns with it rather than falling back to readable
    expect(inArrow.seatViewDelta + inArrow.seatViewInherited).toBe(-180);
  });

  test('a widget states its own facing over the one it inherits', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createSeat('south', { player: 'Bob', index: 2 });
    createWidget({ id: 'table', rotateForViewer: true, facing: 'viewer' });
    const mat = createWidget({ id: 'mat', parent: 'table', owner: 'Bob', facing: 'owner' });

    viewAs('north');
    // Bob's chair is where the mat reads for, half a turn from Alice's
    expect(mat.seatViewDelta + mat.seatViewInherited).toBe(-180);
  });

  test('owner is inherited together with the seat the area belongs to', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createSeat('south', { player: 'Bob', index: 2 });
    createWidget({ id: 'table', rotateForViewer: true });
    createWidget({ id: 'area', parent: 'table', owner: 'Bob', facing: 'owner' });
    // the card belongs to nobody, but the area it lies in does
    const card = createWidget({ id: 'card', parent: 'area' });

    viewAs('north');
    expect(card.seatViewDelta + card.seatViewInherited).toBe(-180);

    viewAs('south');
    expect(card.seatViewDelta + card.seatViewInherited).toBe(0);
  });

  test('a widget inside a container that turns for the viewer is not turned twice by rotateForViewer of its own', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createWidget({ id: 'table', rotateForViewer: true, facing: 'viewer' });
    // rotateForViewer says where the viewer's side of this widget has to end up,
    // so it wins over the readable subtree it is in
    const area = createWidget({ id: 'area', parent: 'table', rotateForViewer: true });

    viewAs('north');
    expect(area.seatViewDelta + area.seatViewInherited).toBe(-180);
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

  test('is still kept readable by the facing of the table it came from', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createContainer('table', { rotateForViewer: true, facing: 'viewer' });
    createWidget({ id: 'card', parent: 'table' });
    const card = dragOut('card', 'table');

    viewAs('north');
    // it travels across the table it is held over, but it stays readable
    expect(card.seatViewRotation()).toBe(0);
    expect(card.seatViewOffset).not.toBe(null);
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

// Where in a hand a dropped card goes is worked out from the position the drop
// wrote, and that position was measured on the screen of the player dropping it.
// Inside a container that turns for the viewing player the same spot on the
// table is a different number on every screen, so the holder has to take the
// drop back through its own frame instead of subtracting its position - or two
// players dropping a card on the same spot would put it in two different places
// in the hand, for everybody.
describe('a drop into a holder that stacks its children', function() {
  // jsdom has no DOMMatrix to measure a real transform with, so the holder's
  // frame is modelled directly: it sits at (100, 800) of a 1000x1000 table, and
  // the per-seat view turns that table by a half turn around its centre.
  function createHand(id, properties) {
    const hand = new Holder(id);
    addWidget(Object.assign({ id, type: 'holder', alignChildren: true, stackOffsetX: 30 }, properties), hand);
    hand.coordLocalFromCoordGlobal = function(coord) {
      const table = widgets.get(this.get('parent'));
      const inTable = table.seatViewDelta ? { x: 1000 - coord.x, y: 1000 - coord.y } : coord;
      return { x: inTable.x - 100, y: inTable.y - 800 };
    };
    // what a browser reports for the holder's own position, which is the same on
    // every client because the per-seat view is never written back
    hand.absoluteCoord = coord=>({ x: 100, y: 800 })[coord];
    return hand;
  }

  test('lands in the same place in the stack whichever seat dropped it', async function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createSeat('south', { player: 'Bob', index: 2 });
    createWidget({ id: 'table', width: 1000, height: 1000, rotateForViewer: true });
    const hand = createHand('hand', { parent: 'table' });
    const card = createWidget({ id: 'card', type: 'card' });

    const dropped = [];
    hand.receiveCard = (c, pos)=>dropped.push(pos);

    // Bob's table is not turned, so he drops the card where it is stored
    viewAs('south');
    card.state.x = 300;
    card.state.y = 850;
    await hand.onChildAddAlign(card, null);

    // Alice looks at the same table point from the far side of the table
    viewAs('north');
    card.state.x = 700;
    card.state.y = 150;
    await hand.onChildAddAlign(card, null);

    expect(dropped[0]).toEqual([ 200, 50 ]);
    expect(dropped[1]).toEqual(dropped[0]);
  });
});

// The six cups of the Chinese checkers board they were asked for: a round board
// in the middle that turns for the viewing player, and beside it a column of
// cups on the left and one on the right that must not turn, because turning them
// would throw them out of the layout.
describe('cycleForViewer', function() {
  const seating = [
    { color: 'blue',   angle: 0,   x: 0,   y: 600 },
    { color: 'black',  angle: 60,  x: 0,   y: 300 },
    { color: 'red',    angle: 120, x: 0,   y: 0   },
    { color: 'yellow', angle: 180, x: 500, y: 0   },
    { color: 'white',  angle: 240, x: 500, y: 300 },
    { color: 'green',  angle: 300, x: 500, y: 600 }
  ];

  function createBoard(cupProperties = {}) {
    const cups = {};
    seating.forEach(function(seat, index) {
      createSeat(seat.color, { player: seat.color, index: index + 1, rotation: seat.angle });
      cups[seat.color] = createWidget(Object.assign({
        id: `cup-${seat.color}`, x: seat.x, y: seat.y, owner: seat.color, cycleForViewer: 'cups'
      }, cupProperties));
    });
    return cups;
  }

  // which of the six places each cup is drawn at, by the colour that owns it
  function placesFor(seatID, cups) {
    viewAs(seatID);
    const places = {};
    for(const seat of seating) {
      const rendered = cups[seat.color].seatViewRenderedCoord();
      places[seat.color] = (seating.filter(s=>s.x == rendered.x && s.y == rendered.y)[0] || {}).color;
    }
    return places;
  }

  test('the stored layout is what the seat at the bottom of it sees', function() {
    const cups = createBoard();

    expect(placesFor('blue', cups)).toEqual({ blue: 'blue', black: 'black', red: 'red', yellow: 'yellow', white: 'white', green: 'green' });
    for(const seat of seating)
      expect(cups[seat.color].seatViewOffset).toBe(null);
  });

  test('every player finds their own one where the layout starts, in the same order', function() {
    const cups = createBoard();

    // Red sees their own cup in the lower left, Yellow at 9 o'clock, White above
    // that: the same six cups, still going round the table the same way
    expect(placesFor('red', cups)).toEqual({ red: 'blue', yellow: 'black', white: 'red', green: 'yellow', blue: 'white', black: 'green' });
    expect(cups.red.seatViewRenderedCoord()).toEqual({ x: 0, y: 600 });
    expect(cups.red.cssTransform()).toBe('translate(0px, 600px)');

    expect(placesFor('white', cups)).toEqual({ white: 'blue', green: 'black', blue: 'red', black: 'yellow', red: 'white', yellow: 'green' });
  });

  test('goes round in the order the seats sit, not in the order of their index', function() {
    const cups = createBoard();
    // the turn order says nothing about which chair is next to which
    for(const seat of seating)
      widgets.get(seat.color).applyDelta({ index: 100 - seating.indexOf(seat) });

    expect(placesFor('red', cups)).toEqual({ red: 'blue', yellow: 'black', white: 'red', green: 'yellow', blue: 'white', black: 'green' });
  });

  test('a viewer without a seat gets the layout as it is stored', function() {
    const cups = createBoard();

    viewAs(null);
    for(const seat of seating)
      expect(cups[seat.color].seatViewOffset).toBe(null);
  });

  test('a seat with nothing in the group moves nothing', function() {
    const cups = createBoard();
    createSeat('spectator', { player: 'Mallory', index: 7, rotation: 30 });

    viewAs('spectator');
    for(const seat of seating)
      expect(cups[seat.color].seatViewOffset).toBe(null);
  });

  test('a widget that belongs to no seat stays out of the group', function() {
    const cups = createBoard();
    const spare = createWidget({ id: 'spare', x: 900, y: 900, cycleForViewer: 'cups' });

    viewAs('red');
    expect(spare.seatViewOffset).toBe(null);
    expect(cups.red.seatViewRenderedCoord()).toEqual({ x: 0, y: 600 });
  });

  test('groups are kept apart by name, and a seat is its own member', function() {
    const cups = createBoard();
    for(const seat of seating)
      widgets.get(seat.color).applyDelta({ x: seat.x - 60, y: seat.y - 60, cycleForViewer: 'seats' });

    viewAs('red');
    // the seat plate travels to the place of the blue one, its cup to the place
    // of the blue cup - the two groups never mix
    expect(widgets.get('red').seatViewRenderedCoord()).toEqual({ x: -60, y: 540 });
    expect(cups.red.seatViewRenderedCoord()).toEqual({ x: 0, y: 600 });
  });

  test('what is inside a cup rides along instead of swapping a second time', function() {
    const cups = createBoard();
    const marble = createWidget({ id: 'marble', parent: 'cup-red', x: 5, y: 5, cycleForViewer: 'cups' });

    viewAs('red');
    // it belongs to no seat of its own, so the cup's swap is all it gets - and
    // that one it gets through the DOM, like every other child
    expect(marble.seatViewOffset).toBe(null);
    expect(cups.red.seatViewOffset).toEqual({ x: 0, y: 600 });
  });

  test('a cup that is being dragged is drawn where it really is', function() {
    const cups = createBoard();

    viewAs('red');
    expect(cups.red.seatViewOffset).not.toBe(null);

    cups.red.state.dragging = 'Alice';
    viewAs('red');
    expect(cups.red.seatViewOffset).toBe(null);
  });

  test('swapping is presentation only', function() {
    const cups = createBoard();

    viewAs('red');
    expect(cups.red.get('x')).toBe(0);
    expect(cups.red.get('y')).toBe(0);
    expect(cups.red.cssTransform(true)).toBe('translate(0px, 0px)');
    // and what a drag measures on screen goes back into the shared position
    expect(cups.red.seatViewSharedCoord(cups.red.seatViewRenderedCoord())).toEqual({ x: 0, y: 0 });
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
