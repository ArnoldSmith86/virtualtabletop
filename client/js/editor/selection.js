let selectedWidgets = [];
let selectedWidgetsPreview = [];

let selectionRectangleActive = false;
let selectionRectangleStart = null;
let selectionRectangleEnd = null;

let widgetRectangles = null;

export function editInputHandler(name, e) {
  const coords = eventCoords(name, e);

  if(name == 'mousedown' || name == 'touchstart') {
    for(let target = e.target; target; target = target.parentNode)
      if(target.id == 'editor')
        return;

    selectionRectangleStart = coords;
    selectionRectangleEnd = coords;
    widgetRectangles = [...widgets.values()].map(w=>[w,w.domElement.getBoundingClientRect()]);
    showSelectionRectangle();
  } else if (name == 'mouseup' || name == 'touchend' || name == 'touchcancel') {
    if(selectionRectangleActive) {
      hideSelectionRectangle();
      applySelectionRectangle(e.shiftKey);
    }
  } else if (name == 'mousemove' || name == 'touchmove') {
    if(selectionRectangleActive) {
      selectionRectangleEnd = coords;
      showSelectionRectangle();
    }
  }

  if(selectionRectangleActive) {
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
  for(const module of sidebarModules)
    module.onSelectionChanged(selectedWidgets, previousSelectedWidgets);
}

export function editClick(widget) {
  setSelection([ widget ]);
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
