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
    const object = deckEditor.selectedObjectTemplate();
    this.startX = object.x || 0;
    this.startY = object.y || 0;
  }

  async dragMove(dx, dy) {
    const object = deckEditor.selectedObjectTemplate();
    object.x = Math.round(this.startX + dx);
    object.y = Math.round(this.startY + dy);
    deckEditor.refreshMainCardFaces();

    return `
      X: <i>${object.x}</i><br>
      Y: <i>${object.y}</i>
    `;
  }

  async dragEnd() {
    await deckEditor.commit('faceTemplates', `${getPlayerDetails().playerName} moved a face object of deck ${deckEditor.deckID} in deck editor`);
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

  async dragStart() {
    const object = deckEditor.selectedObjectTemplate();
    const objectDiv = deckEditor.selectedObjectDiv();
    this.resizeIconSize = object.type == 'icon' && object.width === undefined;
    this.startSize   = object.size !== undefined ? object.size : (objectDiv ? objectDiv.offsetWidth : 0);
    this.startWidth  = object.width  !== undefined ? object.width  : (objectDiv ? objectDiv.offsetWidth  : 0);
    this.startHeight = object.height !== undefined ? object.height : (objectDiv ? objectDiv.offsetHeight : 0);
  }

  async dragMove(dx, dy) {
    const object = deckEditor.selectedObjectTemplate();

    if(this.resizeIconSize) {
      object.size = Math.max(1, Math.round(this.startSize + Math.max(dx, dy)));
      deckEditor.refreshMainCardFaces();
      return `Size: <i>${object.size}</i>`;
    }

    let resizeDx = dx;
    let resizeDy = dy;
    if(this.keepAspectRatio && this.startWidth && this.startHeight) {
      if(resizeDx > resizeDy)
        resizeDy = resizeDx * this.startHeight / this.startWidth;
      else
        resizeDx = resizeDy * this.startWidth / this.startHeight;
    }
    object.width  = Math.max(1, Math.round(this.startWidth  + resizeDx));
    object.height = Math.max(1, Math.round(this.startHeight + resizeDy));
    deckEditor.refreshMainCardFaces();

    return `
      Width: <i>${object.width}</i><br>
      Height: <i>${object.height}</i>
    `;
  }

  async dragEnd() {
    await deckEditor.commit('faceTemplates', `${getPlayerDetails().playerName} resized a face object of deck ${deckEditor.deckID} in deck editor`);
    deckEditor.renderSidebar();
  }
}

class DeckEditorRotateButton extends DeckEditorDragButton {
  constructor() {
    super('settings_backup_restore', 'Rotate', 'Drag to rotate the selected face object.');
  }

  async dragStart() {
    this.startRotation = deckEditor.selectedObjectTemplate().rotation || 0;
  }

  async dragMove(dx, dy) {
    const object = deckEditor.selectedObjectTemplate();
    object.rotation = Math.floor(this.startRotation + (dx+dy)/2);
    deckEditor.refreshMainCardFaces();

    return `Rotation: <i>${object.rotation}°</i>`;
  }

  async dragEnd() {
    await deckEditor.commit('faceTemplates', `${getPlayerDetails().playerName} rotated a face object of deck ${deckEditor.deckID} in deck editor`);
    deckEditor.renderSidebar();
  }
}

class DeckEditor {
  constructor() {
    this.deckID = null;
    this.cardType = null;
    this.face = 0;
    this.selectedObject = null;
    this.cardScale = 1;
    this.commitTimers = {};
    this.faceTemplates = [];
    this.cardTypes = {};
    this.cardDefaults = {};
    this.showAllAreas = false;
    this.addMode = 'static'; // 'static' = same on every card, 'dynamic' = different per card type

    // Self-contained edit history for the breadcrumb + undo/redo (scoped to the deck editor, rebuilt on open).
    // Each entry is a full snapshot of the working copies; undo/redo re-commit a snapshot through the normal
    // delta path, so they sync and are themselves room-undoable. applyingHistory suppresses recording while
    // a snapshot is being re-applied. See recordHistory()/jumpToHistory().
    this.history = [];
    this.historyIndex = -1;
    this.applyingHistory = false;
    this.maxHistory = 60;
    this.actionSeq = 0;
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

    this.dragToolbarButtons = [
      new DeckEditorDragDragButton(),
      new DeckEditorMoveButton(),
      new DeckEditorResizeButton(false),
      new DeckEditorResizeButton(true),
      new DeckEditorRotateButton()
    ];
    for(const button of this.dragToolbarButtons)
      button.render($('#deckEditorDragToolbar'));

    $('#deckEditorUndo').onclick = _=>this.undo();
    $('#deckEditorRedo').onclick = _=>this.redo();
    $('#deckEditorDeckSelect').onchange = e=>this.open(e.target.value);
    $('#deckEditorFaceSelect').onchange = e=>{
      this.face = +e.target.value;
      this.selectedObject = null;
      this.render();
    };
    $('#deckEditorAddFace').onclick = _=>this.addFace();
    $('#deckEditorDeleteFace').onclick = _=>this.deleteFace();
    $('#deckEditorShowAll').onclick = _=>{
      this.showAllAreas = !this.showAllAreas;
      $('#deckEditorShowAll').classList.toggle('active', this.showAllAreas);
      $('#deckEditorMain').classList.toggle('deckEditorShowAllAreas', this.showAllAreas);
    };
    // One set of add buttons; the mode toggle decides whether they add a static object (same on every card)
    // or a per-card-type one. The toggle's highlighted side and the group's accent color are the indicators.
    for(const button of $a('#deckEditorAddModeToggle button'))
      button.onclick = _=>this.setAddMode(button.dataset.mode);
    $('#deckEditorAddText').onclick = _=>this.addByMode({ type: 'text', x: 10, y: 10, width: 80, height: 30, fontSize: 20, textAlign: 'center' }, 'text', 'Text');
    $('#deckEditorAddImage').onclick = _=>{
      uploadAsset().then(asset=>{
        if(asset)
          this.addByMode({ type: 'image', x: 10, y: 10, width: 50, height: 50, color: 'transparent' }, 'image', asset);
      });
    };
    $('#deckEditorAddIcon').onclick = _=>this.addByMode({ type: 'icon', x: 10, y: 10, size: 50, color: '#000000' }, 'icon', 'skoll/hearts');
    $('#deckEditorAddColor').onclick = _=>this.addByMode(this.colorBoxTemplate(), 'color', '#cccccc', 'color');

    $('#deckEditorMain').onmousedown = e=>{
      if(e.target.id == 'deckEditorMain' || e.target.classList.contains('deckEditorCard') || e.target.classList.contains('cardFace'))
        this.selectObject(null);
    };

    window.addEventListener('resize', _=>{
      if(this.isOpen()) {
        this.renderMain();
        this.updateDragToolbar();
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
    if(e.key == 'Delete' && this.selectedObject !== null) {
      e.preventDefault();
      this.deleteSelectedObject();
    }
  }

  async open(deckID) {
    this.initializeDOM();

    const deck = widgets.get(deckID);
    if(!deck || deck.get('type') != 'deck')
      return;

    if(this.deckID !== null && this.deckID != deckID)
      await this.flushPendingCommits();

    this.deckID = deckID;
    this.loadWorkingCopies();
    this.cardType = Object.keys(this.cardTypes)[0] || null;
    const dynamicFaces = this.dynamicFaces();
    this.face = dynamicFaces.length ? dynamicFaces[dynamicFaces.length-1] : Math.max(0, this.faceTemplates.length-1);
    this.selectedObject = null;
    this.resetHistory();

    $('body').classList.add('deckEditorActive');
    this.render();
    this.syncToolbarButton();
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
      if(decks.length)
        deckID = decks[decks.length-1].get('id');
    }
    if(deckID !== null)
      await this.open(deckID);
    else
      alert('This game has no deck yet. Add one first — the "Design a deck in the deck editor" option when adding a deck opens it here directly.');
  }

  async close() {
    await this.flushPendingCommits();
    this.selectedObject = null;
    $('body').classList.remove('deckEditorActive');
    $('#deckEditorDragToolbar').classList.remove('active');
    this.syncToolbarButton();
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
    if(!this.isOpen())
      return;
    this.deckID = null;
    this.selectedObject = null;
    this.history = [];
    this.historyIndex = -1;
    $('body').classList.remove('deckEditorActive');
    $('#deckEditorDragToolbar').classList.remove('active');
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
    if(this.selectedObject !== null && (!face || !Array.isArray(face.objects) || this.selectedObject >= face.objects.length))
      this.selectedObject = null;
    // A reload only happens for genuine external changes (see matchesWorkingCopy guard), so record it as its
    // own breadcrumb step (no actionId => never merges) rather than swapping the working copy out silently.
    this.recordHistory('__external__', null);
    this.render();
  }

  dynamicFaces() {
    const isDynamic = object=>{
      if(object.dynamicProperties && Object.keys(object.dynamicProperties).length)
        return true;
      if(object.svgReplaces && Object.keys(object.svgReplaces).length)
        return true;
      return object.type == 'html' && String(object.value).match(/\$\{PROPERTY /);
    };

    const result = [];
    for(let face=0; face<this.faceTemplates.length; ++face)
      if((this.faceTemplates[face].objects || []).filter(isDynamic).length)
        result.push(face);
    return result;
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

    let match = cause.match(/ updated "(.+?)" of face object (\d+) /);
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
    this.renderTopbar();
    this.renderHistory();
    this.renderMain();
    this.renderStrip();
    this.renderSidebar();
    this.updateDragToolbar();
  }

  renderTopbar() {
    const deckSelect = $('#deckEditorDeckSelect');
    deckSelect.innerHTML = '';
    for(const deck of widgetFilter(w=>w.get('type') == 'deck')) {
      const option = document.createElement('option');
      option.value = option.textContent = deck.id;
      option.selected = deck.id == this.deckID;
      deckSelect.append(option);
    }

    const faceSelect = $('#deckEditorFaceSelect');
    faceSelect.innerHTML = '';
    for(let face=0; face<this.faceTemplates.length; ++face) {
      const option = document.createElement('option');
      option.value = face;
      option.textContent = this.faceLabel(face);
      option.selected = face == this.face;
      faceSelect.append(option);
    }
    faceSelect.disabled = !this.faceTemplates.length;
    $('#deckEditorDeleteFace').disabled = !this.faceTemplates.length;
  }

  // Face 0 back / face 1 front is only the usual convention, so hedge with "usually" and drop the
  // hint entirely for decks with a non-standard number of faces.
  faceLabel(face) {
    if(this.faceTemplates.length == 2)
      return face == 0 ? 'Face 0 (usually the back)' : 'Face 1 (usually the front)';
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
    this.cardScale = Math.max(0.1, Math.min((available.width-100)/cardWidth, (available.height-100)/cardHeight));

    wrapper.style.width  = cardWidth  + 'px';
    wrapper.style.height = cardHeight + 'px';
    wrapper.style.transform = `scale(${this.cardScale})`;
    wrapper.style.setProperty('--deckEditorCardScale', this.cardScale);

    this.refreshMainCardFaces();
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
  }

  attachObjectHandlers() {
    if(!this.mainCard)
      return;
    const faceDiv = $a('.cardFace', this.mainCard.domElement)[this.face];
    if(!faceDiv)
      return;

    [...faceDiv.children].forEach((objectDiv, index)=>{
      objectDiv.classList.toggle('deckEditorSelectedObject', index === this.selectedObject);
      const pointerDown = (name, e)=>{
        e.stopPropagation();
        e.preventDefault();
        if(this.selectedObject !== index)
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

    const object = this.faceTemplates[this.face].objects[index];
    const startCoords = eventCoords(name, e);
    const startX = object.x || 0;
    const startY = object.y || 0;
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
      object.x = Math.round(startX + dx);
      object.y = Math.round(startY + dy);
      this.refreshMainCardFaces();
      this.updateDragToolbar();
    };
    const up = async ev=>{
      for(const event of [ 'mousemove', 'touchmove' ])
        document.removeEventListener(event, move);
      for(const event of [ 'mouseup', 'touchend', 'touchcancel' ])
        document.removeEventListener(event, up);
      if(moved) {
        await this.commit('faceTemplates', `${getPlayerDetails().playerName} moved a face object of deck ${this.deckID} in deck editor`);
        this.renderSidebar();
      }
    };
    for(const event of [ 'mousemove', 'touchmove' ])
      document.addEventListener(event, move, { passive: false });
    for(const event of [ 'mouseup', 'touchend', 'touchcancel' ])
      document.addEventListener(event, up);
  }

  selectObject(index) {
    this.selectedObject = index;
    this.attachObjectHandlers();
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

  updateDragToolbar() {
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

  renderStrip() {
    const strip = $('#deckEditorStrip');
    strip.innerHTML = '';
    if(!this.deck())
      return;

    // One entry per card type. It shows the currently selected face; when that face has nothing dynamic (it
    // looks the same on every card type, e.g. a static back), fall back to a dynamic face so the entries
    // still tell the card types apart. Faces are switched with the dropdown, not by multiplying the strip.
    const dynamicFaces = this.dynamicFaces();
    const stripFace = !this.faceTemplates.length ? null
                    : dynamicFaces.length && !dynamicFaces.includes(this.face) ? dynamicFaces[dynamicFaces.length-1]
                    : this.face;

    for(const cardType of Object.keys(this.cardTypes)) {
      const button = div(strip, 'deckEditorStripCard', `<div class=renderedCard></div><span>${html(cardType)}</span>`);
      button.classList.toggle('selected', cardType == this.cardType);
      if(stripFace !== null && stripFace != this.face)
        button.title = `${cardType} — showing face ${stripFace} because the selected face looks the same on every card type`;
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
        this.selectedObject = null;
        this.render();
      };
    }

    const addButton = div(strip, 'deckEditorStripCard deckEditorAddCardType', '<button icon=add></button><span>Add blank card type</span>');
    addButton.title = 'Adds a new card type without any properties.';
    $('button', addButton).onclick = _=>this.addCardType();

    if(this.cardType !== null) {
      const copyButton = div(strip, 'deckEditorStripCard deckEditorAddCardType', '<button icon=content_copy></button><span>Copy card type</span>');
      copyButton.title = `Adds a new card type with the same properties as "${this.cardType}".`;
      $('button', copyButton).onclick = _=>this.addCardType(this.cardType);
    }
  }

  renderSidebar() {
    const sidebar = $('#deckEditorSidebar');
    sidebar.innerHTML = '';
    const deck = this.deck();
    if(!deck)
      return;

    // A <header> (not a div) so the test selector `.deckEditorProperties:first-of-type` keeps matching the
    // first properties div. scopeClass carries the topbar's blue/amber accent into the sidebar sections.
    const addHeader = (text, scopeClass, caption)=>{
      const header = document.createElement('header');
      header.className = `deckEditorSidebarHeader ${scopeClass}`;
      header.innerHTML = `<h2>${html(text)}</h2><p>${html(caption)}</p>`;
      sidebar.append(header);
    };

    const addPropertyRow = (target, onAdd)=>{
      const row = div(target, 'deckEditorAddProperty', '<input placeholder="new property"><button icon=add>Add</button>');
      $('button', row).onclick = _=>{
        const property = $('input', row).value.trim();
        if(property)
          onAdd(property);
      };
    };

    const object = this.selectedObjectTemplate();
    if(object) {
      addHeader(`Face object ${this.selectedObject+1} (${object.type || 'text'})`, 'deckEditorScopeEveryCard', 'Part of the face template — on every card');
      // One cause/actionId per edited field: a typing burst on one property of one object stays one
      // breadcrumb/undo step, but edits to another property or object become their own step.
      const objectFieldArgs = property=>[
        `${getPlayerDetails().playerName} updated "${property}" of face object ${this.selectedObject+1} on face ${this.face} of deck ${this.deckID} in deck editor`,
        `field:faceTemplates:${this.face}:${this.selectedObject}:${property}`
      ];
      const objectProps = div(sidebar, 'deckEditorProperties deckEditorObjectProperties');
      for(const property of Object.keys(object)) {
        if(property == 'dynamicProperties')
          continue;
        const row = this.addInput(property, object[property], v=>this.queueFieldEdit(async _=>{
          await this.flushPendingCommitForOtherField('faceTemplates', objectFieldArgs(property)[1]);
          if(typeof v === 'undefined')
            delete object[property];
          else
            object[property] = v;
          this.refreshMainCardFaces();
          this.updateDragToolbar();
          this.scheduleCommit('faceTemplates', ...objectFieldArgs(property));
        }), objectProps);
        if(property != 'type') {
          const makeDynamic = document.createElement('button');
          makeDynamic.setAttribute('icon', 'style');
          makeDynamic.className = 'deckEditorMakeDynamic';
          makeDynamic.title = `Make "${property}" different per card type`;
          makeDynamic.onclick = _=>this.makePropertyDynamic(object, property);
          row.dom.append(makeDynamic);
        }
        this.addPropertyDeleteButton(row, property, async _=>{
          await this.flushPendingCommits();
          delete object[property];
          this.refreshMainCardFaces();
          await this.commit('faceTemplates', `${getPlayerDetails().playerName} deleted property "${property}" of a face object of deck ${this.deckID} in deck editor`);
          this.renderSidebar();
        });
      }
      addPropertyRow(sidebar, property=>this.queueFieldEdit(async _=>{
        if(property == 'dynamicProperties' || object[property] !== undefined)
          return;
        await this.flushPendingCommitForOtherField('faceTemplates', objectFieldArgs(property)[1]);
        object[property] = '';
        this.scheduleCommit('faceTemplates', ...objectFieldArgs(property));
        this.renderSidebar();
      }));

      this.renderDynamicProperties(sidebar, object);

      const objectButtons = div(sidebar, 'buttonBar');
      if(object.type == 'image') {
        const upload = document.createElement('button');
        upload.setAttribute('icon', 'upload');
        upload.innerText = 'Upload image';
        upload.onclick = _=>uploadAsset().then(async asset=>{
          if(asset) {
            await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
            object.value = asset;
            this.refreshMainCardFaces();
            await this.commit('faceTemplates', `${getPlayerDetails().playerName} uploaded an image for a face object of deck ${this.deckID} in deck editor`);
            this.renderSidebar();
          }
        });
        objectButtons.append(upload);
      }
      const deleteObject = document.createElement('button');
      deleteObject.setAttribute('icon', 'delete');
      deleteObject.className = 'red';
      deleteObject.innerText = 'Delete object';
      deleteObject.onclick = _=>this.deleteSelectedObject();
      objectButtons.append(deleteObject);
    } else if(this.faceTemplates.length) {
      div(sidebar, 'deckEditorHint', '<p>Click a face object in the big card view to select and edit it. Drag it to move it around.</p>');
    }

    if(this.faceTemplates[this.face]) {
      const face = this.faceTemplates[this.face];
      addHeader(this.faceLabel(this.face), 'deckEditorScopeEveryCard', 'Settings of the whole face — on every card');
      const faceFieldArgs = property=>[
        `${getPlayerDetails().playerName} updated "${property}" of face ${this.face} of deck ${this.deckID} in deck editor`,
        `field:faceTemplates:face:${this.face}:${property}`
      ];
      const faceProps = div(sidebar, 'deckEditorProperties');
      for(const property of [ 'border', 'radius' ]) {
        this.addInput(property, face[property], v=>this.queueFieldEdit(async _=>{
          await this.flushPendingCommitForOtherField('faceTemplates', faceFieldArgs(property)[1]);
          if(typeof v === 'undefined')
            delete face[property];
          else
            face[property] = v;
          this.refreshMainCardFaces();
          this.scheduleCommit('faceTemplates', ...faceFieldArgs(property));
        }), faceProps);
      }
    }

    if(this.cardType === null) {
      this.renderCardDefaults(sidebar, addHeader, addPropertyRow);
      return;
    }

    addHeader('Card type', 'deckEditorScopeThisType', 'Only this card type');

    const nameRow = div(sidebar, 'deckEditorCardTypeName', `<label>Name</label><input value="${html(String(this.cardType))}">`);
    $('input', nameRow).onchange = e=>{
      const newName = e.target.value;
      if(newName && newName != this.cardType && !this.cardTypes[newName])
        this.renameCardType(this.cardType, newName);
      else
        e.target.value = this.cardType;
    };

    const cardCount = widgetFilter(w=>w.get('deck') == this.deckID && w.get('cardType') == this.cardType).length;
    const countRow = div(sidebar, 'deckEditorCardCount', `<label>Cards in game</label><button icon=remove></button><input type=number min=0 value=${cardCount}><button icon=add></button>`);
    const countInput = $('input', countRow);
    const applyCount = count=>{
      countInput.value = Math.max(0, parseInt(count, 10) || 0);
      setCardCount(deck, this.cardType, +countInput.value);
    };
    $('[icon=remove]', countRow).onclick = _=>applyCount(+countInput.value - 1);
    $('[icon=add]',    countRow).onclick = _=>applyCount(+countInput.value + 1);
    countInput.onchange = _=>applyCount(countInput.value);

    const typeProperties = this.cardTypes[this.cardType];
    const typeFieldArgs = property=>[
      `${getPlayerDetails().playerName} updated "${property}" of card type "${this.cardType}" of deck ${this.deckID} in deck editor`,
      `field:cardTypes:${this.cardType}:${property}`
    ];
    const typeProps = div(sidebar, 'deckEditorProperties');
    const addTypeInput = property=>{
      const row = this.addInput(property, typeProperties[property], v=>this.queueFieldEdit(async _=>{
        await this.flushPendingCommitForOtherField('cardTypes', typeFieldArgs(property)[1]);
        if(typeof v === 'undefined') {
          delete typeProperties[property];
          if(this.mainCard)
            delete this.mainCard.state[property];
        } else {
          typeProperties[property] = v;
        }
        this.refreshMainCardFaces();
        this.scheduleCommit('cardTypes', ...typeFieldArgs(property));
      }), typeProps);
      if(typeProperties[property] !== undefined) {
        this.addPropertyDeleteButton(row, property, async _=>{
          await this.flushPendingCommits();
          delete typeProperties[property];
          if(this.mainCard)
            delete this.mainCard.state[property];
          this.refreshMainCardFaces();
          await this.commit('cardTypes', `${getPlayerDetails().playerName} deleted property "${property}" of card type "${this.cardType}" of deck ${this.deckID} in deck editor`);
          this.renderSidebar();
        });
      }
    };
    for(const property of Object.keys(typeProperties))
      addTypeInput(property);
    for(const face of this.faceTemplates)
      for(const object of face.objects || [])
        for(const property of Object.values(object.dynamicProperties || {}))
          if(typeof typeProperties[property] === 'undefined' && [ 'cardType', 'id' ].indexOf(property) == -1)
            addTypeInput(property);
    addPropertyRow(sidebar, property=>this.queueFieldEdit(async _=>{
      if(typeProperties[property] !== undefined)
        return;
      await this.flushPendingCommitForOtherField('cardTypes', typeFieldArgs(property)[1]);
      typeProperties[property] = '';
      this.scheduleCommit('cardTypes', ...typeFieldArgs(property));
      this.renderSidebar();
    }));

    const typeButtons = div(sidebar, 'buttonBar');
    const deleteType = document.createElement('button');
    deleteType.setAttribute('icon', 'delete');
    deleteType.className = 'red';
    deleteType.innerText = 'Delete card type';
    deleteType.onclick = _=>this.deleteCardType();
    typeButtons.append(deleteType);

    this.renderCardDefaults(sidebar, addHeader, addPropertyRow);
  }

  renderCardDefaults(sidebar, addHeader, addPropertyRow) {
    addHeader('Card defaults', 'deckEditorScopeEveryCard', 'Default properties of every card of this deck');

    const defaultsFieldArgs = property=>[
      `${getPlayerDetails().playerName} updated "${property}" of card defaults of deck ${this.deckID} in deck editor`,
      `field:cardDefaults:${property}`
    ];
    const defaultsProps = div(sidebar, 'deckEditorProperties');
    const addDefaultsInput = property=>{
      const row = this.addInput(property, this.cardDefaults[property], v=>this.queueFieldEdit(async _=>{
        await this.flushPendingCommitForOtherField('cardDefaults', defaultsFieldArgs(property)[1]);
        if(typeof v === 'undefined')
          delete this.cardDefaults[property];
        else
          this.cardDefaults[property] = v;
        this.scheduleCommit('cardDefaults', ...defaultsFieldArgs(property));
      }), defaultsProps);
      if(this.cardDefaults[property] !== undefined) {
        this.addPropertyDeleteButton(row, property, async _=>{
          await this.flushPendingCommits();
          delete this.cardDefaults[property];
          await this.commit('cardDefaults', `${getPlayerDetails().playerName} deleted property "${property}" of card defaults of deck ${this.deckID} in deck editor`);
          this.renderSidebar();
        });
      }
    };
    for(const property of Object.keys(this.cardDefaults))
      addDefaultsInput(property);
    for(const property of [ 'width', 'height' ]) // the most common defaults are always offered
      if(this.cardDefaults[property] === undefined)
        addDefaultsInput(property);
    addPropertyRow(sidebar, property=>this.queueFieldEdit(async _=>{
      if(this.cardDefaults[property] !== undefined)
        return;
      await this.flushPendingCommitForOtherField('cardDefaults', defaultsFieldArgs(property)[1]);
      this.cardDefaults[property] = '';
      this.scheduleCommit('cardDefaults', ...defaultsFieldArgs(property));
      this.renderSidebar();
    }));
  }

  // The type dropdown's "not set" only unsets the value until the next re-render; this removes the row too.
  addPropertyDeleteButton(row, property, onDelete) {
    const button = document.createElement('button');
    button.setAttribute('icon', 'delete');
    button.className = 'deckEditorDeleteProperty';
    button.title = `Delete property "${property}"`;
    button.onclick = onDelete;
    row.dom.append(button);
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

  // One-click conversion of a static face object property into a per-card-type one: bind it to a (new) card
  // type property and seed that property on EVERY card type with the previous static value, so no card
  // changes visually until the values are edited per card type.
  async makePropertyDynamic(object, property) {
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    const typeProperty = this.generateUniquePropertyName(property == 'value' ? (object.type || 'text') : property);
    const staticValue = object[property];
    if(!object.dynamicProperties || typeof object.dynamicProperties != 'object')
      object.dynamicProperties = {};
    object.dynamicProperties[property] = typeProperty;
    delete object[property]; // a static value would override the dynamic one

    // One cause + one actionId so this single user action is one undo step and one breadcrumb, not two.
    const cause = `${getPlayerDetails().playerName} made "${property}" of a face object different per card type for deck ${this.deckID} in deck editor`;
    const actionId = this.newAction();
    if(staticValue !== undefined && Object.keys(this.cardTypes).length) {
      for(const type of Object.keys(this.cardTypes))
        if(this.cardTypes[type][typeProperty] === undefined)
          this.cardTypes[type][typeProperty] = staticValue;
      await this.commit('cardTypes', cause, actionId);
    }
    this.refreshMainCardFaces();
    await this.commit('faceTemplates', cause, actionId);
    this.renderSidebar();
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
    for(const button of $a('#deckEditorAddModeToggle button'))
      button.classList.toggle('active', button.dataset.mode == this.addMode);
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
    const h = document.createElement('h3');
    h.innerText = 'Dynamic properties';
    sidebar.append(h);

    const container = div(sidebar, 'deckEditorDynamicProperties', '<p>Dynamic properties fill properties of this object from the card type, so every card type can show different text, images or colors. The <b>stack</b> button next to a property above converts it with one click.</p>');

    for(const [ objectProperty, typeProperty ] of Object.entries(object.dynamicProperties || {})) {
      const row = div(container, 'deckEditorDynamicProperty', `<span><b>${html(objectProperty)}</b> from card type property <b>${html(String(typeProperty))}</b></span><button icon=delete title="Remove this binding and make the property static again."></button>`);
      $('button', row).onclick = async _=>{
        await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
        delete object.dynamicProperties[objectProperty];
        if(!Object.keys(object.dynamicProperties).length)
          delete object.dynamicProperties;
        // Restore the current card type's value as the static value so the card does not change visually.
        const currentValue = this.cardType !== null ? this.cardTypes[this.cardType][typeProperty] : undefined;
        if(currentValue !== undefined && object[objectProperty] === undefined)
          object[objectProperty] = currentValue;
        this.refreshMainCardFaces();
        const cause = `${getPlayerDetails().playerName} removed a dynamic property binding from deck ${this.deckID} in deck editor`;
        const actionId = this.newAction();
        await this.commit('faceTemplates', cause, actionId);
        if(this.removeOrphanedTypeProperties([ { dynamicProperties: { [objectProperty]: typeProperty } } ]))
          await this.commit('cardTypes', cause, actionId);
        this.renderSidebar();
      };
    }

    // Both sides are dropdowns: the object side offers common displayable properties plus the object's own
    // ones, the card type side offers every property any card type already has plus a "new property" choice.
    const bound = object.dynamicProperties || {};
    const objectPropertyOptions = [...new Set([ 'value', 'color', 'width', 'height', 'display', ...Object.keys(object) ])]
      .filter(p=>p != 'type' && p != 'dynamicProperties' && bound[p] === undefined);
    const typePropertyOptions = this.knownCardTypeProperties();
    const addRow = div(container, 'deckEditorAddBinding', `
      <div><label>Object property to fill</label><select class=objectProperty>${objectPropertyOptions.map(p=>`<option value="${html(p)}">${html(p)}</option>`).join('')}</select></div>
      <div><label>From card type property</label><select class=typeProperty>${typePropertyOptions.map(p=>`<option value="${html(p)}">${html(p)}</option>`).join('')}<option value="__new__">new property…</option></select></div>
      <div class=newTypeProperty style="display:none"><label>Name of the new property</label><input placeholder="e.g. rank"></div>
      <div class=buttonBar><button icon=add>Add dynamic property</button></div>
    `);
    const typeSelect = $('.typeProperty', addRow);
    const updateNewNameVisibility = _=>$('.newTypeProperty', addRow).style.display = typeSelect.value == '__new__' ? '' : 'none';
    typeSelect.onchange = updateNewNameVisibility;
    updateNewNameVisibility();
    $('button', addRow).onclick = async _=>{
      const objectProperty = $('.objectProperty', addRow).value;
      let typeProperty = typeSelect.value == '__new__' ? $('.newTypeProperty input', addRow).value.trim() : typeSelect.value;
      if(!objectProperty || !typeProperty)
        return;
      if(typeSelect.value == '__new__' && this.reservedCardTypeProperties().includes(typeProperty))
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
      this.renderTopbar();
    }
    const face = this.faceTemplates[this.face];
    if(!face)
      return;
    if(!Array.isArray(face.objects))
      face.objects = [];
    face.objects.push(objectTemplate);
    if(this.mainCard)
      this.refreshMainCardFaces();
    else
      this.renderMain(); // the "no faces yet" empty state was showing before this
    await this.commit('faceTemplates', cause || `${getPlayerDetails().playerName} added a ${objectTemplate.type || 'basic'} object to deck ${this.deckID} in deck editor`, actionId);
    this.selectObject(face.objects.length-1);
  }

  // Card type properties the given objects pull values from (dynamicProperties, svgReplaces, ${PROPERTY ...}).
  referencedTypeProperties(objects) {
    const properties = new Set();
    for(const object of objects) {
      for(const property of Object.values(object.dynamicProperties || {}))
        properties.add(property);
      for(const property of Object.values(object.svgReplaces || {}))
        properties.add(property);
      if(object.type == 'html')
        for(const match of String(object.value).matchAll(/\$\{PROPERTY ([^}]+)\}/g))
          properties.add(match[1]);
    }
    return properties;
  }

  // Removes card type properties that are no longer referenced by any face object after the given objects
  // were removed, so deleting an object doesn't leave orphaned per-card-type data behind (and the next
  // added object can reuse the property name). Returns whether cardTypes changed.
  removeOrphanedTypeProperties(removedObjects) {
    const stillReferenced = this.referencedTypeProperties(this.faceTemplates.flatMap(face=>face.objects || []));

    let changed = false;
    for(const property of this.referencedTypeProperties(removedObjects))
      if(!stillReferenced.has(property))
        for(const typeProperties of Object.values(this.cardTypes))
          if(typeProperties[property] !== undefined) {
            delete typeProperties[property];
            changed = true;
          }
    return changed;
  }

  async deleteSelectedObject() {
    const face = this.faceTemplates[this.face];
    if(!face || this.selectedObject === null)
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    const removed = face.objects.splice(this.selectedObject, 1);
    this.selectedObject = null;
    this.refreshMainCardFaces();
    // One cause + one actionId so the object removal and the orphaned-property cleanup are one undo step.
    const cause = `${getPlayerDetails().playerName} deleted a face object from deck ${this.deckID} in deck editor`;
    const actionId = this.newAction();
    await this.commit('faceTemplates', cause, actionId);
    if(this.removeOrphanedTypeProperties(removed))
      await this.commit('cardTypes', cause, actionId);
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
    await this.commit('faceTemplates', `${getPlayerDetails().playerName} added a face to deck ${this.deckID} in deck editor`);
    this.render();
  }

  async deleteFace() {
    if(!this.deck() || !this.faceTemplates.length)
      return;
    if(!confirm(`Delete ${this.faceLabel(this.face)} from every card type of this deck?`))
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    const removed = this.faceTemplates.splice(this.face, 1);
    this.face = Math.min(this.face, Math.max(0, this.faceTemplates.length-1));
    this.selectedObject = null;
    const cause = `${getPlayerDetails().playerName} deleted a face from deck ${this.deckID} in deck editor`;
    const actionId = this.newAction();
    await this.commit('faceTemplates', cause, actionId);
    if(this.removeOrphanedTypeProperties(removed[0] && removed[0].objects || []))
      await this.commit('cardTypes', cause, actionId);
    this.render();
  }

  // copyOf: name of an existing card type whose properties the new type starts with (null for a blank one).
  async addCardType(copyOf = null) {
    if(!this.deck() || copyOf !== null && this.cardTypes[copyOf] === undefined)
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    let name;
    if(copyOf !== null) {
      name = `${copyOf} copy`;
      let index = 2;
      while(this.cardTypes[name] !== undefined)
        name = `${copyOf} copy ${index++}`;
      this.cardTypes[name] = JSON.parse(JSON.stringify(this.cardTypes[copyOf]));
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
    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} removed card type ${name} from deck ${this.deckID} in deck editor`);
    for(const card of cards)
      await removeWidgetLocal(card.get('id'));
    delete this.cardTypes[name];
    await this.deck().set('cardTypes', JSON.parse(JSON.stringify(this.cardTypes)));
    batchEnd();

    this.cardType = Object.keys(this.cardTypes)[0] || null;
    this.selectedObject = null;
    // Removed card widgets aren't in the snapshots, so restart deck-editor history to avoid an in-editor undo
    // resurrecting a cardType with no cards (the toolbar undo still restores the cards).
    this.resetHistory();
    this.render();
  }
}

const deckEditor = new DeckEditor();

async function deckEditorReceiveDelta(delta) {
  if(!deckEditor.isOpen())
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
