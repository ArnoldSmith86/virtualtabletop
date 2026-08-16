let selectedWidgets = [];
let selectedWidgetsPreview = [];

let selectionModeActive = true;
let selectionRectangleActive = false;
let selectionRectangleStart = null;
let selectionRectangleEnd = null;

let draggingDragButton = null;
let widgetRectangles = null;

export function editInputHandler(name, e) {
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
      applySelectionRectangle(e.shiftKey);
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

function applySelectionRectangle(addToSelection) {
  const s = getSelectionRectangle();

  let newlySelected = [];
  if(s.right - s.left < 5 || s.bottom - s.top < 5) {
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
  } else {
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
                        && selectionChanged(previousSelectedWidgets, newSelectedWidgets);
  if(editorMovedOn)
    cancelAudioPicker();

  selectedWidgets = newSelectedWidgets;

  for(const widget of previousSelectedWidgets)
    widget.setHighlighted(false);

  for(const widget of selectedWidgets)
    widget.setHighlighted(true);

  for(const button of toolbarButtons)
    button.onSelectionChanged(selectedWidgets, previousSelectedWidgets);
  for(const button of dragToolbarButtons)
    button.onSelectionChanged(selectedWidgets, previousSelectedWidgets);
  for(const module of sidebarModules)
    module.onSelectionChanged(selectedWidgets, previousSelectedWidgets);

  updateDragToolbar();

  // last, once the editor really is on the new selection: closing a popup that
  // applies on close writes the picked value to the widget it belonged to, and
  // that delta can come straight back in here (a widget dropping out of the
  // selection re-enters setSelection) - which must not happen half way through.
  if(editorMovedOn)
    closeEditorPopups();
}

export async function editClick(widget) {
  // a running widget picker owns the clicks in the room; without this the click
  // falls through to widget.click() for the widget the picker belongs to,
  // because that one is selected the whole time the picker runs
  if(handleWidgetPickerClick(widget))
    return true;
  if(selectedWidgets.indexOf(widget) == -1) {
    setSelection([ widget ]);
    return true;
  }
}

export function editorReceiveDelta(delta) {
  // a widget can disappear while it is selected - a pile removes itself as soon
  // as it holds a single card. Its sidebar inputs would keep writing to the
  // dead id, and the server re-creates an unknown id as a typeless widget that
  // then ends up in the saved game, so drop it from the selection first.
  if(selectedWidgets.some(w=>widgets.get(w.id) !== w))
    setSelection(selectedWidgets.filter(w=>widgets.get(w.id) === w));

  for(const module of sidebarModules)
    module.onDeltaReceived(delta);
  deckEditorReceiveDelta(delta);
}

function receiveStateFromServer(state) {
  // A new state replaces every widget in the room, so anything still selected
  // points at a widget object that is gone by the time this runs. Clearing the
  // selection first is the same notification the modules got before - just
  // with the dead widgets already dropped, so nothing re-renders an editor for
  // one of them and follows its dangling links (a card looks up its deck).
  // The selection survives leaving edit mode, so this happens while playing too.
  deckEditorStateReplaced();
  setSelection([]);
  for(const module of sidebarModules)
    module.onStateReceived(state);
}

function registerSelectionEventHandlers() {
  onMessage('state', receiveStateFromServer);
}
