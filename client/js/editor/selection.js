let selectedWidgets = [];
let selectedWidgetsPreview = [];

let selectionModeActive = true;
let selectionRectangleActive = false;
let selectionRectangleStart = null;
let selectionRectangleEnd = null;

let draggingDragButton = null;
let widgetRectangles = null;

export function editInputHandler(name, e) {
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
    const clicked = document.elementsFromPoint(s.left, s.top).map(el => widgets.get(unescapeID(el.id.slice(2)))).filter(w => w);
    if(clicked.length)
      newlySelected = [ clicked[0] ];
  } else {
    newlySelected = selectedWidgetsPreview;
  }

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
}

function setSelection(newSelectedWidgets) {
  const previousSelectedWidgets = [...selectedWidgets];
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
}

export async function editClick(widget) {
  if(selectedWidgets.indexOf(widget) == -1) {
    setSelection([ widget ]);
  } else {
    setDeltaCause(`${getPlayerDetails().playerName} clicked ${widget.id} in editor`);
    await widget.click();
  }
}

export function editorReceiveDelta(delta) {
  for(const module of sidebarModules)
    module.onDeltaReceived(delta);
}

function receiveStateFromServer(state) {
  for(const module of sidebarModules) {
    module.onSelectionChanged(selectedWidgets, []);
    module.onStateReceived(state);
  }
  setSelection([]);
}

function registerSelectionEventHandlers() {
  onMessage('state', receiveStateFromServer);
}
