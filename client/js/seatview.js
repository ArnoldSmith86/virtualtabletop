import { asArray } from './domhelpers.js';
import { widgets, widgetFilter } from './serverstate.js';
import { playerName } from './overlays/players.js';

// Per-seat views: one widget, many presentations.
//
// Everything here is a rendering layer on top of the room state. Overrides are
// resolved on every client from synced data, but they are never written back:
// routines, ${PROPERTY ...} reads, undo and saved games always see the plain,
// un-overridden values. Only what a client draws differs.

// The closed whitelist of properties a seat may override. Presentation only -
// anything a routine computes with has to stay out of it.
export const seatViewProperties = [
  'x', 'y', 'rotation', 'scale', 'width', 'height', 'borderRadius', 'css', 'classes', 'display', 'movable', 'clickable'
];

// The keys of seatOverrides that are not seat IDs, in ascending precedence.
export const seatViewKeys = [ 'all', 'others', 'owner', 'noSeat' ];

let seatViewPreview = null;
let seatViewRefreshScheduled = false;
let seatViewGeneration = 0;

// Games that never use the feature must not pay for it, so the refresh is a
// no-op until something in the room actually asks for a per-seat view.
let seatViewUsed = false;

export function seatViewCurrentGeneration() {
  return seatViewGeneration;
}

export function seatViewMarkUsed() {
  seatViewUsed = true;
}

export function getSeatViewPreview() {
  return seatViewPreview;
}

// Client-only "show the table as this seat sees it". Never synced.
export function setSeatViewPreview(seatID) {
  const newPreview = seatID && widgets.has(seatID) ? seatID : null;
  if(newPreview === seatViewPreview)
    return;
  seatViewPreview = newPreview;
  if(seatViewPreview)
    seatViewMarkUsed();
  refreshSeatViews(true);
}

export function scheduleSeatViewRefresh() {
  if(seatViewRefreshScheduled || !seatViewUsed)
    return;
  seatViewRefreshScheduled = true;
  setTimeout(function() {
    seatViewRefreshScheduled = false;
    refreshSeatViews();
  }, 0);
}

// Two passes: every widget resolves its own overrides first because
// counter-rotation needs the resolved values of all its ancestors.
export function refreshSeatViews(force = false) {
  if(!seatViewUsed && !force)
    return;
  ++seatViewGeneration;
  for(const [ id, widget ] of widgets)
    widget.computeSeatView();
  for(const [ id, widget ] of widgets)
    widget.applySeatView(force);
}

// The seat this client is looking through: the previewed one in the editor,
// otherwise the seat the local player occupies. Null for spectators, which is
// what makes the un-overridden layout the defined fallback view.
function seatViewSeat() {
  if(seatViewPreview && widgets.has(seatViewPreview))
    return widgets.get(seatViewPreview);
  return orderedSeats().filter(w=>w.get('player') != '' && w.get('player') == playerName)[0] || null;
}

// The identity all per-player visibility (owner, onlyVisibleForSeat,
// linkedToSeat) is judged against. Only reading uses it - everything that
// writes state keeps using playerName, so a preview can never change the game.
export function viewingPlayerName() {
  if(seatViewPreview && widgets.has(seatViewPreview))
    return widgets.get(seatViewPreview).get('player');
  return playerName;
}

// How far content has to be turned to read upright for someone in this seat.
// Defaults to the seat widget's own rotation, which designers already set to
// point a seat at its side of the table.
function seatViewRotation(seat) {
  if(!seat)
    return 0;
  const viewRotation = seat.get('viewRotation');
  return typeof viewRotation == 'number' ? viewRotation : seat.get('rotation');
}

function orderedSeats() {
  return widgetFilter(w=>w.get('type') == 'seat').sort((a,b)=>a.get('index') - b.get('index') || String(a.get('id')).localeCompare(String(b.get('id'))));
}

// The seats a widget belongs to: its owner players' seats plus the seats it is
// explicitly tied to. This is what "owner" means for facing and seatOverrides.
function seatViewOwnerSeats(widget) {
  const owners = asArray(widget.get('owner'));
  const seatIDs = asArray(widget.get('linkedToSeat')).concat(asArray(widget.get('onlyVisibleForSeat')));
  return orderedSeats().filter(w=>seatIDs.indexOf(w.get('id')) != -1 || w.get('player') != '' && owners.indexOf(w.get('player')) != -1);
}

// Which seatOverrides keys apply to this viewer, in ascending precedence.
function matchingOverrideKeys(widget, viewerSeat) {
  if(!viewerSeat)
    return [ 'noSeat' ];

  const keys = [ 'all' ];
  const ownerSeats = seatViewOwnerSeats(widget);
  const isOwner = ownerSeats.indexOf(viewerSeat) != -1;
  if(!isOwner)
    keys.push('others');

  // "+1" matches the viewer sitting one seat after the owner in index order,
  // "-1" one seat before - the "this belongs to my neighbour" case.
  const order = orderedSeats();
  const viewerPosition = order.indexOf(viewerSeat);
  for(const ownerSeat of ownerSeats) {
    const ownerPosition = order.indexOf(ownerSeat);
    if(ownerPosition == -1 || viewerPosition == -1)
      continue;
    let offset = viewerPosition - ownerPosition;
    if(offset * 2 > order.length)
      offset -= order.length;
    if(offset * 2 < -order.length)
      offset += order.length;
    if(offset)
      keys.push(offset > 0 ? '+' + offset : String(offset));
  }

  if(isOwner)
    keys.push('owner');
  keys.push(String(viewerSeat.get('id')));
  return keys;
}

function applyOverride(target, override) {
  if(!override || typeof override != 'object' || Array.isArray(override))
    return;
  for(const property of seatViewProperties)
    if(override[property] !== undefined)
      target[property] = override[property];
}

// Seat-side viewOverrides are the broad strokes ("player 2's whole layout is
// mirrored"), widget-side seatOverrides refine them ("but this card faces its
// owner"), so the widget always has the final say about itself.
export function resolveSeatOverrides(widget) {
  const result = {};
  const viewerSeat = seatViewSeat();

  if(viewerSeat) {
    const viewOverrides = viewerSeat.get('viewOverrides');
    if(viewOverrides && typeof viewOverrides == 'object')
      applyOverride(result, viewOverrides[widget.get('id')]);
  }

  const seatOverrides = widget.get('seatOverrides');
  if(seatOverrides && typeof seatOverrides == 'object')
    for(const key of matchingOverrideKeys(widget, viewerSeat))
      applyOverride(result, seatOverrides[key]);

  return result;
}

// Layer 1: turn a widget so it reads upright from the chair it is meant for.
export function facingRotation(widget) {
  const facing = widget.get('facing');
  if(facing != 'owner' && facing != 'viewer')
    return 0;

  const viewerSeat = seatViewSeat();
  if(!viewerSeat)
    return 0;
  if(facing == 'owner' && seatViewOwnerSeats(widget).indexOf(viewerSeat) == -1)
    return 0;

  return -seatViewRotation(viewerSeat);
}
