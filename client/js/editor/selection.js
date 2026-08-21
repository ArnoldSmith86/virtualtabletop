let selectedWidgets = [];
let selectedWidgetsPreview = [];

let selectionModeActive = true;
let selectionRectangleActive = false;
let selectionRectangleStart = null;
let selectionRectangleEnd = null;

let draggingDragButton = null;
let widgetRectangles = null;

// Alt+click drills down: clicking the same spot again means "not that one, the
// one under it". The stack is taken once and then walked, so a widget getting
// its selection outline (which changes what elementsFromPoint returns) does not
// reshuffle the list halfway through. It is the stack in the order the selection
// bar lists it, so "2/3" in the badge is row 2 (and F2) of the very same list.
let drill = { anchor: null, index: 0, stack: [] };
const DRILL_TOLERANCE = 4; // px; a click further away than this starts a new drill

function drillTo(clientX, clientY, e) {
  // no anchor means no drill is running - a coordinate cannot say that, (0, 0)
  // is a corner of the window like any other
  const near = !!drill.anchor && Math.abs(clientX - drill.anchor.x) <= DRILL_TOLERANCE && Math.abs(clientY - drill.anchor.y) <= DRILL_TOLERANCE;
  const stack = near && drill.stack.every(w=>widgets.get(w.id) === w) ? drill.stack : widgetStackAtSorted(clientX, clientY);
  if(!stack.length) {
    endDrill(); // empty room space: nothing to drill, and the old anchor is stale
    return null;
  }

  const step = e.shiftKey ? -1 : 1;
  drill = { anchor: { x: clientX, y: clientY }, stack, index: near ? (drill.index + step + stack.length) % stack.length : Math.min(1, stack.length-1) };
  // the bar lists what is under the pointer, and this is a fresher answer for
  // that very point than the last scan - so the list and the drill readout above
  // it always count the same widgets
  selectionBarAdoptStack(stack, clientX, clientY);
  showDrillBadge(clientX, clientY);
  return stack[drill.index];
}

function endDrill() {
  drill = { anchor: null, index: 0, stack: [] };
  if($('#editorDrillBadge'))
    $('#editorDrillBadge').remove();
}

// Where in the stack the drill currently is - the editor is the only thing that
// can say so, the room looks exactly the same as after a plain click. Only while
// the pointer is still on the spot that was drilled: the bar shows this next to
// the list of widgets under the pointer, and the two must not count different
// spots at the same time.
function drillPosition() {
  const stack = selectionBarWidgetStack();
  const onDrilledSpot = drill.stack.length == stack.length && drill.stack.every((w, i)=>stack[i] === w);
  return onDrilledSpot && drill.stack.length > 1 && selectedWidgets.length == 1 && selectedWidgets[0] === drill.stack[drill.index]
    ? { index: drill.index + 1, total: drill.stack.length } : null;
}

// Built from scratch every time so its fade-out animation starts over
function showDrillBadge(clientX, clientY) {
  if($('#editorDrillBadge'))
    $('#editorDrillBadge').remove();
  const widget = drill.stack[drill.index];
  const badge = div($('body'), '');
  badge.id = 'editorDrillBadge';
  badge.textContent = `${drill.index+1}/${drill.stack.length} · ${widget.get('type') || 'basic'} ${widget.id}`;
  badge.style.left = `${clientX}px`;
  badge.style.top = `${clientY}px`;
}

export function editInputHandler(name, e) {
  // While a routine is being recorded the room belongs to the recording: a
  // selection band drawn over it would swallow every drag before it reaches the
  // widget, and a drag is what is being recorded
  if(isRoutineRecording())
    return;
  // While Space is held (edit-space-pan), never show selection rectangles
  if(document.body.classList.contains('spacePanActive')) {
    if(selectionRectangleActive)
      hideSelectionRectangle();
    e.preventDefault();
    return true;
  }
  if(e.touches && e.touches.length == 2)
    hideSelectionRectangle();

  const isRightMouseButton = name.startsWith('mouse') && (e.button == 2 || e.buttons == 2);
  if(isRightMouseButton) {
    $('#editorToolbar [icon=highlight_alt]').classList.toggle('active', !selectionModeActive);
    if(name == 'mouseup') {
      setTimeout(function() {
        $('#editorToolbar [icon=highlight_alt]').classList.toggle('active', selectionModeActive);
        updateDragToolbar(true);
      }, 0);
    }
  }
  if((selectionModeActive == isRightMouseButton || isOverlayActive()) && (!e.target.parentNode || e.target.parentNode.id != 'editorDragToolbar') && !draggingDragButton)
    return;

  const coords = eventCoords(name, e);
  const wasDraggingDragButton = !!draggingDragButton;

  if(name == 'mousedown' || name == 'touchstart') {
    for(let target = e.target; target; target = target.parentNode)
      if(target.id == 'editor')
        return;

    selectionRectangleStart = coords;
    selectionRectangleEnd = coords;
    widgetRectangles = [...widgets.values()].map(w=>[w,w.domElement.getBoundingClientRect()]);
    showSelectionRectangle();
  } else if(name == 'mouseup' || name == 'touchend' || name == 'touchcancel') {
    if(selectionRectangleActive) {
      hideSelectionRectangle();
      applySelectionRectangle(e.shiftKey && !e.altKey, e);
    }
    if(draggingDragButton)
      draggingDragButton.mouseup(name, e);
  } else if(name == 'mousemove' || name == 'touchmove') {
    if(selectionRectangleActive) {
      selectionRectangleEnd = coords;
      showSelectionRectangle();
    }
    if(draggingDragButton)
      draggingDragButton.mousemove(name, e);
  }

  if(selectionRectangleActive || wasDraggingDragButton) {
    e.preventDefault();
    return true;
  }
}

function getSelectionRectangle() {
  return {
    left:   Math.min(selectionRectangleStart.clientX, selectionRectangleEnd.clientX),
    top:    Math.min(selectionRectangleStart.clientY, selectionRectangleEnd.clientY),
    right:  Math.max(selectionRectangleStart.clientX, selectionRectangleEnd.clientX),
    bottom: Math.max(selectionRectangleStart.clientY, selectionRectangleEnd.clientY)
  };
}

function showSelectionRectangle() {
  selectionRectangleActive = true;

  const s = getSelectionRectangle();

  $('#editorSelection').classList.add('active');
  $('#editorSelection').style.left   = s.left + 'px';
  $('#editorSelection').style.top    = s.top  + 'px';
  $('#editorSelection').style.width  = s.right  - s.left + 'px';
  $('#editorSelection').style.height = s.bottom - s.top  + 'px';

  for(const widget of selectedWidgetsPreview)
    widget.domElement.classList.remove('selectedInEditPreview');

  selectedWidgetsPreview = [];
  for(const [ widget, rect ] of widgetRectangles)
    if(rect.left >= s.left && rect.top >= s.top && rect.right <= s.right && rect.bottom <= s.bottom)
      selectedWidgetsPreview.push(widget);

  selectedWidgetsPreview = selectedWidgetsPreview.filter(w=>selectedWidgetsPreview.indexOf(widgets.get(w.get('parent'))) == -1);

  for(const widget of selectedWidgetsPreview)
    widget.domElement.classList.add('selectedInEditPreview');
}

function hideSelectionRectangle() {
  selectionRectangleActive = false;

  for(const widget of selectedWidgetsPreview)
    widget.domElement.classList.remove('selectedInEditPreview');

  $('#editorSelection').classList.remove('active');
}

function updateDragToolbar(invertSelectionMode) {
  if(selectedWidgets.length && (selectionModeActive == !invertSelectionMode)) {
    const rects = selectedWidgets.map(w=>w.domElement.getBoundingClientRect());
    $('#editorDragToolbar').classList.add('active');

    let top = Math.max(...rects.map(r=>r.bottom)) + 10;
    top = Math.min(top, getRoomRectangle().bottom - $('#editorDragToolbar').clientHeight - 10);
    $('#editorDragToolbar').style.top = top + 'px';

    let right = window.innerWidth - Math.max(...rects.map(r=>r.right));
    right = Math.min(right, window.innerWidth - getRoomRectangle().left - $('#editorDragToolbar').clientWidth - 10);
    right = Math.max(right, window.innerWidth - getRoomRectangle().right                                      + 10);
    $('#editorDragToolbar').style.right = right + 'px';
  } else {
    $('#editorDragToolbar').classList.remove('active');
  }
}

function applySelectionRectangle(addToSelection, e) {
  const s = getSelectionRectangle();

  let newlySelected = [];
  if(s.right - s.left < 5 || s.bottom - s.top < 5) {
    if(e && e.altKey) {
      const drilled = drillTo(s.left, s.top, e);
      if(drilled)
        newlySelected = [ drilled ];
    } else {
      endDrill();
      // resolve each element under the click to its owning widget: some widgets only
      // expose an inner element for hit-testing while their own box has
      // pointer-events:none (a line), and parts a widget renders on top of its own box
      // (the handle of a pile) have no widget id themselves - so climb to the nearest
      // ancestor carrying the widget id
      const clicked = document.elementsFromPoint(s.left, s.top)
        .map(el => el.closest('[id^="w_"]'))
        .map(el => el && widgets.get(unescapeID(el.id.slice(2))))
        .filter(w => w);
      if(clicked.length)
        newlySelected = [ clicked[0] ];
    }
  } else {
    endDrill();
    newlySelected = selectedWidgetsPreview;
  }

  // in selection mode a click on a widget arrives here instead of as editClick,
  // so this is where a running picker takes it - a selection change would not
  // reach it for the widget the picker belongs to, which stays selected
  if(newlySelected.length == 1 && handleWidgetPickerClick(newlySelected[0]))
    return;

  // a band drawn in the room is the one selection change a running picker owns:
  // it is how widgets are picked with a band rather than a click
  selectWidgetsInRoom(_=>{
    if(!addToSelection) {
      setSelection(newlySelected);
    } else {
      let selectionToApply = [...selectedWidgets];
      for(const widget of newlySelected) {
        if(selectedWidgets.indexOf(widget) == -1)
          selectionToApply.push(widget);
        else
          selectionToApply = selectionToApply.filter(w=>w!=widget);
      }
      setSelection(selectionToApply);
    }
  });
}

// whether a selection is a different set of widgets than the one before it -
// re-selecting the same widget (clicking the one that already is selected) is
// not the editor moving on to another one
function selectionChanged(previousSelection, newSelection) {
  return previousSelection.length != newSelection.length || newSelection.some(widget=>previousSelection.indexOf(widget) == -1);
}

function setSelection(newSelectedWidgets) {
  const previousSelectedWidgets = [...selectedWidgets];

  // a widget inside a smart clone is edited through the clone itself, so the
  // selection the editor works on is the processed one - including below, where
  // it decides whether the editor moved on to another widget
  const selectionToApply = smartCloneProcessSelection(newSelectedWidgets);

  // Whatever the editor has open belongs to the widget that was being edited, so
  // moving on to another one takes it along: the sound library is an overlay
  // that outlives the editor it was opened from (it does not cover the sidebar,
  // and a widget can also be selected without clicking in the room), and the
  // popups hang off controls this very selection change is about to throw away -
  // the ones that let widgets be picked in the room ignore clicks in there, so
  // nothing else ever closes them. Picking widgets in the room is not the editor
  // moving on: the picker restores the selection it started from after every
  // pick. Every other way to select another widget is - a picker waiting for a
  // click in the room does not make the JSON editor's tree or an "Edit line ..."
  // link something else than the editor moving on, so it ends with its popup.
  endWidgetPickerWithoutTarget();
  const editorMovedOn = !isWidgetPickerChangingSelection() && !isWidgetPickerRestoringSelection()
                        && selectionChanged(previousSelectedWidgets, selectionToApply);
  if(editorMovedOn)
    cancelAudioPicker();

  selectedWidgets = selectionToApply;

  // before the modules are notified: the panels they build carry a selection bar
  // that shows where in the history the editor now is
  selectionBarSelectionChanged(selectedWidgets);

  for(const widget of previousSelectedWidgets)
    widget.setHighlighted(false);

  for(const widget of selectedWidgets)
    widget.setHighlighted(jeWidgetHighlightingEnabled());

  for(const button of toolbarButtons)
    button.onSelectionChanged(selectedWidgets, previousSelectedWidgets);
  for(const button of dragToolbarButtons)
    button.onSelectionChanged(selectedWidgets, previousSelectedWidgets);
  for(const module of sidebarModules)
    module.onSelectionChanged(selectedWidgets, previousSelectedWidgets);
  updateSelectionBars();

  updateDragToolbar();

  // last, once the editor really is on the new selection: closing a popup that
  // applies on close writes the picked value to the widget it belonged to, and
  // that delta can come straight back in here (a widget dropping out of the
  // selection re-enters setSelection) - which must not happen half way through.
  if(editorMovedOn)
    closeEditorPopups();
}

export async function editClick(widget, button, e) {
  // "drag to move" is the other way a click in the room arrives, so the drill
  // gesture has to be here too or it only works in one of the two select modes.
  // It always counts as handled: drilling back onto the widget that already is
  // selected must not fall through to running its click routine.
  if(e && e.altKey) {
    const drilled = drillTo(e.clientX, e.clientY, e);
    if(drilled) {
      if(!handleWidgetPickerClick(drilled))
        setSelection([ drilled ]);
      return true;
    }
  }
  endDrill();

  // a running widget picker owns the clicks in the room; without this the click
  // falls through to widget.click() for the widget the picker belongs to,
  // because that one is selected the whole time the picker runs
  if(handleWidgetPickerClick(widget))
    return true;
  // and so does a running recording: selecting the clicked widget would take the
  // editor off the routine the click is being recorded into, and running its
  // click routine would play the game instead of describing it
  if(handleRoutineRecorderClick())
    return true;
  if(selectedWidgets.indexOf(widget) == -1) {
    setSelection([ widget ]);
    return true;
  }
}

export function editorReceiveDelta(delta) {
  // what the room did on its own while a gesture was being recorded (a holder
  // turning a card face up as it enters) only shows up here
  routineRecorderReceiveDelta(delta);

  // a widget can disappear while it is selected - a pile removes itself as soon
  // as it holds a single card. Its sidebar inputs would keep writing to the
  // dead id, and the server re-creates an unknown id as a typeless widget that
  // then ends up in the saved game, so drop it from the selection first.
  if(selectedWidgets.some(w=>widgets.get(w.id) !== w))
    setSelection(selectedWidgets.filter(w=>widgets.get(w.id) === w));

  for(const module of sidebarModules)
    module.onDeltaReceived(delta);
  selectionBarDeltaReceived(delta);
  deckEditorReceiveDelta(delta);
  smartCloneDeltaReceived(delta);
}

function receiveStateFromServer(state) {
  // A new state replaces every widget in the room, so anything still selected
  // points at a widget object that is gone by the time this runs. Clearing the
  // selection first is the same notification the modules got before - just
  // with the dead widgets already dropped, so nothing re-renders an editor for
  // one of them and follows its dangling links (a card looks up its deck).
  // The selection survives leaving edit mode, so this happens while playing too.
  deckEditorStateReplaced();
  endDrill();
  smartCloneInit();
  setSelection([]);
  for(const module of sidebarModules)
    module.onStateReceived(state);
  selectionBarStateReceived();
}

function registerSelectionEventHandlers() {
  onMessage('state', receiveStateFromServer);
}
