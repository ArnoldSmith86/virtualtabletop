let currentOverlayId = null;
export function setCurrentOverlayId(id) { currentOverlayId = id; }
export function getCurrentOverlayId() { return currentOverlayId; }
export function getEditMode() { return document.body.classList.contains('edit'); }
