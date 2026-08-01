import { asArray } from './domhelpers.js';
import { widgets, widgetFilter } from './serverstate.js';
import { playerName } from './overlays/players.js';

// Per-seat views: one room, one set of widgets, but every player looks at the
// table from their own chair.
//
// A container with rotateForViewer is turned by the viewing player's seat
// rotation, so the side of the table that belongs to them ends up in front of
// them: in chess both players move up the screen, in a trick taking game
// everybody sits at the bottom and looks across the table. facing takes that
// turn back out of the content so text and art stay readable - a widget's
// content being everything inside it, so facing on the play area covers the
// pieces on it and facing: 'table' on one of them opts it back out.
//
// All of this is a rendering layer. Nothing here is ever written back: x, y,
// rotation, parent and every other property stay as they are in the room state,
// so routines, ${PROPERTY ...}, undo and saved games see identical values on
// every client.

// Only whole quarter turns: a square area rotated by 90 degrees still fits its
// own footprint, so the surrounding layout never has to reflow.
const rotationStep = 90;

let seatViewPreview = null;
let refreshScheduled = false;
let generation = 0;

// Games that never use the feature must not pay for it, so a refresh is a no-op
// until some widget in the room actually asks for a per-seat view.
let inUse = false;

// The seats, the seat this client looks through and its rotation cannot change
// while a single sweep runs, so they are computed once per sweep instead of once
// per widget - a 1000 widget room would otherwise sort the seat list 1000 times.
let sweepCache = null;

// Which seat properties the view is read from. rotateForViewer may name any
// property of a seat, so this is only known once one has actually been read -
// every sweep records the names it used, and a change to one of them has to
// refresh the view just like a change to viewRotation does.
let rotationProperties = new Set([ 'viewRotation' ]);

// The editor's seat list has to be rebuilt when somebody sits down while it is
// open, which nothing else in the client would notice.
let seatsChangedCallback = null;

export function seatViewGeneration() {
  return generation;
}

export function seatViewMarkUsed() {
  inUse = true;
}

// A different room, a different game: nothing of the old one may leak into it,
// least of all the sweep that only games using the feature should pay for.
export function resetSeatViews() {
  seatViewPreview = null;
  inUse = false;
  sweepCache = null;
  rotationProperties = new Set([ 'viewRotation' ]);
  seatsChanged();
}

// Does a change to these seat properties change what this client sees?
export function isSeatViewRotationDelta(delta) {
  for(const key in delta)
    if(rotationProperties.has(key))
      return true;
  return false;
}

export function onSeatsChanged(callback) {
  seatsChangedCallback = callback;
}

export function seatsChanged() {
  if(seatsChangedCallback)
    seatsChangedCallback();
}

function perSweep(key, compute) {
  if(!sweepCache)
    return compute();
  if(sweepCache[key] === undefined)
    sweepCache[key] = compute();
  return sweepCache[key];
}

export function getSeatViewPreview() {
  return seatViewPreview;
}

// Client-only "show the table the way that seat sees it" for the editor. Never
// synced, and only ever read - everything that writes state keeps using the real
// player name, so a preview cannot change the game.
export function setSeatViewPreview(seatID) {
  const preview = seatID && widgets.has(seatID) ? seatID : null;
  if(preview === seatViewPreview)
    return;
  seatViewPreview = preview;
  refreshSeatViews(true);
  // per player visibility is judged against the previewed seat, so everything
  // that hides a widget from somebody has to be re-evaluated
  for(const [ id, widget ] of widgets)
    widget.updateOwner();
}

export function scheduleSeatViewRefresh() {
  if(refreshScheduled || !inUse && !seatViewPreview)
    return;
  refreshScheduled = true;
  setTimeout(function() {
    refreshScheduled = false;
    refreshSeatViews();
  }, 0);
}

export function refreshSeatViews(force = false) {
  if(!inUse && !seatViewPreview && !force)
    return;
  ++generation;
  sweepCache = {};
  try {
    for(const [ id, widget ] of widgets)
      widget.applySeatView();
  } finally {
    sweepCache = null;
  }
}

// Dragging is the one thing that changes a single widget's personal view on its
// own: it detaches the widget to room level, where it has to keep looking like
// it is still on the table it came from. Every mouse move measures the widget
// through the DOM to keep the grabbed point under the cursor, so that view has
// to be in place immediately - a sweep one frame later would be one frame of
// wrong measurements, which is a visible jump.
export function refreshSeatViewBranch(widget) {
  if(!inUse && !seatViewPreview)
    return;
  ++generation;
  sweepCache = {};
  try {
    const branch = [ widget ];
    while(branch.length) {
      const current = branch.pop();
      current.applySeatView();
      for(const child of current.childArray)
        branch.push(child);
    }
  } finally {
    sweepCache = null;
  }
}

// The identity per-player visibility (owner, onlyVisibleForSeat, linkedToSeat)
// is judged against while rendering.
export function viewingPlayerName() {
  if(seatViewPreview && widgets.has(seatViewPreview))
    return widgets.get(seatViewPreview).get('player');
  return playerName;
}

// The seat this client is looking through: the previewed one in the editor,
// otherwise the seat the local player occupies. Null for spectators and players
// without a seat, which is what makes the stored layout the fallback view.
export function viewingSeat() {
  return perSweep('viewingSeat', function() {
    if(seatViewPreview && widgets.has(seatViewPreview))
      return widgets.get(seatViewPreview);
    return orderedSeats().filter(w=>w.get('player') != '' && w.get('player') == playerName)[0] || null;
  });
}

function orderedSeats() {
  return perSweep('seats', _=>widgetFilter(w=>w.get('type') == 'seat').sort((a,b)=>a.get('index') - b.get('index') || String(a.get('id')).localeCompare(String(b.get('id')))));
}

// How far the table has to be turned so that this seat's side of it ends up in
// front of the player sitting there. Defaults to the seat widget's own rotation,
// which designers already set to point a seat at its side of the table.
export function seatRotation(seat, property = 'viewRotation') {
  rotationProperties.add(property);
  if(!seat)
    return 0;
  const value = seat.get(property);
  const rotation = value === null || value === undefined || value === '' || isNaN(+value) ? seat.get('rotation') : +value;
  return Math.round((rotation || 0) / rotationStep) * rotationStep;
}

// Quarter turns only, so the sine and cosine come out exact. A drag inverts
// this to work out the position it stores, and floating point dust there would
// end up in the room state on every mouse move.
export function rotateCoord(coord, angle) {
  const quarter = ((Math.round(angle / rotationStep) % 4) + 4) % 4;
  const cos = [ 1, 0, -1, 0 ][quarter];
  const sin = [ 0, 1, 0, -1 ][quarter];
  return { x: coord.x * cos - coord.y * sin, y: coord.x * sin + coord.y * cos };
}

export function viewingSeatRotation(property = 'viewRotation') {
  return perSweep(`viewingSeatRotation-${property}`, _=>seatRotation(viewingSeat(), property));
}

// The seat a widget belongs to: the seat of one of its owners, or a seat it is
// explicitly tied to. Null when it belongs to nobody in particular.
export function ownerSeat(widget) {
  const owners = asArray(widget.get('owner'));
  const seatIDs = asArray(widget.get('linkedToSeat')).concat(asArray(widget.get('onlyVisibleForSeat')));
  return orderedSeats().filter(w=>seatIDs.indexOf(w.get('id')) != -1 || w.get('player') != '' && owners.indexOf(w.get('player')) != -1)[0] || null;
}
