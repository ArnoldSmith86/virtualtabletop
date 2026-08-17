class DeckEditorDragButton extends ToolbarButton {
  async dragStart() {
  }

  async dragMove(dx, dy) {
  }

  async dragEnd() {
  }

  render(target) {
    this.domElement = div(target, 'editorToolbarButton', `
      <button icon=${this.icon}><span>${this.tooltip}</span>
    `);
    this.domElement.onmousedown  = e=>this.pointerDown('mousedown', e);
    this.domElement.ontouchstart = e=>this.pointerDown('touchstart', e);
  }

  async pointerDown(name, e) {
    e.preventDefault();
    e.stopPropagation();
    $('body').classList.add('dragToolbarDragging');

    this.pointerStartCoords = eventCoords(name, e);
    this.toolbarStartRect = this.domElement.parentElement.getBoundingClientRect();

    this.moveHandler = ev=>this.pointerMove(ev.type, ev);
    this.upHandler   = ev=>this.pointerUp(ev.type, ev);
    for(const event of [ 'mousemove', 'touchmove' ])
      document.addEventListener(event, this.moveHandler, { passive: false });
    for(const event of [ 'mouseup', 'touchend', 'touchcancel' ])
      document.addEventListener(event, this.upHandler);

    await deckEditor.flushPendingCommits(); // don't absorb a pending typed edit into the drag's commit
    this.setFeedback(await this.dragStart());
  }

  async pointerMove(name, e) {
    e.preventDefault();
    const coords = eventCoords(name, e);
    const dx = coords.clientX - this.pointerStartCoords.clientX;
    const dy = coords.clientY - this.pointerStartCoords.clientY;

    this.setFeedback(await this.dragMove(dx / deckEditor.cardScale, dy / deckEditor.cardScale));

    const toolbar = this.domElement.parentElement;
    toolbar.style.right = (window.innerWidth - this.toolbarStartRect.right - dx) + 'px';
    toolbar.style.top = (this.toolbarStartRect.top + dy) + 'px';
    deckEditor.constrainDragToolbar();
  }

  async pointerUp(name, e) {
    $('body').classList.remove('dragToolbarDragging');

    for(const event of [ 'mousemove', 'touchmove' ])
      document.removeEventListener(event, this.moveHandler);
    for(const event of [ 'mouseup', 'touchend', 'touchcancel' ])
      document.removeEventListener(event, this.upHandler);

    await this.dragEnd();
    this.setFeedback(null);
  }

  setFeedback(html) {
    $('#deckEditorDragToolbarFeedback').innerHTML = html || '';
    $('#deckEditorDragToolbarFeedback').classList.toggle('active', !!html);
  }
}

class DeckEditorDragDragButton extends DeckEditorDragButton {
  constructor() {
    super('drag_indicator', 'Drag', 'Drag to move this toolbar without doing anything in case it is in the way.');
  }
}

class DeckEditorMoveButton extends DeckEditorDragButton {
  constructor() {
    super('control_camera', 'Move', 'Drag to move the selected face object.');
  }

  async dragStart() {
    this.starts = deckEditor.startPositions();
  }

  async dragMove(dx, dy) {
    for(const start of this.starts) {
      start.object.x = Math.round(start.x + dx);
      start.object.y = Math.round(start.y + dy);
    }
    deckEditor.refreshMainCardFaces();

    // With several objects moving together the feedback follows the primary one - they all move by the same
    // amount, so one pair of coordinates describes the whole drag.
    const object = deckEditor.selectedObjectTemplate();
    return object ? `
      X: <i>${object.x}</i><br>
      Y: <i>${object.y}</i>
    ` : null;
  }

  async dragEnd() {
    await deckEditor.commit('faceTemplates', deckEditor.objectActionCause('moved', this.starts.length));
    deckEditor.renderSidebar();
  }
}

class DeckEditorResizeButton extends DeckEditorDragButton {
  constructor(keepAspectRatio) {
    if(keepAspectRatio)
      super('aspect_ratio', 'Resize (Keep Aspect Ratio)', 'Drag to resize the selected face object. Aspect ratio is kept.');
    else
      super('fit_screen', 'Resize', 'Drag to resize the selected face object.');
    this.keepAspectRatio = keepAspectRatio;
  }

  // Every selected object is resized by the same number of card pixels, each starting from its own size - so a
  // group of objects keeps its size differences instead of being flattened to one size.
  async dragStart() {
    const divs = deckEditor.selectedObjectDivs();
    this.starts = deckEditor.dragObjects().map((object, i)=>{
      const objectDiv = divs[i];
      return {
        object,
        iconSize:    object.type == 'icon' && object.width === undefined,
        startSize:   object.size   !== undefined ? object.size   : (objectDiv ? objectDiv.offsetWidth  : 0),
        startWidth:  object.width  !== undefined ? object.width  : (objectDiv ? objectDiv.offsetWidth  : 0),
        startHeight: object.height !== undefined ? object.height : (objectDiv ? objectDiv.offsetHeight : 0)
      };
    });
  }

  async dragMove(dx, dy) {
    for(const start of this.starts) {
      const object = start.object;
      if(start.iconSize) {
        object.size = Math.max(1, Math.round(start.startSize + Math.max(dx, dy)));
        continue;
      }

      let resizeDx = dx;
      let resizeDy = dy;
      if(this.keepAspectRatio && start.startWidth && start.startHeight) {
        if(resizeDx > resizeDy)
          resizeDy = resizeDx * start.startHeight / start.startWidth;
        else
          resizeDx = resizeDy * start.startWidth / start.startHeight;
      }
      object.width  = Math.max(1, Math.round(start.startWidth  + resizeDx));
      object.height = Math.max(1, Math.round(start.startHeight + resizeDy));
    }
    deckEditor.refreshMainCardFaces();

    const object = deckEditor.selectedObjectTemplate();
    if(!object)
      return null;
    if(object.type == 'icon' && object.width === undefined)
      return `Size: <i>${object.size}</i>`;
    return `
      Width: <i>${object.width}</i><br>
      Height: <i>${object.height}</i>
    `;
  }

  async dragEnd() {
    await deckEditor.commit('faceTemplates', deckEditor.objectActionCause('resized', this.starts.length));
    deckEditor.renderSidebar();
  }
}

class DeckEditorRotateButton extends DeckEditorDragButton {
  constructor() {
    super('settings_backup_restore', 'Rotate', 'Drag to rotate the selected face object.');
  }

  async dragStart() {
    this.starts = deckEditor.dragObjects().map(object=>({ object, rotation: object.rotation || 0 }));
  }

  async dragMove(dx, dy) {
    for(const start of this.starts)
      start.object.rotation = Math.floor(start.rotation + (dx+dy)/2);
    deckEditor.refreshMainCardFaces();

    const object = deckEditor.selectedObjectTemplate();
    return object ? `Rotation: <i>${object.rotation}°</i>` : null;
  }

  async dragEnd() {
    await deckEditor.commit('faceTemplates', deckEditor.objectActionCause('rotated', this.starts.length));
    deckEditor.renderSidebar();
  }
}

class DeckEditor {
  constructor() {
    this.deckID = null;
    this.cardType = null;
    this.face = 0;
    this._selectedObjects = []; // the selected face objects, in click order - see the selectedObject accessor
    this.cardScale = 1;   // effective scale = fitScale * userZoom (drag math divides by this)
    this.fitScale = 1;    // scale that fits the card in the main area
    this.userZoom = 1;    // extra zoom from scroll wheel / pinch
    this.panX = 0;
    this.panY = 0;
    this.commitTimers = {};
    this.faceTemplates = [];
    this.cardTypes = {};
    this.cardDefaults = {};
    this.showAllAreas = false;
    this.expandedDecks = new Set(); // tree branches the user explicitly expanded (beyond the current deck)
    this.expandedFaces = new Set(); // keyed "deckID:faceIndex"
    this.collapsedDecks = new Set(); // branches the user double-click-collapsed (overrides the implicit current)
    this.collapsedFaces = new Set();
    this.activeArea = 'tree'; // which side was interacted with last: 'tree' (left) or 'strip' (card types) - the
                              // active one gets a solid outline, the other's selection a dashed one
    this.addMode = 'static'; // 'static' = same on every card, 'dynamic' = different per card type
    this.deckSymbolSelected = false; // the deck-widget strip entry is selected -> the sidebar edits card defaults
    this.sidebarTab = 'defaults'; // which property scope the right sidebar shows: defaults | cardType | face | object
    this.addSectionOpen = false; // the "+" expander revealing the add-object controls
    this.addSectionHost = 'tree'; // which "+" it is currently attached to: 'tree' (left) or 'sidebar' (Object tab)
    this.roomVisible = false; // "Card view" toggled off: the card stage is a window onto the room's play area
    this.treeObjectPreviews = []; // the tree rows' preview boxes, so they can follow the card (refreshTreePreviews)
    this.treeLevel = 'face'; // which tree level the unified add/copy/delete toolbar acts on: deck | face | object

    // Remember where the user left off per deck (tree node + card type) so leaving and returning restores it,
    // like the JSON editor's per-widget cursor (#2503). lastDeckID is the deck to reopen when the toolbar
    // button carries no selection context; the first ever open of a deck falls back to sensible defaults.
    this.selectionMemory = {};
    this.lastDeckID = null;
    this.suggestSeq = 0; // unique-id counter for the add-property datalists
    // The css rows' editing state (declarations switched off, ones without a value yet, sections switched to
    // text editing, folded sections) - see CssEditor. Not part of the game, so it goes when the editor closes.
    this.cssEditorState = new CssEditorState();

    // Self-contained edit history for the breadcrumb + undo/redo (scoped to the deck editor, rebuilt on open).
    // Each entry is a full snapshot of the working copies; undo/redo re-commit a snapshot through the normal
    // delta path, so they sync and are themselves room-undoable. applyingHistory suppresses recording while
    // a snapshot is being re-applied. See recordHistory()/jumpToHistory().
    this.history = [];
    this.historyIndex = -1;
    this.applyingHistory = false;
    this.maxHistory = 60;
    this.actionSeq = 0;

    this.groupCollapsed = {}; // which sidebar property groups the user folded away, keyed "tab:group"
  }

  // Several face objects can be selected at once (Ctrl/Shift+click), which is what makes editing a property of
  // all of them - or aligning them - possible. The selection lives in _selectedObjects in click order, so its
  // LAST entry is the primary one: the object whose properties headline the sidebar and whose box the drag
  // toolbar hangs off. selectedObject reads exactly that, and assigning to it collapses the selection back to a
  // single object - which is what every structural change (adding, deleting, reordering, restoring a remembered
  // selection, ...) means when it sets one, so all those paths keep working unchanged.
  get selectedObject() {
    return this._selectedObjects.length ? this._selectedObjects[this._selectedObjects.length-1] : null;
  }

  set selectedObject(index) {
    this._selectedObjects = index === null || index === undefined ? [] : [ index ];
  }

  // The selection in the order the objects sit on the face (not the order they were clicked), which is what the
  // sidebar rows, align/distribute and multi-delete want.
  selectedObjectIndices() {
    return [...this._selectedObjects].sort((a,b)=>a-b);
  }

  // The shown face's object array, or an empty one while there is no face (yet).
  faceObjects() {
    const face = this.faceTemplates[this.face];
    return face && Array.isArray(face.objects) ? face.objects : [];
  }

  selectedObjectTemplates() {
    const objects = this.faceObjects();
    return this.selectedObjectIndices().map(index=>objects[index]).filter(object=>object);
  }

  isObjectSelected(index) {
    return this._selectedObjects.indexOf(index) != -1;
  }

  // The objects a drag acts on: the whole selection, falling back to the single object the drag started on.
  dragObjects(fallbackObject) {
    const objects = this.selectedObjectTemplates();
    if(objects.length)
      return objects;
    return fallbackObject ? [ fallbackObject ] : [];
  }

  startPositions(fallbackObject) {
    return this.dragObjects(fallbackObject).map(object=>({ object, x: object.x || 0, y: object.y || 0 }));
  }

  // Causes of the drag/align actions, phrased for one object or for a group so the breadcrumb (and the room's
  // undo history) says which of the two happened.
  objectActionCause(verb, count) {
    return `${getPlayerDetails().playerName} ${verb} ${count > 1 ? `${count} face objects` : 'a face object'} of deck ${this.deckID} in deck editor`;
  }

  addInput(labelText, value, onValueChanged, target) {
    return PropertiesModule.prototype.addInput.call(this, labelText, value, onValueChanged, target);
  }

  deck() {
    return this.deckID !== null && widgets.has(this.deckID) ? widgets.get(this.deckID) : null;
  }

  isOpen() {
    return $('body').classList.contains('deckEditorActive');
  }

  initializeDOM() {
    if(this.dragToolbarButtons)
      return;

    // Editor overlays are normally hosted in #roomArea, which sits below the full-screen deck editor's
    // stacking context. Move these into #editor so opening them from the deck editor is actually visible.
    $('#editor').append($('#deckEditorExportOverlay'));
    $('#editor').append($('#deckEditorImportOverlay'));
    $('#editor').append($('#deckEditorNewDeckOverlay'));
    $('#editor').append($('#symbolPickerOverlay'));
    $('#editor').append($('#audioPickerOverlay'));
    // Move the shared public-library overlay into #editor too, so "Browse the public library" from the deck
    // editor's Add New Deck submenu shows above the editor instead of behind it (it still works normally in
    // plain edit mode - overlays are position:fixed, so the parent only affects stacking).
    $('#editor').append($('#libraryDecksOverlay'));

    this.dragToolbarButtons = [
      new DeckEditorDragDragButton(),
      new DeckEditorResizeButton(false),
      new DeckEditorResizeButton(true),
      new DeckEditorRotateButton(),
      new DeckEditorMoveButton() // "drag to move" last, like the room editor's drag toolbar
    ];
    for(const button of this.dragToolbarButtons)
      button.render($('#deckEditorDragToolbar'));

    $('#deckEditorAddDeck').onclick = _=>this.openNewDeckOverlay();
    $('#deckEditorNewDeckClose').onclick = _=>this.closeNewDeckOverlay();
    for(const radio of $a('#deckEditorNewDeckOverlay input[name=deckEditorNewDeckMode]'))
      radio.onchange = _=>this.renderNewDeckPanel(radio.value);
    for(const header of $a('#deckEditorNewDeckOverlay .deckEditorNewDeckGroupHeader'))
      header.onclick = _=>this.openNewDeckGroup(header.parentNode);
    // A reset button recalls the cards into the holder, so it is only offered together with one.
    $('#deckEditorNewDeckHolder').onchange = _=>$('#deckEditorNewDeckResetButton').disabled = !$('#deckEditorNewDeckHolder').checked;
    $('#deckEditorUndo').onclick = _=>this.undo();
    $('#deckEditorRedo').onclick = _=>this.redo();
    $('#deckEditorCardView').onclick = _=>this.setRoomVisible(!this.roomVisible);
    this.setRoomVisible(false); // sets the toggle's initial tooltip
    $('#deckEditorClose').onclick = _=>this.close();
    $('#deckEditorShowAll').onclick = _=>{
      this.showAllAreas = !this.showAllAreas;
      $('#deckEditorShowAll').classList.toggle('active', this.showAllAreas);
      $('#deckEditorMain').classList.toggle('deckEditorShowAllAreas', this.showAllAreas);
    };

    $('#deckEditorExport').onclick = _=>this.openExportOverlay();
    $('#deckEditorExportClose').onclick = _=>this.closeExportOverlay();
    for(const control of $a('#deckEditorExportDialog input, #deckEditorExportDialog select')) {
      control.oninput = _=>this.updateExportSummary();
      control.onchange = _=>this.updateExportSummary();
    }
    progressButton($('#deckEditorExportPDF'), async updateProgress=>{
      this.updateExportSummary();
      try { await this.printDeck(updateProgress); }
      catch(e) {
        if(this.isExportCancelled(e))
          return;
        this.showExportError(e);
        throw e;
      }
    });
    $('#deckEditorExportCSV').onclick = _=>this.exportCardTypesCSV();

    // Import card types from CSV (upload button between add and copy in the card-type strip toolbar).
    $('#deckEditorStripImport').onclick = _=>{ if(this.deck()) showOverlay('deckEditorImportOverlay'); };
    $('#deckEditorImportClose').onclick = _=>showOverlay();
    $('#deckEditorImportChoose').onclick = async _=>{
      const mode = $('#deckEditorImportOverlay input[name=deckEditorImportMode]:checked');
      showOverlay();
      await this.importCardTypesFromFile(mode ? mode.value : 'replace');
    };
    // One set of add buttons; the "Add to:" radios decide whether they add a static object (All Cards) or a
    // per-card-type one (Card Type). The selected radio and the group's accent color are the indicators.
    for(const radio of $a('#deckEditorAddMode input[type=radio]'))
      radio.onchange = _=>this.setAddMode(radio.value);
    $('#deckEditorAddText').onclick = _=>this.addByMode({ type: 'text', x: 10, y: 10, width: 80, height: 30, fontSize: 20, textAlign: 'center' }, 'text', 'Text');
    $('#deckEditorAddImage').onclick = async _=>{
      const symbol = await pickSymbol('images');
      if(symbol && symbol.url)
        this.addByMode({ type: 'image', x: 10, y: 10, width: 50, height: 50, color: 'transparent' }, 'image', symbol.url);
    };
    $('#deckEditorAddIcon').onclick = async _=>{
      const symbol = await pickSymbol();
      if(symbol)
        this.addByMode({ type: 'icon', x: 10, y: 10, size: 50, color: '#000000' }, 'icon', symbol.symbol);
    };
    $('#deckEditorAddColor').onclick = _=>this.addByMode(this.colorBoxTemplate(), 'color', '#cccccc', 'color');

    // Card-type toolbar above the strip (item: add blank / copy / delete the current card type).
    $('#deckEditorStripAdd').onclick = _=>this.addCardType();
    $('#deckEditorStripCopy').onclick = _=>{ if(this.cardType !== null) this.addCardType(this.cardType); };
    $('#deckEditorStripDelete').onclick = _=>{ if(this.cardType !== null) this.deleteCardType(); };

    // "Card count" group of the same header: "- All" / "+ All" change every card type's count together.
    $('#deckEditorCountAllRemove').onclick = _=>this.changeAllCardCounts(-1);
    $('#deckEditorCountAllAdd').onclick = _=>this.changeAllCardCounts(1);

    // Unified tree toolbar: add / copy / delete act on whatever level is selected in the tree (deck, face or
    // object). Show areas lives here too and is only enabled while an object is selected.
    $('#deckEditorTreeAdd').onclick = _=>this.treeAdd();
    $('#deckEditorTreeCopy').onclick = _=>this.treeCopy();
    $('#deckEditorTreeDelete').onclick = _=>this.treeDelete();

    // Only a click on the card itself (its empty area) drops the object selection. Clicking the space AROUND
    // the card does nothing, so missing the card can't silently switch the sidebar from Object to Face.
    $('#deckEditorMain').onmousedown = e=>{
      if(e.target.classList.contains('deckEditorCard') || e.target.classList.contains('cardFace'))
        this.selectObject(null);
    };

    // Scroll-wheel zoom on the card design area (reuses the same zoom-to-cursor idea as the room).
    $('#deckEditorMain').addEventListener('wheel', e=>{
      if(!this.mainCard)
        return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.85 : 1.15;
      this.zoomCardAroundPoint(this.userZoom * delta, e.clientX, e.clientY);
    }, { passive: false });

    // Hold Space and drag to pan. Track Space ourselves rather than relying on zoom.js's body.spacePanActive,
    // which is suppressed while an overlay is active - toggling the grid opens the grid-options overlay, so
    // reusing that flag made panning stop working whenever the grid was on. Capture phase so the pan takes
    // precedence over an object's own drag handler.
    this.spaceHeld = false;
    let panning = false;
    let panStart = null;
    window.addEventListener('keydown', e=>{
      if(this.isOpen() && (e.code == 'Space' || e.key == ' ') && [ 'INPUT', 'TEXTAREA', 'SELECT' ].indexOf(e.target.tagName) == -1 && !e.target.isContentEditable) {
        this.spaceHeld = true;
        document.body.classList.add('deckEditorSpacePan');
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', e=>{
      if(e.code == 'Space' || e.key == ' ') {
        this.spaceHeld = false;
        document.body.classList.remove('deckEditorSpacePan');
      }
    });
    $('#deckEditorMain').addEventListener('mousedown', e=>{
      if(e.button != 0 || !this.spaceHeld)
        return;
      e.preventDefault();
      e.stopPropagation();
      panning = true;
      document.body.classList.add('deckEditorPanning');
      panStart = { x: e.clientX, y: e.clientY, panX: this.panX, panY: this.panY };
    }, true);
    window.addEventListener('mousemove', e=>{
      if(!panning)
        return;
      this.panX = panStart.panX + (e.clientX - panStart.x);
      this.panY = panStart.panY + (e.clientY - panStart.y);
      this.applyCardTransform();
    });
    window.addEventListener('mouseup', _=>{ panning = false; document.body.classList.remove('deckEditorPanning'); });

    // Touch: pinch (two fingers) to zoom, one finger to pan (unless the finger is on a face object, which
    // drags the object instead).
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let touchPanning = false;
    let touchPanStart = null;
    $('#deckEditorMain').addEventListener('touchstart', e=>{
      if(e.touches.length == 2 && this.mainCard) {
        touchPanning = false;
        pinchStartDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        pinchStartZoom = this.userZoom;
      } else if(e.touches.length == 1 && this.mainCard && !(e.target.closest && e.target.closest('.cardFaceObject'))) {
        touchPanning = true;
        touchPanStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, panX: this.panX, panY: this.panY };
      }
    }, { passive: false });
    $('#deckEditorMain').addEventListener('touchmove', e=>{
      if(e.touches.length == 2 && pinchStartDist > 0) {
        e.preventDefault();
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const midX = (e.touches[0].clientX + e.touches[1].clientX)/2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY)/2;
        this.zoomCardAroundPoint(pinchStartZoom * (dist / pinchStartDist), midX, midY);
      } else if(e.touches.length == 1 && touchPanning) {
        e.preventDefault();
        this.panX = touchPanStart.panX + (e.touches[0].clientX - touchPanStart.x);
        this.panY = touchPanStart.panY + (e.touches[0].clientY - touchPanStart.y);
        this.applyCardTransform();
      }
    }, { passive: false });
    $('#deckEditorMain').addEventListener('touchend', e=>{ if(e.touches.length < 2) pinchStartDist = 0; if(!e.touches.length) touchPanning = false; });

    $('#deckEditorStrip').addEventListener('scroll', _=>this.updateStripOverflow());

    window.addEventListener('resize', _=>{
      if(this.isOpen()) {
        this.renderMain();
        this.updateDragToolbar();
        this.updateStripOverflow();
      }
    });
    window.addEventListener('keydown', e=>this.onKeyDown(e));
    // The room editor behind the fullscreen deck editor also reacts to Escape (window.onkeyup in main.js
    // toggles the active sidebar tab or even leaves edit mode, which closes the deck editor). Swallow the
    // keyup while the deck editor is open - or was just closed by this very Escape - so Escape only means
    // "deselect/close" here. Capture phase, so this runs before main.js's bubble-phase handler.
    window.addEventListener('keyup', e=>{
      if(e.key == 'Escape' && (this.isOpen() || this.closedByEscape)) {
        this.closedByEscape = false;
        e.stopImmediatePropagation();
      }
    }, true);
  }

  openExportOverlay() {
    if(!this.deck())
      return;
    this.updateExportSummary();
    showOverlay('deckEditorExportOverlay');
  }

  closeExportOverlay() {
    this.cancelExport();
    showOverlay();
  }

  beginExport() {
    this.cancelExport();
    this.exportAbortController = new AbortController();
    return this.exportAbortController.signal;
  }

  finishExport(signal) {
    if(this.exportAbortController && this.exportAbortController.signal == signal)
      delete this.exportAbortController;
  }

  cancelExport() {
    if(this.exportAbortController) {
      this.exportAbortController.abort();
      delete this.exportAbortController;
    }
    if(this.exportPrintWindow && !this.exportPrintWindow.closed)
      this.exportPrintWindow.close();
    delete this.exportPrintWindow;
  }

  isExportCancelled(error) {
    return error && error.name == 'AbortError';
  }

  checkExportCancelled(signal) {
    if(signal && signal.aborted)
      throw new DOMException('Export cancelled.', 'AbortError');
  }

  async waitForExportPromise(promise, signal) {
    this.checkExportCancelled(signal);
    if(!signal)
      return await promise;
    return await new Promise((resolve, reject)=>{
      const abort = _=>reject(new DOMException('Export cancelled.', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      Promise.resolve(promise).then(value=>{
        signal.removeEventListener('abort', abort);
        resolve(value);
      }, error=>{
        signal.removeEventListener('abort', abort);
        reject(error);
      });
    });
  }

  showExportError(error) {
    const summary = $('#deckEditorExportSummary');
    summary.textContent = error && error.message ? error.message : String(error);
    summary.classList.add('error');
  }

  exportOptions() {
    const numberValue = (id, minimum)=>{
      const value = Number($(id).value);
      if(!Number.isFinite(value) || value < minimum)
        throw new Error(`${$(id).parentElement.firstChild.textContent.trim()} must be at least ${minimum}.`);
      return value;
    };
    const papers = {
      a4: [ 210, 297 ],
      letter: [ 215.9, 279.4 ],
      legal: [ 215.9, 355.6 ]
    };
    const paperName = $('#deckEditorExportPaper').value;
    let [ paperWidth, paperHeight ] = papers[paperName] || papers.letter;
    const orientation = $('#deckEditorExportOrientation').value;
    if(orientation == 'landscape')
      [ paperWidth, paperHeight ] = [ paperHeight, paperWidth ];

    return {
      copies: $('#deckEditorExportCopies').value,
      faces: $('#deckEditorExportFaces').value,
      paperName,
      orientation,
      duplex: $('#deckEditorExportDuplex').value,
      paperWidth,
      paperHeight,
      cardWidth: numberValue('#deckEditorExportCardWidth', 10),
      cardHeight: numberValue('#deckEditorExportCardHeight', 10),
      margin: numberValue('#deckEditorExportMargin', 0),
      gap: numberValue('#deckEditorExportGap', 0),
      bleed: numberValue('#deckEditorExportBleed', 0),
      cropMarks: $('#deckEditorExportCropMarks').checked
    };
  }

  exportCardEntries(options) {
    const entries = [];
    let typeIndex = 0;
    for(const cardType of Object.keys(this.cardTypes)) {
      const count = options.copies == 'one' ? 1 : widgetFilter(w=>w.get('deck') == this.deckID && w.get('cardType') == cardType).length;
      for(let copy=0; copy<count; ++copy)
        entries.push({ cardType, copy, typeIndex });
      ++typeIndex;
    }
    return entries;
  }

  exportFaceDescriptors(options) {
    const faceCount = this.faceTemplates.length;
    if(!faceCount)
      return [];
    const front = faceCount > 1 ? 1 : 0;
    if(options.faces == 'front')
      return [ { face: front, name: 'front' } ];
    if(options.faces == 'all')
      return this.faceTemplates.map((_, face)=>({ face, name: `face-${face}` }));
    const result = [ { face: front, name: 'front' } ];
    if(faceCount > 1)
      result.push({ face: 0, name: 'back', back: true });
    return result;
  }

  exportLayout(options) {
    const artworkWidth = options.cardWidth + 2*options.bleed;
    const artworkHeight = options.cardHeight + 2*options.bleed;
    const usableWidth = options.paperWidth - 2*options.margin;
    const usableHeight = options.paperHeight - 2*options.margin;
    const columns = Math.floor((usableWidth + options.gap) / (artworkWidth + options.gap));
    const rows = Math.floor((usableHeight + options.gap) / (artworkHeight + options.gap));
    if(columns < 1 || rows < 1)
      throw new Error('The selected card size, bleed, and margins do not fit on this paper.');
    return { artworkWidth, artworkHeight, columns, rows, capacity: columns*rows };
  }

  updateExportSummary() {
    const summary = $('#deckEditorExportSummary');
    if(!summary)
      return;
    try {
      const options = this.exportOptions();
      const entries = this.exportCardEntries(options);
      const faces = this.exportFaceDescriptors(options);
      const layout = this.exportLayout(options);
      if(!entries.length)
        throw new Error(options.copies == 'game' ? 'This deck has no cards in the game. Choose “One of each card type” to export its designs.' : 'This deck has no card types to export.');
      if(!faces.length)
        throw new Error('This deck has no faces to export.');
      const sheetSets = Math.ceil(entries.length/layout.capacity);
      const printedPages = sheetSets*faces.length;
      summary.textContent = `${entries.length} card${entries.length == 1 ? '' : 's'} · ${layout.columns} × ${layout.rows} per sheet · ${printedPages} printed page${printedPages == 1 ? '' : 's'}${options.faces == 'frontBack' && faces.length == 2 ? ` (${sheetSets} duplex sheet${sheetSets == 1 ? '' : 's'})` : ''}`;
      summary.classList.remove('error');
      if(!$('#deckEditorExportPDF').classList.contains('progress'))
        $('#deckEditorExportPDF').disabled = false;
    } catch(e) {
      summary.textContent = e.message || String(e);
      summary.classList.add('error');
      if(!$('#deckEditorExportPDF').classList.contains('progress'))
        $('#deckEditorExportPDF').disabled = true;
    }
  }

  exportCardDOM(cardType, face) {
    const host = document.createElement('div');
    const card = this.renderCard(cardType, face, host);
    const cardDOM = card.domElement;
    cardDOM.classList.remove('hidden', 'foreign', 'selectedInEdit', 'selectedInEditPreview');
    cardDOM.style.position = 'absolute';
    cardDOM.style.left = '0';
    cardDOM.style.top = '0';
    cardDOM.style.margin = '0';
    cardDOM.style.transformOrigin = 'top left';
    return { card, cardDOM };
  }

  async waitForExportArtwork(cardDOMs, signal) {
    this.checkExportCancelled(signal);
    if(document.fonts && document.fonts.ready)
      await this.waitForExportPromise(document.fonts.ready, signal);
    const needsBackground = [];
    for(const cardDOM of cardDOMs) {
      const faces = $a('.cardFace', cardDOM);
      for(let face=0; face<this.faceTemplates.length; ++face) {
        const objects = this.faceTemplates[face].objects || [];
        const renderedObjects = faces[face] ? $a('.cardFaceObject', faces[face]) : [];
        for(let object=0; object<objects.length; ++object)
          if(objects[object].type == 'image' && (objects[object].value || objects[object].dynamicProperties && objects[object].dynamicProperties.value) && renderedObjects[object])
            needsBackground.push(renderedObjects[object]);
      }
    }
    const deadline = Date.now()+5000;
    while(needsBackground.some(node=>!node.style.backgroundImage) && Date.now()<deadline) {
      await this.waitForExportPromise(sleep(50), signal);
      this.checkExportCancelled(signal);
    }
    const images = cardDOMs.flatMap(cardDOM=>[ ...cardDOM.querySelectorAll('img') ]);
    await this.waitForExportPromise(Promise.all(images.map(image=>image.complete ? Promise.resolve() : new Promise(resolve=>{
      image.onload = resolve;
      image.onerror = resolve;
    }))), signal);
    await this.waitForExportPromise(sleep(100), signal);
  }

  async preparePrintCardHTML(entries, faces, layout, signal) {
    const host = div(document.body);
    host.id = 'deckEditorExportRenderHost';
    const records = new Map();
    try {
      for(const entry of entries) {
        for(const descriptor of faces) {
          this.checkExportCancelled(signal);
          const key = `${entry.cardType}\n${descriptor.face}`;
          if(records.has(key))
            continue;
          const { card, cardDOM } = this.exportCardDOM(entry.cardType, descriptor.face);
          cardDOM.style.transform = `scale(${layout.artworkWidth*96/25.4/card.get('width')}, ${layout.artworkHeight*96/25.4/card.get('height')})`;
          host.append(cardDOM);
          records.set(key, cardDOM);
        }
      }
      await this.waitForExportArtwork([ ...records.values() ], signal);
      this.checkExportCancelled(signal);
      return new Map([ ...records ].map(([ key, cardDOM ])=>[ key, cardDOM.outerHTML ]));
    } finally {
      host.remove();
    }
  }

  printCardHTML(entry, face, options, cardHTML) {
    const renderedCard = cardHTML.get(`${entry.cardType}\n${face}`);
    const marks = options.cropMarks ? '<i class="cropMark cropTLH"></i><i class="cropMark cropTLV"></i><i class="cropMark cropTRH"></i><i class="cropMark cropTRV"></i><i class="cropMark cropBLH"></i><i class="cropMark cropBLV"></i><i class="cropMark cropBRH"></i><i class="cropMark cropBRV"></i>' : '';
    return `<div class="printCardArtwork">${renderedCard}</div>${marks}`;
  }

  printSheetHTML(entries, face, back, options, layout, cardHTML) {
    const mirrorHorizontally = back && (options.duplex == 'long') == (options.orientation == 'portrait');
    const mirrorVertically = back && !mirrorHorizontally;
    const cards = entries.map((entry, index)=>{
      const row = Math.floor(index/layout.columns) + 1;
      const column = index%layout.columns + 1;
      const printColumn = mirrorHorizontally ? layout.columns-column+1 : column;
      const printRow = mirrorVertically ? layout.rows-row+1 : row;
      return `<div class="printCardSlot" style="grid-row:${printRow};grid-column:${printColumn}">${this.printCardHTML(entry, face, options, cardHTML)}</div>`;
    }).join('');
    return `<section class="printSheet">${cards}</section>`;
  }

  async waitForPrintWindow(printWindow, signal) {
    if(printWindow.document.readyState != 'complete')
      await this.waitForExportPromise(new Promise(resolve=>printWindow.addEventListener('load', resolve, { once: true })), signal);
    if(printWindow.document.fonts && printWindow.document.fonts.ready)
      await this.waitForExportPromise(printWindow.document.fonts.ready, signal);
    const images = [ ...printWindow.document.images ];
    await this.waitForExportPromise(Promise.all(images.map(image=>image.complete ? Promise.resolve() : new Promise(resolve=>{
      image.onload = resolve;
      image.onerror = resolve;
    }))), signal);
    await this.waitForExportPromise(sleep(100), signal);
  }

  async printDeck(updateProgress) {
    const signal = this.beginExport();
    const printWindow = window.open('', '_blank');
    if(!printWindow) {
      this.finishExport(signal);
      throw new Error('The print window was blocked. Allow pop-ups for this site and try again.');
    }
    this.exportPrintWindow = printWindow;
    try {
      updateProgress('Preparing cards...');
      await this.flushPendingCommits();
      this.checkExportCancelled(signal);
      const options = this.exportOptions();
      const entries = this.exportCardEntries(options);
      const faces = this.exportFaceDescriptors(options);
      const layout = this.exportLayout(options);
      if(!entries.length || !faces.length)
        throw new Error('There are no cards or faces to print.');

      updateProgress('Loading artwork...');
      const cardHTML = await this.preparePrintCardHTML(entries, faces, layout, signal);
      let sheets = '';
      for(let start=0; start<entries.length; start+=layout.capacity) {
        this.checkExportCancelled(signal);
        const pageEntries = entries.slice(start, start+layout.capacity);
        for(const descriptor of faces) {
          this.checkExportCancelled(signal);
          sheets += this.printSheetHTML(pageEntries, descriptor.face, !!descriptor.back, options, layout, cardHTML);
        }
      }

      const inheritedStyles = [ ...document.head.querySelectorAll('style, link[rel="stylesheet"]') ].map(node=>node.outerHTML).join('\n');
      const pageSize = `${options.paperWidth}mm ${options.paperHeight}mm`;
      const title = html(`Print ${this.deckID}`);
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html><head><base href="${html(location.href)}"><meta charset="utf-8"><title>${title}</title>${inheritedStyles}<style>
        @page { size: ${pageSize}; margin: 0; }
        html, body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { color: black; }
        .printSheet { width: ${options.paperWidth}mm; height: ${options.paperHeight}mm; padding: ${options.margin}mm; box-sizing: border-box; display: grid; grid-template-columns: repeat(${layout.columns}, ${layout.artworkWidth}mm); grid-template-rows: repeat(${layout.rows}, ${layout.artworkHeight}mm); gap: ${options.gap}mm; place-content: center; break-after: page; page-break-after: always; overflow: hidden; }
        .printSheet:last-child { break-after: auto; page-break-after: auto; }
        .printCardSlot { position: relative; width: ${layout.artworkWidth}mm; height: ${layout.artworkHeight}mm; overflow: visible; }
        .printCardArtwork { position: absolute; inset: 0; overflow: hidden; }
        .printCardArtwork > .widget { left: 0 !important; top: 0 !important; margin: 0 !important; transform-origin: top left !important; }
        .cropMark { position: absolute; display: block; background: #000; z-index: 100000; }
        .cropTLH, .cropBLH { left: calc(${options.bleed}mm - 2.5mm); width: 2mm; height: .2mm; }
        .cropTRH, .cropBRH { left: calc(${options.bleed + options.cardWidth}mm + .5mm); width: 2mm; height: .2mm; }
        .cropTLV, .cropTRV { top: calc(${options.bleed}mm - 2.5mm); width: .2mm; height: 2mm; }
        .cropBLV, .cropBRV { top: calc(${options.bleed + options.cardHeight}mm + .5mm); width: .2mm; height: 2mm; }
        .cropTLH, .cropTRH { top: ${options.bleed}mm; }
        .cropBLH, .cropBRH { top: ${options.bleed + options.cardHeight}mm; }
        .cropTLV, .cropBLV { left: ${options.bleed}mm; }
        .cropTRV, .cropBRV { left: ${options.bleed + options.cardWidth}mm; }
        @media screen { body { background: #ddd; } .printSheet { margin: 8mm auto; background: white; box-shadow: 0 2mm 8mm #0004; } }
      </style></head><body>${sheets}</body></html>`);
      printWindow.document.close();
      updateProgress('Preparing print preview...');
      await this.waitForPrintWindow(printWindow, signal);
      this.checkExportCancelled(signal);
      updateProgress('Opening print dialog...');
      printWindow.focus();
      printWindow.addEventListener('afterprint', _=>printWindow.close(), { once: true });
      printWindow.print();
    } catch(e) {
      printWindow.close();
      throw e;
    } finally {
      if(this.exportPrintWindow == printWindow)
        delete this.exportPrintWindow;
      this.finishExport(signal);
    }
  }

  onKeyDown(e) {
    if(!this.isOpen())
      return;

    // Ctrl/Cmd+Z and Ctrl/Cmd+Y (or Ctrl/Cmd+Shift+Z) work even from inside an input, matching common editors.
    if((e.ctrlKey || e.metaKey) && !e.altKey) {
      const key = e.key.toLowerCase();
      if(key == 'z' && !e.shiftKey) {
        e.preventDefault();
        return this.undo();
      }
      if(key == 'y' || (key == 'z' && e.shiftKey)) {
        e.preventDefault();
        return this.redo();
      }
      // Ctrl/Cmd+A selects every face object of the shown face, ready for a shared property edit or an alignment.
      // Not while one of the editor's overlays (export, import, new deck, ...) is up though: there the browser's
      // own "select all" is what the user means.
      if(key == 'a' && !isOverlayActive() && [ 'TEXTAREA', 'INPUT', 'SELECT' ].indexOf(e.target.tagName) == -1 && !e.target.isContentEditable) {
        e.preventDefault();
        return this.selectAllObjects();
      }
    }

    if([ 'TEXTAREA', 'INPUT', 'SELECT' ].indexOf(e.target.tagName) != -1 || e.target.isContentEditable)
      return;

    if(e.key == 'Escape') {
      e.preventDefault();
      if(this.selectedObject !== null) {
        this.selectObject(null);
      } else {
        this.closedByEscape = true; // so the keyup listener still swallows this Escape's keyup
        this.close();
      }
    }
    if(e.key == 'Delete') {
      if(this.selectedObject !== null) {
        e.preventDefault();
        this.deleteSelectedObject(); // a selected object is deleted straight away, no prompt
      } else if(!this.deckSymbolSelected && this.cardType !== null) {
        e.preventDefault();
        this.deleteCardType(); // with only a card type selected, Delete prompts before removing it
      }
    }
  }

  async open(deckID) {
    this.initializeDOM();

    const deck = widgets.get(deckID);
    if(!deck || deck.get('type') != 'deck')
      return;

    const wasOpen = this.isOpen();
    if(this.deckID !== null && this.deckID != deckID) {
      this.saveSelection(); // remember where the user left off in the deck we're switching away from
      await this.flushPendingCommits();
    }

    this.deckID = deckID;
    this.lastDeckID = deckID;
    this.loadWorkingCopies();
    this.restoreSelection(deckID); // first open -> face 1 + "edit all card defaults"; later -> where left off
    this.expandedDecks.add(deckID); // open this deck's branch and its current face by default
    this.expandedFaces.add(`${deckID}:${this.face}`);
    this.userZoom = 1; // start each deck at fit scale, unpanned
    this.panX = 0;
    this.panY = 0;
    this.resetHistory();

    $('body').classList.add('deckEditorActive');
    $('#deckEditorMainCol').append($('#symbolPickerOverlay')); // constrain the picker to the card view while open
    // If a sidebar module (e.g. the deck's text Properties panel this editor is opened from) is open, close it
    // so the visual editor owns the full width instead of sharing the screen with the panel it replaces. Only
    // when the editor actually opens though: switching decks inside it must leave a panel the user opened
    // afterwards (the JSON module in particular) alone.
    if(!wasOpen) {
      const activeModuleButton = $('#editorSidebar button.active');
      if(activeModuleButton)
        activeModuleButton.click();
    }
    this.render();
    this.syncToolbarButton();
    jeSelectDeckEditorDeck(deck); // an open JSON editor follows the deck being edited
  }

  // Entry point for the "Edit Cards and Deck" button on a card's Properties panel: open the card's deck with
  // that card type shown in the strip and Face 1 selected in the tree, overriding any remembered selection.
  async openAtCardType(deckID, cardType) {
    await this.open(deckID);
    if(this.deckID != deckID)
      return; // open() bails out early if the widget isn't a deck
    if(cardType !== undefined && cardType !== null && this.cardTypes && this.cardTypes[cardType] !== undefined)
      this.cardType = cardType;
    this.selectFaceNode(Math.min(1, Math.max(0, this.faceTemplates.length - 1)));
  }

  // Entry point for the toolbar toggle button: open the most relevant deck (a selected deck, a selected
  // card's deck, or the last deck in the game) since the button carries no per-deck context of its own.
  async openBestDeck() {
    let deckID = null;
    for(const widget of selectedWidgets) {
      if(widget.get('type') == 'deck') { deckID = widget.get('id'); break; }
      if(widget.get('type') == 'card' && widget.get('deck')) { deckID = widget.get('deck'); break; }
    }
    if(deckID === null) {
      const decks = widgetFilter(w=>w.get('type') == 'deck');
      if(this.lastDeckID && decks.some(d=>d.get('id') == this.lastDeckID))
        deckID = this.lastDeckID; // return to the last deck the user worked on this session
      else if(decks.length)
        deckID = decks[0].get('id'); // first open with no context: the first deck in the list
    }
    // Don't auto-create a deck when the room has none; open an empty editor and let the user add one.
    if(deckID === null)
      return this.openEmpty();
    await this.open(deckID);
  }

  // Open the deck editor with no deck selected. Renders an empty editor (empty tree/main/strip) from which
  // the user can create a deck with the "Add New Deck" button.
  async openEmpty() {
    this.initializeDOM();
    const wasOpen = this.isOpen();
    if(this.deckID !== null)
      await this.flushPendingCommits();
    this.deckID = null;
    this.faceTemplates = [];
    this.cardTypes = {};
    this.cardDefaults = {};
    this.cardType = null;
    this.selectedObject = null;
    this.treeLevel = 'deck';
    this.userZoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.resetHistory();
    $('body').classList.add('deckEditorActive');
    $('#deckEditorMainCol').append($('#symbolPickerOverlay')); // constrain the picker to the card view while open
    if(!wasOpen) {
      const activeModuleButton = $('#editorSidebar button.active');
      if(activeModuleButton)
        activeModuleButton.click();
    }
    this.render();
    this.syncToolbarButton();
  }

  // Snapshot the current tree/strip selection so reopening this deck returns to it (see restoreSelection).
  saveSelection() {
    if(this.deckID == null)
      return;
    this.selectionMemory[this.deckID] = {
      treeLevel: this.treeLevel,
      face: this.face,
      selectedObject: this.selectedObject,
      cardType: this.cardType,
      deckSymbolSelected: this.deckSymbolSelected,
      activeArea: this.activeArea,
      sidebarTab: this.sidebarTab
    };
  }

  // Restore the remembered selection for a deck, clamping stale indices to the current structure. With no
  // memory yet (first open of this deck this session), default to face 1 with the "edit all card defaults"
  // strip tile selected.
  restoreSelection(deckID) {
    const mem = this.selectionMemory[deckID];
    this.cardType = mem && mem.cardType != null && this.cardTypes[mem.cardType]
      ? mem.cardType : (Object.keys(this.cardTypes)[0] || null);
    if(!mem) {
      this.face = Math.min(1, Math.max(0, this.faceTemplates.length - 1));
      this.selectedObject = null;
      this.treeLevel = 'face';
      this.deckSymbolSelected = true;
      this.activeArea = 'strip';
      this.sidebarTab = 'defaults';
      return;
    }
    this.sidebarTab = mem.sidebarTab || 'defaults';
    this.face = mem.face != null && mem.face < this.faceTemplates.length
      ? mem.face : Math.max(0, this.faceTemplates.length - 1);
    this.deckSymbolSelected = !!mem.deckSymbolSelected;
    this.activeArea = mem.activeArea == 'strip' ? 'strip' : 'tree';
    this.treeLevel = mem.treeLevel || 'face';
    const objects = (this.faceTemplates[this.face] && this.faceTemplates[this.face].objects) || [];
    this.selectedObject = mem.selectedObject != null && mem.selectedObject < objects.length ? mem.selectedObject : null;
    if(this.selectedObject === null && this.treeLevel == 'object')
      this.treeLevel = 'face';
  }

  async close() {
    this.saveSelection(); // remember this deck's selection for the next time the editor opens
    await this.flushPendingCommits();
    const deck = this.deck();
    this.selectedObject = null;
    // switched off and half typed css declarations are not in the game state, so nothing may outlive the
    // editing session they were made in
    this.cssEditorState.clear();
    $('body').classList.remove('deckEditorActive');
    $('#editor').append($('#symbolPickerOverlay')); // back to covering the whole editor for the JSON editor etc.
    $('#deckEditorDragToolbar').classList.remove('active');
    this.setRoomVisible(false); // hand the whole play area back to the room
    this.syncToolbarButton();
    // The deck that was on screen is what the user was working on, so leave the JSON editor on it.
    jeSelectDeckEditorDeck(deck);
  }

  // The "Card view" toggle in the upper right of the history row. On (default): the card design fills the main
  // area as always. Off: that area becomes a window onto the room's play area behind the editor, so the deck
  // can be compared with the running game while the tree, card types and property sidebar stay usable.
  setRoomVisible(roomVisible) {
    this.roomVisible = !!roomVisible;
    $('body').classList.toggle('deckEditorRoomVisible', this.roomVisible);
    const button = $('#deckEditorCardView');
    if(button) {
      button.classList.toggle('active', !this.roomVisible);
      button.title = this.roomVisible
        ? 'Card view is off: this area shows the room instead. Click to design the card here again.'
        : "Card view is on: the card fills this area. Click to show the room's play area here instead, so you can compare the deck with the game while still editing it.";
    }
    setScale(); // the room is fitted into whatever is visible of it, so this toggle changes its scale
  }

  // Keep the toolbar toggle button's pressed state in sync however the editor was opened/closed (button,
  // properties module, Escape, game switch). deckEditorToolbarButton is set when that button is constructed.
  syncToolbarButton() {
    if(deckEditorToolbarButton)
      deckEditorToolbarButton.syncState();
  }

  cancelPendingCommits() {
    for(const property of Object.keys(this.commitTimers))
      clearTimeout(this.commitTimers[property].timer);
    this.commitTimers = {};
  }

  // The room state was replaced (game switch), so this.deckID likely no longer exists. Drop pending commits
  // without flushing (they'd target the missing deck) and hide the editor. Don't call close(), which flushes.
  handleStateReplaced() {
    this.cancelPendingCommits();
    // The old decks are gone; drop the remembered selections so a new game starts fresh.
    this.selectionMemory = {};
    this.lastDeckID = null;
    if(!this.isOpen())
      return;
    this.deckID = null;
    this.selectedObject = null;
    this.history = [];
    this.historyIndex = -1;
    $('body').classList.remove('deckEditorActive');
    $('#editor').append($('#symbolPickerOverlay')); // back to covering the whole editor for the JSON editor etc.
    $('#deckEditorDragToolbar').classList.remove('active');
    this.setRoomVisible(false);
    this.syncToolbarButton();
  }

  workingCopy(property) {
    return this[property];
  }

  loadWorkingCopies(properties = [ 'faceTemplates', 'cardTypes', 'cardDefaults' ]) {
    const deck = this.deck();
    if(properties.includes('faceTemplates')) {
      const faceTemplates = deck.get('faceTemplates');
      this.faceTemplates = Array.isArray(faceTemplates) ? JSON.parse(JSON.stringify(faceTemplates)) : [];
    }
    for(const property of [ 'cardTypes', 'cardDefaults' ]) {
      if(properties.includes(property)) {
        const value = deck.get(property);
        this[property] = value && typeof value == 'object' && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {};
      }
    }
  }

  // Used to tell apart the local echo of our own commit() (deck's property already equals our working copy,
  // since we built the committed value from that same working copy) from a genuine remote/undo change.
  matchesWorkingCopy(property) {
    const deck = this.deck();
    return !!deck && JSON.stringify(deck.get(property)) == JSON.stringify(this.workingCopy(property));
  }

  reload(properties = [ 'faceTemplates', 'cardTypes', 'cardDefaults' ]) {
    if(!this.deck())
      return this.close();
    for(const property of properties) {
      if(this.commitTimers[property])
        clearTimeout(this.commitTimers[property].timer);
      delete this.commitTimers[property];
    }
    this.loadWorkingCopies(properties);
    if(this.cardType === null || !this.cardTypes[this.cardType])
      this.cardType = Object.keys(this.cardTypes)[0] || null;
    if(this.face >= this.faceTemplates.length)
      this.face = Math.max(0, this.faceTemplates.length-1);
    const face = this.faceTemplates[this.face];
    const objectCount = face && Array.isArray(face.objects) ? face.objects.length : 0;
    this._selectedObjects = this._selectedObjects.filter(index=>index < objectCount); // drop indices that vanished
    // A reload only happens for genuine external changes (see matchesWorkingCopy guard), so record it as its
    // own breadcrumb step (no actionId => never merges) rather than swapping the working copy out silently.
    this.recordHistory('__external__', null);
    this.render();
  }

  // Debounced commit for typed edits. cause/actionId identify the edited FIELD (e.g. one property of one face
  // object), so a typing burst on that field merges into one breadcrumb/undo step but edits to a different
  // field become a separate step. They are remembered with the timer so flushes commit under the right cause.
  scheduleCommit(property, cause, actionId) {
    const pending = this.commitTimers[property];
    if(pending)
      clearTimeout(pending.timer);
    this.commitTimers[property] = {
      cause,
      actionId,
      timer: setTimeout(_=>this.commit(property), 500)
    };
  }

  // Returns a fresh action id used to group the (possibly several) commits of one user action into a single
  // breadcrumb / undo step. Call once at the start of a multi-commit action and pass the id to each commit.
  newAction() {
    return `action:${++this.actionSeq}`;
  }

  // cause distinguishes this commit in the room undo protocol (consecutive same-cause deltas merge). actionId
  // groups history: commits sharing an actionId collapse into one breadcrumb step. Structural actions get a
  // unique "action:N" id whose number is appended to the cause, so two consecutive actions of the same kind
  // (two drags, two adds, repeated Undo presses) stay separate room-undo entries as well - only the commits of
  // one single action share a suffix and merge. Typed edits keep their stable per-field id and cause (from
  // scheduleCommit) without a suffix, so a burst on one field still merges everywhere.
  async commit(property, cause, actionId) {
    const pending = this.commitTimers[property];
    if(pending) {
      clearTimeout(pending.timer);
      delete this.commitTimers[property];
      if(cause === undefined) { // flushing the debounced edit: commit it under its own field identity
        cause = pending.cause;
        actionId = pending.actionId;
      }
    }

    const deck = this.deck();
    if(!deck)
      return;

    let resolvedCause = cause || `${getPlayerDetails().playerName} updated ${property} of deck ${this.deckID} in deck editor`;
    const resolvedActionId = actionId || (cause ? this.newAction() : `field:${property}`);
    if(resolvedActionId.startsWith('action:'))
      resolvedCause += ` (#${resolvedActionId.slice('action:'.length)})`;

    batchStart();
    setDeltaCause(resolvedCause);
    await deck.set(property, JSON.parse(JSON.stringify(this.workingCopy(property))));
    batchEnd();

    this.recordHistory(resolvedCause, resolvedActionId);
    // Rebuilds every strip preview; fine for typical decks. If this ever gets janky on huge decks while
    // typing, give the strip its own longer debounce instead of skipping it (typed edits do affect previews).
    this.renderStrip();
    if(property == 'cardDefaults' && !this.applyingHistory) { // defaults like width/height resize the main card
      this.renderMain();
      this.updateDragToolbar();
    }
  }

  async flushPendingCommits() {
    // Let queued typed edits mutate + schedule first, so their pending commits are visible below. Only ever
    // awaited from outside the queue (structural handlers, undo/redo, open/close), so this cannot deadlock.
    await (this.fieldEditChain || Promise.resolve()).catch(_=>{});
    for(const property of Object.keys(this.commitTimers))
      await this.commit(property);
  }

  // Typed edits share one debounce timer (and one working copy) per deck property. Before the working copy
  // absorbs an edit to a DIFFERENT field, commit the pending field under its own identity - otherwise two
  // fields edited within one debounce window would silently become one breadcrumb/undo step labeled with only
  // the second field. commit() takes its state snapshot synchronously, so awaiting this before mutating is safe.
  async flushPendingCommitForOtherField(property, actionId) {
    const pending = this.commitTimers[property];
    if(pending && pending.actionId !== actionId)
      await this.commit(property);
  }

  // Serializes typed-edit callbacks (flush other field -> mutate -> schedule) so two edits arriving in the
  // same event-loop turn cannot interleave around the awaits above and skip the different-field flush.
  queueFieldEdit(callback) {
    this.fieldEditChain = (this.fieldEditChain || Promise.resolve()).catch(_=>{}).then(callback);
    return this.fieldEditChain;
  }

  snapshot(cause, actionId, label) {
    return {
      faceTemplates: JSON.parse(JSON.stringify(this.faceTemplates)),
      cardTypes: JSON.parse(JSON.stringify(this.cardTypes)),
      cardDefaults: JSON.parse(JSON.stringify(this.cardDefaults)),
      cause,
      actionId,
      label: label || this.historyLabel(cause)
    };
  }

  resetHistory() {
    this.history = [ this.snapshot('__open__', null, 'Start') ];
    this.historyIndex = 0;
  }

  recordHistory(cause, actionId) {
    if(this.applyingHistory)
      return;

    const entry = this.snapshot(cause, actionId);

    // Drop the redo tail: editing after an undo forks a new future.
    if(this.historyIndex < this.history.length-1)
      this.history = this.history.slice(0, this.historyIndex+1);

    // Merge only commits that belong to the same action (same actionId): a typing burst on one property, or the
    // several commits of one multi-step action. Distinct clicks get distinct ids, so each is its own crumb.
    const current = this.history[this.historyIndex];
    if(current && actionId && current.actionId === actionId) {
      this.history[this.historyIndex] = entry;
    } else {
      this.history.push(entry);
      if(this.history.length > this.maxHistory)
        this.history.shift();
      this.historyIndex = this.history.length-1;
    }

    this.renderHistory();
  }

  // Turn a delta cause into a short human breadcrumb label. Causes all read "<player> <action> ... in deck editor".
  historyLabel(cause) {
    if(cause == '__open__')
      return 'Start';
    if(cause == '__external__')
      return 'External change';

    cause = cause.replace(/ \(#\d+\)$/, ''); // per-action suffix that keeps room-undo entries separate

    let match = cause.match(/ updated "(.+?)" of (\d+) face objects /);
    if(match)
      return `Edited ${match[1]} of ${match[2]} objects`;
    match = cause.match(/ updated "(.+?)" of face object (\d+) /);
    if(match)
      return `Edited ${match[1]} of object ${match[2]}`;
    match = cause.match(/ updated "(.+?)" of card type "(.+?)" /);
    if(match)
      return `Edited ${match[1]} of ${match[2]}`;
    match = cause.match(/ updated "(.+?)" of face (\d+) /);
    if(match)
      return `Edited ${match[1]} of face ${match[2]}`;
    match = cause.match(/ updated "(.+?)" of card defaults /);
    if(match)
      return `Edited default ${match[1]}`;
    match = cause.match(/ deleted property "(.+?)" /);
    if(match)
      return `Deleted ${match[1]}`;
    if(/ updated faceTemplates /.test(cause))
      return 'Edited face object';
    if(/ updated cardTypes /.test(cause))
      return 'Edited card type';

    const player = getPlayerDetails().playerName;
    let label = cause;
    if(label.startsWith(player + ' '))
      label = label.slice(player.length+1);
    label = label.replace(/ (to|of|from|for|in) deck \S+/, '');
    label = label.replace(/ in deck editor$/, '');
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Change';
  }

  async jumpToHistory(index, cause) {
    if(index < 0 || index >= this.history.length || index === this.historyIndex)
      return;

    await this.flushPendingCommits();

    this.historyIndex = index;
    const snapshot = this.history[index];

    const changed = [ 'faceTemplates', 'cardTypes', 'cardDefaults' ].filter(property=>JSON.stringify(this.workingCopy(property)) !== JSON.stringify(snapshot[property]));
    for(const property of changed)
      this[property] = JSON.parse(JSON.stringify(snapshot[property]));

    if(this.cardType === null || !this.cardTypes[this.cardType])
      this.cardType = Object.keys(this.cardTypes)[0] || null;
    if(this.face >= this.faceTemplates.length)
      this.face = Math.max(0, this.faceTemplates.length-1);
    this.selectedObject = null;

    // applyingHistory keeps these re-commits from being recorded as new history entries. One shared actionId
    // keeps the commits of this jump a single room-undo entry, while separate jumps stay separate.
    const actionId = this.newAction();
    this.applyingHistory = true;
    for(const property of changed)
      await this.commit(property, cause, actionId);
    this.applyingHistory = false;

    this.render();
  }

  async undo() {
    await this.flushPendingCommits();
    if(this.historyIndex > 0)
      await this.jumpToHistory(this.historyIndex-1, `${getPlayerDetails().playerName} undid a change of deck ${this.deckID} in deck editor`);
  }

  async redo() {
    await this.flushPendingCommits();
    if(this.historyIndex < this.history.length-1)
      await this.jumpToHistory(this.historyIndex+1, `${getPlayerDetails().playerName} redid a change of deck ${this.deckID} in deck editor`);
  }

  renderHistory() {
    $('#deckEditorUndo').disabled = this.historyIndex <= 0;
    $('#deckEditorRedo').disabled = this.historyIndex >= this.history.length-1;

    const breadcrumb = $('#deckEditorBreadcrumb');
    breadcrumb.innerHTML = '';

    // Show a trailing window of steps so a long session doesn't overflow the bar; ellipsis marks hidden history.
    const maxCrumbs = 7;
    const start = Math.max(0, this.history.length - maxCrumbs);
    if(start > 0)
      div(breadcrumb, 'deckEditorCrumbEllipsis', '…');

    for(let i=start; i<this.history.length; ++i) {
      const crumb = div(breadcrumb, 'deckEditorCrumb', `<span>${html(this.history[i].label)}</span>`);
      crumb.classList.toggle('current', i == this.historyIndex);
      crumb.classList.toggle('future', i > this.historyIndex);
      crumb.title = this.history[i].label;
      crumb.onclick = _=>this.jumpToHistory(i, `${getPlayerDetails().playerName} jumped in history of deck ${this.deckID} in deck editor`);
    }

    breadcrumb.scrollLeft = breadcrumb.scrollWidth;
  }

  render() {
    this.renderHistory();
    // Render the card-types strip BEFORE the main card: the strip takes vertical space in the right column, so
    // measuring #deckEditorMain while the strip is still empty would size the card to a too-tall area and let
    // it overflow once the strip fills in.
    this.renderStrip();
    this.renderMain();
    this.renderLeftSidebar();
    this.renderSidebar();
    this.updateDragToolbar();
  }

  // Face 0 back / face 1 front is only the usual convention, so hedge with "usually" and drop the
  // hint entirely for decks with a non-standard number of faces.
  faceLabel(face) {
    if(face == 0)
      return 'Face 0 (back)';
    if(face == 1)
      return 'Face 1 (front)';
    return `Face ${face}`;
  }

  renderCard(cardType, face, target) {
    const card = new Card();
    return card.renderReadonlyCopyRaw({ deck: this.deckID, cardType, activeFace: face }, target);
  }

  renderMain() {
    const container = $('#deckEditorMain');
    container.innerHTML = '';
    this.mainCard = null;

    if(!this.deck())
      return;
    if(this.deckSymbolSelected)
      return div(container, 'deckEditorEmpty', '<p>Edit the default properties of every card in this deck in the properties panel, or select a card type in the "Card types" strip to edit that card.</p>');
    if(this.cardType === null)
      return div(container, 'deckEditorEmpty', '<p>This deck does not have any card types yet. Add one using the button in the bottom strip.</p>');
    if(!this.faceTemplates.length)
      return div(container, 'deckEditorEmpty', '<p>This deck does not have any faces yet. Use "Add face" in the top bar to add one.</p>');

    const wrapper = div(container, 'deckEditorCard');
    try {
      this.mainCard = this.renderCard(this.cardType, this.face, wrapper);
    } catch(e) {
      wrapper.remove();
      return div(container, 'deckEditorEmpty', `<p>Could not render card type ${html(String(this.cardType))}: ${html(String(e))}</p>`);
    }

    const cardWidth  = this.mainCard.get('width');
    const cardHeight = this.mainCard.get('height');
    const available = container.getBoundingClientRect();
    this.fitScale = Math.max(0.1, Math.min((available.width-100)/cardWidth, (available.height-100)/cardHeight));
    this.cardScale = this.fitScale * this.userZoom;

    wrapper.style.width  = cardWidth  + 'px';
    wrapper.style.height = cardHeight + 'px';
    this.cardWrapper = wrapper;
    this.applyCardTransform();

    // Grid overlay covering the card in its own design coordinates (shown only while the toolbar grid is on).
    const grid = div(wrapper, 'deckEditorGrid');
    grid.style.width  = cardWidth  + 'px';
    grid.style.height = cardHeight + 'px';

    this.refreshMainCardFaces();
  }

  // Applies the current fit scale, user zoom and pan to the card wrapper. Because cardScale includes the user
  // zoom, the object-drag math (which divides screen deltas by cardScale) keeps working unchanged.
  applyCardTransform() {
    if(!this.cardWrapper)
      return;
    this.cardWrapper.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.cardScale})`;
    this.cardWrapper.style.setProperty('--deckEditorCardScale', this.cardScale);
  }

  // Scroll-wheel / pinch zoom that keeps the point under the cursor fixed (mirrors the room's zoom-to-cursor).
  zoomCardAroundPoint(newZoom, clientX, clientY) {
    newZoom = Math.max(1, Math.min(6, newZoom));
    if(!this.cardWrapper || newZoom == this.userZoom)
      return;
    const container = $('#deckEditorMain').getBoundingClientRect();
    const centerX = container.left + container.width/2;
    const centerY = container.top + container.height/2;
    const ratio = newZoom / this.userZoom;
    this.panX = (clientX - centerX) * (1 - ratio) + this.panX * ratio;
    this.panY = (clientY - centerY) * (1 - ratio) + this.panY * ratio;
    this.userZoom = newZoom;
    if(this.userZoom == 1) { // back to fit: recenter
      this.panX = 0;
      this.panY = 0;
    }
    this.cardScale = this.fitScale * this.userZoom;
    this.applyCardTransform();
  }

  refreshMainCardFaces() {
    const card = this.mainCard;
    if(!card)
      return;

    Object.assign(card.state, this.cardTypes[this.cardType] || {});
    card.domElement.innerHTML = '';
    card.createFaces(this.faceTemplates);
    for(let face=0; face<card.domElement.children.length; ++face)
      card.domElement.children[face].classList.toggle('active', face == this.face);

    this.attachObjectHandlers();
    this.refreshTreePreviews();
    this.updateSelectionOutline(); // the objects were just re-created, so the rectangle has to be re-measured
  }

  // The tree's object previews are clones of the card's rendered objects, so they follow every card refresh -
  // typing in the right sidebar updates them right away, like the card type strip at the bottom. Only the
  // preview boxes are rebuilt (not the whole tree), and a box the user is typing in is left alone.
  refreshTreePreviews() {
    for(const preview of this.treeObjectPreviews) {
      if(!preview.box.isConnected || preview.box.contains(document.activeElement))
        continue;
      preview.box.className = 'deckEditorObjectPreview'; // a text preview adds its own class to the box
      preview.box.innerHTML = '';
      this.renderObjectPreview(preview.box, preview.index, preview.face);
    }
  }

  attachObjectHandlers() {
    if(!this.mainCard)
      return;
    const faceDiv = $a('.cardFace', this.mainCard.domElement)[this.face];
    if(!faceDiv)
      return;

    [...faceDiv.children].forEach((objectDiv, index)=>{
      objectDiv.classList.toggle('deckEditorSelectedObject', this.isObjectSelected(index));
      const pointerDown = (name, e)=>{
        e.stopPropagation();
        e.preventDefault();
        // Ctrl/Cmd or Shift picks up a second object instead of replacing the selection - and only changes the
        // selection, so a modifier click can't drag the objects around by accident.
        if(e.shiftKey)
          return this.extendObjectSelection(index, undefined, e.ctrlKey || e.metaKey);
        if(e.ctrlKey || e.metaKey)
          return this.toggleObjectSelection(index);
        if(!this.isObjectSelected(index))
          this.selectObject(index);
        this.startObjectDrag(name, e, index);
      };
      objectDiv.onmousedown  = e=>pointerDown('mousedown', e);
      objectDiv.ontouchstart = e=>pointerDown('touchstart', e);
    });
  }

  startObjectDrag(name, e, index) {
    // Flush before the first mousemove can mutate the working copy, so a pending typed edit is not absorbed
    // into the drag's commit. commit() snapshots synchronously, so not awaiting this here is safe.
    this.flushPendingCommits();

    // Dragging one object of a multi-selection moves the whole selection, so a group keeps its arrangement.
    const dragged = this.startPositions(this.faceTemplates[this.face].objects[index]);
    const collapseOnClick = this._selectedObjects.length > 1; // see up() below
    const startCoords = eventCoords(name, e);
    let moved = false;

    const move = ev=>{
      ev.preventDefault();
      const coords = eventCoords(ev.type, ev);
      const dx = (coords.clientX - startCoords.clientX) / this.cardScale;
      const dy = (coords.clientY - startCoords.clientY) / this.cardScale;
      if(Math.abs(dx) + Math.abs(dy) > 2)
        moved = true;
      if(!moved)
        return;
      for(const start of dragged) {
        start.object.x = Math.round(start.x + dx);
        start.object.y = Math.round(start.y + dy);
      }
      this.refreshMainCardFaces();
      this.updateDragToolbar();
    };
    const up = async ev=>{
      for(const event of [ 'mousemove', 'touchmove' ])
        document.removeEventListener(event, move);
      for(const event of [ 'mouseup', 'touchend', 'touchcancel' ])
        document.removeEventListener(event, up);
      if(moved) {
        await this.commit('faceTemplates', this.objectActionCause('moved', dragged.length));
        this.renderSidebar();
      } else if(collapseOnClick) {
        // A plain click on a member of a multi-selection keeps the group while the mouse is down (so it can
        // drag the whole group) but falls back to just this object when it turns out to be a click - the same
        // as clicking its row in the tree, and what keeps the next property edit from hitting all of them.
        this.selectObject(index);
      }
    };
    for(const event of [ 'mousemove', 'touchmove' ])
      document.addEventListener(event, move, { passive: false });
    for(const event of [ 'mouseup', 'touchend', 'touchcancel' ])
      document.addEventListener(event, up);
  }

  selectObject(index, face) {
    if(index !== null)
      this.activeArea = 'tree';
    // Clicking an object of another (expanded) face makes that face current first.
    if(index !== null && face !== undefined && face !== this.face) {
      if(this.deckID)
        this.expandedFaces.add(`${this.deckID}:${this.face}`); // keep the previously-open face expanded
      this.face = face;
      this.selectedObject = index;
      this.deckSymbolSelected = false;
      this.treeLevel = 'object';
      this.sidebarTab = 'object';
      this.render();
      return;
    }
    this.selectedObject = index;
    this.afterSelectionChanged();
  }

  // Ctrl/Cmd+click adds or removes one face object, so a property (or an alignment) can be applied to several of
  // them at once. Objects of another face can only be selected on their own - the working copy the sidebar edits
  // is always the shown face.
  toggleObjectSelection(index, face) {
    if(face !== undefined && face !== this.face)
      return this.selectObject(index, face);
    const at = this._selectedObjects.indexOf(index);
    if(at != -1)
      this._selectedObjects.splice(at, 1);
    else
      this._selectedObjects.push(index); // last = primary
    this.afterSelectionChanged();
  }

  // Shift+click selects everything between the primary object and the clicked one, like a file list: the range
  // becomes the whole selection, so objects picked up earlier and left outside it are dropped. Ctrl+Shift+click
  // is the additive version - it adds the range to what is already selected.
  extendObjectSelection(index, face, additive) {
    if((face !== undefined && face !== this.face) || this.selectedObject === null)
      return this.selectObject(index, face);
    const range = [];
    for(let i=Math.min(this.selectedObject, index); i<=Math.max(this.selectedObject, index); ++i)
      range.push(i);
    const kept = additive ? this._selectedObjects.filter(i=>range.indexOf(i) == -1) : [];
    this._selectedObjects = [ ...kept, ...range.filter(i=>i != index), index ]; // clicked object last = primary
    this.afterSelectionChanged();
  }

  selectAllObjects() {
    const face = this.faceTemplates[this.face];
    if(!face || !Array.isArray(face.objects) || !face.objects.length)
      return;
    this._selectedObjects = face.objects.map((_, index)=>index);
    this.afterSelectionChanged();
  }

  // Everything that has to follow a changed selection, however it was changed. The sidebar tab follows too:
  // picking an object shows its properties, dropping the selection falls back to the face the object lives on.
  afterSelectionChanged() {
    if(this.selectedObject !== null) {
      this.activeArea = 'tree';
      this.deckSymbolSelected = false; // selecting a face object leaves the card-defaults view
      this.treeLevel = 'object';
    }
    this.sidebarTab = this.selectedObject !== null ? 'object' : 'face';
    // Picking an object out of the tree while the card-defaults view was showing has to bring the card back:
    // the selection outline, the drag toolbar and align/distribute all work off the rendered card.
    if(this.selectedObject !== null && !this.mainCard)
      this.renderMain();
    this.attachObjectHandlers();
    this.renderLeftSidebar(); // keep the left face-object list's highlight in sync with the main card
    this.renderSidebar();
    this.updateDragToolbar();
  }

  selectedObjectTemplate() {
    const face = this.faceTemplates[this.face];
    if(!face || !Array.isArray(face.objects) || this.selectedObject === null)
      return null;
    return face.objects[this.selectedObject] || null;
  }

  selectedObjectDiv() {
    if(!this.mainCard || this.selectedObject === null)
      return null;
    const faceDiv = $a('.cardFace', this.mainCard.domElement)[this.face];
    return faceDiv ? faceDiv.children[this.selectedObject] : null;
  }

  // The rendered nodes of the selected objects, in the same order as selectedObjectTemplates/dragObjects - so
  // the same indices are dropped here as there and entry i always belongs to object i.
  selectedObjectDivs() {
    const objects = this.faceObjects();
    const faceDiv = this.mainCard ? $a('.cardFace', this.mainCard.domElement)[this.face] : null;
    if(!faceDiv)
      return [];
    return this.selectedObjectIndices().filter(index=>objects[index]).map(index=>faceDiv.children[index] || null);
  }

  // Align / distribute work on what is actually drawn (getBoundingClientRect, so rotated objects and auto-sized
  // icons line up by their visible box) and write the result back in the card's own coordinates - the same
  // approach the room editor's align toolbar takes with widgets.
  // Each object is paired with its own rendered node by index (not by position in two separately filtered
  // lists), and objects without a visible box are left out: a "display: false" object renders as display:none,
  // whose rect is all zeros, so aligning to it would teleport it by the card's offset on screen.
  alignItems() {
    const objects = this.faceObjects();
    const faceDiv = this.mainCard ? $a('.cardFace', this.mainCard.domElement)[this.face] : null;
    if(!faceDiv)
      return [];
    return this.selectedObjectIndices()
      .filter(index=>objects[index] && faceDiv.children[index])
      .map(index=>({ object: objects[index], rect: faceDiv.children[index].getBoundingClientRect() }))
      .filter(item=>item.rect.width || item.rect.height);
  }

  async alignObjects(property, lowerBound, upperBound, factor) {
    // Flush first, measure afterwards: besides not absorbing a pending typed edit into this action, flushing
    // can run a queued field edit that moves an object - the rects below have to describe the result of that.
    await this.flushPendingCommits();
    const items = this.alignItems();
    if(items.length < 2)
      return;
    const lower = Math.min(...items.map(item=>item.rect[lowerBound]));
    const target = lower + (Math.max(...items.map(item=>item.rect[upperBound])) - lower) * factor;
    for(const { object, rect } of items) {
      const own = rect[lowerBound] + (rect[upperBound] - rect[lowerBound]) * factor;
      object[property] = Math.round((object[property] || 0) - (own - target)/this.cardScale);
    }
    await this.finishAlignment(items.length, 'aligned');
  }

  async distributeObjects(property, lowerBound, upperBound) {
    await this.flushPendingCommits(); // flush before measuring, see alignObjects
    const items = this.alignItems();
    if(items.length < 3)
      return;
    const sorted = [...items].sort((a,b)=>a.rect[lowerBound] - b.rect[lowerBound]);
    const start = sorted[0].rect[lowerBound];
    const span = Math.max(...items.map(item=>item.rect[upperBound])) - start;
    const used = items.reduce((sum, item)=>sum + item.rect[upperBound] - item.rect[lowerBound], 0);
    const gap = (span - used) / (items.length - 1);
    let offset = 0;
    for(const { object, rect } of sorted) {
      object[property] = Math.round((object[property] || 0) - (rect[lowerBound] - start - offset)/this.cardScale);
      offset += gap + rect[upperBound] - rect[lowerBound];
    }
    await this.finishAlignment(items.length, 'distributed');
  }

  async finishAlignment(count, verb) {
    this.refreshMainCardFaces();
    await this.commit('faceTemplates', this.objectActionCause(verb, count));
    this.renderSidebar();
    this.updateDragToolbar();
  }

  // The selected object's orange rectangle. While the object stays well inside the card that rectangle is a CSS
  // outline on the object itself (.deckEditorSelectedObject), which hugs it and follows its rotation. That
  // outline is useless as soon as the object reaches the card's edge though: the face clips at its padding box,
  // so the rectangle of an object covering the whole card - or reaching past it - lands in the clipped area and
  // isn't drawn at all. For that case this puts a replacement rectangle into the card wrapper, outside the clip,
  // at the object's box clamped to the card - i.e. just inside the card's outer edge - and turns the object's
  // own outline off so only one rectangle is drawn.
  // Only the primary object can carry that replacement rectangle, so every other object gets the class taken
  // off again first - ctrl+clicking a second object makes it the new primary, and the old one would otherwise
  // keep an outline that is turned off with no rectangle standing in for it.
  updateSelectionOutline() {
    const objectDiv = this.selectedObjectDiv();
    const outline = this.selectionOutline;
    for(const clipped of $a('.deckEditorClippedObject', this.mainCard && this.mainCard.domElement))
      if(clipped != objectDiv)
        clipped.classList.remove('deckEditorClippedObject');
    if(!this.cardWrapper || !objectDiv) {
      if(outline)
        outline.style.display = 'none';
      return;
    }

    const scale = this.cardScale || 1;
    const rect = objectDiv.getBoundingClientRect();
    // What the face still shows: its border box minus the (uniform) border, minus the corner radius - both eat
    // into the rounded overflow: hidden clip. 0.5px of slack absorbs the subpixel rounding of the scaled card.
    const faceDiv = objectDiv.parentNode;
    const faceRect = faceDiv.getBoundingClientRect();
    const inset = (faceDiv.clientLeft + (parseFloat(getComputedStyle(faceDiv).borderTopLeftRadius) || 0))*scale - 0.5;
    const fits = rect.left >= faceRect.left + inset && rect.top >= faceRect.top + inset
              && rect.right <= faceRect.right - inset && rect.bottom <= faceRect.bottom - inset;
    objectDiv.classList.toggle('deckEditorClippedObject', !fits);
    if(fits) {
      if(outline)
        outline.style.display = 'none';
      return;
    }

    if(!this.selectionOutline || this.selectionOutline.parentNode != this.cardWrapper)
      this.selectionOutline = div(this.cardWrapper, 'deckEditorSelectionOutline');
    // Screen pixels back to the card's own design coordinates, so the rectangle rides along with pan and zoom.
    const cardRect = this.cardWrapper.getBoundingClientRect();
    const cardWidth = this.cardWrapper.offsetWidth;
    const cardHeight = this.cardWrapper.offsetHeight;
    const clamp = (v, max)=>Math.max(0, Math.min(max, v));
    const left = clamp((rect.left - cardRect.left)/scale, cardWidth);
    const top = clamp((rect.top - cardRect.top)/scale, cardHeight);
    // An object dragged off the card entirely still leaves a sliver at the edge it left through, so it stays
    // findable: the minimum is the two 3px edges of the rectangle itself (see .deckEditorSelectionOutline).
    const minSize = 6/scale;
    const width = Math.min(cardWidth, Math.max(clamp((rect.right - cardRect.left)/scale, cardWidth) - left, minSize));
    const height = Math.min(cardHeight, Math.max(clamp((rect.bottom - cardRect.top)/scale, cardHeight) - top, minSize));
    this.selectionOutline.style.display = '';
    this.selectionOutline.style.left = Math.min(left, cardWidth-width) + 'px';
    this.selectionOutline.style.top = Math.min(top, cardHeight-height) + 'px';
    this.selectionOutline.style.width = width + 'px';
    this.selectionOutline.style.height = height + 'px';
  }

  // What the Object tab's align row offers, with the number of selected objects each one needs: aligning takes
  // two, spreading them out evenly takes three.
  alignActions() {
    return [
      [ 'deckEditorAlignLeft',   'align_horizontal_left',   'Align the selected face objects to the left',   2, _=>this.alignObjects('x', 'left', 'right', 0) ],
      [ 'deckEditorAlignCenter', 'align_horizontal_center', 'Align the selected face objects to the center', 2, _=>this.alignObjects('x', 'left', 'right', 0.5) ],
      [ 'deckEditorAlignRight',  'align_horizontal_right',  'Align the selected face objects to the right',  2, _=>this.alignObjects('x', 'left', 'right', 1) ],
      [ 'deckEditorAlignTop',    'align_vertical_top',      'Align the selected face objects to the top',    2, _=>this.alignObjects('y', 'top', 'bottom', 0) ],
      [ 'deckEditorAlignMiddle', 'align_vertical_center',   'Align the selected face objects to the middle', 2, _=>this.alignObjects('y', 'top', 'bottom', 0.5) ],
      [ 'deckEditorAlignBottom', 'align_vertical_bottom',   'Align the selected face objects to the bottom', 2, _=>this.alignObjects('y', 'top', 'bottom', 1) ],
      [ 'deckEditorDistributeH', 'horizontal_distribute',   'Equalize the horizontal spacing between the selected face objects', 3, _=>this.distributeObjects('x', 'left', 'right') ],
      [ 'deckEditorDistributeV', 'vertical_distribute',     'Equalize the vertical spacing between the selected face objects',   3, _=>this.distributeObjects('y', 'top', 'bottom') ]
    ];
  }

  // The align row of the Object tab's toolbar, right above the selection it acts on. It stays visible with too
  // few objects selected (disabled, and saying what it would do) instead of appearing and disappearing.
  renderAlignToolbar(sidebar) {
    const bar = document.createElement('menu');
    bar.className = 'deckEditorSidebarToolbar deckEditorAlignToolbar';
    div(bar, 'deckEditorAlignLabel').textContent = 'Align:';
    for(const [ id, icon, title, minSelected, run ] of this.alignActions()) {
      // A disabled button receives no pointer events, so its own tooltip never opens - which is exactly the
      // state in which it needs to explain itself. The tooltip therefore sits on a wrapper around it instead.
      const wrapper = div(bar, 'deckEditorAlignButton');
      wrapper.title = `${title}. Needs ${minSelected} or more visible objects selected: ctrl+click objects on the card or in the list, or ctrl+A to take the whole face.`;
      const button = document.createElement('button');
      button.id = id;
      button.setAttribute('icon', icon);
      button.dataset.minSelected = minSelected;
      button.onclick = run;
      wrapper.append(button);
    }
    sidebar.append(bar);
    this.updateAlignToolbar();
  }

  // Enabled from what align/distribute can actually act on, not from the raw selection: alignItems() leaves out
  // objects without a visible box ("display: false"), so counting the selection would leave a button clickable
  // that then does nothing - e.g. one visible object plus a hidden one.
  updateAlignToolbar() {
    const buttons = $a('.deckEditorAlignToolbar button');
    if(!buttons.length)
      return;
    const usable = this.alignItems().length;
    for(const button of buttons)
      button.disabled = usable < +button.dataset.minSelected;
  }

  updateDragToolbar() {
    this.updateSelectionOutline();
    this.updateAlignToolbar();
    const toolbar = $('#deckEditorDragToolbar');
    const objectDiv = this.selectedObjectDiv();
    if(!objectDiv) {
      toolbar.classList.remove('active');
      return;
    }
    toolbar.classList.add('active');

    const rect = objectDiv.getBoundingClientRect();
    toolbar.style.top = rect.bottom + 10 + 'px';
    toolbar.style.right = (window.innerWidth - rect.right) + 'px';
    this.constrainDragToolbar();
  }

  constrainDragToolbar() {
    const toolbar = $('#deckEditorDragToolbar');
    const available = $('#deckEditorMain').getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const feedbackRect = $('#deckEditorDragToolbarFeedback').getBoundingClientRect();

    const newTop = Math.max(available.top, Math.min(available.bottom - feedbackRect.height - toolbarRect.height - 1, toolbarRect.top));
    toolbar.style.top = newTop + 'px';

    const newRight = Math.max(window.innerWidth - available.right + 10, Math.min(window.innerWidth - available.left - toolbarRect.width, parseFloat(toolbar.style.right)));
    toolbar.style.right = newRight + 'px';
  }

  // Adds/removes one card of every card type at once ("± All" in the strip header).
  async changeAllCardCounts(delta) {
    if(!this.deck())
      return;
    for(const type of Object.keys(this.cardTypes)) {
      const count = widgetFilter(w=>w.get('deck') == this.deckID && w.get('type') == 'card' && w.get('cardType') == type).length;
      await setCardCount(this.deck(), type, Math.max(0, count + delta));
    }
    this.renderStrip();
  }

  renderStrip() {
    const strip = $('#deckEditorStrip');
    const prevScroll = strip.scrollLeft; // rebuilding the tiles must not snap the strip back to the start
    strip.innerHTML = '';
    if(!this.deck())
      return this.updateStripOverflow(); // an empty strip hides nothing behind either edge

    // The card-type toolbar's copy/delete need a selected card type; "± All" needs at least one card type.
    $('#deckEditorStripCopy').disabled = this.cardType === null;
    $('#deckEditorStripDelete').disabled = this.cardType === null;
    const hasCardTypes = Object.keys(this.cardTypes).length > 0;
    $('#deckEditorCountAllRemove').disabled = !hasCardTypes;
    $('#deckEditorCountAllAdd').disabled = !hasCardTypes;

    // One entry per card type, always rendered on the actually-selected face so the strip is a reliable visual
    // indicator of which face is being worked on (even when that face looks the same on every card type).
    const stripFace = this.faceTemplates.length ? this.face : null;

    for(const cardType of Object.keys(this.cardTypes)) {
      const button = div(strip, 'deckEditorStripCard', `<div class=renderedCard></div><span>${html(cardType)}</span>`);
      const cardSel = !this.deckSymbolSelected && cardType == this.cardType;
      button.classList.toggle('selected', cardSel && this.activeArea == 'strip');
      button.classList.toggle('selectedInactive', cardSel && this.activeArea != 'strip');
      if(stripFace !== null) {
        try {
          const card = this.renderCard(cardType, stripFace, $('.renderedCard', button));
          const scale = Math.min(120 / card.get('width'), 90 / card.get('height'));
          $('.renderedCard', button).style.width  = card.get('width')  * scale + 'px';
          $('.renderedCard', button).style.height = card.get('height') * scale + 'px';
          card.domElement.style.transform = `scale(${scale})`;
          card.domElement.style.transformOrigin = 'top left';
        } catch(e) {
          $('.renderedCard', button).textContent = '?';
        }
      }
      button.onclick = _=>{
        this.cardType = cardType;
        this.activeArea = 'strip';
        this.deckSymbolSelected = false;
        this.selectedObject = null;
        this.sidebarTab = 'cardType';
        if(this.treeLevel == 'object')
          this.treeLevel = 'face';
        this.render();
      };
      // Drag-and-drop reordering of card types (dropping one onto another moves it to that position).
      button.draggable = true;
      button.ondragstart = e=>{
        this.dragCardTypeFrom = cardType;
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', cardType); } catch(_) {}
        button.classList.add('dragging');
      };
      button.ondragend = _=>{ button.classList.remove('dragging'); this.dragCardTypeFrom = null; };
      button.ondragover = e=>{ e.preventDefault(); e.dataTransfer.dropEffect = 'move'; button.classList.add('dragOver'); };
      button.ondragleave = _=>button.classList.remove('dragOver');
      button.ondrop = e=>{
        e.preventDefault();
        button.classList.remove('dragOver');
        if(this.dragCardTypeFrom && this.dragCardTypeFrom !== cardType)
          this.reorderCardType(this.dragCardTypeFrom, cardType);
      };
      // Per-card-type "cards in game" count with +/- right under the tile.
      const count = widgetFilter(w=>w.get('deck') == this.deckID && w.get('type') == 'card' && w.get('cardType') == cardType).length;
      const countRow = div(button, 'deckEditorStripCount', `<button icon=remove title="One fewer card of this type"></button><span class=deckEditorStripCountVal title="Cards of this type in the game">${count}</span><button icon=add title="One more card of this type"></button>`);
      countRow.draggable = false;
      countRow.onmousedown = e=>e.stopPropagation();
      countRow.ondragstart = e=>{ e.preventDefault(); e.stopPropagation(); };
      $('[icon=remove]', countRow).onclick = async e=>{ e.stopPropagation(); await setCardCount(this.deck(), cardType, Math.max(0, count-1)); this.renderStrip(); };
      $('[icon=add]',    countRow).onclick = async e=>{ e.stopPropagation(); await setCardCount(this.deck(), cardType, count+1); this.renderStrip(); };
    }
    // Restore the scroll position, then make sure a NEWLY selected tile is actually visible. Re-renders that
    // don't change the selection (card counts going up/down, "± All") must leave the strip scrolled where the
    // user left it instead of jumping back to the selected tile.
    strip.scrollLeft = prevScroll;
    const selectionKey = this.deckSymbolSelected ? '\0deck' : String(this.cardType);
    const selectedTile = $('.deckEditorStripCard.selected', strip);
    if(selectedTile && selectedTile.scrollIntoView && this.stripScrolledTo !== selectionKey)
      selectedTile.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.stripScrolledTo = selectionKey;
    this.updateStripOverflow();
  }

  // Which side of the strip still has card types hidden behind its edge, for the fades in deckeditor.css.
  updateStripOverflow() {
    const strip = $('#deckEditorStrip');
    const hidden = strip.scrollWidth - strip.clientWidth;
    strip.classList.toggle('deckEditorStripMoreLeft',  hidden > 1 && strip.scrollLeft > 1);
    strip.classList.toggle('deckEditorStripMoreRight', hidden > 1 && strip.scrollLeft < hidden - 1);
  }

  renderSidebar() {
    const sidebar = $('#deckEditorSidebar');
    // The shared add-object submenu may be parked in the sidebar (Object tab): move it back out before the
    // rebuild wipes it, renderSidebarToolbar puts it back if it still belongs here.
    const addSection = $('#deckEditorAddSection');
    if(addSection && sidebar.contains(addSection))
      $('#deckEditorAddSectionHost').append(addSection);
    this.sidebarAddButton = null;
    sidebar.innerHTML = '';
    const deck = this.deck();
    if(!deck)
      return;

    // A <header> element, so a tab reads as titled sections rather than a stack of divs. scopeClass carries
    // the topbar's blue/amber accent into the sidebar sections.
    const addHeader = (text, scopeClass, caption)=>{
      const header = document.createElement('header');
      header.className = `deckEditorSidebarHeader ${scopeClass}`;
      header.innerHTML = `<h2>${html(text)}</h2>${caption ? `<p>${html(caption)}</p>` : ''}`;
      sidebar.append(header);
    };

    // The type selector is shown ONLY here (when adding a new property); the created row is then a fixed field.
    // suggestions (optional) populate a datalist so known-but-currently-absent properties stay discoverable.
    const addPropertyRow = (target, onAdd, suggestions)=>{
      const listId = suggestions && suggestions.length ? `deckEditorPropSuggest${++this.suggestSeq}` : '';
      const list = listId ? `<datalist id=${listId}>${suggestions.map(s=>`<option value="${html(s)}">`).join('')}</datalist>` : '';
      const row = div(target, 'deckEditorAddProperty', `<input placeholder="new property"${listId ? ` list=${listId}` : ''}>${list}<select><option value="text">text</option><option value="number">number</option><option value="color">color</option><option value="true">true</option><option value="false">false</option><option value="object">object/array</option></select><button icon=add>Add</button>`);
      $('button', row).onclick = _=>{
        const property = $('input', row).value.trim();
        if(property)
          onAdd(property, $('select', row).value);
      };
    };

    const object = this.selectedObjectTemplate();

    // One tab per property scope, so only one kind of property is on screen at a time (see sidebarTabs).
    const tabs = this.sidebarTabs(object);
    if(this.deckSymbolSelected)
      this.sidebarTab = 'defaults'; // editing the deck itself *is* the card-defaults scope
    if(!tabs.some(t=>t.id == this.sidebarTab && t.available))
      this.sidebarTab = [ 'face', 'cardType', 'defaults' ].find(id=>tabs.some(t=>t.id == id && t.available)) || 'defaults';
    this.renderSidebarTabs(sidebar, tabs);
    this.renderSidebarToolbar(sidebar);

    if(this.sidebarTab == 'defaults') {
      this.renderCardDefaults(sidebar, addHeader, addPropertyRow);
      this.renderObjectHint();
      return;
    }

    if(this.sidebarTab == 'face') {
      this.renderEntireFaceSection(sidebar, addPropertyRow);
      this.renderObjectHint();
      return;
    }

    if(this.sidebarTab == 'cardType') {
      this.renderCardTypeSection(sidebar, addHeader, addPropertyRow);
      this.renderObjectHint();
      return;
    }

    // The object tab stays clickable without a selection, so a face object can be added straight from here.
    if(!object) {
      const note = document.createElement('p');
      note.className = 'deckEditorSectionNote';
      note.textContent = 'No face object is selected. Add one with the + above, or click an object on the card or in the list to the left to edit it. Ctrl+click picks several at once (ctrl+A takes the whole face) to edit or align them together.';
      sidebar.append(note);
      this.renderObjectHint();
      return;
    }

    // With more than one object selected every row edits all of them at once, so the header counts them instead
    // of naming one - but it still lists which ones (as the tree numbers them), so the selection can be checked
    // without looking away. The caption spells out what the rows below do, so the contrast with the amber
    // "different per card type" Dynamic properties section further down is stated, not just colored.
    const objects = this.selectedObjectTemplates();
    const multi = objects.length > 1;
    const numbers = this.selectedObjectIndices().map(index=>index+1);
    const listed = numbers.length > 8 ? `${numbers.slice(0, 8).join(', ')}, …` : numbers.join(', ');
    addHeader(multi ? `${objects.length} face objects selected (${listed})` : `Face object ${this.selectedObject+1} (${object.type || 'text'})`,
      'deckEditorScopeEveryCard', 'Same on every card type');
    // Note below (not part of) the header, in the same style as the Dynamic properties note.
    if(multi)
      div(sidebar, 'deckEditorSectionNote').textContent = 'Every row below changes all selected objects at once. A property the selected objects do not agree on shows as "(mixed)" until a new value is typed. Ctrl+click adds or removes an object, shift+click selects a range of them, ctrl+A the whole face.';
    else if(object.type == 'html')
      div(sidebar, 'deckEditorSectionNote').textContent = 'The JSON Editor should be used for editing HTML face objects.';

    // One cause/actionId per edited field: a typing burst on one property of one object stays one
    // breadcrumb/undo step, but edits to another property or object become their own step.
    const objectFieldArgs = property=>multi ? [
      `${getPlayerDetails().playerName} updated "${property}" of ${objects.length} face objects on face ${this.face} of deck ${this.deckID} in deck editor`,
      `field:faceTemplates:${this.face}:${this.selectedObjectIndices().join('+')}:${property}`
    ] : [
      `${getPlayerDetails().playerName} updated "${property}" of face object ${this.selectedObject+1} on face ${this.face} of deck ${this.deckID} in deck editor`,
      `field:faceTemplates:${this.face}:${this.selectedObject}:${property}`
    ];
    const deleteObjectProperty = async property=>{
      await this.flushPendingCommits();
      for(const selected of objects)
        delete selected[property];
      this.refreshMainCardFaces();
      const from = multi ? `${objects.length} face objects` : 'a face object';
      await this.commit('faceTemplates', `${getPlayerDetails().playerName} deleted property "${property}" of ${from} of deck ${this.deckID} in deck editor`);
      this.renderSidebar();
    };
    // Grouped into the same blocks the Edit Widget sidebar uses (see renderPropertyGroups); a property only one
    // of the selected objects has still gets a row, so it can be given to all of them in one go.
    const objectProperties = [...new Set(objects.flatMap(o=>Object.keys(o)))].filter(property=>property != 'dynamicProperties');
    const commonType = this.commonPropertyValue(objects, 'type');
    this.renderPropertyGroups(sidebar, objectProperties, 'object', (property, objectProps)=>{
      // The object's structural "type" is a dropdown of the valid types (not a free-typed field that could
      // be broken by a typo) and can't be deleted.
      if(property == 'type')
        return this.renderObjectTypeRow(objectProps, objects, objectFieldArgs('type'));
      // Known object properties get a fixed field type (number or text) with no type selector; the value's
      // JS type decides for anything custom. A "(mixed)" row has no value to read that type from, so it is
      // taken from the first object that has the property set - otherwise a mixed checkbox/JSON row would
      // fall back to a text field and write a string ("false") where a boolean belongs.
      const common = this.commonPropertyValue(objects, property);
      const fieldType = this.objectFieldType(property) || this.valueFieldType(common.sample);
      const onValueChanged = v=>this.queueFieldEdit(async _=>{
        await this.flushPendingCommitForOtherField('faceTemplates', objectFieldArgs(property)[1]);
        for(const selected of objects)
          selected[property] = v;
        this.refreshMainCardFaces();
        this.updateDragToolbar();
        this.scheduleCommit('faceTemplates', ...objectFieldArgs(property));
      });
      // The object's css styles the box it is drawn in. Only an HTML object gets class/selector sections:
      // for every other type the engine writes it into the style attribute of that box (card.js). Declarations
      // can only be edited from a shared starting point, so a "(mixed)" css stays the plain row below until
      // the selected objects are given the same value.
      if(this.isCssProperty(property) && !common.mixed) {
        this.addCssEditor(objectProps, property, {
          stateKey: `${this.deckID}:faceTemplates:${this.face}:${this.selectedObjectIndices().join('+')}:${property}`,
          getValue: _=>this.commonPropertyValue(objects, property).value,
          setValue: v=>this.queueFieldEdit(async _=>{
            await this.flushPendingCommitForOtherField('faceTemplates', objectFieldArgs(property)[1]);
            for(const selected of objects) {
              if(v === null) // no declaration left is no css property, rather than a "css": null in the deck
                delete selected[property];
              else
                selected[property] = v;
            }
            this.refreshMainCardFaces();
            this.scheduleCommit('faceTemplates', ...objectFieldArgs(property));
          }),
          allowClasses: !commonType.mixed && commonType.value == 'html',
          defaultLabel: property == 'css' ? 'The object itself' : undefined,
          defaultInfo: !commonType.mixed && commonType.value == 'html' ? 'Declarations applied to the object itself. Other sections are selectors matched inside its HTML.' : 'Declarations applied to the box this object is drawn in.',
          onDelete: _=>deleteObjectProperty(property)
        });
        return;
      }
      const row = this.addTypedInput(property, common.value, onValueChanged, objectProps, fieldType, true, common.mixed);
      // The object's own value is an image/icon: a picker button opens the same chip picker the Edit
      // Widgets tab uses for a basic widget's Content section, right below this row.
      if(property == 'value' && !commonType.mixed && (commonType.value == 'image' || commonType.value == 'icon'))
        this.addAssetPickerToRow(row, objectProps, commonType.value, _=>this.commonPropertyValue(objects, property).value, onValueChanged);
      // A color-named property (color, strokeColor, …) or a color-looking value gets a swatch + color picker.
      else
        this.addColorPickerToRow(row, objectProps, property, onValueChanged);
      // Per-row "make different per card type" (split) button removed; that binding is created from the
      // Dynamic properties section's Link control below. Only the delete (trash) button stays on the row.
      this.addPropertyDeleteButton(row, property, _=>deleteObjectProperty(property));
    }, 'deckEditorObjectProperties');
    addPropertyRow(sidebar, (property, type)=>this.queueFieldEdit(async _=>{
      if(property == 'dynamicProperties' || objects.every(selected=>selected[property] !== undefined))
        return;
      await this.flushPendingCommitForOtherField('faceTemplates', objectFieldArgs(property)[1]);
      for(const selected of objects)
        if(selected[property] === undefined)
          selected[property] = this.initialValueForType(type);
      this.scheduleCommit('faceTemplates', ...objectFieldArgs(property));
      this.renderSidebar();
    }));

    // Bindings are per object (they name the card type property each one reads), so they stay a single-object
    // affair. The section keeps its header with several objects selected and says so, instead of silently
    // disappearing - a whole panel vanishing on a ctrl+click reads as a bug.
    this.renderDynamicProperties(sidebar, multi ? null : object);

    // No "Delete object" button here — objects are deleted from the left face-object list (or Delete key).
    this.renderObjectHint();
  }

  // The four property scopes the sidebar can edit, in the order the tree presents them: the deck's card
  // defaults, the shown face, the selected card type and the selected face object. Each one is a tab, and only
  // the active tab's sections are rendered - so a tab is one focused list instead of a stack of unrelated bands.
  // The scope also picks the color: blue = shared by every card, amber = differs per card type.
  sidebarTabs(object) {
    const face = this.faceTemplates[this.face];
    return [
      { id: 'defaults', label: 'All Cards', icon: 'style', scope: 'deckEditorScopeEveryCard', available: true,
        title: 'The properties every card of this deck starts with' },
      { id: 'face', label: 'Face', icon: 'crop_portrait', scope: 'deckEditorScopeEveryCard', available: !!face,
        title: face ? `Settings of ${this.faceLabel(this.face).toLowerCase()}, on every card of this deck`
                    : 'This deck does not have any faces yet' },
      { id: 'cardType', label: 'Card Type', icon: 'label', scope: 'deckEditorScopeThisType', available: this.cardType !== null,
        title: this.cardType === null ? 'Select a card type in the strip below to edit its properties'
                                      : `The properties of card type "${this.cardType}" alone` },
      // Selecting an object is not required to open this tab: without one it still offers the + that adds a
      // face object, so an empty face can be filled without going through the tree.
      { id: 'object', label: 'Object', icon: 'category', scope: 'deckEditorScopeEveryCard', available: !!face,
        title: this._selectedObjects.length > 1 ? `${this._selectedObjects.length} face objects of ${this.faceLabel(this.face).toLowerCase()} — every property here is set on all of them`
             : object ? `Face object ${this.selectedObject+1} of ${this.faceLabel(this.face).toLowerCase()}`
                      : 'Add a face object, or click one on the card or in the list to the left to edit it' }
    ];
  }

  // The same add / copy / delete the left tree toolbar offers, repeated at the top of every tab and scoped to
  // that tab: the deck, the shown face, the selected card type or the selected face object can be added,
  // copied and deleted without leaving the sidebar. The Object tab's "+" reveals the very same "Add to: All
  // Cards / Card Type" submenu the tree's "+" does - it is one node that moves here (see openAddSectionIn).
  renderSidebarToolbar(sidebar) {
    const hasDeck = !!this.deck();
    const hasFace = !!this.faceTemplates[this.face];
    const hasType = this.cardType !== null;
    const hasObject = !!this.selectedObjectTemplate();
    const objectNoun = this._selectedObjects.length > 1 ? 'objects' : 'object';
    const actions = {
      defaults: [
        [ 'Add a new deck to the game', true, _=>this.openNewDeckOverlay() ],
        [ 'Copy this deck', hasDeck, _=>this.copyDeck() ],
        [ 'Delete this deck', hasDeck, _=>this.deleteDeck() ]
      ],
      face: [
        [ 'Add a face to this deck', hasDeck, _=>this.addFace() ],
        [ 'Copy the shown face', hasFace, _=>this.copyFace() ],
        [ 'Delete the shown face', hasFace, _=>this.deleteFace() ]
      ],
      cardType: [
        [ 'Add a blank card type', hasDeck, _=>this.addCardType() ],
        [ 'Copy the selected card type', hasType, _=>this.addCardType(this.cardType) ],
        [ 'Delete the selected card type', hasType, _=>this.deleteCardType() ]
      ],
      object: [
        [ 'Add a face object to this face', hasFace, null ], // wired to the submenu below
        [ `Copy the selected face ${objectNoun}`, hasObject, _=>this.copySelectedObject() ],
        [ `Delete the selected face ${objectNoun}`, hasObject, _=>this.deleteSelectedObject() ]
      ]
    }[this.sidebarTab];
    if(!actions)
      return;

    // A <menu>: this is a list of actions, not one more block of properties.
    const bar = document.createElement('menu');
    bar.className = 'deckEditorSidebarToolbar';
    sidebar.append(bar);
    const buttons = [ 'add', 'content_copy', 'delete_forever' ].map((icon, i)=>{
      const [ title, enabled, run ] = actions[i];
      const button = document.createElement('button');
      button.setAttribute('icon', icon);
      button.title = title;
      button.disabled = !enabled;
      if(run)
        button.onclick = run;
      bar.append(button);
      return button;
    });

    if(this.sidebarTab == 'object') {
      const host = document.createElement('aside');
      host.className = 'deckEditorSidebarAddHost';
      sidebar.append(host);
      this.sidebarAddButton = buttons[0];
      buttons[0].onclick = _=>this.openAddSectionIn(host, 'sidebar');
      if(this.addSectionOpen && this.addSectionHost == 'sidebar')
        host.append($('#deckEditorAddSection')); // it was open here before this rebuild: put it back
      // Align / distribute act on the face-object selection, so they live with the selection's other actions
      // here rather than in the top bar, which is about the deck as a whole.
      this.renderAlignToolbar(sidebar);
    } else if(this.addSectionHost == 'sidebar') {
      this.addSectionOpen = false; // the submenu belongs to the Object tab only
      this.addSectionHost = 'tree';
    }
    this.updateAddSection();
  }

  // The add-object submenu is a single node that moves to whichever "+" opened it (the tree toolbar's or the
  // Object tab's), so both share its "Add to:" mode and its type buttons. Clicking the "+" it is already
  // attached to closes it again.
  openAddSectionIn(host, where) {
    this.lastTreeClickKey = null; // don't let the next tree click read as a double click
    const section = $('#deckEditorAddSection');
    if(!section || !host)
      return;
    this.addSectionOpen = !(this.addSectionOpen && this.addSectionHost == where);
    this.addSectionHost = where;
    if(this.addSectionOpen)
      host.append(section);
    this.updateAddSection();
  }

  renderSidebarTabs(sidebar, tabs) {
    // A <nav>: the tab bar navigates between scopes, it does not edit anything.
    const nav = document.createElement('nav');
    nav.id = 'deckEditorTabs';
    sidebar.append(nav);
    for(const tab of tabs) {
      const button = document.createElement('button');
      button.id = `deckEditorTab_${tab.id}`;
      button.className = `deckEditorTab ${tab.scope}`;
      button.setAttribute('icon', tab.icon);
      button.textContent = tab.label;
      button.title = tab.title;
      button.classList.toggle('active', this.sidebarTab == tab.id);
      button.disabled = !tab.available;
      button.onclick = _=>this.setSidebarTab(tab.id);
      nav.append(button);
    }
  }

  // The card-defaults tab edits the deck itself rather than one of its card types, so switching to it also
  // drops the card-type-level selection - which keeps the card view matching the tab.
  setSidebarTab(id) {
    this.sidebarTab = id;
    this.deckSymbolSelected = id == 'defaults';
    if(this.deckSymbolSelected) {
      this.selectedObject = null;
      if(this.treeLevel == 'object')
        this.treeLevel = 'face';
    }
    this.render();
  }

  // The selected card type's own properties: its name plus everything only cards of this type carry.
  renderCardTypeSection(sidebar, addHeader, addPropertyRow) {
    if(this.cardType === null)
      return;
    addHeader('Card type properties', 'deckEditorScopeThisType', 'Only for this card type');

    const nameRow = div(sidebar, 'deckEditorCardTypeName', `<label>Name</label><input value="${html(String(this.cardType))}">`);
    $('input', nameRow).onchange = e=>{
      const newName = e.target.value;
      if(newName && newName != this.cardType && !this.cardTypes[newName])
        this.renameCardType(this.cardType, newName);
      else
        e.target.value = this.cardType;
    };

    // The per-card-type "Cards in game" +/- now lives under each card type tile in the bottom strip.
    const typeProperties = this.cardTypes[this.cardType];
    const typeFieldArgs = property=>[
      `${getPlayerDetails().playerName} updated "${property}" of card type "${this.cardType}" of deck ${this.deckID} in deck editor`,
      `field:cardTypes:${this.cardType}:${property}`
    ];
    // Properties a face object binds to are structural: the object reads them, so their row must stay even
    // when blank. Only free-standing properties get a trash (which removes the whole row + JSON); to remove a
    // bound one, remove the object's binding.
    const boundProperties = new Set();
    for(const face of this.faceTemplates)
      for(const object of face.objects || [])
        for(const property of Object.values(object.dynamicProperties || {}))
          boundProperties.add(property);
    const deleteTypeProperty = async property=>{
      await this.flushPendingCommits();
      delete typeProperties[property];
      if(this.mainCard)
        delete this.mainCard.state[property];
      this.refreshMainCardFaces();
      await this.commit('cardTypes', `${getPlayerDetails().playerName} deleted property "${property}" of card type "${this.cardType}" of deck ${this.deckID} in deck editor`);
      this.renderSidebar();
    };
    const addTypeInput = (property, typeProps)=>{
      const onValueChanged = v=>this.queueFieldEdit(async _=>{
        await this.flushPendingCommitForOtherField('cardTypes', typeFieldArgs(property)[1]);
        typeProperties[property] = v;
        this.refreshMainCardFaces();
        this.scheduleCommit('cardTypes', ...typeFieldArgs(property));
      });
      // a card type property becomes a property of the cards of that type, so its css is a widget css
      if(this.isCssProperty(property)) {
        this.addCssEditor(typeProps, property, {
          stateKey: `${this.deckID}:cardTypes:${this.cardType}:${property}`,
          getValue: _=>typeProperties[property],
          setValue: v=>this.queueFieldEdit(async _=>{
            await this.flushPendingCommitForOtherField('cardTypes', typeFieldArgs(property)[1]);
            if(v === null) // no declaration left is no css property, rather than a "css": null in the deck
              delete typeProperties[property];
            else
              typeProperties[property] = v;
            this.refreshMainCardFaces();
            this.scheduleCommit('cardTypes', ...typeFieldArgs(property));
          }),
          defaultLabel: property == 'css' ? 'Cards of this type' : undefined,
          defaultInfo: 'Declarations applied to the cards of this card type. Other sections style parts of a card (like "&nbsp;> .cardFace") or states like ":hover".',
          selectorSuggestions: cssSelectorSuggestions.card,
          onDelete: boundProperties.has(property) ? null : _=>deleteTypeProperty(property)
        });
        return;
      }
      const row = this.addTypedInput(property, typeProperties[property], onValueChanged, typeProps);
      // The sorting properties of the standard decks say on hover what they are for - on the label too, which
      // carries a tooltip of its own (the property name, for names the label column cuts off).
      const hint = this.cardTypePropertyHint(property, typeProperties);
      if(hint) {
        row.dom.title = `${property} — ${hint}`;
        const label = $('.deckEditorPropertyLabel', row.dom);
        if(label)
          label.title = row.dom.title;
      }
      // A custom asset value, or a property bound to an image/icon face object's "value", gets a picker too.
      const boundKind = this.assetPickerKindForCardTypeProperty(property);
      if(boundKind || this.isAssetValue(typeProperties[property]))
        this.addAssetPickerToRow(row, typeProps, boundKind || 'image', ()=>typeProperties[property], onValueChanged);
      else
        this.addColorPickerToRow(row, typeProps, property, onValueChanged);
      if(!boundProperties.has(property))
        this.addPropertyDeleteButton(row, property, _=>deleteTypeProperty(property));
    };
    const typePropertyNames = [ ...Object.keys(typeProperties) ];
    for(const property of boundProperties)
      if(typeof typeProperties[property] === 'undefined' && [ 'cardType', 'id' ].indexOf(property) == -1)
        typePropertyNames.push(property);
    // No property groups here: every property of a card type is defined by the game, so sorting them by the
    // engine's names would put "name" under Content and "cost" under Custom purely by coincidence of naming.
    const typeProps = div(sidebar, 'deckEditorProperties');
    for(const property of typePropertyNames)
      addTypeInput(property, typeProps);
    addPropertyRow(sidebar, (property, type)=>this.queueFieldEdit(async _=>{
      if(typeProperties[property] !== undefined)
        return;
      await this.flushPendingCommitForOtherField('cardTypes', typeFieldArgs(property)[1]);
      typeProperties[property] = this.initialValueForType(type);
      this.scheduleCommit('cardTypes', ...typeFieldArgs(property));
      this.renderSidebar();
    }));

  }

  // The "Entire face" section: whole-face settings (on every card of the deck). border/radius are plain numbers
  // (0 = absent); "enlarge" is stored under the face template's "properties" object so it reaches the card.
  renderEntireFaceSection(sidebar, addPropertyRow) {
    const face = this.faceTemplates[this.face];
    if(!face)
      return;
    const header = document.createElement('header');
    header.className = 'deckEditorSidebarHeader deckEditorScopeEveryCard';
    header.innerHTML = `<h2>Entire face properties</h2><p>${html(this.faceLabel(this.face))} of every card</p>`;
    sidebar.append(header);

    const faceProps = div(sidebar, 'deckEditorProperties');
    const fieldArgs = property=>[
      `${getPlayerDetails().playerName} updated "${property}" of face ${this.face} of deck ${this.deckID} in deck editor`,
      `field:faceTemplates:face:${this.face}:${property}`
    ];
    // A trash on a number row (addNumberInput returns the row div, addPropertyDeleteButton wants {dom}).
    const addFaceTrash = (row, property, onDelete)=>this.addPropertyDeleteButton({ dom: row }, property, onDelete);
    const deleteCause = property=>`${getPlayerDetails().playerName} deleted property "${property}" of face ${this.face} of deck ${this.deckID} in deck editor`;
    const deleteFaceTemplateProperty = async property=>{
      await this.flushPendingCommits();
      delete face[property];
      this.refreshMainCardFaces();
      await this.commit('faceTemplates', deleteCause(property));
      this.renderSidebar();
    };

    // border & radius live on the face template itself (numbers). Like the Card type section, a property is a
    // row only while it exists, so its trash removes the whole row; add absent ones from the row below.
    for(const property of [ 'border', 'radius' ]) {
      if(face[property] === undefined)
        continue;
      const row = this.addNumberInput(property, face[property], value=>this.queueFieldEdit(async _=>{
        await this.flushPendingCommitForOtherField('faceTemplates', fieldArgs(property)[1]);
        face[property] = value;
        this.refreshMainCardFaces();
        this.scheduleCommit('faceTemplates', ...fieldArgs(property));
      }), faceProps);
      addFaceTrash(row, property, _=>deleteFaceTemplateProperty(property));
    }

    // The face template's own css (face.css) styles the face itself - the engine writes it into the style
    // attribute of the face div (createFaces in card.js), so it has no class/selector sections.
    for(const property of Object.keys(face)) {
      if(!this.isCssProperty(property))
        continue;
      this.addCssEditor(faceProps, property, {
        stateKey: `${this.deckID}:faceTemplates:${this.face}:${property}`,
        getValue: _=>face[property],
        setValue: value=>this.queueFieldEdit(async _=>{
          await this.flushPendingCommitForOtherField('faceTemplates', fieldArgs(property)[1]);
          if(value === null) // no declaration left is no css property, rather than a "css": null in the deck
            delete face[property];
          else
            face[property] = value;
          this.refreshMainCardFaces();
          this.scheduleCommit('faceTemplates', ...fieldArgs(property));
        }),
        allowClasses: false,
        defaultLabel: 'The face itself',
        defaultInfo: 'Declarations applied to the face of every card of this deck. The engine writes them into the style attribute of the face, so they cannot have class/selector sections.',
        onDelete: _=>deleteFaceTemplateProperty(property)
      });
    }

    // Properties that reach the card live under face.properties (enlarge and any custom ones).
    const setFaceProperty = (property, value)=>{
      if(!face.properties || typeof face.properties != 'object')
        face.properties = {};
      face.properties[property] = value;
    };
    const deleteFaceProperty = async property=>{
      await this.flushPendingCommits();
      if(face.properties) {
        delete face.properties[property];
        if(!Object.keys(face.properties).length)
          delete face.properties;
      }
      this.refreshMainCardFaces();
      await this.commit('faceTemplates', deleteCause(property));
      this.renderSidebar();
    };
    const faceProperties = (face.properties && typeof face.properties == 'object') ? face.properties : {};
    // enlarge is a known number property; then any custom ones the user added. All rendered only while present.
    if(faceProperties.enlarge !== undefined) {
      const enlargeRow = this.addNumberInput('enlarge', faceProperties.enlarge, value=>this.queueFieldEdit(async _=>{
        await this.flushPendingCommitForOtherField('faceTemplates', fieldArgs('enlarge')[1]);
        setFaceProperty('enlarge', value);
        this.refreshMainCardFaces();
        this.scheduleCommit('faceTemplates', ...fieldArgs('enlarge'));
      }), faceProps);
      addFaceTrash(enlargeRow, 'enlarge', _=>deleteFaceProperty('enlarge'));
    }
    for(const property of Object.keys(faceProperties)) {
      if(property == 'enlarge')
        continue;
      // face.properties reaches the card widget, so a css there is the card's own css while this face is
      // up - a widget css, unlike the face template's css above
      if(this.isCssProperty(property)) {
        this.addCssEditor(faceProps, property, {
          stateKey: `${this.deckID}:faceTemplates:${this.face}:properties:${property}`,
          getValue: _=>faceProperties[property],
          setValue: value=>this.queueFieldEdit(async _=>{
            await this.flushPendingCommitForOtherField('faceTemplates', fieldArgs(property)[1]);
            if(value === null)
              delete faceProperties[property];
            else
              setFaceProperty(property, value);
            this.refreshMainCardFaces();
            this.scheduleCommit('faceTemplates', ...fieldArgs(property));
          }),
          defaultLabel: property == 'css' ? 'Every card showing this face' : undefined,
          defaultInfo: 'Declarations applied to the whole card while this face is the one shown - unlike the css above, which styles the face itself.',
          selectorSuggestions: cssSelectorSuggestions.card,
          onDelete: _=>deleteFaceProperty(property)
        });
        continue;
      }
      const row = this.addTypedInput(property, faceProperties[property], value=>this.queueFieldEdit(async _=>{
        await this.flushPendingCommitForOtherField('faceTemplates', fieldArgs(property)[1]);
        setFaceProperty(property, value);
        this.refreshMainCardFaces();
        this.scheduleCommit('faceTemplates', ...fieldArgs(property));
      }), faceProps);
      this.addColorPickerToRow(row, faceProps, property, value=>this.queueFieldEdit(async _=>{
        await this.flushPendingCommitForOtherField('faceTemplates', fieldArgs(property)[1]);
        setFaceProperty(property, value);
        this.refreshMainCardFaces();
        this.scheduleCommit('faceTemplates', ...fieldArgs(property));
      }));
      this.addPropertyDeleteButton(row, property, _=>deleteFaceProperty(property));
    }

    // Add a whole-face property. border/radius and css are on the face template itself; enlarge and custom ones
    // live under face.properties. Known face knobs are offered as datalist suggestions so they stay discoverable.
    const faceLevel = property=>[ 'border', 'radius' ].indexOf(property) != -1 || this.isCssProperty(property);
    const hasFaceProperty = property=>faceLevel(property) ? face[property] !== undefined : faceProperties[property] !== undefined;
    const suggestions = [ 'border', 'radius', 'enlarge', 'css' ].filter(p=>!hasFaceProperty(p));
    addPropertyRow(sidebar, (property, type)=>this.queueFieldEdit(async _=>{
      if(hasFaceProperty(property))
        return;
      await this.flushPendingCommitForOtherField('faceTemplates', fieldArgs(property)[1]);
      if(this.isCssProperty(property))
        face[property] = {}; // an empty declaration list to fill in
      else if(faceLevel(property))
        face[property] = 0; // border/radius are numeric face-template properties
      else
        setFaceProperty(property, property == 'enlarge' ? 0 : this.initialValueForType(type));
      this.scheduleCommit('faceTemplates', ...fieldArgs(property));
      this.renderSidebar();
    }), suggestions);
  }

  // The left "file directory" tree: Decks (top level, names only) → the current deck's Faces (names only) →
  // the current face's objects (numbered, with previews). Selecting a node sets the level (deck/face/object)
  // the unified add/copy/delete toolbar acts on.
  renderLeftSidebar() {
    this.updateAddSection();
    const tree = $('#deckEditorTree');
    if(tree) {
      // Preserve the deck-id field's focus/caret across the rebuild: selecting the deck re-renders the tree,
      // which would otherwise blur the field mid-edit. Same for a text object's preview field: clicking it to
      // select the object (see renderPreviewTextField) re-renders the tree before the click can place a caret.
      const focused = document.activeElement;
      const keepIdFocus = focused && focused.classList && focused.classList.contains('deckEditorTreeDeckId');
      const idCaret = keepIdFocus ? [ focused.selectionStart, focused.selectionEnd ] : null;
      const keepPreviewFocus = focused && focused.classList && focused.classList.contains('deckEditorPreviewText');
      const previewCaret = keepPreviewFocus ? [ focused.selectionStart, focused.selectionEnd ] : null;
      tree.innerHTML = '';
      this.treeObjectPreviews = []; // filled by renderTreeObjectRow, refreshed on every card refresh
      for(const deck of widgetFilter(w=>w.get('type') == 'deck')) {
        const isCurrent = deck.id == this.deckID;
        // A branch is expanded when it's the current deck/face or the user opened it; single click expands +
        // selects (leaving other branches open), double click collapses. Objects only render for the current
        // deck (its faces are the loaded working copy); expanding a face of another deck switches to it.
        const deckExpanded = !this.collapsedDecks.has(deck.id) && (isCurrent || this.expandedDecks.has(deck.id));
        // The current deck's id is editable inline; other decks show a plain label.
        const deckRow = div(tree, 'deckEditorTreeNode deckEditorTreeDeck', `<span class=deckEditorTreeIcon icon=style></span>` + (isCurrent
          ? `<input class=deckEditorTreeDeckId title="Edit the deck's id">`
          : `<span class=deckEditorTreeLabel>${html(deck.id)}</span>`));
        if(isCurrent) {
          const idInput = $('.deckEditorTreeDeckId', deckRow);
          idInput.value = deck.id;
          // Clicking the field still selects the deck node (so the tree toolbar acts on the deck); the caret is
          // restored below after the resulting re-render so typing isn't interrupted. Enter/blur commits the id.
          idInput.onkeydown = e=>{ if(e.key == 'Enter') idInput.blur(); };
          idInput.onchange = _=>{ const v = idInput.value.trim(); if(v && v != deck.id) this.changeDeckId(v); else idInput.value = deck.id; };
        }
        const deckSel = isCurrent && this.treeLevel == 'deck';
        deckRow.classList.toggle('selected', deckSel && this.activeArea == 'tree');
        deckRow.classList.toggle('selectedInactive', deckSel && this.activeArea != 'tree');
        deckRow.classList.toggle('deckEditorTreeExpanded', deckExpanded);
        this.wireTreeExpandCollapse(deckRow, `deck:${deck.id}`, _=>{ this.collapsedDecks.delete(deck.id); this.expandedDecks.add(deck.id); this.selectDeckNode(deck.id); }, _=>{ this.collapsedDecks.add(deck.id); this.expandedDecks.delete(deck.id); this.renderLeftSidebar(); });
        if(!deckExpanded)
          continue;
        const faceTemplates = isCurrent ? this.faceTemplates : (deck.get('faceTemplates') || []);
        for(let f=0; f<faceTemplates.length; ++f) {
          const faceKey = `${deck.id}:${f}`;
          const faceExpanded = !this.collapsedFaces.has(faceKey) && ((isCurrent && f == this.face) || this.expandedFaces.has(faceKey));
          const faceRow = div(tree, 'deckEditorTreeNode deckEditorTreeFace', `<span class=deckEditorTreeIcon icon=crop_portrait></span><span class=deckEditorTreeLabel>${html(this.faceLabel(f))}</span>`);
          const faceSel = isCurrent && f == this.face && this.treeLevel == 'face';
          faceRow.classList.toggle('selected', faceSel && this.activeArea == 'tree');
          faceRow.classList.toggle('selectedInactive', faceSel && this.activeArea != 'tree');
          faceRow.classList.toggle('deckEditorTreeExpanded', faceExpanded);
          this.wireTreeExpandCollapse(faceRow, `face:${faceKey}`, _=>{ this.collapsedFaces.delete(faceKey); this.expandedFaces.add(faceKey); this.selectFaceNodeIn(deck.id, f); }, _=>{ this.collapsedFaces.add(faceKey); this.expandedFaces.delete(faceKey); this.renderLeftSidebar(); });
          if(!faceExpanded || !isCurrent)
            continue;
          const face = faceTemplates[f];
          const objects = face && Array.isArray(face.objects) ? face.objects : [];
          if(!objects.length)
            div(tree, 'deckEditorTreeNode deckEditorTreeEmpty', '<span class=deckEditorTreeLabel>(no objects)</span>');
          objects.forEach((object, index)=>this.renderTreeObjectRow(tree, object, index, f));
        }
      }
      // Keep the selected object's row visible (e.g. when it was selected by clicking it in the big card view).
      const selectedRow = this.selectedObject !== null ? $a('.deckEditorObjectRow', tree)[this.selectedObject] : null;
      if(selectedRow)
        selectedRow.scrollIntoView({ block: 'nearest' });
      if(keepIdFocus) {
        const newInput = $('.deckEditorTreeDeckId', tree);
        if(newInput) {
          newInput.focus();
          try { newInput.setSelectionRange(idCaret[0], idCaret[1]); } catch(e) {}
        }
      }
      if(keepPreviewFocus) {
        const focusedRow = $('.deckEditorObjectRow.selected', tree);
        const newInput = focusedRow ? $('.deckEditorPreviewText', focusedRow) : null;
        if(newInput) {
          newInput.focus();
          try { newInput.setSelectionRange(previewCaret[0], previewCaret[1]); } catch(e) {}
        }
      }
    }
    this.updateTreeToolbar();
  }

  renderTreeObjectRow(tree, object, index, face = this.face) {
    const typeIcon = { text: 'format_size', image: 'image', icon: 'add_reaction', html: 'code' }[object.type || 'text'] || 'category';
    const row = div(tree, 'deckEditorTreeNode deckEditorObjectRow', `<span class=deckEditorObjectNum>${index+1}</span><span class=deckEditorTreeIcon icon=${typeIcon}></span><div class=deckEditorObjectPreview></div>`);
    const objSel = face === this.face && this.isObjectSelected(index);
    row.classList.toggle('selected', objSel && this.activeArea == 'tree');
    row.classList.toggle('selectedInactive', objSel && this.activeArea != 'tree');
    row.title = `Face object ${index+1} (${object.type || 'text'}) — Ctrl+click to select several at once`;
    const previewBox = $('.deckEditorObjectPreview', row);
    this.treeObjectPreviews.push({ box: previewBox, index, face });
    this.renderObjectPreview(previewBox, index, face);
    row.onclick = e=>{
      if(e.shiftKey)
        return this.extendObjectSelection(index, face, e.ctrlKey || e.metaKey);
      if(e.ctrlKey || e.metaKey)
        return this.toggleObjectSelection(index, face);
      this.selectObject(index, face);
    };
    // Drag-and-drop reordering, only within the current face (objects of other expanded faces are read-only here).
    row.draggable = face === this.face;
    row.ondragstart = e=>{
      this.dragObjectFrom = index;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(index)); } catch(_) {}
      row.classList.add('dragging');
    };
    row.ondragend = _=>{ row.classList.remove('dragging'); this.dragObjectFrom = null; };
    row.ondragover = e=>{ e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('dragOver'); };
    row.ondragleave = _=>row.classList.remove('dragOver');
    row.ondrop = e=>{
      e.preventDefault();
      row.classList.remove('dragOver');
      const from = this.dragObjectFrom;
      if(face === this.face && from !== null && from !== undefined && from !== index)
        this.moveFaceObject(from, index);
    };
  }

  // Shows/hides the "+"-revealed add-object controls (only meaningful at object/empty-face level) and marks
  // the "+" they are currently attached to as pressed - the tree toolbar's or the Object tab's.
  updateAddSection() {
    const section = $('#deckEditorAddSection');
    if(section)
      section.classList.toggle('deckEditorAddSectionOpen', this.addSectionOpen);
    const addBtn = $('#deckEditorTreeAdd');
    if(addBtn)
      addBtn.classList.toggle('active', this.addSectionOpen && this.addSectionHost == 'tree');
    if(this.sidebarAddButton)
      this.sidebarAddButton.classList.toggle('active', this.addSectionOpen && this.addSectionHost == 'sidebar');
  }

  // Reflects the tree selection level in the unified toolbar (labels + which buttons are usable). Show areas
  // is only enabled while a face object is selected.
  updateTreeToolbar() {
    const hasDeck = !!this.deck();
    const level = this.treeLevel;
    const noun = level == 'object' ? (this._selectedObjects.length > 1 ? 'objects' : 'object') : level;
    const add = $('#deckEditorTreeAdd'), copy = $('#deckEditorTreeCopy'), del = $('#deckEditorTreeDelete'), show = $('#deckEditorShowAll');
    if(add) {
      add.disabled = !hasDeck;
      add.title = level == 'deck' ? 'Add a face to this deck' : 'Add a face object';
    }
    const noSelection = !hasDeck || (level == 'object' && this.selectedObject === null) || (level != 'deck' && !this.faceTemplates.length);
    if(copy) { copy.disabled = noSelection; copy.title = `Copy the selected ${noun}`; }
    if(del)  { del.disabled  = noSelection; del.title  = `Delete the selected ${noun}`; }
    // "Outline all face objects" applies whenever a card is shown, not only when an object is selected.
    if(show) show.disabled = !(hasDeck && !this.deckSymbolSelected && this.cardType !== null && this.faceTemplates.length > 0);
  }

  async selectDeckNode(deckID) {
    this.deckSymbolSelected = false;
    this.activeArea = 'tree';
    this.addSectionOpen = false;
    if(deckID != this.deckID) {
      if(this.deckID)
        this.expandedDecks.add(this.deckID); // keep the previously-open deck's branch expanded
      await this.open(deckID); // switches deck (resets treeLevel to 'face')
    } else {
      this.selectedObject = null;
    }
    this.expandedDecks.add(deckID);
    this.treeLevel = 'deck';
    this.render();
  }

  selectFaceNode(face) {
    this.treeLevel = 'face';
    this.activeArea = 'tree';
    this.deckSymbolSelected = false;
    this.sidebarTab = 'face';
    this.addSectionOpen = false;
    if(this.deckID && this.face !== face)
      this.expandedFaces.add(`${this.deckID}:${this.face}`); // keep the previously-current face's branch open
    this.face = face;
    this.selectedObject = null;
    if(this.deckID)
      this.expandedFaces.add(`${this.deckID}:${face}`); // expand the newly selected face so its objects show
    this.render();
  }

  // Drop tree face expand/collapse state (face indices change on add/delete, so old keys would be stale).
  resetFaceExpansion() {
    this.expandedFaces.clear();
    this.collapsedFaces.clear();
    this.lastTreeClickKey = null;
  }

  // Select a face of a possibly-different deck (from the tree): switch decks first if needed.
  async selectFaceNodeIn(deckID, face) {
    if(deckID != this.deckID)
      await this.open(deckID);
    this.selectFaceNode(face);
  }

  // Single click expands + selects a branch immediately (no lag), leaving other open branches open. A second
  // click on the same branch within the double-click window collapses it. Native dblclick can't be used: the
  // single click rebuilds the tree, so the row (and its dblclick target) is gone before dblclick fires. The
  // last-clicked key is cleared by toolbar ops (treeAdd/Copy/Delete) so a click on a renumbered branch right
  // after one of those isn't misread as a double click (keeps the TestCafe flow working).
  wireTreeExpandCollapse(row, key, onSingle, onDouble) {
    row.onclick = _=>{
      const now = Date.now();
      if(this.lastTreeClickKey === key && now - (this.lastTreeClickTime || 0) < 400) {
        this.lastTreeClickKey = null;
        onDouble();
      } else {
        this.lastTreeClickKey = key;
        this.lastTreeClickTime = now;
        onSingle();
      }
    };
  }

  // The "+" adds one level down from the selection: a deck's "+" adds a face; a face's or object's "+" adds an
  // object (revealing the type menu). New decks come from the separate "Add New Deck" button.
  treeAdd() {
    this.lastTreeClickKey = null; // structural change: don't let the next tree click read as a double click
    if(this.treeLevel == 'deck')
      return this.addFace();
    this.openAddSectionIn($('#deckEditorAddSectionHost'), 'tree');
  }

  treeCopy() {
    this.lastTreeClickKey = null;
    if(this.treeLevel == 'deck')
      return this.copyDeck();
    if(this.treeLevel == 'object')
      return this.copySelectedObject();
    return this.copyFace();
  }

  treeDelete() {
    this.lastTreeClickKey = null;
    if(this.treeLevel == 'deck')
      return this.deleteDeck();
    if(this.treeLevel == 'object')
      return this.deleteSelectedObject();
    return this.deleteFace();
  }

  // Renders a small live preview of a face object by cloning its rendered node from the main card (so text,
  // icons, images and color boxes all look right); falls back to a swatch/label when the card can't render.
  renderObjectPreview(box, index, faceIndex = this.face) {
    const face = this.faceTemplates[faceIndex];
    const object = face && Array.isArray(face.objects) ? face.objects[index] : null;
    if(!box || !object)
      return;
    const type = object.type || 'text';

    // Text objects show the actual text in an inline editable field (like the right sidebar's value field):
    // clicking the field edits it, clicking the row around it selects the object.
    if(type == 'text') {
      this.renderPreviewTextField(box, object, index, faceIndex);
      return;
    }

    // Image/icon thumbnails just select the object like any other row; the value is changed from the right
    // sidebar (its upload button for images, its asset picker on the value row for images/icons).

    const bw = 44, bh = 60;
    let node = null;
    if(this.mainCard) {
      const faceDiv = $a('.cardFace', this.mainCard.domElement)[faceIndex];
      if(faceDiv && faceDiv.children[index])
        node = faceDiv.children[index].cloneNode(true);
    }

    // Images fill the preview with the whole picture (contain), so the entire image shows, not a corner.
    if(type == 'image') {
      const bg = node ? node.style.backgroundImage : '';
      const fill = div(box, 'deckEditorPreviewFill');
      if(bg && bg != 'none')
        fill.style.backgroundImage = bg;
      if(object.color && object.color != 'transparent')
        fill.style.backgroundColor = object.color;
      return;
    }

    // Icons (and anything else) are scaled to fit the box from their own bounds, so the whole glyph shows.
    if(node) {
      const w = type == 'icon' ? (object.size || object.width || 40) : (object.width || object.size || 40);
      const h = type == 'icon' ? (object.size || object.height || 40) : (object.height || object.size || 40);
      const scale = Math.min(bw / w, bh / h);
      node.style.left = '0';
      node.style.top = '0';
      node.style.transform = `scale(${scale})`;
      node.style.transformOrigin = 'top left';
      node.style.pointerEvents = 'none';
      const wrap = div(box, 'deckEditorObjectPreviewInner');
      wrap.style.width = (w * scale) + 'px';
      wrap.style.height = (h * scale) + 'px';
      wrap.append(node);
      return;
    }
    box.textContent = type == 'icon' ? '★' : String(object.value || '').slice(0, 6);
  }

  // The editable text field shown in a text object's list row. Edits the static value, or — when the value is
  // bound per card type — the current card type's property, committed with the same debounce as the sidebar.
  renderPreviewTextField(box, object, index, faceIndex = this.face) {
    box.classList.add('deckEditorPreviewTextBox');
    const bound = object.dynamicProperties && object.dynamicProperties.value;
    const editable = !bound || this.cardType !== null;
    const input = document.createElement('input');
    input.className = 'deckEditorPreviewText';
    let current = bound ? (this.cardType !== null ? this.cardTypes[this.cardType][bound] : undefined) : object.value;
    input.value = current === undefined || current === null ? '' : current;
    input.disabled = !editable;
    input.title = bound ? `Text for card type "${this.cardType}" (property "${bound}")` : 'Text on every card';
    // Clicking/dragging inside the field must not start a row drag, but should still select this field's
    // face object (and switch to its face) if it isn't already the selection. The browser focuses the field on
    // mousedown, so whether the user was already typing in it has to be remembered from before that.
    let wasFocused = false;
    input.onmousedown = e=>{
      wasFocused = document.activeElement == input;
      e.stopPropagation();
    };
    input.onclick = e=>{
      e.stopPropagation();
      // The field covers most of its row, so it has to offer the row's Ctrl/Shift multi-select too - otherwise
      // text objects could only ever be selected one at a time. Inside the field the user is currently typing
      // in, though, those clicks belong to the text: shift+click extends the caret selection there, and taking
      // it over would rebuild the tree (afterSelectionChanged) and destroy the field mid-edit.
      if(wasFocused && (e.shiftKey || e.ctrlKey || e.metaKey))
        return;
      if(e.shiftKey)
        return this.extendObjectSelection(index, faceIndex, e.ctrlKey || e.metaKey);
      if(e.ctrlKey || e.metaKey)
        return this.toggleObjectSelection(index, faceIndex);
      if(this.selectedObject !== index || this.face !== faceIndex)
        this.selectObject(index, faceIndex);
    };
    input.ondragstart = e=>{ e.preventDefault(); e.stopPropagation(); };
    input.oninput = _=>this.queueFieldEdit(async _=>{
      const value = input.value;
      if(bound && this.cardType !== null) {
        const args = [
          `${getPlayerDetails().playerName} updated "${bound}" of card type "${this.cardType}" of deck ${this.deckID} in deck editor`,
          `field:cardTypes:${this.cardType}:${bound}`
        ];
        await this.flushPendingCommitForOtherField('cardTypes', args[1]);
        this.cardTypes[this.cardType][bound] = value;
        this.refreshMainCardFaces();
        this.scheduleCommit('cardTypes', ...args);
      } else {
        const args = [
          `${getPlayerDetails().playerName} updated "value" of face object ${index+1} on face ${faceIndex} of deck ${this.deckID} in deck editor`,
          `field:faceTemplates:${faceIndex}:${index}:value`
        ];
        await this.flushPendingCommitForOtherField('faceTemplates', args[1]);
        object.value = value;
        this.refreshMainCardFaces();
        this.scheduleCommit('faceTemplates', ...args);
      }
    });
    box.append(input);
  }

  // Copies every selected object, putting the copies together right after the last one - so they stay a block
  // that the next drag (they are the new selection) moves off the originals as a whole. A non-contiguous
  // selection therefore comes back contiguous: the copies are drawn next to each other rather than each one
  // right on top of its original.
  async copySelectedObject() {
    const face = this.faceTemplates[this.face];
    const indices = this.selectedObjectIndices();
    if(!face || !indices.length || !Array.isArray(face.objects))
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    const insertAt = indices[indices.length-1] + 1;
    const copies = indices.map(index=>{
      const copy = JSON.parse(JSON.stringify(face.objects[index]));
      copy.x = (copy.x || 0) + 10; // offset so the copy is visible on top of the original
      copy.y = (copy.y || 0) + 10;
      return copy;
    });
    face.objects.splice(insertAt, 0, ...copies);
    this._selectedObjects = copies.map((_, i)=>insertAt + i);
    this.refreshMainCardFaces();
    await this.commit('faceTemplates', this.objectActionCause('copied', copies.length));
    this.render();
  }

  async moveFaceObject(from, to) {
    const face = this.faceTemplates[this.face];
    if(!face || !Array.isArray(face.objects) || from === to || to < 0 || to >= face.objects.length)
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    const [ object ] = face.objects.splice(from, 1);
    face.objects.splice(to, 0, object);
    // The whole selection follows the splice, so reordering one row doesn't drop objects that were picked up
    // with ctrl+click: the dragged object lands on "to", everything it moved past shifts by one, the rest stays.
    this._selectedObjects = this._selectedObjects.map(i=>{
      if(i === from)
        return to;
      if(from < to)
        return i > from && i <= to ? i-1 : i;
      return i >= to && i < from ? i+1 : i;
    });
    this.refreshMainCardFaces();
    await this.commit('faceTemplates', `${getPlayerDetails().playerName} reordered a face object of deck ${this.deckID} in deck editor`);
    this.render();
  }

  // A plain number field (default 0) for whole-face settings; unlike addInput it has no type dropdown.
  addNumberInput(label, value, onValueChanged, target) {
    const row = div(target, 'deckEditorNumberInput', `<label>${html(label)}</label><input type=number step=any>`);
    const input = $('input', row);
    input.value = value === undefined || value === null ? 0 : value;
    input.oninput = _=>{
      if(input.value.trim() === '') // a momentarily-empty field shouldn't commit 0 over the real value
        return;
      onValueChanged(Number(input.value) || 0);
    };
    return row;
  }

  // The fixed field type for a known object property (number vs text); undefined for anything else so its own
  // value's JS type decides (handles booleans and objects/arrays too).
  // The initial value for a newly-added property of the chosen type (from the add-property selector).
  initialValueForType(type) {
    switch(type) {
      case 'number': return 0;
      // A text row whose value already looks like a color, so shouldOfferColorPicker puts the swatch on it
      // right away even when the property isn't named after a color.
      case 'color':  return '#000000';
      case 'true':   return true;
      case 'false':  return false;
      case 'object': return {};
      default:       return '';
    }
  }

  // The object's "type" as a dropdown of valid values (text/image/icon/html); changing it re-renders because
  // the header and the image-only upload button depend on it. It has no make-dynamic or delete control. With
  // several objects selected it sets the type of all of them, and shows "(mixed)" while they differ.
  renderObjectTypeRow(target, objects, args) {
    const common = this.commonPropertyValue(objects, 'type');
    const row = div(target, 'genericInput deckEditorTypedInput');
    const labelEl = document.createElement('label');
    labelEl.className = 'deckEditorPropertyLabel';
    labelEl.textContent = 'type';
    const select = document.createElement('select');
    if(common.mixed) {
      const mixedOption = document.createElement('option');
      mixedOption.value = '';
      mixedOption.textContent = '(mixed)';
      mixedOption.selected = true;
      select.append(mixedOption);
    }
    for(const t of [ 'text', 'image', 'icon', 'html' ]) {
      const opt = document.createElement('option');
      opt.value = opt.textContent = t;
      opt.selected = !common.mixed && (common.value || 'text') == t;
      select.append(opt);
    }
    select.onchange = _=>this.queueFieldEdit(async _=>{
      if(!select.value)
        return;
      await this.flushPendingCommitForOtherField('faceTemplates', args[1]);
      for(const object of objects)
        object.type = select.value;
      this.refreshMainCardFaces();
      this.scheduleCommit('faceTemplates', ...args);
      this.renderSidebar();
    });
    row.append(labelEl, select);
  }

  // The value a property has across the selected objects: the shared one, or mixed = true as soon as they
  // disagree - the row then shows an empty "(mixed)" field that only writes once something is typed into it.
  // A mixed row still needs a field type though (a checkbox has to stay a checkbox), and value is blank in that
  // case, so sample carries the first value actually set - what the row's type is then read from.
  commonPropertyValue(objects, property) {
    const key = value=>JSON.stringify(value === undefined ? null : value);
    const first = objects.length ? objects[0][property] : undefined;
    const mixed = objects.some(object=>key(object[property]) !== key(first));
    const set = objects.find(object=>object[property] !== undefined);
    return { value: mixed ? undefined : first, mixed, sample: set ? set[property] : undefined };
  }

  // The blocks the sidebar sorts property rows into, mirroring the Edit Widget sidebar so both read the same
  // way: known properties land in Content / Position / Size / Colors / Appearance, and everything the engine
  // doesn't know - the bespoke properties a game defines for itself - gets its own area at the bottom.
  propertyGroups() {
    return [
      { id: 'content',    title: 'Content',    properties: [ 'type', 'value', 'text', 'name' ] },
      { id: 'position',   title: 'Position',   properties: [ 'x', 'y', 'rotation' ], collapsed: true },
      { id: 'size',       title: 'Size',       properties: [ 'width', 'height', 'size', 'scale' ], collapsed: true },
      { id: 'colors',     title: 'Colors',     properties: [ 'color', 'strokeColor', 'hoverColor', 'hoverStrokeColor' ] },
      { id: 'appearance', title: 'Appearance', properties: [ 'fontSize', 'textAlign', 'strokeWidth', 'hoverStrokeWidth', 'opacity', 'hoverOpacity', 'offsetX', 'offsetY', 'flip', 'display', 'classes', 'css', 'svgReplaces', 'border', 'radius', 'note' ] },
      { id: 'custom',     title: 'Custom',     properties: null } // everything else, in the order it is stored
    ];
  }

  // Draws one collapsible block per non-empty group and lets renderRow(property, container) fill it. The block's
  // properties div keeps the deckEditorProperties class (and any extra one the caller needs), so rows, pickers
  // and their CSS work exactly as they do in an ungrouped list. Which blocks are folded away is remembered per
  // tab for the session, so a scope the user works in stays open while switching objects.
  renderPropertyGroups(target, properties, stateKey, renderRow, extraClass = '') {
    const remaining = properties.slice();
    const groups = [];
    for(const group of this.propertyGroups()) {
      const inGroup = group.properties ? group.properties.filter(property=>remaining.indexOf(property) != -1) : remaining.slice();
      if(!inGroup.length)
        continue;
      for(const property of inGroup)
        remaining.splice(remaining.indexOf(property), 1);
      groups.push({ group, inGroup });
    }

    // A single block is pure chrome: its header would just repeat the rows below it, and there is nothing to
    // tell them apart from. Such a list is drawn ungrouped, the way it was before there were groups.
    if(groups.length < 2) {
      const body = div(target, `deckEditorProperties ${extraClass}`.trim());
      for(const property of groups.length ? groups[0].inGroup : [])
        renderRow(property, body);
      return;
    }

    for(const { group, inGroup } of groups) {
      // Position/Size start folded only for a face object, where x/y/width/height are usually changed by
      // dragging the object around. On the All Cards tab width/height are the point of the tab, so there
      // every block starts open.
      const key = `${stateKey}:${group.id}`;
      const collapsed = this.groupCollapsed[key] !== undefined ? this.groupCollapsed[key] : (stateKey == 'object' && !!group.collapsed);
      const wrap = div(target, `deckEditorGroup${collapsed ? ' collapsed' : ''}`);
      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'deckEditorGroupHeader';
      header.setAttribute('aria-expanded', String(!collapsed));
      header.title = `Show or hide the ${group.title.toLowerCase()} properties`;
      // The summary lists what is inside, so a folded block still says what it holds - the same idea as the
      // Edit Widget sidebar's "x, y" summaries, but working for arbitrary property names.
      header.innerHTML = `<span class=deckEditorGroupArrow></span><span class=deckEditorGroupTitle>${html(group.title)}</span><span class=deckEditorGroupSummary>${html(inGroup.join(', '))}</span>`;
      header.onclick = _=>{
        const nowCollapsed = !wrap.classList.contains('collapsed');
        wrap.classList.toggle('collapsed', nowCollapsed);
        header.setAttribute('aria-expanded', String(!nowCollapsed));
        this.groupCollapsed[key] = nowCollapsed;
      };
      wrap.append(header);

      const body = div(wrap, `deckEditorProperties deckEditorGroupBody ${extraClass}`.trim());
      for(const property of inGroup)
        renderRow(property, body);
    }
  }

  objectFieldType(property) {
    if([ 'x', 'y', 'width', 'height', 'fontSize', 'size', 'strokeWidth', 'rotation' ].indexOf(property) != -1)
      return 'number';
    if([ 'textAlign', 'color', 'value', 'strokeColor', 'type' ].indexOf(property) != -1)
      return 'text';
    return undefined;
  }

  // The field a value asks for when nothing forces a type: numbers get a number field, booleans a checkbox,
  // arrays/objects a JSON textarea, everything else a text field.
  valueFieldType(value) {
    if(typeof value === 'number')
      return 'number';
    if(typeof value === 'boolean')
      return 'boolean';
    if(value !== null && typeof value === 'object')
      return 'object';
    return 'text';
  }

  // A property row with a fixed input type and NO type selector — matches addInput's return shape ({ dom }) so
  // the make-dynamic / delete buttons attach the same way. fieldType may be forced (number/text/boolean/object)
  // or left undefined to follow the value's JS type. mixed marks a row whose selected objects disagree about
  // the value: the field starts empty and says so, and only writes to them once something is entered.
  addTypedInput(label, value, onValueChanged, target, fieldType, emptyIsZero, mixed) {
    if(!fieldType)
      fieldType = this.valueFieldType(value);
    const wrapper = div(target, 'genericInput deckEditorTypedInput');
    const labelEl = document.createElement('label');
    labelEl.className = 'deckEditorPropertyLabel';
    labelEl.textContent = label;
    labelEl.title = label; // game-defined names can be longer than the label column, which cuts them
    wrapper.append(labelEl);
    let input;
    if(fieldType == 'boolean') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!value;
      input.indeterminate = !!mixed;
      // A checkbox has no placeholder to put "(mixed)" into: the dash in the box is all it can show, so what
      // that dash means - and what ticking it does to the other objects - is said in the tooltip.
      if(mixed)
        input.title = 'Mixed — the selected objects disagree about this. Clicking sets one value on all of them.';
      input.onchange = _=>onValueChanged(input.checked);
    } else if(fieldType == 'object') {
      input = document.createElement('textarea');
      input.value = mixed ? '' : (value !== undefined && value !== null ? JSON.stringify(value, null, '  ') : '{}');
      input.oninput = input.onchange = _=>{
        try { onValueChanged(JSON.parse(input.value)); input.classList.remove('inputError'); }
        catch(e) { input.classList.add('inputError'); }
      };
    } else {
      input = document.createElement('input');
      input.type = fieldType == 'number' ? 'number' : 'text';
      if(fieldType == 'number')
        input.step = 'any';
      input.value = value === undefined || value === null ? '' : value;
      input.oninput = input.onchange = _=>{
        if(fieldType == 'number') {
          if(input.value.trim() === '') {
            // Face object properties: an erased number reads as 0 - except in a "(mixed)" field, where empty is
            // the state it started in, so clearing it again is "never mind" and must not write 0 to everything.
            if(emptyIsZero && !mixed)
              onValueChanged(0);
            return; // otherwise a momentarily-empty field shouldn't commit 0 over the real value
          }
          onValueChanged(Number(input.value) || 0);
        } else {
          onValueChanged(input.value);
        }
      };
    }
    if(mixed && input.type != 'checkbox') {
      input.placeholder = '(mixed)';
      input.classList.add('deckEditorMixedValue'); // italic, so it can't be read as a value someone typed
    }
    wrapper.append(input);
    return { dom: wrapper };
  }

  // A property's value looks like an uploaded custom asset (e.g. "/assets/-647970708_494").
  isAssetValue(value) {
    return typeof value == 'string' && /^\/assets\/[0-9_-]+$/.test(value);
  }

  // A property value that looks like a CSS color the row's swatch/color picker can show: hex, rgb(a), hsl(a),
  // or one of the plain CSS color keywords (blue, tan, transparent, …). The keywords are not listed here -
  // an all-letter value is handed to the browser's own color parser instead, which knows the whole list.
  isColorValue(value) {
    if(typeof value != 'string')
      return false;
    if(/^\s*(#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\([^)]*\)|hsla?\([^)]*\))\s*$/.test(value))
      return true;
    return /^\s*[a-zA-Z]+\s*$/.test(value) && this.parseColor(value) !== null;
  }

  // A value that is on its way to becoming a color while it is being typed: an empty field, a half-typed hex
  // ("#1a"), the start of an rgb()/hsl() notation, or plain letters (a keyword before it is finished). Without
  // this the picker button of a color-named property would vanish and reappear under the cursor mid-keystroke.
  isPartialColorValue(value) {
    const text = String(value === undefined || value === null ? '' : value).trim();
    return text == '' || /^#[0-9a-fA-F]{0,8}$/.test(text) || /^[a-zA-Z]+$/.test(text) || /^(rgba?|hsla?)\(/.test(text);
  }

  // Whether a property row should get the little color swatch + color picker. A value that is a color always
  // gets one, and an empty color-named property (color, strokeColor, textColor, …) does too - the picker is
  // how a color is put there. The name alone is not enough: a card type property named after a color can hold
  // something that is no color at all - the standard deck sorts by suitColor: "♠" - and picking a color there
  // would silently overwrite that value with a hex code.
  // Anything half-typed in between only *keeps* a picker that is already showing (offeredBefore), so a color
  // being retyped doesn't lose its button - and its open picker - between two keystrokes, while typing a word
  // like "Spades" over a sort key never arms one.
  shouldOfferColorPicker(property, value, offeredBefore = true) {
    if(this.isColorValue(value))
      return true;
    if(!/color/i.test(String(property)))
      return false;
    const text = String(value === undefined || value === null ? '' : value).trim();
    return text == '' || (offeredBefore && this.isPartialColorValue(text));
  }

  // What a card type property is there for, as a row tooltip. The standard decks give their cards a set of
  // properties that exist purely so a routine can SORT by them (see generateCardDeckWidgets in editmode.js and
  // assets/decks/standard.json), and their values are shaped for that order rather than for reading - without
  // a word of explanation the panel just shows "suitAlt: 3♠" and "rankFixed: 02 S". Only a card type carrying
  // that whole set is described this way, so a deck that uses "rank"/"suit" for its own readable values (the
  // German and Spanish decks do) isn't told what its properties supposedly mean.
  cardTypePropertyHint(property, typeProperties) {
    const hints = {
      suit: 'Sorting property: groups the cards of one suit together.',
      suitColor: 'Sorting property: keeps the suits of the same color together. Despite its name it holds no CSS color here.',
      suitAlt: 'Sorting property: a second suit order - the standard deck alternates black and red suits with it.',
      rank: 'Sorting property: orders the cards by rank, ace low. Shaped so that sorting gets it right, not for printing on a card.',
      rankA: 'Sorting property: like rank, but with the ace high.',
      rankFixed: 'Sorting property: one fixed order for the whole deck - by rank, then by suit.'
    };
    const isSortingDeck = [ 'suitAlt', 'rankA', 'rankFixed' ].some(key=>typeProperties[key] !== undefined);
    if(!isSortingDeck || !hints[property])
      return null;
    if(property == 'suitColor' && this.isColorValue(typeProperties[property]))
      return 'The color of this card\'s suit. Sorting by it keeps the suits of the same color together.';
    return hints[property];
  }

  // Whether a card type property is used as the "value" of an image/icon face object bound to it — such a
  // property is effectively an image/icon value even when it doesn't currently hold an asset path.
  assetPickerKindForCardTypeProperty(property) {
    for(const face of this.faceTemplates)
      for(const object of face.objects || [])
        if(object.dynamicProperties && object.dynamicProperties.value == property && (object.type == 'image' || object.type == 'icon'))
          return object.type;
    return null;
  }

  // Adds a small icon-only picker button to a property row (reusing the Edit Widgets tab's IconInput/ImageInput
  // picker content) and an expanding picker section directly below it, matching the basic-widget Content
  // pickers. Unlike those, the button is just a symbol - no chip preview of the current image/icon, kept the
  // same size as the row's trash button so the row stays on one line - and picking a value here immediately
  // closes the picker (rows keep editing other fields right after). The picker's own CSS is scoped under
  // ".editorModule" (the sidebar-module system this deck editor doesn't use), so the picker section carries
  // that class plus an override rule making it visible here too.
  // Image rows get a second small button next to it that uploads a picture into the row instead of choosing
  // an existing one — so uploading is offered wherever an image can be chosen.
  addAssetPickerToRow(row, target, kind, getValue, setValue) {
    const pickerHost = div(target, 'deckEditorPickerRow editorModule');
    row.dom.classList.add('hasAssetPicker');
    const inputClass = kind == 'icon' ? IconInput : ImageInput;
    const picker = new inputClass({}, {}, null, { getValue, listenTo: [], clearable: false });
    picker.setValue = value=>{
      setValue(value);
      const field = row.dom.querySelector('input, textarea');
      if(field)
        field.value = value === null || value === undefined ? '' : value;
      picker.closePicker();
    };
    const button = document.createElement('button');
    button.setAttribute('icon', kind == 'icon' ? 'add_reaction' : 'image'); // match the tree list's type symbol
    button.className = 'deckEditorAssetPickerButton';
    button.title = kind == 'icon' ? 'Choose icon' : 'Choose image';
    button.onclick = _=>picker.togglePicker();
    row.dom.append(button);
    if(kind == 'image') {
      row.dom.classList.add('hasUploadButton');
      const upload = document.createElement('button');
      upload.setAttribute('icon', 'upload');
      upload.className = 'deckEditorUploadButton';
      upload.title = 'Upload image';
      upload.onclick = _=>uploadAsset().then(asset=>{
        if(asset)
          picker.setValue(asset);
      });
      row.dom.append(upload);
    }
    picker.previewButton = button; // openPicker/closePicker toggle .open on this
    picker.pickerDOM = div(pickerHost, 'propertyPicker');
    picker.pickerDOM.style.display = 'none';
    return picker;
  }

  // Adds a small color-swatch button to a property row — between the value field and the trash, the same size as
  // the trash — plus an expanding color picker below it that reuses the Edit Widgets tab's ColorInput (the same
  // picker basic widgets get in their Appearance section). The swatch shows the row's current color behind a
  // palette symbol (tinted by contrastAnyColor so it stays readable on any color) and is only offered while
  // shouldOfferColorPicker() says so — that is re-evaluated on every keystroke, so typing a color into a
  // property that isn't named after one makes the button appear right away and dragging the value away from a
  // color makes it disappear again. Unlike the asset picker, picking here keeps the picker open (like the
  // Appearance pickers) until it's closed with the picker's own close (X) button. Same ".editorModule" scoping
  // note as addAssetPickerToRow applies.
  addColorPickerToRow(row, target, property, setValue) {
    const field = row.dom.querySelector('input[type=text]');
    if(!field) // only plain text rows can hold a color (number/checkbox/JSON rows can't)
      return null;
    const pickerHost = div(target, 'deckEditorPickerRow editorModule');
    const button = document.createElement('button');
    button.className = 'deckEditorColorPickerButton';
    button.setAttribute('icon', 'palette');
    button.title = 'Pick color';
    // The picker reads the field instead of the model so it opens on what is currently typed, even while the
    // edit that writes it through is still queued.
    const picker = new ColorInput({}, {}, null, { getValue: _=>field.value, listenTo: [] });
    // A row that starts out without a picker doesn't get one from a half-typed value, only from a real color:
    // see shouldOfferColorPicker.
    let offer = this.shouldOfferColorPicker(property, field.value, false);
    // A color-named row keeps the space for the button reserved even while it isn't showing one, so the field
    // doesn't change width under the cursor when the value stops (or starts) looking like a color mid-edit.
    const keepsRoom = /color/i.test(String(property));
    const updateSwatch = _=>{
      offer = this.shouldOfferColorPicker(property, field.value, offer);
      button.style.display = offer ? '' : 'none';
      row.dom.classList.toggle('hasColorPicker', offer || keepsRoom);
      if(offer) {
        const color = this.parseColor(field.value);
        if(color)
          button.style.setProperty('--swatchColor', color);
        else
          button.style.removeProperty('--swatchColor');
        button.style.color = contrastAnyColor(this.swatchBackdrop(color), 1);
      } else if(picker.pickerOpen()) {
        picker.closePicker();
      }
    };
    picker.setValue = value=>{
      setValue(value);
      field.value = value === null || value === undefined ? '' : value;
      updateSwatch();
      if(picker.pickerOpen())
        picker.refreshPicker(value);
    };
    field.addEventListener('input', updateSwatch); // addTypedInput owns field.oninput, so don't overwrite it
    button.onclick = _=>picker.togglePicker();
    row.dom.append(button);
    picker.previewButton = button; // openPicker/closePicker toggle .open on this
    picker.pickerDOM = div(pickerHost, 'propertyPicker');
    picker.pickerDOM.style.display = 'none';
    updateSwatch();
    return picker;
  }

  // The browser's own reading of a CSS color string, or null if it can't parse it as one. Probing with two
  // different starting values tells an unparsable value (fillStyle stays untouched) apart from a real black.
  parseColor(value) {
    if(typeof value != 'string' || !value.trim())
      return null;
    const ctx = this.colorProbeContext();
    for(const probe of [ '#000000', '#ffffff' ]) {
      ctx.fillStyle = probe;
      ctx.fillStyle = value.trim();
      if(ctx.fillStyle != probe)
        return ctx.fillStyle;
    }
    return null;
  }

  // What a swatch color actually looks like: a translucent (or missing) color lets the swatch's checkerboard
  // through, so composite it over that gray before asking contrastAnyColor() for a readable symbol color.
  swatchBackdrop(color) {
    const checkerboard = '#b3b3b3'; // between the checkerboard's two grays
    if(!color)
      return checkerboard;
    const ctx = this.colorProbeContext();
    ctx.fillStyle = checkerboard;
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [ r, g, b ] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r},${g},${b})`;
  }

  // One reusable 1x1 canvas for the two color helpers above: they run on every keystroke in every text row,
  // so a fresh canvas per call would be pure churn.
  colorProbeContext() {
    if(!this.colorProbe) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      this.colorProbe = canvas.getContext('2d', { willReadFrequently: true });
    }
    return this.colorProbe;
  }

  // The "Click a face object…" hint, shown below the card view (bottom-center) whenever a card type is being
  // edited but no object is selected. Blank in every other state.
  renderObjectHint() {
    const hint = $('#deckEditorObjectHint');
    if(!hint)
      return;
    const show = this.deck() && !this.deckSymbolSelected && this.selectedObject === null && this.faceTemplates.length;
    hint.textContent = show ? 'Click a face object on the card, or in the "Face objects" list, to select, edit, or drag it around.' : '';
    hint.classList.toggle('active', !!show);
  }

  renderCardDefaults(sidebar, addHeader, addPropertyRow) {
    const header = document.createElement('header');
    header.className = 'deckEditorSidebarHeader deckEditorScopeEveryCard';
    header.innerHTML = '<h2>Card defaults</h2><p>Every card of this deck</p>';
    sidebar.append(header);

    const defaultsFieldArgs = property=>[
      `${getPlayerDetails().playerName} updated "${property}" of card defaults of deck ${this.deckID} in deck editor`,
      `field:cardDefaults:${property}`
    ];
    const addDefaultsInput = (property, defaultsProps)=>{
      const forced = (property == 'width' || property == 'height') ? 'number' : undefined;
      const onValueChanged = v=>this.queueFieldEdit(async _=>{
        await this.flushPendingCommitForOtherField('cardDefaults', defaultsFieldArgs(property)[1]);
        this.cardDefaults[property] = v;
        this.scheduleCommit('cardDefaults', ...defaultsFieldArgs(property));
      });
      // the card defaults become properties of every card widget, so their css is a widget css: the class
      // and selector sections apply
      if(this.isCssProperty(property)) {
        this.addCssEditor(defaultsProps, property, {
          stateKey: `${this.deckID}:cardDefaults:${property}`,
          getValue: _=>this.cardDefaults[property],
          setValue: v=>this.queueFieldEdit(async _=>{
            await this.flushPendingCommitForOtherField('cardDefaults', defaultsFieldArgs(property)[1]);
            if(v === null) // no declaration left is no css property, rather than a "css": null in the deck
              delete this.cardDefaults[property];
            else
              this.cardDefaults[property] = v;
            this.scheduleCommit('cardDefaults', ...defaultsFieldArgs(property));
          }),
          defaultLabel: property == 'css' ? 'Every card' : undefined,
          defaultInfo: 'Declarations applied to every card of this deck. Other sections style parts of a card (like "&nbsp;> .cardFace") or states like ":hover".',
          selectorSuggestions: cssSelectorSuggestions.card,
          onDelete: async _=>{
            await this.flushPendingCommits();
            delete this.cardDefaults[property];
            await this.commit('cardDefaults', `${getPlayerDetails().playerName} deleted property "${property}" of card defaults of deck ${this.deckID} in deck editor`);
            this.renderSidebar();
          }
        });
        return;
      }
      const row = this.addTypedInput(property, this.cardDefaults[property], onValueChanged, defaultsProps, forced);
      if(this.isAssetValue(this.cardDefaults[property]))
        this.addAssetPickerToRow(row, defaultsProps, 'image', ()=>this.cardDefaults[property], onValueChanged);
      else
        this.addColorPickerToRow(row, defaultsProps, property, onValueChanged);
      if(this.cardDefaults[property] !== undefined) {
        this.addPropertyDeleteButton(row, property, async _=>{
          await this.flushPendingCommits();
          delete this.cardDefaults[property];
          await this.commit('cardDefaults', `${getPlayerDetails().playerName} deleted property "${property}" of card defaults of deck ${this.deckID} in deck editor`);
          this.renderSidebar();
        });
      }
    };
    const defaultsPropertyNames = [ ...Object.keys(this.cardDefaults) ];
    for(const property of [ 'width', 'height' ]) // the most common defaults are always offered
      if(this.cardDefaults[property] === undefined)
        defaultsPropertyNames.push(property);
    this.renderPropertyGroups(sidebar, defaultsPropertyNames, 'defaults', addDefaultsInput);
    addPropertyRow(sidebar, (property, type)=>this.queueFieldEdit(async _=>{
      if(this.cardDefaults[property] !== undefined)
        return;
      await this.flushPendingCommitForOtherField('cardDefaults', defaultsFieldArgs(property)[1]);
      this.cardDefaults[property] = this.initialValueForType(type);
      this.scheduleCommit('cardDefaults', ...defaultsFieldArgs(property));
      this.renderSidebar();
    }));
  }

  // The type dropdown's "not set" only unsets the value until the next re-render; this removes the row too.
  addPropertyDeleteButton(row, property, onDelete) {
    const button = document.createElement('button');
    button.setAttribute('icon', 'delete_forever');
    button.className = 'deckEditorDeleteProperty';
    button.title = `Delete property "${property}"`;
    button.onclick = onDelete;
    row.dom.append(button);
  }

  // A property holding css: "css" itself, or one of the "<element>CSS" ones (handleCSS, faceCSS, …). Those get
  // a text row like every other property plus, behind a button, the declaration rows of the Edit Widgets tab -
  // so the same editor edits the css of a widget and the css of a card, a face or a face object.
  isCssProperty(property) {
    return property == 'css' || /^[a-zA-Z]+CSS$/.test(String(property));
  }

  // One css property as a row of this sidebar: its name, its declarations as text and the trash every property
  // row has, with the devtools-style editor (CssEditor in cssEditor.js, shared with the Edit Widgets tab)
  // opening below it - the same shape as the image and color pickers of the other rows.
  // The rows read the value back while they are being edited, so the editor keeps its own copy of it: every
  // other write of this sidebar is queued (so a typing burst commits as one undo step) and would reach the
  // model only after the rows have already been rebuilt from it.
  // options: getValue/setValue (setValue(null) means "no css left"), onDelete, allowClasses, defaultLabel,
  // defaultInfo, selectorSuggestions and the stateKey the editing state is remembered under.
  addCssEditor(target, property, options) {
    const host = div(target, 'deckEditorCssProperty');
    // created first so the list opens below the row instead of next to it, then moved behind it
    const pickerHost = div(host, 'deckEditorPickerRow editorModule');
    let value = options.getValue();
    const editor = new CssEditor({
      property,
      stateKey: options.stateKey,
      state: this.cssEditorState,
      getValue: _=>value,
      setValue: newValue=>{
        value = newValue;
        options.setValue(newValue);
      },
      allowClasses: options.allowClasses !== false,
      defaultLabel: options.defaultLabel,
      defaultInfo: options.defaultInfo,
      selectorSuggestions: options.selectorSuggestions || []
    });
    const { row } = editor.renderRow(host, {
      rowClass: `genericInput deckEditorTypedInput deckEditorCssRow${options.onDelete ? ' hasDelete' : ''}`,
      labelStyle: 'display:inline-block;width:100px',
      buttonClass: 'deckEditorCssPickerButton',
      buttonIcon: 'format_list_bulleted',
      hint: options.defaultInfo ? html(options.defaultInfo) : null,
      pickerTarget: pickerHost
    });
    host.insertBefore(row, pickerHost);
    if(options.onDelete) {
      const button = document.createElement('button');
      button.setAttribute('icon', 'delete_forever');
      button.className = 'deckEditorDeleteProperty';
      button.title = `Delete property "${property}"`;
      button.onclick = options.onDelete;
      row.append(button);
    }
    return host;
  }

  knownCardTypeProperties() {
    const properties = new Set();
    for(const typeProperties of Object.values(this.cardTypes))
      for(const property of Object.keys(typeProperties))
        properties.add(property);
    for(const face of this.faceTemplates)
      for(const object of face.objects || [])
        for(const property of Object.values(object.dynamicProperties || {}))
          properties.add(property);
    return [...properties];
  }

  // Card widget properties a card type property must not be named after: cards carry these in their own
  // state (position, rotation, the deck link etc.), which shadows the card type value everywhere outside
  // the deck editor's main card - a binding to "x" would read the card's room position, and previews force
  // x/y/rotation/scale to fixed values. So making "x" dynamic binds to "x2" instead.
  reservedCardTypeProperties() {
    return [ 'id', 'deck', 'cardType', 'activeFace', 'parent', 'owner', 'x', 'y', 'z', 'rotation', 'scale', 'layer', 'linkedToSeat', 'onlyVisibleForSeat' ];
  }

  generateUniquePropertyName(base) {
    const taken = new Set([ ...this.knownCardTypeProperties(), ...this.reservedCardTypeProperties() ]);
    if(!taken.has(base))
      return base;
    let suffix = 2;
    while(taken.has(base + suffix))
      ++suffix;
    return base + suffix;
  }

  // Only seeds the currently selected card type; other card types are left for the user to fill in,
  // same as any other dynamic property that isn't set for them yet.
  async seedCardTypeProperty(typeProperty, defaultValue, cause, actionId) {
    if(this.cardType === null || this.cardTypes[this.cardType][typeProperty] !== undefined)
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    this.cardTypes[this.cardType][typeProperty] = defaultValue;
    await this.commit('cardTypes', cause, actionId);
  }

  // Adds an object in the currently selected add mode: a static object (value baked in) or a per-card-type one
  // (the value bound to a fresh card type property). boundProperty is which object property carries the value.
  async addByMode(objectTemplate, propertyBaseName, defaultValue, boundProperty = 'value') {
    if(this.addMode == 'dynamic')
      return this.addDynamicObject(objectTemplate, propertyBaseName, defaultValue, boundProperty);
    return this.addObject({ ...objectTemplate, [boundProperty]: defaultValue });
  }

  setAddMode(mode) {
    this.addMode = mode == 'dynamic' ? 'dynamic' : 'static';
    const section = $('#deckEditorAddSection');
    if(section) {
      section.classList.toggle('deckEditorAddGroupStatic', this.addMode == 'static');
      section.classList.toggle('deckEditorAddGroupDynamic', this.addMode == 'dynamic');
    }
    const radio = $(`#deckEditorAddMode input[value=${this.addMode}]`);
    if(radio)
      radio.checked = true;
  }

  async addDynamicObject(objectTemplate, propertyBaseName, defaultValue, boundProperty = 'value') {
    const typeProperty = this.generateUniquePropertyName(propertyBaseName);
    // One cause + one actionId so this single user action is one undo step and one breadcrumb, not two.
    const cause = `${getPlayerDetails().playerName} added a per-card-type ${objectTemplate.type} object to deck ${this.deckID} in deck editor`;
    const actionId = this.newAction();
    await this.seedCardTypeProperty(typeProperty, defaultValue, cause, actionId);
    const template = { ...objectTemplate, dynamicProperties: { [boundProperty]: typeProperty } };
    delete template[boundProperty]; // a static value would override the dynamic one
    await this.addObject(template, cause, actionId);
  }

  colorBoxTemplate() {
    const width = this.mainCard ? this.mainCard.get('width') : 103;
    const height = this.mainCard ? this.mainCard.get('height') : 160;
    return { type: 'image', x: 0, y: 0, width, height, color: '#cccccc' };
  }

  renderDynamicProperties(sidebar, object) {
    // Amber, like the Card type tab and the "Card Type" add mode: what these rows fill in comes from the card
    // type, so they are the one part of the object that differs per card - the properties above are not.
    const header = document.createElement('header');
    header.className = 'deckEditorSidebarHeader deckEditorScopeThisType';
    header.innerHTML = '<h2>Dynamic properties</h2><p>Different per card type</p>';
    sidebar.append(header);

    const container = div(sidebar, 'deckEditorDynamicProperties deckEditorScopeThisType');
    // object == null: several objects are selected, and each one's bindings name its own card type properties.
    if(!object) {
      div(container, 'deckEditorSectionNote').textContent = 'Dynamic properties are per object. Select a single object to edit them.';
      return;
    }
    div(container, 'deckEditorSectionNote').textContent = 'These specify a different face object for each card type.';

    // The already-active bindings: each row is a live "object property ← card type property" with a red trash.
    // They get column headers (laid out with the same flex structure as the rows so they line up above them);
    // without any binding those headers would label an empty space, so say what that space means instead.
    const bindings = Object.entries(object.dynamicProperties || {});
    if(bindings.length)
      div(container, 'deckEditorDynamicProperty deckEditorDynamicPropertyHeaders', '<span class=deckEditorBindingObjectProp>Object property</span><span class=deckEditorBindingLink></span><span class=deckEditorBindingTypeProp>Card property</span><span class=deckEditorBindingDeleteSpacer></span>');
    else
      div(container, 'deckEditorNoDynamicProperties').textContent = 'This object does not have dynamic properties.';
    for(const [ objectProperty, typeProperty ] of bindings) {
      // Both sides are editable text fields with a link icon between them ("value ⛓ rank"): the left is the
      // object property that gets filled, the right is the card type property it reads from.
      const row = div(container, 'deckEditorDynamicProperty', `<input class=deckEditorBindingObjectProp title="Object property that gets filled"><span class="deckEditorBindingLink material-symbols" title="filled from the card type">link</span><input class=deckEditorBindingTypeProp title="Card type property to read from"><button icon=delete_forever class="deckEditorBindingDelete" title="Remove this binding and make the property static again."></button>`);
      const objInput = $('.deckEditorBindingObjectProp', row);
      const typeInput = $('.deckEditorBindingTypeProp', row);
      objInput.value = objectProperty;
      typeInput.value = String(typeProperty);

      // Rename the object property this binding fills (rename the key in dynamicProperties).
      objInput.onchange = async _=>{
        const newProp = objInput.value.trim();
        if(!newProp || newProp == objectProperty) { objInput.value = objectProperty; return; }
        await this.flushPendingCommits();
        const readsFrom = object.dynamicProperties[objectProperty];
        delete object.dynamicProperties[objectProperty];
        object.dynamicProperties[newProp] = readsFrom;
        this.refreshMainCardFaces();
        await this.commit('faceTemplates', `${getPlayerDetails().playerName} renamed a dynamic property binding of deck ${this.deckID} in deck editor`);
        this.renderSidebar();
      };

      // Repoint the binding to a different (possibly new) card type property.
      typeInput.onchange = async _=>{
        const newType = typeInput.value.trim();
        if(!newType || newType == String(typeProperty)) { typeInput.value = String(typeProperty); return; }
        await this.flushPendingCommits();
        const cause = `${getPlayerDetails().playerName} repointed a dynamic property binding of deck ${this.deckID} in deck editor`;
        const actionId = this.newAction();
        object.dynamicProperties[objectProperty] = newType;
        await this.seedCardTypeProperty(newType, '', cause, actionId); // make sure the target property exists
        this.refreshMainCardFaces();
        await this.commit('faceTemplates', cause, actionId);
        this.renderSidebar();
      };

      $('.deckEditorBindingDelete', row).onclick = async _=>{
        await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
        delete object.dynamicProperties[objectProperty];
        if(!Object.keys(object.dynamicProperties).length)
          delete object.dynamicProperties;
        // Restore the current card type's value as the static value so the card does not change visually.
        const currentValue = this.cardType !== null ? this.cardTypes[this.cardType][typeProperty] : undefined;
        if(currentValue !== undefined && object[objectProperty] === undefined)
          object[objectProperty] = currentValue;
        this.refreshMainCardFaces();
        // Keep the card type property this binding used: it may still be referenced by routines / SELECT / CSS.
        await this.commit('faceTemplates', `${getPlayerDetails().playerName} removed a dynamic property binding from deck ${this.deckID} in deck editor`);
        this.renderSidebar();
      };
    }

    // Add-binding control laid out on the same grid as the rows above. Both sides are editable comboboxes
    // (input + datalist): pick an existing property or just type a new one in the same box - no separate field.
    const bound = object.dynamicProperties || {};
    const objectPropertyOptions = [...new Set([ 'value', 'color', 'width', 'height', 'display', ...Object.keys(object) ])]
      .filter(p=>p != 'type' && p != 'dynamicProperties' && bound[p] === undefined);
    const typePropertyOptions = this.knownCardTypeProperties();
    const addRow = div(container, 'deckEditorAddBinding', `
      <div class=deckEditorAddBindingTitle>Add a new dynamic property link</div>
      <div class="deckEditorDynamicProperty deckEditorAddBindingRow">
        <input class="objectProperty deckEditorBindingObjectProp" list=deckEditorObjPropList placeholder="Object property" title="Object property to fill - pick one or type a new name">
        <datalist id=deckEditorObjPropList>${objectPropertyOptions.map(p=>`<option value="${html(p)}"></option>`).join('')}</datalist>
        <span class="deckEditorBindingLink material-symbols">link</span>
        <input class="typeProperty deckEditorBindingTypeProp" list=deckEditorTypePropList placeholder="Card property" title="Card type property to read from - pick one or type a new name">
        <datalist id=deckEditorTypePropList>${typePropertyOptions.map(p=>`<option value="${html(p)}"></option>`).join('')}</datalist>
        <button class=deckEditorAddBindingButton icon=link title="Add new dynamic property link">Link</button>
      </div>
    `);
    $('button', addRow).onclick = async _=>{
      const objectProperty = $('.objectProperty', addRow).value.trim();
      let typeProperty = $('.typeProperty', addRow).value.trim();
      if(!objectProperty || !typeProperty)
        return;
      if(this.reservedCardTypeProperties().includes(typeProperty))
        typeProperty = this.generateUniquePropertyName(typeProperty); // a reserved name would be shadowed by the card widget's own property
      await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
      if(!object.dynamicProperties || typeof object.dynamicProperties != 'object')
        object.dynamicProperties = {};
      object.dynamicProperties[objectProperty] = typeProperty;
      const staticValue = object[objectProperty];
      delete object[objectProperty]; // a static value would override the dynamic one
      // One cause + one actionId for both commits so binding a property is a single undo step / breadcrumb.
      const cause = `${getPlayerDetails().playerName} bound a dynamic property of a face object in deck ${this.deckID} in deck editor`;
      const actionId = this.newAction();
      await this.seedCardTypeProperty(typeProperty, staticValue !== undefined ? staticValue : '', cause, actionId);
      this.refreshMainCardFaces();
      await this.commit('faceTemplates', cause, actionId);
      this.renderSidebar();
    };
  }

  async addObject(objectTemplate, cause, actionId) {
    if(!this.deck())
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    // Starting from a deck without faces: create the first face as part of the same action (same commit).
    if(!this.faceTemplates.length) {
      this.faceTemplates.push({ objects: [] });
      this.face = 0;
    }
    const face = this.faceTemplates[this.face];
    if(!face)
      return;
    if(!Array.isArray(face.objects))
      face.objects = [];
    // A face object selected in the tree is where the new one goes right after (like copying an object); with
    // the face itself selected there is no such anchor, so it is appended at the bottom of the list.
    const insertAt = this.treeLevel == 'object' && this.selectedObject !== null
      ? Math.min(this.selectedObject+1, face.objects.length)
      : face.objects.length;
    face.objects.splice(insertAt, 0, objectTemplate);
    if(this.mainCard)
      this.refreshMainCardFaces();
    else
      this.renderMain(); // the "no faces yet" empty state was showing before this
    await this.commit('faceTemplates', cause || `${getPlayerDetails().playerName} added a ${objectTemplate.type || 'basic'} object to deck ${this.deckID} in deck editor`, actionId);
    this.selectObject(insertAt);
  }

  async deleteSelectedObject() {
    const face = this.faceTemplates[this.face];
    const indices = this.selectedObjectIndices();
    if(!face || !indices.length)
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    for(const index of [...indices].reverse()) // back to front, so the indices still to come stay valid
      face.objects.splice(index, 1);
    this.selectedObject = null;
    this.refreshMainCardFaces();
    // Only the face template changes: card type properties this object referenced are deliberately kept, since
    // routines / SELECT / CSS can use them independently of any face object (deleting them could break a game).
    const what = indices.length > 1 ? `${indices.length} face objects` : 'a face object';
    await this.commit('faceTemplates', `${getPlayerDetails().playerName} deleted ${what} from deck ${this.deckID} in deck editor`);
    this.renderLeftSidebar(); // drop the deleted row from the left list right away
    this.renderSidebar();
    this.updateDragToolbar();
  }

  async addFace() {
    if(!this.deck())
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    this.faceTemplates.push({ objects: [] });
    this.face = this.faceTemplates.length-1;
    this.selectedObject = null;
    this.treeLevel = 'face';
    this.resetFaceExpansion(); // face indices changed; drop stale expand/collapse state
    await this.commit('faceTemplates', `${getPlayerDetails().playerName} added a face to deck ${this.deckID} in deck editor`);
    this.render();
  }

  async deleteFace() {
    if(!this.deck() || !this.faceTemplates.length)
      return;
    if(!confirm(`Delete ${this.faceLabel(this.face)} from every card type of this deck?`))
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    this.faceTemplates.splice(this.face, 1);
    this.face = Math.min(this.face, Math.max(0, this.faceTemplates.length-1));
    this.selectedObject = null;
    this.treeLevel = 'face';
    this.resetFaceExpansion(); // face indices shifted; drop stale expand/collapse state
    // As with deleting a single object, card type properties are kept (they may be used outside face rendering).
    await this.commit('faceTemplates', `${getPlayerDetails().playerName} deleted a face from deck ${this.deckID} in deck editor`);
    this.render();
  }

  // Inserts a deep copy of the current face right after it (faces are shared across card types, so this adds
  // the face to every card type).
  async copyFace() {
    if(!this.deck() || !this.faceTemplates[this.face])
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    const copy = JSON.parse(JSON.stringify(this.faceTemplates[this.face]));
    this.faceTemplates.splice(this.face+1, 0, copy);
    this.face = this.face+1;
    this.selectedObject = null;
    this.resetFaceExpansion(); // face indices shifted
    await this.commit('faceTemplates', `${getPlayerDetails().playerName} copied a face of deck ${this.deckID} in deck editor`);
    this.render();
  }

  async addDeck(deckID, size, placement) {
    if(deckID && widgets.has(deckID)) {
      alert(`A widget with the id "${deckID}" already exists. Please choose a different deck id.`);
      return;
    }
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    await this.open(await createStarterDeck(deckID, size, placement));
    this.treeLevel = 'deck';
    this.render();
  }

  // "Add New Deck" opens a small submenu offering every existing way to create a deck. Rather than
  // reinventing those flows, we reuse the ones the properties sidebar already implements (traditional,
  // custom, image upload, front/back image upload, text cards, TTS import) by rendering them, and the
  // public-library and empty-deck flows.
  openNewDeckOverlay() {
    if(!this.deckCreator) {
      this.deckCreator = new PropertiesModule();
      // The flows this instance renders are the dialog's, so they follow its placement checkboxes.
      this.deckCreator.newDeckPlacement = newDeckPlacement;
    }
    // Always start on the blank deck group with both placement options on, so the submenu is predictable each
    // time it opens. Opening that group is already the "empty deck" choice, so it also renders the panel.
    $('#deckEditorNewDeckHolder').checked = true;
    $('#deckEditorNewDeckResetButton').checked = true;
    $('#deckEditorNewDeckResetButton').disabled = false;
    this.openNewDeckGroup($('#deckEditorNewDeckGroupBlank'));
    showOverlay('deckEditorNewDeckOverlay');
  }

  // The ways to create a deck are grouped into three expanders - a blank deck, an existing deck, a custom
  // deck - of which only one is open at a time, so the dialog shows three short rows instead of a wall of
  // options. Opening a group closes the others and moves the panel doing the actual work into it, right
  // below the options it belongs to. A group offering several ways waits for one of them to be picked; the
  // blank deck group has only the one, so opening it is already the choice and its panel shows right away.
  openNewDeckGroup(group) {
    for(const other of $a('#deckEditorNewDeckOverlay .deckEditorNewDeckGroup'))
      other.classList.toggle('deckEditorNewDeckGroupOpen', other == group);
    const modes = $a('input[name=deckEditorNewDeckMode]', group);
    for(const radio of $a('#deckEditorNewDeckOverlay input[name=deckEditorNewDeckMode]'))
      radio.checked = modes.length == 1 && radio == modes[0];
    $('.deckEditorNewDeckGroupBody', group).append($('#deckEditorNewDeckPanel'));
    this.renderNewDeckPanel(modes.length == 1 ? modes[0].value : null);
  }

  closeNewDeckOverlay() {
    this.pendingNewDeck = false;
    showOverlay();
  }

  // Each mode renders its existing creation flow into the overlay's panel (no mode picked yet: nothing to
  // render). Every mode except "empty" adds a fresh deck to the game; once that lands as a delta,
  // deckEditorReceiveDelta switches the editor to it (this.pendingNewDeck). "empty" opens the new deck here
  // directly.
  renderNewDeckPanel(mode) {
    const panel = $('#deckEditorNewDeckPanel');
    panel.innerHTML = '';
    this.pendingNewDeck = !!mode && mode != 'empty';
    if(!mode)
      return;
    if(mode == 'empty') {
      // Card size first, then the (optional) deck id: the size decides what the starter faces and the holder
      // are built at, and it is the harder one to change afterwards.
      const sizes = div(panel, 'deckEditorNewDeckSizes', '<span class=deckEditorNewDeckSizesLabel>Card size</span>'
        + deckEditorCardSizes.map((size, index)=>`<label title="${html(size.label)} cards are ${size.width} wide and ${size.height} high"><input type=radio name=deckEditorNewDeckSize value=${index}${index ? '' : ' checked'}><b>${html(size.label)}</b><span>${size.width} &times; ${size.height}</span></label>`).join(''));
      const idInput = document.createElement('input');
      idInput.type = 'text';
      idInput.className = 'deckEditorNewDeckId';
      idInput.placeholder = "Deck id (optional) - leave blank to generate one";
      panel.append(idInput);
      const bar = div(panel, 'deckEditorNewDeckButtonBar', '<button icon=library_add class=green>Create empty deck</button>');
      $('button', bar).onclick = _=>{
        const id = idInput.value.trim();
        if(id && widgets.has(id)) {
          alert(`A widget with the id "${id}" already exists. Please choose a different deck id.`);
          return;
        }
        const picked = $('input[name=deckEditorNewDeckSize]:checked', sizes);
        const placement = newDeckPlacement(); // read before closing the dialog the checkboxes live in
        this.closeNewDeckOverlay();
        this.addDeck(id || undefined, deckEditorCardSizes[picked ? +picked.value : 0], placement);
      };
    } else if(mode == 'library') {
      // Keep the deck editor open: the library overlay is moved into #editor (see initializeDOM) so it shows
      // above the editor, and pendingNewDeck makes the picked deck open in the editor once it is added. The
      // dialog is hidden while browsing, so the placement options are read now rather than at the click.
      const bar = div(panel, 'deckEditorNewDeckButtonBar', '<button icon=style class=green>Browse the public library</button>');
      $('button', bar).onclick = _=>openLibraryDecksOverlay(newDeckPlacement());
    } else {
      // Render the existing PropertiesModule deck-creation flow inside a container carrying the same classes
      // the sidebar uses ("tune editorModule"), so its scoped CSS (preview tiles, suit editors, TTS input)
      // applies and it looks and works exactly like the Properties panel it is reused from.
      const moduleDOM = div(panel, 'tune editorModule deckEditorNewDeckModule');
      this.deckCreator.moduleDOM = moduleDOM;
      if(mode == 'traditional')
        this.deckCreator.deckTraditional(moduleDOM);
      else if(mode == 'custom')
        this.deckCreator.deckGenerator(moduleDOM);
      else if(mode == 'images')
        this.deckCreator.deckImages(moduleDOM);
      else if(mode == 'imagePairs')
        this.deckCreator.deckImagePairs(moduleDOM);
      else if(mode == 'text')
        this.deckCreator.deckTextCards(moduleDOM);
      else if(mode == 'tts')
        this.deckCreator.deckImportTTS(moduleDOM);
    }
  }

  // Creates a new deck (holder + deck widget) with the current deck's faces, card types and card defaults.
  async copyDeck() {
    if(!this.deck())
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    batchStart();
    const id = generateUniqueWidgetID();
    setDeltaCause(`${getPlayerDetails().playerName} copied deck ${this.deckID} in deck editor`);
    await addWidgetLocal({ type: 'holder', id, x: 748, y: 400, dropTarget: { type: 'card' } });
    await addWidgetLocal({
      type: 'deck',
      id: id+'D',
      parent: id,
      x: 12,
      y: 41,
      cardDefaults: JSON.parse(JSON.stringify(this.cardDefaults)),
      cardTypes: JSON.parse(JSON.stringify(this.cardTypes)),
      faceTemplates: JSON.parse(JSON.stringify(this.faceTemplates))
    });
    batchEnd();
    await this.open(id+'D');
    this.treeLevel = 'deck';
    this.render();
  }

  async deleteDeck() {
    const deck = this.deck();
    if(!deck)
      return;
    const cards = widgetFilter(w=>w.get('deck') == this.deckID);
    if(!confirm(`Delete deck "${this.deckID}"${cards.length ? ` and its ${cards.length} card(s)` : ''}?`))
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    const parent = deck.get('parent');
    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} deleted deck ${this.deckID} in deck editor`);
    for(const card of cards)
      await removeWidgetLocal(card.get('id'));
    await removeWidgetLocal(deck.get('id'));
    // Drop the holder created for this deck if nothing else lives in it.
    if(parent && widgets.has(parent) && !widgetFilter(w=>w.get('parent') == parent).length)
      await removeWidgetLocal(parent);
    // Clear the current deck before the removal delta lands so deckEditorReceiveDelta doesn't force-close the
    // editor (deleting the last deck should leave the editor open on an empty state, not exit it).
    this.deckID = null;
    batchEnd();

    const remaining = widgetFilter(w=>w.get('type') == 'deck');
    if(remaining.length) {
      await this.open(remaining[remaining.length-1].get('id'));
      this.treeLevel = 'deck';
    } else {
      // No decks left: stay open with an empty editor so the user can add a new deck from here.
      this.cardType = null;
      this.selectedObject = null;
      this.treeLevel = 'deck';
      this.resetHistory();
    }
    this.render();
  }

  // copyOf: name of an existing card type whose properties the new type starts with (null for a blank one).
  async addCardType(copyOf = null) {
    if(!this.deck() || copyOf !== null && this.cardTypes[copyOf] === undefined)
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    let name;
    if(copyOf !== null) {
      // Same clone convention as widget cloning: increment a trailing number if the name has one,
      // otherwise start at 1 (so "Hero" -> "Hero1", "type 3" -> "type 4").
      const match = String(copyOf).match(/^(.*?)([0-9]+)([^0-9]*)$/);
      const head = match ? match[1] : String(copyOf);
      const tail = match && match[3] ? match[3] : '';
      let number = match ? parseInt(match[2]) : 0;
      do {
        name = `${head}${++number}${tail}`;
      } while(this.cardTypes[name] !== undefined);
      // Insert the copy right after the original (object key order = strip order), not at the end.
      const copy = JSON.parse(JSON.stringify(this.cardTypes[copyOf]));
      const reordered = {};
      for(const key of Object.keys(this.cardTypes)) {
        reordered[key] = this.cardTypes[key];
        if(key === copyOf)
          reordered[name] = copy;
      }
      this.cardTypes = reordered;
    } else {
      let index = Object.keys(this.cardTypes).length + 1;
      while(this.cardTypes[`type ${index}`] !== undefined)
        ++index;
      name = `type ${index}`;
      this.cardTypes[name] = {};
    }
    this.cardType = name;
    this.selectedObject = null;
    await this.commit('cardTypes', copyOf !== null
      ? `${getPlayerDetails().playerName} copied card type ${copyOf} of deck ${this.deckID} in deck editor`
      : `${getPlayerDetails().playerName} added a card type to deck ${this.deckID} in deck editor`);
    this.render();
  }

  // Reorder card types by moving `from` to `to`'s position in the strip (object key order).
  async reorderCardType(from, to) {
    if(from === to || this.cardTypes[from] === undefined || this.cardTypes[to] === undefined)
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    const keys = Object.keys(this.cardTypes).filter(k=>k !== from);
    keys.splice(keys.indexOf(to), 0, from);
    const reordered = {};
    for(const k of keys)
      reordered[k] = this.cardTypes[k];
    this.cardTypes = reordered;
    await this.commit('cardTypes', `${getPlayerDetails().playerName} reordered card types of deck ${this.deckID} in deck editor`);
    this.render();
  }

  // Rename the deck widget's id (from the tree). updateWidgetId re-parents children, repoints the cards'
  // "deck" property and any inheritFrom, so nothing else breaks.
  async changeDeckId(newID) {
    newID = String(newID).trim();
    const deck = this.deck();
    const oldID = this.deckID;
    if(!deck || !newID || newID == oldID)
      return;
    if(widgets.has(newID)) {
      alert(`A widget with the id "${newID}" already exists. Please choose a different deck id.`);
      this.renderLeftSidebar();
      return;
    }
    await this.flushPendingCommits(); // save pending edits onto the old deck first
    const newState = JSON.parse(JSON.stringify(deck.state));
    newState.id = newID;
    this.renamingDeck = true;
    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} renamed deck ${oldID} to ${newID} in deck editor`);
    await updateWidgetId(newState, oldID);
    batchEnd();
    this.renamingDeck = false;
    // Migrate the editor's per-deck tree state to the new id.
    for(const set of [ this.expandedDecks, this.collapsedDecks ])
      if(set.has(oldID)) { set.delete(oldID); set.add(newID); }
    for(const set of [ this.expandedFaces, this.collapsedFaces ])
      for(const key of [...set])
        if(key.slice(0, oldID.length + 1) == oldID + ':') { set.delete(key); set.add(newID + key.slice(oldID.length)); }
    this.deckID = newID;
    this.loadWorkingCopies();
    this.resetHistory();
    this.render();
  }

  async renameCardType(oldName, newName) {
    const deck = this.deck();
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    const newTypes = {};
    for(const key of Object.keys(this.cardTypes))
      newTypes[key == oldName ? newName : key] = this.cardTypes[key];
    this.cardTypes = newTypes;
    this.cardType = newName;

    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} renamed card type ${oldName} of deck ${this.deckID} in deck editor`);
    await deck.set('cardTypes', JSON.parse(JSON.stringify(newTypes)));
    for(const card of widgetFilter(w=>w.get('deck') == this.deckID && w.get('cardType') == oldName))
      await card.set('cardType', newName);
    batchEnd();

    // This also renamed card widgets, which the working-copy snapshots don't capture, so restart the deck-editor
    // history here rather than let an in-editor undo revert cardTypes and orphan those cards (the toolbar undo
    // still reverts the whole rename).
    this.resetHistory();
    this.render();
  }

  async deleteCardType() {
    const name = this.cardType;
    const cards = widgetFilter(w=>w.get('deck') == this.deckID && w.get('cardType') == name);
    if(!confirm(`Delete card type "${name}"${cards.length ? ` and its ${cards.length} card(s)` : ''}?`))
      return;

    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    const cause = `${getPlayerDetails().playerName} removed card type ${name} from deck ${this.deckID} in deck editor`;
    batchStart();
    setDeltaCause(cause);
    for(const card of cards)
      await removeWidgetLocal(card.get('id'));
    delete this.cardTypes[name];
    await this.deck().set('cardTypes', JSON.parse(JSON.stringify(this.cardTypes)));
    batchEnd();

    this.cardType = Object.keys(this.cardTypes)[0] || null;
    this.selectedObject = null;
    // Record the deletion as a breadcrumb step (in-editor undo restores the card type definition; a card type
    // with zero cards is a valid state, and the room-level toolbar undo restores the deleted card widgets too).
    this.recordHistory(cause, this.newAction());
    this.render();
  }

  // --- Card type CSV import/export (mirrors the JSON editor's je_exportCSV / je_importCSV, but driven from the
  // deck editor's own UI and working copies). ---

  csvEscapeField(v) {
    if(v === undefined)
      return '';
    if(typeof v == 'number')
      return v.toString();
    return typeof v == 'string' && !v.match(/^-?[0-9]*(\.[0-9]+)?(e[0-9]+)?$|^JSON:/) ? `"${v.replace(/"/g, '""')}"` : `"JSON:${JSON.stringify(v).replace(/"/g, '""')}"`;
  }

  csvUnescapeField(v) {
    try {
      if(v.match(/^JSON:/))
        return JSON.parse(v.substr(5));
      else if(v && v.match(/^-?[0-9]*(\.[0-9]+)?(e[0-9]+)?$/))
        return parseFloat(v);
      else if(v)
        return v;
    } catch(e) {
      return e.toString();
    }
  }

  csvToArray(text, delimiter) {
    let p = '', row = [ '' ], ret = [ row ], i = 0, r = 0, s = !0, l;
    for(l of text) {
      if('"' === l) {
        if(s && l === p) row[i] += l;
        s = !s;
      } else if(delimiter === l && s) l = row[++i] = '';
      else if('\n' === l && s) {
        if('\r' === p) row[i] = row[i].slice(0, -1);
        row = ret[++r] = [ l = '' ]; i = 0;
      } else row[i] += l;
      p = l;
    }
    return ret;
  }

  exportCardTypesCSV(separator) {
    if(!this.deck())
      return;
    separator = separator || ',';
    const allProperties = [ ...new Set(Object.values(this.cardTypes).reduce((a, t)=>a.concat(...Object.keys(t)), [])) ];
    let csvText = `id::INTERNAL${separator}${allProperties.map(p=>this.csvEscapeField(p)).join(separator)}${separator}cardCount::INTERNAL\n`;
    for(const [ id, type ] of Object.entries(this.cardTypes)) {
      const cardCount = widgetFilter(w=>w.get('deck') == this.deckID && w.get('cardType') == id).length;
      csvText += `${this.csvEscapeField(id)}${separator}${allProperties.map(p=>this.csvEscapeField(type[p])).join(separator)}${separator}${cardCount}\n`;
    }
    const blob = new Blob([ csvText ], { type: 'text/csv' });
    const link = document.createElement('a');
    link.download = `${this.deckID} cardTypes.csv`;
    link.href = window.URL.createObjectURL(blob);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async importCardTypesCSV(csvText, mode) {
    const deck = this.deck();
    if(!deck)
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    const oldIDs = Object.keys(this.cardTypes);
    if(mode == 'replace')
      this.cardTypes = {};

    const lines = this.csvToArray(csvText, csvText.split(';').length > csvText.split(',').length ? ';' : ',');
    const headers = lines[0].map(v=>this.csvUnescapeField(v));
    const targetCounts = {};
    for(let i=1; i<lines.length; i++) {
      const line = lines[i];
      if(line.length == 1 && !line[0])
        continue;
      const obj = {};
      for(let j=0; j<Math.min(headers.length, line.length); j++)
        obj[headers[j]] = this.csvUnescapeField(line[j]);
      const id = obj['id::INTERNAL'] || generateUniqueWidgetID();
      delete obj['id::INTERNAL'];
      targetCounts[id] = obj['cardCount::INTERNAL'];
      delete obj['cardCount::INTERNAL'];
      this.cardTypes[id] = obj;
    }

    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} imported card types from CSV to deck ${this.deckID} in deck editor`);
    for(const oldID of oldIDs)
      if(!this.cardTypes[oldID])
        for(const card of widgetFilter(w=>w.get('deck') == this.deckID && w.get('cardType') == oldID))
          await removeWidgetLocal(card.get('id'));
    await deck.set('cardTypes', JSON.parse(JSON.stringify(this.cardTypes)));
    batchEnd();

    // Card counts from the file (blank leaves the existing count as-is).
    for(const [ id, count ] of Object.entries(targetCounts))
      if(count !== undefined && count !== '')
        await setCardCount(deck, id, parseInt(count, 10) || 0);

    this.cardType = Object.keys(this.cardTypes)[0] || null;
    this.selectedObject = null;
    // Card widgets changed outside the deck-editor snapshots, so restart its history (the room-level undo still
    // reverts the whole import).
    this.resetHistory();
    this.render();
  }

  async importCardTypesFromFile(mode) {
    let csv;
    try {
      csv = await selectFile('TEXT');
    } catch(e) {
      if(e.message != 'File selection cancelled.')
        alert(`Error: ${e.toString()}`);
      return;
    }
    await this.importCardTypesCSV(csv.content, mode);
  }
}

const deckEditor = new DeckEditor();

// Card sizes offered when creating an empty deck, in the order they are shown. The first is the size new
// decks have always been created at and stays the default; the rest are the proportions that come up most
// often across the public library (small cards, poker/tarot/large ratios, wide cards, square tiles/tokens).
const deckEditorCardSizes = [
  { label: 'Default',     width: 103, height: 160 },
  { label: 'Small',       width:  59, height:  92 },
  { label: 'Poker',       width: 100, height: 140 },
  { label: 'Tarot',       width:  87, height: 150 },
  { label: 'Large',       width: 120, height: 168 },
  { label: 'Wide',        width: 262, height: 160 },
  { label: 'Square tile', width: 100, height: 100 },
  { label: 'Token',       width:  50, height:  50 }
];

// The "Recall & Shuffle" button all deck creation flows put below their holder: it recalls the deck's cards,
// flips them to their back and shuffles them. Offered as an option by the "Add New Deck" wizard.
function deckResetButton(holderID, width, y) {
  return {
    id: holderID+'B',
    parent: holderID,
    fixedParent: true,
    y,
    width,
    height: 40,
    type: 'button',
    text: 'Recall & Shuffle',
    movableInEdit: false,
    clickRoutine: [
      { func: 'RECALL',  holder: '${PROPERTY parent}' },
      { func: 'FLIP',    holder: '${PROPERTY parent}', face: 0 },
      { func: 'SHUFFLE', holder: '${PROPERTY parent}' }
    ]
  };
}

// The two options of the "Add New Deck" dialog: whether the new deck gets a holder to put its cards in, and a
// reset button on that holder. The creation flows the dialog reuses live in three different modules, so it hands
// each of them this reader (the boxes stay togglable while a flow is on screen). Everywhere else - the properties
// sidebar, the add widget overlay's library deck browser - deckPlacementDefault applies, which is what those
// flows have always done.
function newDeckPlacement() {
  const holder = $('#deckEditorNewDeckHolder').checked;
  return { holder, resetButton: holder && $('#deckEditorNewDeckResetButton').checked };
}

const deckPlacementDefault = { holder: true, resetButton: true };

// Creates a minimal deck to start designing from scratch (holder + deck with one card type, a colored back
// and a white front, plus one card) and returns the deck's id. Used by the "Empty deck" option of the
// "Add New Deck" dialog.
// deckID: optional id for the deck widget itself (from the dialog); the holder and button still get generated
// ids. Defaults to the holder id + 'D' when not given.
// size: one of deckEditorCardSizes; the cards, the holder and its button are all built at that size.
// placement: what to add besides the deck itself, read from the dialog before it closes (see
// newDeckPlacement); holder and reset button when not given.
async function createStarterDeck(deckID, size, placement) {
  placement = placement || deckPlacementDefault;
  batchStart();
  const id = generateUniqueWidgetID();
  const dID = deckID || id+'D';
  const cardWidth = size && size.width || 103;
  const cardHeight = size && size.height || 160;
  const holderWidth = cardWidth + 8;   // the holder has always been 8 larger than the card it holds
  const holderHeight = cardHeight + 8;
  setDeltaCause(`${getPlayerDetails().playerName} created deck ${dID} for the deck editor`);
  if(placement.holder) {
    const holder = { type: 'holder', id, x: 748, y: 400, dropTarget: { type: 'card' } };
    // Spelled out only when they differ from the holder's own defaults, so a default-sized starter deck is
    // still exactly the deck this has always created.
    if(holderWidth != 111 || holderHeight != 168) {
      holder.width = holderWidth;
      holder.height = holderHeight;
    }
    await addWidgetLocal(holder);
    if(placement.resetButton)
      await addWidgetLocal(deckResetButton(id, holderWidth, holderHeight + 3.36));
  }
  // Without a holder the card is placed where the holder would have been and the deck widget (invisible outside
  // edit mode) next to it, so both are reachable.
  await addWidgetLocal(Object.assign({
    type: 'deck',
    id: dID
  }, placement.holder ? { parent: id, x: 12, y: 41 } : { x: 748 - 96, y: 400 }, {
    cardDefaults: { width: cardWidth, height: cardHeight },
    cardTypes: { 'type 1': {} },
    faceTemplates: [
      { objects: [ { type: 'image', x: 0, y: 0, width: cardWidth, height: cardHeight, color: VTTblue } ] },
      { objects: [ { type: 'image', x: 0, y: 0, width: cardWidth, height: cardHeight, color: '#ffffff' } ] }
    ]
  }));
  await addWidgetLocal(Object.assign({ type: 'card', deck: dID, cardType: 'type 1' },
    placement.holder ? { parent: id } : { x: 752, y: 404 }, { activeFace: 1 }));
  batchEnd();
  return dID;
}

async function deckEditorReceiveDelta(delta) {
  if(!deckEditor.isOpen())
    return;
  // A deck-id rename removes the old deck and adds it back under a new id; changeDeckId reloads the editor
  // itself, so ignore the delta here (otherwise the old-deck removal would close the editor).
  if(deckEditor.renamingDeck)
    return;
  // The "Add New Deck" submenu just triggered a creation flow (traditional/custom/image/TTS): when the new
  // deck lands, close the submenu and switch the editor to it so the freshly created deck is shown.
  if(deckEditor.pendingNewDeck && delta.s) {
    for(const id in delta.s) {
      const w = delta.s[id];
      if(w && w.type == 'deck' && id != deckEditor.deckID) {
        deckEditor.pendingNewDeck = false;
        showOverlay();
        await deckEditor.open(id);
        deckEditor.treeLevel = 'deck';
        deckEditor.render();
        return;
      }
    }
  }
  // The editor can be open with no deck selected (e.g. right after deleting the last deck) - there is nothing
  // to track or close in that case; the user can add a new deck from the still-open editor.
  if(deckEditor.deckID === null)
    return;
  if(delta.s && delta.s[deckEditor.deckID] === null || !widgets.has(deckEditor.deckID))
    return deckEditor.close();
  const deckDelta = delta.s && delta.s[deckEditor.deckID];
  if(!deckDelta)
    return;
  // deck.set() in commit() echoes back into here synchronously (before commit() even returns); reloading on
  // that self-echo would wipe out the sidebar mid-edit and revert any other property still pending a commit.
  // A delta that exactly matches the current working copy is that self-echo, not a genuine remote change.
  const changedProperties = [ 'faceTemplates', 'cardTypes', 'cardDefaults' ].filter(property=>deckDelta[property] !== undefined && !deckEditor.matchesWorkingCopy(property));
  if(!changedProperties.length)
    return;

  // Commit edits to properties the remote delta did not touch before reloading. A same-property conflict is
  // resolved in favor of the received value: reload() cancels its pending timer so stale local data cannot be
  // sent afterward.
  for(const property of Object.keys(deckEditor.commitTimers))
    if(!changedProperties.includes(property))
      await deckEditor.commit(property);

  return deckEditor.reload(changedProperties);
}

// Called when a full room state replaces the current one (e.g. switching games). The deck being edited is
// likely gone, so drop any pending debounced commits (they'd target a missing deck) and close the editor.
function deckEditorStateReplaced() {
  deckEditor.handleStateReplaced();
}
