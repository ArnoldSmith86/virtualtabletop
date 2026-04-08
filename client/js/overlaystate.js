let currentOverlayId = null;
let currentStateView = { stateID: null, stateName: null };
export function setCurrentOverlayId(id) { currentOverlayId = id; }
export function getCurrentOverlayId() { return currentOverlayId; }
export function setCurrentStateView(stateID, stateName) { currentStateView = { stateID: stateID || null, stateName: stateName || null }; }
export function getCurrentStateView() { return currentStateView; }
export function getEditMode() { return document.body.classList.contains('edit'); }
