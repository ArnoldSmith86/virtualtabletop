// The selection bar: one control that says which widget the editor is on and
// carries every way of getting to another one - back and forward through the
// widgets that were selected, the ancestry of the current one, the tree of the
// room, and the stack of widgets under the pointer. Every sidebar module that
// edits the selection mounts its own copy (Edit Widgets, JSON), so reaching a
// widget that lies underneath another one no longer means opening the JSON
// editor: it used to be eleven fixed function-key rows that only existed while
// that module was open.
//
// The tree itself (#jeTree) is a single DOM node built by jsonedit.js, so only
// one bar can show it at a time - opening it in one bar closes it in the others.

const selectionBars = [];

let selectionBarHistory = [];
let selectionBarHistoryIndex = -1;
let selectionBarHistoryNavigating = false;
let selectionBarCrumbWidget = null;

let selectionBarTreeOwner = null;   // key of the bar the shared #jeTree is currently in
let selectionBarStack = [];         // widgets under the pointer, topmost first
let selectionBarStackCoords = null; // pointer position in room coordinates
let selectionBarPointer = null;
let selectionBarScanQueued = false;
let selectionBarListening = false;

/* State that outlives a single bar: the tree pin used to be a key of its own,
   back when the bar was part of the JSON editor. */

function selectionBarStoredState() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem('editorState') || '{}').selectionBar || {};
  } catch(e) {
  }
  if(stored.treePinned === undefined)
    stored.treePinned = localStorage.getItem('jeTreePinned') == 'true';
  return stored;
}

function selectionBarStoreState(changes) {
  let editorState = {};
  try {
    editorState = JSON.parse(localStorage.getItem('editorState') || '{}');
  } catch(e) {
  }
  editorState.modules = editorState.modules || {};
  editorState.selectionBar = Object.assign(selectionBarStoredState(), changes);
  localStorage.setItem('editorState', JSON.stringify(editorState));
}

/* The stack of widgets under the pointer */

// Every widget below the given point, topmost first. Foreign and hidden widgets
// are pointer-events:none in edit mode, so body.hitTest makes them hittable for
// the length of the hit test - they are exactly the ones that cannot be clicked
// at all otherwise. Some widgets only expose an inner element (the hit path of a
// line, the handle a pile draws on top of its own box), so climb to the nearest
// ancestor carrying the widget id.
function widgetStackAt(clientX, clientY) {
  document.body.classList.add('hitTest');
  const stack = [ ...new Set(document.elementsFromPoint(clientX, clientY)
    .map(el => el.closest && el.closest('[id^="w_"]'))
    .map(el => el && widgets.get(unescapeID(el.id.slice(2))))) ].filter(w => w);
  document.body.classList.remove('hitTest');
  return stack;
}

// Display order of the stack: normal widgets first, then the ones nobody but
// their owner sees, then cards - within each group by z, with the direction the
// je_reverseFkeys command sets. Kept as it was for the F keys.
function selectionBarSortStack(stack) {
  const hiddenParent = function(widget) {
    return widget ? widget.domElement.classList.contains('foreign') || hiddenParent(widgets.get(widget.get('parent'))) : false;
  };
  return [ ...stack ].sort(function(w1, w2) {
    const w1card = w1.get('type') == 'card';
    const w2card = w2.get('type') == 'card';
    const w1foreign = !w1card && hiddenParent(w1);
    const w2foreign = !w2card && hiddenParent(w2);
    const w1normal = !w1foreign && !w1card;
    const w2normal = !w2foreign && !w2card;
    return ((w1card && w2card) || (w1foreign && w2foreign) || (w1normal && w2normal)) ?
      jeFKeyOrderDescending*(w2.calculateZ() - w1.calculateZ()) :
      ((w1card && !w2card) || (w1foreign && w2normal)) ? 1 : -1;
  });
}

function selectionBarWidgetStack() {
  return selectionBarStack;
}

// F1, F2, F3, F5 ... F12 - F4 is skipped because the browser owns it
function selectionBarWidgetForHotkey(functionKey) {
  const index = functionKey >= 5 ? functionKey - 2 : functionKey - 1;
  return functionKey != 4 && index >= 0 ? selectionBarStack[index] : undefined;
}

// The list is what lies under the pointer in the room, so it stops following the
// pointer once that leaves the room - otherwise its rows could never be reached
// with the mouse, which is why the panel it replaces was keyboard-only.
function selectionBarPointerIsInRoom(target) {
  if(document.body.classList.contains('overlayActive'))
    return false;
  return !(target && target.closest && target.closest('#editor, #editorOverlays, #jsonEditor'));
}

function selectionBarRoomCoords(clientX, clientY) {
  const surface = $('#topSurface');
  if(!surface)
    return null;
  const rect = surface.getBoundingClientRect();
  if(clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom)
    return null;
  return {
    x: Math.floor((clientX - rect.left) * viewportConfig.targetWidth  / rect.width),
    y: Math.floor((clientY - rect.top ) * viewportConfig.targetHeight / rect.height)
  };
}

function selectionBarScan() {
  if(!selectionBars.length || !selectionBarPointer)
    return;
  selectionBarStack = selectionBarSortStack(widgetStackAt(selectionBarPointer.x, selectionBarPointer.y));
  selectionBarStackCoords = selectionBarRoomCoords(selectionBarPointer.x, selectionBarPointer.y);
  for(const bar of selectionBars)
    selectionBarRenderStack(bar);
}

function selectionBarInstallListeners() {
  if(selectionBarListening)
    return;
  selectionBarListening = true;

  // one scan per frame at most: it hit-tests the whole document and rooms go up
  // to a couple of thousand widgets
  window.addEventListener('mousemove', function(e) {
    if(!selectionBars.length || e.buttons || !selectionBarPointerIsInRoom(e.target))
      return;
    selectionBarPointer = { x: e.clientX, y: e.clientY };
    if(selectionBarScanQueued)
      return;
    selectionBarScanQueued = true;
    requestAnimationFrame(function() {
      selectionBarScanQueued = false;
      selectionBarScan();
    });
  });

  // F1, F2, F3, F5 ... F12 pick the rows of the list without opening it - the
  // keys the panel this replaces was built around. Ctrl pastes the id into the
  // JSON editor, which only means anything while that one is open.
  window.addEventListener('keydown', function(e) {
    if(!selectionBars.length)
      return;
    const functionKey = e.key && e.key.match(/^F([0-9]+)$/);
    const widget = functionKey && selectionBarWidgetForHotkey(+functionKey[1]);
    if(!widget)
      return;
    e.preventDefault();
    if(e.ctrlKey && jeEnabled)
      jePasteText(jeContext[jeContext.length-1] == '"null"' ? `"${widget.id}"` : widget.id, true);
    else if(e.shiftKey && selectedWidgets.indexOf(widget) != -1)
      setSelection(selectedWidgets.filter(w=>w!=widget));
    else if(e.shiftKey)
      setSelection([ widget ].concat(selectedWidgets));
    else
      setSelection([ widget ]);
  });
}

/* History: every widget the editor moved to, not just the ones the JSON editor saw */

function selectionBarAddToHistory(id) {
  if(selectionBarHistoryNavigating || selectionBarHistory[selectionBarHistoryIndex] === id)
    return;
  selectionBarHistory = selectionBarHistory.slice(0, selectionBarHistoryIndex + 1);
  selectionBarHistory.push(id);
  if(selectionBarHistory.length > 100)
    selectionBarHistory.shift();
  selectionBarHistoryIndex = selectionBarHistory.length - 1;
}

function selectionBarHistoryCanNavigate(direction) {
  for(let i = selectionBarHistoryIndex + direction; i >= 0 && i < selectionBarHistory.length; i += direction)
    if(widgets.has(selectionBarHistory[i]))
      return true;
  return false;
}

function selectionBarHistoryNavigate(direction) {
  let index = selectionBarHistoryIndex + direction;
  while(index >= 0 && index < selectionBarHistory.length && !widgets.has(selectionBarHistory[index]))
    index += direction;
  if(index < 0 || index >= selectionBarHistory.length)
    return;

  selectionBarHistoryIndex = index;
  selectionBarHistoryNavigating = true;
  setSelection([ widgets.get(selectionBarHistory[index]) ]);
  selectionBarHistoryNavigating = false;
}

/* The tree dropdown */

function selectionBarTreeIsVisible() {
  return selectionBars.some(bar=>bar.dom.classList.contains('treeVisible'));
}

function selectionBarTreeIsPinned() {
  return !!selectionBarStoredState().treePinned;
}

function selectionBarSetTreePinned(pinned) {
  selectionBarStoreState({ treePinned: pinned });
  for(const bar of selectionBars) {
    if(bar.options.tree) {
      bar.dom.classList.toggle('treePinned', pinned);
      bar.pinButton.classList.toggle('active', pinned);
    }
  }
}

function selectionBarToggleTree(bar, forceClose, focusSearch) {
  if(!bar.options.tree)
    return;
  selectionBarPrune();
  const open = !forceClose && !bar.dom.classList.contains('treeVisible');

  for(const other of selectionBars) {
    if(other.options.tree) {
      other.dom.classList.toggle('treeVisible', open && other === bar);
      other.treeButton.classList.toggle('active', open && other === bar);
    }
  }

  selectionBarTreeOwner = open ? bar.options.key : null;
  if(open) {
    selectionBarToggleStack(bar, true); // one dropdown at a time, they share the space below the bar
    selectionBarSetTreePinned(selectionBarTreeIsPinned());
    bar.treeContainer.append($('#jeTree'));
    jeDisplayTree();
    if(focusSearch)
      $('#jeWidgetSearchBox').focus();
  } else {
    selectionBarReturnTree(bar);
  }
}

// #jeTree belongs to the JSON editor and is only lent to a bar, so it has to go
// back before the bar it sits in is thrown away - otherwise it is detached and
// $('#jeTree') finds nothing the next time a bar wants it. A bar that was wiped
// without saying so still holds it in its own container, so look there first.
function selectionBarReturnTree(bar) {
  const tree = bar && bar.treeContainer && bar.treeContainer.firstElementChild || $('#jeTree');
  if(tree && $('#jeEditArea'))
    $('#jeEditArea').append(tree);
}

function selectionBarUpdateTreeHighlight() {
  if(!selectionBarTreeIsVisible())
    return;
  const selectedIDs = selectedWidgets.map(w=>w.id);
  for(const widgetDOM of $a('#jeTree .key'))
    widgetDOM.parentElement.classList.toggle('jeHighlightRow', selectedIDs.indexOf(widgetDOM.textContent) != -1);
}

/* Rendering */

function selectionBarButton(target, icon, title, onClick) {
  const button = document.createElement('button');
  button.setAttribute('icon', icon);
  button.title = title;
  button.onclick = onClick;
  target.append(button);
  return button;
}

// what makes this widget hard or impossible to get at with a plain click - the
// reason the stack list exists at all
function selectionBarWidgetNotes(widget) {
  const notes = [];
  if(widget.get('type') == 'card')
    notes.push(`deck ${widget.get('deck')}`);
  // only when it is not the default for the type: every basic widget is on
  // layer 1 and saying so for each of them would drown out the rest
  if(widget.get('layer') !== widget.getDefaultValue('layer'))
    notes.push(`layer ${widget.get('layer')}`);
  if(String(widget.get('classes') || '').split(' ').indexOf('transparent') != -1)
    notes.push('transparent');
  if(widget.domElement.classList.contains('foreign'))
    notes.push('another seat');
  if(widget.domElement.classList.contains('hidden'))
    notes.push('hidden');
  if(widget.get('movableInEdit') === false)
    notes.push('movableInEdit:false');
  return notes.join(' · ');
}

function selectionBarRenderStack(bar) {
  if(!bar.options.stack)
    return;

  bar.stackCount.textContent = selectionBarStack.length || '';
  bar.stackButton.classList.toggle('empty', !selectionBarStack.length);

  if(!bar.dom.classList.contains('stackVisible'))
    return;

  bar.stackList.innerHTML = '';
  const header = div(bar.stackList, 'selectionBarStackHeader');
  header.textContent = selectionBarStackCoords
    ? `${selectionBarStack.length} under the pointer at ${selectionBarStackCoords.x}, ${selectionBarStackCoords.y}`
    : `${selectionBarStack.length} under the pointer`;

  const limit = bar.options.stackLimit || selectionBarStack.length;
  for(const [ index, widget ] of selectionBarStack.slice(0, limit).entries()) {
    const hotkey = index < 3 ? `F${index+1}` : index < 11 ? `F${index+2}` : '';
    const row = div(bar.stackList, 'selectionBarStackRow');
    row.classList.toggle('selected', selectedWidgets.indexOf(widget) != -1);
    row.innerHTML = `<span class=selectionBarStackKey>${hotkey}</span>`
                  + `<span class=selectionBarStackType>${html(widget.get('type') || 'basic')}</span>`
                  + `<span class=selectionBarStackId>${html(widget.id)}</span>`
                  + `<span class=selectionBarStackNotes>${html(selectionBarWidgetNotes(widget))}</span>`;
    row.title = `z ${widget.calculateZ()} - click to select, shift-click to add to the selection`;
    row.onmouseenter = _=>widget.domElement.classList.add('selectionBarHover');
    row.onmouseleave = _=>widget.domElement.classList.remove('selectionBarHover');
    row.onclick = function(e) {
      widget.domElement.classList.remove('selectionBarHover');
      if(e.ctrlKey && jeEnabled)
        jePasteText(jeContext[jeContext.length-1] == '"null"' ? `"${widget.id}"` : widget.id, true);
      else if(e.shiftKey && selectedWidgets.indexOf(widget) != -1)
        setSelection(selectedWidgets.filter(w=>w!=widget));
      else if(e.shiftKey)
        setSelection([ widget ].concat(selectedWidgets));
      else
        bar.options.onPick(widget);
    };
  }

  if(!selectionBarStack.length)
    div(bar.stackList, 'selectionBarStackEmpty', 'Move the pointer over the room. The list keeps the last stack once the pointer is back here, so its rows can be clicked.');
}

function selectionBarToggleStack(bar, forceClose) {
  if(!bar.options.stack)
    return;
  const open = !forceClose && !bar.dom.classList.contains('stackVisible');
  if(open && bar.dom.classList.contains('treeVisible'))
    selectionBarToggleTree(bar, true);
  bar.dom.classList.toggle('stackVisible', open);
  bar.stackButton.classList.toggle('active', open);
  selectionBarRenderStack(bar);
}

// Ancestry of the selected widget. It keeps showing the same chain while the
// selection stays inside it, so walking up to a parent does not shorten the
// crumbs the way it would if they always ended at the selected widget.
function selectionBarRenderCrumbs(bar) {
  if(!bar.options.crumbs)
    return;

  let displayWidget = selectionBarCrumbWidget;
  const widget = selectedWidgets.length == 1 ? selectedWidgets[0] : null;
  if(widget && widgets.has(widget.id)) {
    if(!displayWidget || !widgets.has(displayWidget.id) || !selectionBarIsAncestorOf(widget, displayWidget))
      displayWidget = selectionBarCrumbWidget = widget;
  } else {
    displayWidget = selectionBarCrumbWidget = null;
  }

  const separator = '<span class=selectionBarCrumbSeparator>chevron_right</span>';
  let crumbsHTML;
  if(displayWidget) {
    const chain = [];
    const seen = new Set();
    for(let w = displayWidget; w && !seen.has(w); w = widgets.get(w.get('parent'))) {
      seen.add(w);
      chain.unshift(w);
    }
    const crumbs = chain.slice(-3).map(w=>w != widget
      ? `<span class=selectionBarCrumb data-id="${html(w.id)}">${html(w.id)}</span>`
      : `<span class="selectionBarCrumb selectionBarCrumbCurrent">${html(w.id)}</span>`);
    if(chain.length > 3)
      crumbs.unshift('<span class=selectionBarCrumbEllipsis>…</span>');
    crumbsHTML = crumbs.join(separator);
  } else if(selectedWidgets.length > 1) {
    crumbsHTML = `<span class=selectionBarCrumbInfo>${selectedWidgets.length} widgets selected</span>`;
  } else if(jeEnabled && jeMode == 'macro') {
    crumbsHTML = '<span class=selectionBarCrumbInfo>macro</span>';
  } else {
    crumbsHTML = '<span class=selectionBarCrumbInfo>no widget selected</span>';
  }
  bar.crumbs.innerHTML = crumbsHTML;

  for(const crumb of $a('.selectionBarCrumb[data-id]', bar.crumbs))
    crumb.onclick = _=>setSelection([ widgets.get(crumb.dataset.id) ]);
}

function selectionBarIsAncestorOf(ancestor, descendant) {
  const seen = new Set();
  for(let w = descendant; w && !seen.has(w); w = widgets.get(w.get('parent'))) {
    seen.add(w);
    if(w === ancestor)
      return true;
  }
  return false;
}

function selectionBarUpdate(bar) {
  if(bar.options.history) {
    bar.backButton.disabled = !selectionBarHistoryCanNavigate(-1);
    bar.forwardButton.disabled = !selectionBarHistoryCanNavigate(1);
  }
  selectionBarRenderCrumbs(bar);
  selectionBarRenderStack(bar);
}

// A bar whose DOM is gone - a module that was closed or rebuilt its panel
// without saying so - drops out here rather than being updated forever.
function selectionBarPrune() {
  for(const bar of [ ...selectionBars ]) {
    if(bar.dom.isConnected)
      continue;
    if(bar.dom.classList.contains('treeVisible')) {
      selectionBarReturnTree(bar);
      selectionBarTreeOwner = null;
    }
    selectionBars.splice(selectionBars.indexOf(bar), 1);
  }
}

function updateSelectionBars() {
  selectionBarPrune();
  for(const bar of selectionBars)
    selectionBarUpdate(bar);
  selectionBarUpdateTreeHighlight();
}

function renderSelectionBar(target, options = {}) {
  options = Object.assign({
    key: 'default',
    history: true,
    tree: true,
    crumbs: true,
    stack: true,
    stackLimit: 0,
    onPick: widget=>setSelection([ widget ])
  }, options);

  selectionBarInstallListeners();
  selectionBarPrune();

  const bar = { options };
  bar.dom = div(target, 'selectionBar');

  if(options.history) {
    bar.backButton    = selectionBarButton(bar.dom, 'arrow_back',    'Back to the previously selected widget (Tab+Left)', _=>selectionBarHistoryNavigate(-1));
    bar.forwardButton = selectionBarButton(bar.dom, 'arrow_forward', 'Forward to the next selected widget (Tab+Right)',   _=>selectionBarHistoryNavigate(1));
  }
  if(options.tree) {
    bar.treeButton = selectionBarButton(bar.dom, 'account_tree', 'Show the widget tree of the room', _=>selectionBarToggleTree(bar, false, true));
    bar.pinButton  = selectionBarButton(bar.dom, 'push_pin',     'Pin the widget tree so it stays open above the editor', _=>selectionBarSetTreePinned(!selectionBarTreeIsPinned()));
    bar.pinButton.classList.add('selectionBarPin');
  }
  if(options.stack) {
    bar.stackButton = selectionBarButton(bar.dom, 'layers', 'Widgets under the pointer - how to reach one that lies underneath another', function() {
      selectionBarToggleStack(bar);
      selectionBarStoreState({ stackOpen: bar.dom.classList.contains('stackVisible') });
    });
    bar.stackButton.classList.add('selectionBarStackButton');
    bar.stackCount = document.createElement('span');
    bar.stackCount.className = 'selectionBarStackCount';
    bar.stackButton.append(bar.stackCount);
  }

  bar.crumbs = div(bar.dom, 'selectionBarCrumbs');
  if(options.tree) {
    bar.treeContainer = div(bar.dom, 'selectionBarTree');
    // unless pinned, close the dropdown when a widget is picked in the tree
    // (capture, so it runs despite the tree's own stopPropagation)
    bar.treeContainer.addEventListener('click', function(e) {
      if(!selectionBarTreeIsPinned() && !e.shiftKey && !e.target.classList.contains('jeTreeExpander') && e.target.closest('.jeTreeWidget'))
        selectionBarToggleTree(bar, true);
    }, true);
    bar.dom.classList.toggle('treePinned', selectionBarTreeIsPinned());
    if(bar.pinButton)
      bar.pinButton.classList.toggle('active', selectionBarTreeIsPinned());
  }
  if(options.stack)
    bar.stackList = div(bar.dom, 'selectionBarStackList');

  selectionBars.push(bar);
  if(options.stack && selectionBarStoredState().stackOpen)
    selectionBarToggleStack(bar);
  // the tree comes back to the module it was open in (a panel that rebuilt
  // itself), and a pinned tree opens in the first bar that asks for it
  if(options.tree && (selectionBarTreeOwner === options.key || (selectionBarTreeOwner === null && selectionBarTreeIsPinned())))
    selectionBarToggleTree(bar, false);
  selectionBarUpdate(bar);
  return bar;
}

// Taking a bar off screen. keepTree is for a panel that is about to build itself
// again: it leaves the tree assigned to that panel so the new bar picks it up,
// while a module that is really closing hands it back.
function removeSelectionBar(bar, keepTree) {
  if(!bar)
    return;
  if(bar.dom.classList.contains('treeVisible')) {
    selectionBarReturnTree(bar);
    if(!keepTree)
      selectionBarTreeOwner = null;
  }
  if(selectionBars.indexOf(bar) != -1)
    selectionBars.splice(selectionBars.indexOf(bar), 1);
  bar.dom.remove();
}

/* Called by the editor when the room or the selection changed */

function selectionBarSelectionChanged(newSelection) {
  if(newSelection.length == 1)
    selectionBarAddToHistory(newSelection[0].id);
}

function selectionBarDeltaReceived(delta) {
  // a widget can disappear while it is listed - a pile removes itself as soon as
  // it holds a single card - and the list would keep offering the dead one
  selectionBarStack = selectionBarStack.filter(w=>widgets.get(w.id) === w);
  if(selectionBarTreeIsVisible())
    jeUpdateTree(delta.s);
  updateSelectionBars();
}

function selectionBarStateReceived() {
  selectionBarStack = [];
  if(selectionBarTreeIsVisible())
    jeDisplayTree();
  updateSelectionBars();
}
