import { widgets } from '../../client/js/serverstate.js';
import { refreshSeatViews, resolveSeatOverrides, setSeatViewPreview, viewingPlayerName } from '../../client/js/seatview.js';
import { createWidget, removeWidget } from './client-util.js';

function createSeat(id, properties) {
  return createWidget(Object.assign({ id, type: 'seat', player: '', index: 1 }, properties));
}

function refreshAs(seatID) {
  setSeatViewPreview(seatID);
  refreshSeatViews(true);
}

afterEach(function() {
  setSeatViewPreview(null);
  for(const id of Array.from(widgets.keys()))
    removeWidget(id);
});

describe('seatOverrides', function() {
  test('owner and others select different presentations', function() {
    createSeat('north', { player: 'Alice' });
    createSeat('south', { player: 'Bob', index: 2 });
    const board = createWidget({
      id: 'board',
      owner: 'Alice',
      x: 100,
      seatOverrides: { owner: { scale: 1 }, others: { scale: 0.4, x: 900 } }
    });

    refreshAs('north');
    expect(board.getView('scale')).toBe(1);
    expect(board.getView('x')).toBe(100);

    refreshAs('south');
    expect(board.getView('scale')).toBe(0.4);
    expect(board.getView('x')).toBe(900);
  });

  test('a widget is tied to a seat by linkedToSeat as well as by owner', function() {
    createSeat('north', { player: 'Alice' });
    createSeat('south', { player: 'Bob', index: 2 });
    const mat = createWidget({ id: 'mat', linkedToSeat: 'north', seatOverrides: { owner: { scale: 2 } } });

    refreshAs('north');
    expect(mat.getView('scale')).toBe(2);
    refreshAs('south');
    expect(mat.getView('scale')).toBe(1);
  });

  test('an exact seat id beats the generic keys', function() {
    createSeat('north', { player: 'Alice' });
    createSeat('south', { player: 'Bob', index: 2 });
    const board = createWidget({ id: 'board', seatOverrides: { all: { scale: 0.5 }, south: { scale: 3 } } });

    refreshAs('north');
    expect(board.getView('scale')).toBe(0.5);
    refreshAs('south');
    expect(board.getView('scale')).toBe(3);
  });

  test('seat offsets match the viewer sitting next to the owner', function() {
    createSeat('s1', { player: 'Alice', index: 1 });
    createSeat('s2', { player: 'Bob', index: 2 });
    createSeat('s3', { player: 'Carol', index: 3 });
    const mat = createWidget({ id: 'mat', owner: 'Alice', seatOverrides: { '+1': { scale: 2 }, '-1': { scale: 3 } } });

    refreshAs('s2');
    expect(mat.getView('scale')).toBe(2);
    refreshAs('s3');
    expect(mat.getView('scale')).toBe(3); // wraps around: s3 sits one before s1
  });

  test('a viewer without a seat gets the plain layout unless noSeat says otherwise', function() {
    createSeat('north', { player: 'Alice' });
    const board = createWidget({ id: 'board', scale: 1, seatOverrides: { all: { scale: 0.5 } } });
    const hint = createWidget({ id: 'hint', seatOverrides: { all: { scale: 0.5 }, noSeat: { display: false } } });

    refreshAs(null);
    expect(board.getView('scale')).toBe(1);
    expect(hint.getView('display')).toBe(false);
  });

  test('only whitelisted properties are taken from an override', function() {
    createSeat('north', { player: 'Alice' });
    const board = createWidget({ id: 'board', owner: 'Alice', seatOverrides: { owner: { scale: 2, clickRoutine: [], owner: 'Bob' } } });

    refreshAs('north');
    expect(resolveSeatOverrides(board)).toEqual({ scale: 2 });
    expect(board.get('owner')).toBe('Alice');
  });

  test('seat side viewOverrides apply, widget side wins over them', function() {
    createSeat('north', { player: 'Alice', viewOverrides: { board: { scale: 0.5, x: 20 } } });
    const board = createWidget({ id: 'board', seatOverrides: { all: { scale: 2 } } });

    refreshAs('north');
    expect(board.getView('scale')).toBe(2);
    expect(board.getView('x')).toBe(20);
  });

  test('an override never changes what get() returns', function() {
    createSeat('north', { player: 'Alice' });
    const board = createWidget({ id: 'board', x: 10, scale: 1, seatOverrides: { all: { x: 500, scale: 0.25 } } });

    refreshAs('north');
    expect(board.getView('x')).toBe(500);
    expect(board.get('x')).toBe(10);
    expect(board.get('scale')).toBe(1);
    expect(board.state.x).toBe(10);
  });

  test('a widget drawn somewhere else for this client cannot be dragged', function() {
    createSeat('north', { player: 'Alice' });
    const moved = createWidget({ id: 'moved', seatOverrides: { all: { x: 500 } } });
    const resized = createWidget({ id: 'resized', seatOverrides: { all: { scale: 0.5 } } });

    refreshAs('north');
    expect(moved.getView('movable')).toBe(false);
    expect(moved.get('movable')).toBe(true);
    expect(resized.getView('movable')).toBe(true);
  });
});

describe('facing', function() {
  test('facing owner turns the widget upright for its owner only', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createSeat('south', { player: 'Bob', index: 2 });
    const mat = createWidget({ id: 'mat', owner: 'Alice', rotation: 180, facing: 'owner' });

    refreshAs('north');
    expect(mat.seatViewRotationDelta).toBe(-180);
    refreshAs('south');
    expect(mat.seatViewRotationDelta).toBe(0);
  });

  test('facing viewer turns the widget upright for everyone who is seated', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createSeat('south', { player: 'Bob', index: 2, rotation: 90 });
    const board = createWidget({ id: 'board', facing: 'viewer' });

    refreshAs('north');
    expect(board.seatViewRotationDelta).toBe(-180);
    refreshAs('south');
    expect(board.seatViewRotationDelta).toBe(-90);
    refreshAs(null);
    expect(board.seatViewRotationDelta).toBe(0);
  });

  test('viewRotation overrides the seat widget rotation', function() {
    createSeat('north', { player: 'Alice', rotation: 180, viewRotation: 45 });
    const board = createWidget({ id: 'board', facing: 'viewer' });

    refreshAs('north');
    expect(board.seatViewRotationDelta).toBe(-45);
  });
});

describe('counter-rotation', function() {
  test('children keep their orientation when a parent is rotated per seat', function() {
    createSeat('north', { player: 'Alice' });
    const board = createWidget({ id: 'board', seatOverrides: { all: { rotation: 180 } } });
    const label = createWidget({ id: 'label', parent: 'board' });
    const grandchild = createWidget({ id: 'grandchild', parent: 'label' });

    refreshAs('north');
    expect(board.getView('rotation')).toBe(180);
    expect(board.seatViewRotationDelta).toBe(0);
    expect(label.seatViewRotationDelta).toBe(-180);
    expect(grandchild.seatViewRotationDelta).toBe(0);
  });

  test('counterRotate false lets a child turn with its parent', function() {
    createSeat('north', { player: 'Alice' });
    createWidget({ id: 'board', seatOverrides: { all: { rotation: 180 } } });
    const piece = createWidget({ id: 'piece', parent: 'board', counterRotate: false });

    refreshAs('north');
    expect(piece.seatViewRotationDelta).toBe(0);
  });

  test('facing does not make children counter-rotate', function() {
    createSeat('north', { player: 'Alice', rotation: 180 });
    createWidget({ id: 'mat', owner: 'Alice', facing: 'owner' });
    const label = createWidget({ id: 'label', parent: 'mat' });

    refreshAs('north');
    expect(label.seatViewRotationDelta).toBe(0);
  });
});

describe('preview as seat', function() {
  test('the previewed seat becomes the identity used for visibility', function() {
    createSeat('north', { player: 'Alice' });
    const secret = createWidget({ id: 'secret', owner: 'Alice' });

    refreshAs('north');
    expect(viewingPlayerName()).toBe('Alice');
    expect(secret.classes()).not.toMatch(/foreign/);

    refreshAs(null);
    expect(secret.classes()).toMatch(/foreign/);
  });
});
