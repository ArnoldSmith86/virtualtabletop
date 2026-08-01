import { asArray } from './domhelpers.js';
import { widgets, widgetFilter } from './serverstate.js';
import { playerName } from './overlays/players.js';

// Per-seat views: one room, one set of widgets, but every player looks at the
// table from their own chair.
//
// A container with rotateForViewer is turned by the viewing player's seat
// rotation, so the side of the table that belongs to them ends up in front of
// them: in chess both players move up the screen, in a trick taking game
// everybody sits at the bottom and looks across the table. Widgets with facing
// take that turn back out of their own content so text and art stay readable.
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

export function seatViewGeneration() {
  return generation;
}

export function seatViewMarkUsed() {
  inUse = true;
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
  inUse = true;
  refreshSeatViews(true);
  // per player visibility is judged against the previewed seat, so everything
  // that hides a widget from somebody has to be re-evaluated
  for(const [ id, widget ] of widgets)
    widget.updateOwner();
}

export function scheduleSeatViewRefresh() {
  if(refreshScheduled || !inUse)
    return;
  refreshScheduled = true;
  setTimeout(function() {
    refreshScheduled = false;
    refreshSeatViews();
  }, 0);
}

export function refreshSeatViews(force = false) {
  if(!inUse && !force)
    return;
  ++generation;
  for(const [ id, widget ] of widgets)
    widget.applySeatView();
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
  if(seatViewPreview && widgets.has(seatViewPreview))
    return widgets.get(seatViewPreview);
  return orderedSeats().filter(w=>w.get('player') != '' && w.get('player') == playerName)[0] || null;
}

function orderedSeats() {
  return widgetFilter(w=>w.get('type') == 'seat').sort((a,b)=>a.get('index') - b.get('index') || String(a.get('id')).localeCompare(String(b.get('id'))));
}

// How far the table has to be turned so that this seat's side of it ends up in
// front of the player sitting there. Defaults to the seat widget's own rotation,
// which designers already set to point a seat at its side of the table.
export function seatRotation(seat, property = 'viewRotation') {
  if(!seat)
    return 0;
  const value = seat.get(property);
  const rotation = typeof value == 'number' ? value : seat.get('rotation');
  return Math.round((rotation || 0) / rotationStep) * rotationStep;
}

export function viewingSeatRotation(property = 'viewRotation') {
  return seatRotation(viewingSeat(), property);
}

// The seat a widget belongs to: the seat of one of its owners, or a seat it is
// explicitly tied to. Null when it belongs to nobody in particular.
export function ownerSeat(widget) {
  const owners = asArray(widget.get('owner'));
  const seatIDs = asArray(widget.get('linkedToSeat')).concat(asArray(widget.get('onlyVisibleForSeat')));
  return orderedSeats().filter(w=>seatIDs.indexOf(w.get('id')) != -1 || w.get('player') != '' && owners.indexOf(w.get('player')) != -1)[0] || null;
}
