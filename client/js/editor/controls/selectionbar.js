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
let selectionBarCoords = null;      // pointer position in room coordinates
let selectionBarPointer = null;
let selectionBarScanTimer = null;
let selectionBarListening = false;

const SELECTION_BAR_SCAN_DELAY = 120; // ms the pointer has to rest before the stack under it is taken

// Alt+click needs a mouse and a modifier key, so it is not something to advise
// on a tablet - the list works there and is the only way in.
function selectionBarCanAltClick() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/* State that outlives a single bar: which of the two dropdowns was open. */

function selectionBarStoredState() {
  try {
    return JSON.parse(localStorage.getItem('editorState') || '{}').selectionBar || {};
  } catch(e) {
    return {};
  }
}

function selectionBarStoreState(changes) {
  let editorState = {};
  try {
    editorState = JSON.parse(localStorage.getItem('editorState') || '{}');
  } catch(e) {
  }
  editorState.selectionBar = Object.assign(selectionBarStoredState(), changes);
  localStorage.setItem('editorState', JSON.stringify(editorState));
}

/* The stack of widgets under the pointer */

// Every widget below the given point, topmost first. Widgets that take no
// pointer events - foreign and hidden ones in edit mode, and any widget whose
// game sets "pointer-events: none" in its css - are made hittable by body.hitTest
// for the length of the hit test, since they are exactly the ones that cannot be
// clicked at all otherwise (see layout.css). Some widgets only expose an inner
// element (the hit path of a line, the handle a pile draws on top of its own
// box), so climb to the nearest ancestor carrying the widget id.
function widgetStackAt(clientX, clientY) {
  document.body.classList.add('hitTest');
  const stack = [ ...new Set(document.elementsFromPoint(clientX, clientY)
    .map(el => el.closest && el.closest('[id^="w_"]'))
    .map(el => el && widgets.get(unescapeID(el.id.slice(2))))) ].filter(w => w);
  document.body.classList.remove('hitTest');
  return stack;
}

// The nearest widget from this one up to the room that matches, the widget
// itself included. A widget is just as invisible when it is an ancestor that is
// hidden or belongs to another seat: the class sits on that ancestor and the CSS
// takes everything inside it along, so the chain has to be walked.
function selectionBarAncestor(widget, matches) {
  const seen = new Set();
  for(let w = widget; w && !seen.has(w); w = widgets.get(w.get('parent'))) {
    seen.add(w);
    if(matches(w))
      return w;
  }
  return null;
}

function selectionBarIsForeign(widget) {
  return widget.domElement.classList.contains('foreign');
}

function selectionBarIsHidden(widget) {
  return widget.domElement.classList.contains('hidden');
}

// Display order of the stack: normal widgets first, then the ones nobody but
// their owner sees, then cards - within each group topmost first. Kept as it was
// for the F keys.
function selectionBarSortStack(stack) {
  return [ ...stack ].sort(function(w1, w2) {
    const w1card = w1.get('type') == 'card';
    const w2card = w2.get('type') == 'card';
    const w1foreign = !w1card && !!selectionBarAncestor(w1, selectionBarIsForeign);
    const w2foreign = !w2card && !!selectionBarAncestor(w2, selectionBarIsForeign);
    const w1normal = !w1foreign && !w1card;
    const w2normal = !w2foreign && !w2card;
    return ((w1card && w2card) || (w1foreign && w2foreign) || (w1normal && w2normal)) ?
      w2.calculateZ() - w1.calculateZ() :
      ((w1card && !w2card) || (w1foreign && w2normal)) ? 1 : -1;
  });
}

// The same stack in the order the list and the F keys number it, so the Alt+click
// drill walks the widgets in the order the bar says it does.
function widgetStackAtSorted(clientX, clientY) {
  return selectionBarSortStack(widgetStackAt(clientX, clientY));
}

function selectionBarWidgetStack() {
  return selectionBarStack;
}

// An Alt+click drill takes its own stack at the point it was aimed at, and that
// is the stack the bar should be showing - otherwise the list can say "nothing
// under the pointer" right next to a drill readout counting five of them.
function selectionBarAdoptStack(stack, clientX, clientY) {
  clearTimeout(selectionBarScanTimer);
  selectionBarScanTimer = null;
  selectionBarPointer = { x: clientX, y: clientY };
  selectionBarStack = stack;
  updateSelectionBars();
}

// F1, F2, F3, F5 ... F12 - F4 is skipped because the browser owns it
function selectionBarWidgetForHotkey(functionKey) {
  const index = functionKey >= 5 ? functionKey - 2 : functionKey - 1;
  return functionKey != 4 && index >= 0 ? selectionBarStack[index] : undefined;
}

// The list is what lies under the pointer in the room, so it stops following the
// pointer once that leaves the room - otherwise its rows could never be reached
// with the mouse, which is why the panel it replaces was keyboard-only. That is
// not enough on its own: the way to the list leads across the room, so a list
// that followed every pixel would be down to the board (or to nothing at all) by
// the time the pointer arrives. It therefore only takes the stack where the
// pointer came to rest - see selectionBarInstallListeners.
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

// Both listeners below are on the window and never come off again, and a module
// is not closed when the editor is: leaving edit mode only display:none's it, so
// its bar stays connected and selectionBarPrune() keeps it. Without this the F
// keys would go on swallowing F5 and a hit test of the whole document would run
// every frame for someone who is just playing the game.
function selectionBarIsActive() {
  return !!selectionBars.length && document.body.classList.contains('edit');
}

function selectionBarScan() {
  if(!selectionBarIsActive() || !selectionBarPointer)
    return;
  selectionBarStack = selectionBarSortStack(widgetStackAt(selectionBarPointer.x, selectionBarPointer.y));
  for(const bar of selectionBars) {
    selectionBarRenderStack(bar);
    selectionBarRenderDrill(bar); // the readout only stands while the pointer is still on the drilled spot
  }
}

// Where the pointer is in room coordinates. Unlike everything else in the bar
// this follows the pointer itself rather than the spot it came to rest on: it is
// read while placing a widget, and a coordinate that arrives an eighth of a
// second late is worse than none at all.
function selectionBarRenderPointerCoords() {
  for(const bar of selectionBars)
    if(bar.coords)
      bar.coords.textContent = selectionBarCoords ? `${selectionBarCoords.x}, ${selectionBarCoords.y}` : '';
}

function selectionBarSetPointerCoords(clientX, clientY) {
  selectionBarCoords = clientX === null ? null : selectionBarRoomCoords(clientX, clientY);
  selectionBarRenderPointerCoords();
}

function selectionBarInstallListeners() {
  if(selectionBarListening)
    return;
  selectionBarListening = true;

  // The stack is taken where the pointer comes to rest, not while it travels:
  // that is what the user is looking at, it is what leaves the list standing
  // while the pointer is on its way to a row, and it keeps a hit test of the
  // whole document (rooms go up to a couple of thousand widgets) off the path of
  // every mouse move. A pointer heading out of the room drops the pending scan
  // rather than taking one more stack on the way out.
  window.addEventListener('mousemove', function(e) {
    if(!selectionBarIsActive())
      return;
    selectionBarSetPointerCoords(e.clientX, e.clientY);
    if(e.buttons)
      return;
    clearTimeout(selectionBarScanTimer);
    selectionBarScanTimer = null;
    if(!selectionBarPointerIsInRoom(e.target))
      return;
    selectionBarPointer = { x: e.clientX, y: e.clientY };
    selectionBarScanTimer = setTimeout(function() {
      selectionBarScanTimer = null;
      selectionBarScan();
    }, SELECTION_BAR_SCAN_DELAY);
  });

  // F1, F2, F3, F5 ... F12 pick the rows of the list without opening it - the
  // keys the panel this replaces was built around. Ctrl pastes the id into the
  // JSON editor, which only means anything while that one is open.
  window.addEventListener('keydown', function(e) {
    if(!selectionBarIsActive())
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
  selectionBarStoreState({ treeOpen: open });
  if(open) {
    selectionBarToggleStack(bar, true); // one dropdown at a time, they share the space below the bar
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

// What makes this widget hard or impossible to get at with a plain click - the
// reason the stack list exists at all. In the words the editor uses for them,
// not in the property and class names behind them: this list is read by the
// people who are here so they do not have to open the JSON.
//
// Being inside a widget that is hidden or belongs to another seat hides a widget
// just as thoroughly as carrying that class itself, and nothing in the room says
// which of the two it is - so the ancestors are walked and the one responsible is
// named.
function selectionBarWidgetNotes(widget) {
  const notes = [];
  if(widget.get('type') == 'card')
    notes.push(`card from ${widget.get('deck')}`);
  // only when it is not the default for the type: every basic widget is on
  // layer 1 and saying so for each of them would drown out the rest
  if(widget.get('layer') !== widget.getDefaultValue('layer'))
    notes.push(`on layer ${widget.get('layer')}`);
  if(String(widget.get('classes') || '').split(' ').indexOf('transparent') != -1)
    notes.push('invisible');
  const foreign = selectionBarAncestor(widget, selectionBarIsForeign);
  if(foreign)
    notes.push(foreign === widget ? 'another seat' : `inside ${foreign.id}, another seat`);
  const hidden = selectionBarAncestor(widget, selectionBarIsHidden);
  if(hidden)
    notes.push(hidden === widget ? 'hidden' : `inside ${hidden.id}, hidden`);
  if(widget.get('movableInEdit') === false)
    notes.push('locked in edit mode');
  return notes.join(' · ');
}

function selectionBarClearHover() {
  for(const widgetDOM of $a('.widget.selectionBarHover'))
    widgetDOM.classList.remove('selectionBarHover');
}

function selectionBarRenderStack(bar) {
  if(!bar.options.stack)
    return;

  bar.stackCount.textContent = selectionBarStack.length || '';

  if(!bar.dom.classList.contains('stackVisible'))
    return;

  // wiping the rows does not fire mouseleave on the one the pointer is over, so
  // its widget would keep the hover outline (and the visibility:important that
  // shows a hidden one) with nothing left on screen to take it off again
  selectionBarClearHover();

  bar.stackList.innerHTML = '';
  const header = div(bar.stackList, 'selectionBarStackHeader');
  header.textContent = selectionBarStack.length
    ? `${selectionBarStack.length} under the pointer, topmost first`
    : 'Nothing under the pointer';

  // What the list is, for someone who just opened it: the panel it replaces
  // carried that sentence permanently, and a tooltip is no place for it.
  if(selectionBarStack.length)
    div(bar.stackList, 'selectionBarStackHelp', 'Click to select, shift-click to add to the selection, or press the key shown.');

  for(const [ index, widget ] of selectionBarStack.entries()) {
    const hotkey = index < 3 ? `F${index+1}` : index < 11 ? `F${index+2}` : '';
    // F4 is not in the column and the gap looks like a bug without a word on it
    const keyTitle = hotkey ? `Press ${hotkey} to select this widget - F4 is missing because the browser keeps that key` : '';
    const row = div(bar.stackList, 'selectionBarStackRow');
    row.classList.toggle('selected', selectedWidgets.indexOf(widget) != -1);
    row.innerHTML = `<span class=selectionBarStackKey title="${keyTitle}">${hotkey}</span>`
                  + `<span class=selectionBarStackType>${html(widget.get('type') || 'basic')}</span>`
                  + `<span class=selectionBarStackId>${html(widget.id)}</span>`
                  + `<span class=selectionBarStackNotes>${html(selectionBarWidgetNotes(widget))}</span>`;
    row.title = `z ${widget.calculateZ()} - click to select, shift-click to add to the selection`;
    row.onmouseenter = _=>widget.domElement.classList.add('selectionBarHover');
    row.onmouseleave = _=>widget.domElement.classList.remove('selectionBarHover');
    row.onclick = function(e) {
      selectionBarClearHover();
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
    div(bar.stackList, 'selectionBarStackEmpty', 'Rest the pointer on a widget in the room - everything stacked at that spot is listed here.');
}

// Where an Alt+click drill currently is. It sits in the bar and not in the panel
// below it for two reasons: the dropdowns cover that panel, so the readout and
// the list it refers to could never be on screen together, and a line that comes
// and goes in a panel header shoves everything below it around on every click.
function selectionBarRenderDrill(bar) {
  if(!bar.drill)
    return;
  const drill = drillPosition();
  bar.drill.textContent = drill ? `${drill.index}/${drill.total}` : '';
  bar.drill.title = drill
    ? `The selected widget is number ${drill.index} of the ${drill.total} widgets under the pointer`
      + (selectionBarCanAltClick() ? ' - Alt+click there again to go deeper, Alt+Shift+click to come back up' : '')
    : '';
}

function selectionBarToggleStack(bar, forceClose) {
  if(!bar.options.stack)
    return;
  const open = !forceClose && !bar.dom.classList.contains('stackVisible');
  if(open && bar.dom.classList.contains('treeVisible'))
    selectionBarToggleTree(bar, true);
  selectionBarStoreState({ stackOpen: open });
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
  selectionBarRenderDrill(bar);
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
  if(options.tree)
    bar.treeButton = selectionBarButton(bar.dom, 'account_tree', 'The widget tree of the room', _=>selectionBarToggleTree(bar, false, true));
  if(options.stack) {
    const stackTitle = 'The widgets under the pointer'
                     + (selectionBarCanAltClick() ? ' - Alt+click in the room steps through them' : '');
    bar.stackButton = selectionBarButton(bar.dom, 'layers', stackTitle, _=>selectionBarToggleStack(bar));
    bar.stackCount = document.createElement('span');
    bar.stackCount.className = 'selectionBarStackCount';
    bar.stackButton.append(bar.stackCount);
  }

  bar.crumbs = div(bar.dom, 'selectionBarCrumbs');
  // both at the end of the bar, where they can appear and disappear without
  // moving anything: the crumbs before them are left-aligned and only shrink
  bar.drill = div(bar.dom, 'selectionBarDrill');
  bar.coords = div(bar.dom, 'selectionBarCoords');
  bar.coords.title = 'Where the pointer is in the room';
  if(options.tree)
    bar.treeContainer = div(bar.dom, 'selectionBarTree');
  if(options.stack)
    bar.stackList = div(bar.dom, 'selectionBarStackList');

  selectionBars.push(bar);
  // both dropdowns work the same way: they stay open until their button is
  // pressed again, and they come back when the module they are in does
  if(options.stack && selectionBarStoredState().stackOpen)
    selectionBarToggleStack(bar);
  if(options.tree && (selectionBarTreeOwner === options.key || (selectionBarTreeOwner === null && selectionBarStoredState().treeOpen)))
    selectionBarToggleTree(bar, false);
  selectionBarRenderPointerCoords();
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

// What the bar collected belongs to the editor being on screen, and the modules
// stay mounted when it is not (it is only display:none'd). So both leaving edit
// mode and coming back to it drop the stack by hand - a hover outline must not
// be left on a widget while the game is played, and the rows and F keys of a
// stack from another session must not still point somewhere.
function selectionBarResetStack() {
  clearTimeout(selectionBarScanTimer);
  selectionBarScanTimer = null;
  selectionBarStack = [];
  selectionBarPointer = null;
  selectionBarSetPointerCoords(null);
  selectionBarClearHover();
  updateSelectionBars();
}

function selectionBarStateReceived() {
  selectionBarStack = [];
  if(selectionBarTreeIsVisible())
    jeDisplayTree();
  updateSelectionBars();
}
