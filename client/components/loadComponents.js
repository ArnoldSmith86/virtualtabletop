import { baseEditOverlay } from './baseEditOverlay.js'
import { deckEditor } from './deckEditor.js';

export function loadComponents(app) {
    app.component('base-edit-overlay', baseEditOverlay);
    app.component('deck-editor', deckEditor);
}