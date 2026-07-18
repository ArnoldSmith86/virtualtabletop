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

    $('#deckEditorClose').onclick = _=>this.close();
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
    $('#deckEditorAddText').onclick = _=>this.addObject({ type: 'text', x: 10, y: 10, width: 80, height: 30, fontSize: 20, textAlign: 'center', value: 'Text' });
    $('#deckEditorAddImage').onclick = _=>{
      uploadAsset().then(asset=>{
        if(asset)
          this.addObject({ type: 'image', x: 10, y: 10, width: 50, height: 50, color: 'transparent', value: asset });
      });
    };
    $('#deckEditorAddIcon').onclick = _=>this.addObject({ type: 'icon', x: 10, y: 10, size: 50, color: '#000000', value: 'skoll/hearts' });

    $('#deckEditorAddTextDynamic').onclick = _=>this.addDynamicObject({ type: 'text', x: 10, y: 10, width: 80, height: 30, fontSize: 20, textAlign: 'center' }, 'text', 'Text');
    $('#deckEditorAddImageDynamic').onclick = _=>{
      uploadAsset().then(asset=>{
        if(asset)
          this.addDynamicObject({ type: 'image', x: 10, y: 10, width: 50, height: 50, color: 'transparent' }, 'image', asset);
      });
    };
    $('#deckEditorAddIconDynamic').onclick = _=>this.addDynamicObject({ type: 'icon', x: 10, y: 10, size: 50, color: '#000000' }, 'icon', 'skoll/hearts');

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
      if(this.selectedObject !== null)
        this.selectObject(null);
      else
        this.close();
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
  }

  async close() {
    await this.flushPendingCommits();
    this.selectedObject = null;
    $('body').classList.remove('deckEditorActive');
    $('#deckEditorDragToolbar').classList.remove('active');
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
  }

  loadWorkingCopies(properties = [ 'faceTemplates', 'cardTypes' ]) {
    const deck = this.deck();
    if(properties.includes('faceTemplates')) {
      const faceTemplates = deck.get('faceTemplates');
      this.faceTemplates = Array.isArray(faceTemplates) ? JSON.parse(JSON.stringify(faceTemplates)) : [];
    }
    if(properties.includes('cardTypes')) {
      const cardTypes = deck.get('cardTypes');
      this.cardTypes = cardTypes && typeof cardTypes == 'object' && !Array.isArray(cardTypes) ? JSON.parse(JSON.stringify(cardTypes)) : {};
    }
  }

  // Used to tell apart the local echo of our own commit() (deck's property already equals our working copy,
  // since we built the committed value from that same working copy) from a genuine remote/undo change.
  matchesWorkingCopy(property) {
    const deck = this.deck();
    return !!deck && JSON.stringify(deck.get(property)) == JSON.stringify(property == 'faceTemplates' ? this.faceTemplates : this.cardTypes);
  }

  reload(properties = [ 'faceTemplates', 'cardTypes' ]) {
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
    await deck.set(property, JSON.parse(JSON.stringify(property == 'faceTemplates' ? this.faceTemplates : this.cardTypes)));
    batchEnd();

    this.recordHistory(resolvedCause, resolvedActionId);
    // Rebuilds every strip preview; fine for typical decks. If this ever gets janky on huge decks while
    // typing, give the strip its own longer debounce instead of skipping it (typed edits do affect previews).
    this.renderStrip();
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
    if(/ updated faceTemplates /.test(cause))
      return 'Edited face object';
    if(/ updated cardTypes /.test(cause))
      return 'Edited card type';

    const player = getPlayerDetails().playerName;
    let label = cause;
    if(label.startsWith(player + ' '))
      label = label.slice(player.length+1);
    label = label.replace(/ (to|of|from|for) deck \S+/, '');
    label = label.replace(/ in deck editor$/, '');
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Change';
  }

  async jumpToHistory(index, cause) {
    if(index < 0 || index >= this.history.length || index === this.historyIndex)
      return;

    await this.flushPendingCommits();

    this.historyIndex = index;
    const snapshot = this.history[index];

    const faceChanged = JSON.stringify(this.faceTemplates) !== JSON.stringify(snapshot.faceTemplates);
    const typesChanged = JSON.stringify(this.cardTypes) !== JSON.stringify(snapshot.cardTypes);

    this.faceTemplates = JSON.parse(JSON.stringify(snapshot.faceTemplates));
    this.cardTypes = JSON.parse(JSON.stringify(snapshot.cardTypes));

    if(this.cardType === null || !this.cardTypes[this.cardType])
      this.cardType = Object.keys(this.cardTypes)[0] || null;
    if(this.face >= this.faceTemplates.length)
      this.face = Math.max(0, this.faceTemplates.length-1);
    this.selectedObject = null;

    // applyingHistory keeps these re-commits from being recorded as new history entries. One shared actionId
    // keeps the (up to) two commits of this jump a single room-undo entry, while separate jumps stay separate.
    const actionId = this.newAction();
    this.applyingHistory = true;
    if(faceChanged)
      await this.commit('faceTemplates', cause, actionId);
    if(typesChanged)
      await this.commit('cardTypes', cause, actionId);
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

    const dynamicFaces = this.dynamicFaces();
    const stripFaces = dynamicFaces.length ? dynamicFaces : this.faceTemplates.length ? [ this.face ] : [];

    for(const cardType of Object.keys(this.cardTypes)) {
      for(const face of stripFaces) {
        const label = stripFaces.length > 1 ? `${cardType} (face ${face})` : cardType;
        const button = div(strip, 'deckEditorStripCard', `<div class=renderedCard></div><span>${html(label)}</span>`);
        button.classList.toggle('selected', cardType == this.cardType && face == this.face);
        try {
          const card = this.renderCard(cardType, face, $('.renderedCard', button));
          const scale = Math.min(120 / card.get('width'), 90 / card.get('height'));
          $('.renderedCard', button).style.width  = card.get('width')  * scale + 'px';
          $('.renderedCard', button).style.height = card.get('height') * scale + 'px';
          card.domElement.style.transform = `scale(${scale})`;
          card.domElement.style.transformOrigin = 'top left';
        } catch(e) {
          $('.renderedCard', button).textContent = '?';
        }
        button.onclick = _=>{
          this.cardType = cardType;
          this.face = face;
          this.selectedObject = null;
          this.render();
        };
      }
    }

    const addButton = div(strip, 'deckEditorStripCard deckEditorAddCardType', '<button icon=add></button><span>Add card type</span>');
    $('button', addButton).onclick = _=>this.addCardType();
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
      const objectProps = div(sidebar, 'deckEditorProperties');
      for(const property of Object.keys(object)) {
        if(property == 'dynamicProperties')
          continue;
        this.addInput(property, object[property], v=>this.queueFieldEdit(async _=>{
          await this.flushPendingCommitForOtherField('faceTemplates', objectFieldArgs(property)[1]);
          if(typeof v === 'undefined')
            delete object[property];
          else
            object[property] = v;
          this.refreshMainCardFaces();
          this.updateDragToolbar();
          this.scheduleCommit('faceTemplates', ...objectFieldArgs(property));
        }), objectProps);
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

    if(this.cardType === null)
      return;

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
      this.addInput(property, typeProperties[property], v=>this.queueFieldEdit(async _=>{
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

  generateUniquePropertyName(base) {
    const known = new Set(this.knownCardTypeProperties());
    if(!known.has(base))
      return base;
    let suffix = 2;
    while(known.has(base + suffix))
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

  async addDynamicObject(objectTemplate, propertyBaseName, defaultValue) {
    const typeProperty = this.generateUniquePropertyName(propertyBaseName);
    // One cause + one actionId so this single user action is one undo step and one breadcrumb, not two.
    const cause = `${getPlayerDetails().playerName} added a per-card-type ${objectTemplate.type} object to deck ${this.deckID} in deck editor`;
    const actionId = this.newAction();
    await this.seedCardTypeProperty(typeProperty, defaultValue, cause, actionId);
    await this.addObject({ ...objectTemplate, dynamicProperties: { value: typeProperty } }, cause, actionId);
  }

  renderDynamicProperties(sidebar, object) {
    const h = document.createElement('h3');
    h.innerText = 'Dynamic properties';
    sidebar.append(h);

    const container = div(sidebar, 'deckEditorDynamicProperties', '<p>Dynamic properties fill properties of this object from the card type, so every card type can show different text, images or colors.</p>');

    for(const [ objectProperty, typeProperty ] of Object.entries(object.dynamicProperties || {})) {
      const row = div(container, 'deckEditorDynamicProperty', `<span><b>${html(objectProperty)}</b> from card type property <b>${html(String(typeProperty))}</b></span><button icon=delete></button>`);
      $('button', row).onclick = async _=>{
        await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
        delete object.dynamicProperties[objectProperty];
        if(!Object.keys(object.dynamicProperties).length)
          delete object.dynamicProperties;
        this.refreshMainCardFaces();
        await this.commit('faceTemplates', `${getPlayerDetails().playerName} removed a dynamic property binding from deck ${this.deckID} in deck editor`);
        this.renderSidebar();
      };
    }

    const objectPropertySuggestions = [ 'value', 'color', 'width', 'height', 'display' ].filter(p=>!(object.dynamicProperties || {})[p]);
    const addRow = div(container, 'deckEditorAddProperty', `
      <input class=objectProperty placeholder="object prop." list=deckEditorObjectPropertySuggestions>
      <input class=typeProperty placeholder="card type prop." list=deckEditorTypePropertySuggestions>
      <button icon=add>Add</button>
      <datalist id=deckEditorObjectPropertySuggestions>${objectPropertySuggestions.map(p=>`<option value="${html(p)}">`).join('')}</datalist>
      <datalist id=deckEditorTypePropertySuggestions>${this.knownCardTypeProperties().map(p=>`<option value="${html(p)}">`).join('')}</datalist>
    `);
    $('button', addRow).onclick = async _=>{
      const objectProperty = $('.objectProperty', addRow).value.trim();
      const typeProperty = $('.typeProperty', addRow).value.trim();
      if(!objectProperty || !typeProperty)
        return;
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
    const face = this.faceTemplates[this.face];
    if(!face)
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    if(!Array.isArray(face.objects))
      face.objects = [];
    face.objects.push(objectTemplate);
    this.refreshMainCardFaces();
    await this.commit('faceTemplates', cause || `${getPlayerDetails().playerName} added a ${objectTemplate.type || 'basic'} object to deck ${this.deckID} in deck editor`, actionId);
    this.selectObject(face.objects.length-1);
  }

  async deleteSelectedObject() {
    const face = this.faceTemplates[this.face];
    if(!face || this.selectedObject === null)
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    face.objects.splice(this.selectedObject, 1);
    this.selectedObject = null;
    this.refreshMainCardFaces();
    await this.commit('faceTemplates', `${getPlayerDetails().playerName} deleted a face object from deck ${this.deckID} in deck editor`);
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
    this.faceTemplates.splice(this.face, 1);
    this.face = Math.min(this.face, Math.max(0, this.faceTemplates.length-1));
    this.selectedObject = null;
    await this.commit('faceTemplates', `${getPlayerDetails().playerName} deleted a face from deck ${this.deckID} in deck editor`);
    this.render();
  }

  async addCardType() {
    if(!this.deck())
      return;
    await this.flushPendingCommits(); // don't absorb a pending typed edit into this action
    let index = Object.keys(this.cardTypes).length + 1;
    while(this.cardTypes[`type ${index}`] !== undefined)
      ++index;
    this.cardTypes[`type ${index}`] = {};
    this.cardType = `type ${index}`;
    this.selectedObject = null;
    await this.commit('cardTypes', `${getPlayerDetails().playerName} added a card type to deck ${this.deckID} in deck editor`);
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
  const changedProperties = [ 'faceTemplates', 'cardTypes' ].filter(property=>deckDelta[property] !== undefined && !deckEditor.matchesWorkingCopy(property));
  if(!changedProperties.length && deckDelta.cardDefaults === undefined)
    return;

  // Commit edits to properties the remote delta did not touch before reloading. A same-property conflict is
  // resolved in favor of the received value: reload() cancels its pending timer so stale local data cannot be
  // sent afterward. cardDefaults only affects previews, so it never replaces either editable working copy.
  for(const property of Object.keys(deckEditor.commitTimers))
    if(!changedProperties.includes(property))
      await deckEditor.commit(property);

  if(changedProperties.length)
    return deckEditor.reload(changedProperties);

  deckEditor.renderMain();
  deckEditor.renderStrip();
  deckEditor.updateDragToolbar();
}

// Called when a full room state replaces the current one (e.g. switching games). The deck being edited is
// likely gone, so drop any pending debounced commits (they'd target a missing deck) and close the editor.
function deckEditorStateReplaced() {
  deckEditor.handleStateReplaced();
}
