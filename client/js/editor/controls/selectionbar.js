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
let selectionBarStackFromTouch = false; // ... or under the finger that tapped, see selectionBarWhere
let selectionBarCoords = null;      // pointer position in room coordinates
let selectionBarPointer = null;
let selectionBarPointerInRoom = false;
let selectionBarScanTimer = null;
let selectionBarListening = false;
let selectionBarKeyboardBar = null; // the bar whose dropdown the arrow keys walk
let selectionBarSwallowEscapeUp = false;
let selectionBarTabHeld = false;    // Tab+Left / Tab+Right walk the history
let selectionBarPeekActive = false; // the peek key is down, see selectionBarPeekStart
let selectionBarPeekBar = null;     // the bar whose list the peek opened and has to close again
let selectionBarPeekArmTimer = null;
let selectionBarPeekArmed = false;  // the key has been held long enough to mean the list, see selectionBarPeekArm
let selectionBarPeekBlocked = false; // ... or it turned out to be the first half of a chord after all
let selectionBarScanFrame = null;

const SELECTION_BAR_SCAN_DELAY = 120; // ms the pointer has to rest before the stack under it is taken
const SELECTION_BAR_PEEK_KEY = 'Control'; // held down, the list opens and follows the pointer without that delay
const SELECTION_BAR_PEEK_ARM_DELAY = 200; // ms the peek key has to be held before the list drops, see selectionBarPeekArm
// what a peeked list answers to itself - any other key makes the keystroke a chord
const SELECTION_BAR_PEEK_KEYS = [ 'Control', 'Shift', 'Alt', 'Meta', 'Escape', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight' ];

// Alt+click needs a mouse and a modifier key, so it is not something to advise
// on a tablet - the list works there and is the only way in.
function selectionBarCanAltClick() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

// How the stack the list holds was taken. Nothing is "under the pointer" on a
// device that has none, and this says which it was rather than what the device
// is: a laptop with a touchscreen is both, and the answer is whichever of the
// two was used last.
function selectionBarWhere() {
  return selectionBarStackFromTouch ? 'where you tapped' : 'under the pointer';
}

/* State that outlives a single bar: which of the two dropdowns was open. */

function selectionBarStoredState() {
  try {
    return JSON.parse(localStorage.getItem('editorState') || '{"modules":{}}').selectionBar || {};
  } catch(e) {
    return {};
  }
}

function selectionBarStoreState(changes) {
  // the same default the rest of the editor uses (layout.js, sidebarModule.js):
  // whoever writes this key first must not leave the next writer without .modules
  let editorState = { modules: {} };
  try {
    editorState = JSON.parse(localStorage.getItem('editorState') || '{"modules":{}}');
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

// Taking the stack the list shows. The keyboard cursor is an index into it, so
// it only goes back to the start when the stack is really another one: the scan
// runs again whenever the pointer settles, and a pointer that settled on the
// same spot must not throw away the row somebody just stepped to.
function selectionBarSetStack(stack) {
  if(stack.length != selectionBarStack.length || stack.some((w, index)=>w !== selectionBarStack[index]))
    selectionBarResetStackCursor();
  selectionBarStack = stack;
}

// An Alt+click drill takes its own stack at the point it was aimed at, and that
// is the stack the bar should be showing - otherwise the list can say "nothing
// under the pointer" right next to a drill readout counting five of them.
function selectionBarAdoptStack(stack, clientX, clientY) {
  selectionBarCancelScan();
  selectionBarStackFromTouch = false; // the drill is an Alt+click, so a mouse took this one
  selectionBarPointer = { x: clientX, y: clientY };
  selectionBarSetStack(stack);
  updateSelectionBars();
}

// F1, F2, F3, F6 ... F12 - F4 and F5 are skipped because the browser owns them.
// F5 is the reason this is not the eleven keys the panel this replaces had: that
// panel only existed while the JSON editor was open, while a bar is in Edit
// Widgets, which is what edit mode opens by default - so taking F5 there would
// mean the page stops reloading for everyone whose pointer rests on a stack.
function selectionBarWidgetForHotkey(functionKey) {
  const index = functionKey >= 6 ? functionKey - 3 : functionKey - 1;
  return functionKey != 4 && functionKey != 5 && index >= 0 ? selectionBarStack[index] : undefined;
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
// keys would go on selecting widgets and a hit test of the whole document would
// run every frame for someone who is just playing the game.
function selectionBarIsActive() {
  return !!selectionBars.length && document.body.classList.contains('edit');
}

function selectionBarCancelScan() {
  clearTimeout(selectionBarScanTimer);
  selectionBarScanTimer = null;
  if(selectionBarScanFrame !== null) {
    cancelAnimationFrame(selectionBarScanFrame);
    selectionBarScanFrame = null;
  }
}

// While the peek key is held the list follows the pointer itself rather than the
// spot it came to rest on, so the scan runs on every move - at most once per
// frame, since what it costs is a hit test of the whole document.
function selectionBarScanNextFrame() {
  if(selectionBarScanFrame !== null)
    return;
  selectionBarScanFrame = requestAnimationFrame(function() {
    selectionBarScanFrame = null;
    selectionBarScan();
  });
}

function selectionBarScan(fromTouch) {
  if(!selectionBarIsActive() || !selectionBarPointer)
    return;
  selectionBarStackFromTouch = !!fromTouch;
  selectionBarSetStack(selectionBarSortStack(widgetStackAt(selectionBarPointer.x, selectionBarPointer.y)));
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
    selectionBarPointerInRoom = selectionBarPointerIsInRoom(e.target);
    if(e.buttons)
      return;
    selectionBarCancelScan();
    if(!selectionBarPointerInRoom)
      return;
    selectionBarPointer = { x: e.clientX, y: e.clientY };
    // The key is very often already down by the time the pointer gets here:
    // putting the caret on a line of the JSON text leaves the pointer over the
    // editor, and holding the key there and then moving onto the room is the
    // whole gesture. So the pointer arriving in the room opens the list too -
    // the modifier state a mouse event carries says whether the key is down,
    // whether or not its keydown ever reached the page. Only opening is done
    // here: what closes the list is the key coming up, and a move that reports
    // no modifier while it is still held would take it away mid-gesture.
    if(!selectionBarPeekActive && e.getModifierState(SELECTION_BAR_PEEK_KEY))
      return selectionBarPeekArm();
    if(selectionBarPeekActive)
      return selectionBarScanNextFrame();
    selectionBarScanTimer = setTimeout(function() {
      selectionBarScanTimer = null;
      selectionBarScan();
    }, SELECTION_BAR_SCAN_DELAY);
  });

  // A finger never hovers, so there is no coming to rest to wait for: the tap is
  // the spot, and the stack under it is taken there and then. Without this the
  // list stays empty on a tablet - the room's own input handler calls
  // preventDefault() on touchstart, so the browser never synthesizes the
  // mousemove above - which left a touch device with no way at all to a covered
  // widget: the Alt+click drill needs a mouse and a modifier key. Capture phase,
  // so a handler that swallows the event on its way down cannot take the tap
  // away from the bar. Two fingers are a pinch or a pan, not a spot.
  window.addEventListener('touchstart', function(e) {
    if(!selectionBarIsActive() || e.touches.length != 1)
      return;
    selectionBarSetPointerCoords(e.touches[0].clientX, e.touches[0].clientY);
    selectionBarCancelScan();
    if(!selectionBarPointerIsInRoom(e.target))
      return;
    selectionBarPointer = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    selectionBarScan(true);
  }, true);

  // A finger dragging a widget keeps the coordinate readout with it, the way a
  // held mouse button does - the stack stays the one the finger came down on.
  window.addEventListener('touchmove', function(e) {
    if(selectionBarIsActive() && e.touches.length == 1)
      selectionBarSetPointerCoords(e.touches[0].clientX, e.touches[0].clientY);
  }, true);

  // F1, F2, F3, F6 ... F12 pick the rows of the list without opening it - the
  // keys the panel this replaces was built around. Ctrl pastes the id into the
  // JSON editor, which only means anything while that one is open.
  window.addEventListener('keydown', function(e) {
    if(e.key == 'Tab')
      selectionBarTabHeld = true;
    if(!selectionBarIsActive())
      return;
    selectionBarSyncPeek(e);
    if(selectionBarHandleHistoryKey(e))
      return;
    if(selectionBarHandleDropdownKey(e))
      return;
    const functionKey = e.key && e.key.match(/^F([0-9]+)$/);
    const widget = functionKey && selectionBarWidgetForHotkey(+functionKey[1]);
    if(!widget)
      return;
    e.preventDefault();
    if(selectionBarPeekKeyIsModifier(e) && jeEnabled)
      jePasteText(jeContext[jeContext.length-1] == '"null"' ? `"${widget.id}"` : widget.id, true);
    else if(e.shiftKey && selectedWidgets.indexOf(widget) != -1)
      setSelection(selectedWidgets.filter(w=>w!=widget));
    else if(e.shiftKey)
      setSelection([ widget ].concat(selectedWidgets));
    else
      setSelection([ widget ]);
  });

  // main.js closes the sidebar module - or leaves edit mode - on the keyup of an
  // Escape, so an Escape that closed a dropdown has to have its keyup swallowed
  // as well, or the module the dropdown was in goes with it. Capture phase, so
  // this runs before main.js's window.onkeyup. Same trick as the deck editor.
  window.addEventListener('keyup', function(e) {
    // the JSON editor stops the keyup of a Tab dead (it ends its command search
    // there), so the release has to be seen before it does
    if(e.key == 'Tab')
      selectionBarTabHeld = false;
    selectionBarSyncPeek(e);
    if(e.key == 'Escape' && selectionBarSwallowEscapeUp) {
      selectionBarSwallowEscapeUp = false;
      e.stopImmediatePropagation();
    }
  }, true);

  // switching windows while a key is down never delivers its keyup
  window.addEventListener('blur', function() {
    selectionBarTabHeld = false;
    selectionBarPeekRelease();
  });

  // A click in the editor's own panels that is not in a bar means the user has
  // moved on to something else in the sidebar - and a dropdown covers the very
  // panel that was clicked, so leaving it standing hides what the click was for.
  // The room is deliberately not included: the stack list is filled from there,
  // and picking a widget must not take the list of what lies under it away.
  window.addEventListener('mousedown', function(e) {
    if(!selectionBarIsActive() || !e.target.closest || e.target.closest('.selectionBar'))
      return;
    if(e.target.closest('#editorSidebar, #editorModules, #editorModuleInOverlay'))
      selectionBarCloseDropdowns();
  }, true);
}

/* Peeking at the stack with a key held down */

// The list costs a click to open and takes the stack where the pointer came to
// rest, which is a step and a wait more than the fixed function-key panel it
// replaces: that one stood permanently in the JSON editor and followed every
// mouse move. Holding Ctrl brings that back for as long as the key is down -
// the list opens, follows the pointer without waiting for it to settle, and goes
// away again with the key. A list that was already open is only made live: it
// belongs to whoever opened it. The key and the pointer being in the room are
// two halves of one condition and either can arrive last, so both the key going
// down and the pointer coming in open the list.
function selectionBarPeekStart() {
  // Where the pointer is is the whole condition, the way it was for the panel
  // this list replaces: that one was up whenever the pointer was in the room and
  // hid as soon as it moved over the editor, and it did not care where the
  // keyboard was - reading a widget's name while the caret sits in the JSON text
  // area is the case it was there for. Outside the room the key does nothing at
  // all: a dropdown covers the panel it hangs in, so a Ctrl+click in the sidebar
  // - which is how a module is docked in the lower slot - must not have the list
  // drop onto what it was aimed at.
  if(selectionBarPeekActive || !selectionBarPointerInRoom)
    return;
  if(document.body.classList.contains('overlayActive') || document.body.classList.contains('deckEditorActive'))
    return;
  selectionBarPrune();
  selectionBarPeekActive = true;

  if(!selectionBars.some(bar=>bar.options.stack && bar.dom.classList.contains('stackVisible'))) {
    const bar = selectionBarKeyboardBar && selectionBarKeyboardBar.options.stack
              ? selectionBarKeyboardBar : selectionBars.find(bar=>bar.options.stack);
    // The two dropdowns share the space below the bar, so putting the list
    // where the tree is means taking the tree down. That tree is something
    // somebody opened and is working in - the keyboard can be in its filter
    // box, and it comes back scrolled to the selection rather than to wherever
    // it was left - and a key that gets tapped all day long must not be able to
    // do that to it. A bar showing its tree keeps it, and the key only makes
    // the stack follow the pointer: the count on the button and the widget the
    // function keys address are live either way.
    if(bar && !bar.dom.classList.contains('treeVisible')) {
      selectionBarPeekBar = bar;
      selectionBarToggleStack(bar, false, true);
    }
  }
  // whatever the last resting scan found can be a room and a pointer position
  // ago, and the point of the key is that the list says what is under the
  // pointer now
  selectionBarScan();
}

function selectionBarPeekStop() {
  if(!selectionBarPeekActive)
    return;
  selectionBarPeekActive = false;
  selectionBarCancelScan();
  const bar = selectionBarPeekBar;
  selectionBarPeekBar = null;
  selectionBarPrune();
  if(bar && bar.dom.isConnected)
    selectionBarToggleStack(bar, true, true);
  updateSelectionBars(); // a list that stays open says what the keys do, and that just changed
}

// Ctrl also starts Ctrl+Z, Ctrl+J, Ctrl+S and every other chord of the editor,
// and the pointer is usually over the room while those are typed - a list the
// width of the panel must not drop over it and snap shut again for the length of
// a keystroke. So the key has to be held for a moment before the list appears: a
// chord is over long before that, a hold is not. Once the key has been held that
// long it stays armed, so the other order - key first, pointer into the room
// afterwards - opens the list the moment the pointer arrives.
function selectionBarPeekArm() {
  if(selectionBarPeekBlocked || selectionBarPeekActive || selectionBarPeekArmTimer !== null)
    return;
  if(selectionBarPeekArmed)
    return selectionBarPeekStart();
  selectionBarPeekArmTimer = setTimeout(function() {
    selectionBarPeekArmTimer = null;
    selectionBarPeekArmed = true;
    selectionBarPeekStart();
  }, SELECTION_BAR_PEEK_ARM_DELAY);
}

function selectionBarPeekCancelArm() {
  clearTimeout(selectionBarPeekArmTimer);
  selectionBarPeekArmTimer = null;
}

// The keystroke turned out to be a chord, or the list was dismissed with Escape:
// either way the key is still down, and it must not bring the list back until it
// has been let go of and pressed again.
function selectionBarPeekBlock() {
  selectionBarPeekBlocked = true;
  selectionBarPeekCancelArm();
  selectionBarPeekStop();
}

function selectionBarPeekRelease() {
  selectionBarPeekBlocked = false;
  selectionBarPeekArmed = false;
  selectionBarPeekCancelArm();
  selectionBarPeekStop();
}

// Whether the peek should be up is read off the event in hand rather than
// remembered from a keydown: a keyup lost to an OS-level menu or shortcut would
// otherwise leave the list latched open and scanning every frame, and the next
// keystroke that reports the key as up puts it away.
function selectionBarSyncPeek(e) {
  if(!e.getModifierState(SELECTION_BAR_PEEK_KEY))
    return selectionBarPeekRelease();
  if(e.type == 'keydown' && SELECTION_BAR_PEEK_KEYS.indexOf(e.key) == -1 && !/^F\d+$/.test(e.key))
    return selectionBarPeekBlock();
  selectionBarPeekArm();
}

/* Walking the history */

// Tab+Left and Tab+Right are what the two arrows of the bar name in their
// tooltip, and until now they only existed inside the JSON text area - which
// left the buttons of Edit Widgets promising a shortcut that did nothing there.
// The JSON editor keeps its own handler for the gesture (it has the command
// search that Tab opened to close first) and stops the event there, so this one
// only ever sees what got past it.
function selectionBarHandleHistoryKey(e) {
  if(!selectionBarTabHeld || e.ctrlKey || e.metaKey || e.altKey)
    return false;
  const direction = e.key == 'ArrowLeft' ? -1 : e.key == 'ArrowRight' ? 1 : 0;
  if(!direction || !selectionBarHistoryCanNavigate(direction))
    return false;
  e.preventDefault();
  selectionBarHistoryNavigate(direction);
  return true;
}

// Whether the JSON editor is what is being worked in. Going back to a widget
// restores the scroll position and the cursor it was left with, so the keyboard
// belongs there afterwards as well - without this the text area is left blurred
// and the caret it just restored belongs to nothing.
function selectionBarJsonHasFocus() {
  return jeEnabled && !!$('#jeText') && document.activeElement === $('#jeText');
}

function selectionBarCloseDropdowns() {
  selectionBarPrune();
  for(const bar of [ ...selectionBars ]) {
    if(bar.options.stack && bar.dom.classList.contains('stackVisible'))
      selectionBarToggleStack(bar, true);
    if(bar.options.tree && bar.dom.classList.contains('treeVisible'))
      selectionBarToggleTree(bar, true);
  }
}

/* Walking an open dropdown from the keyboard */

function selectionBarOpenDropdown(bar) {
  if(!bar || !bar.dom.isConnected)
    return null;
  if(bar.options.stack && bar.dom.classList.contains('stackVisible'))
    return { bar, kind: 'stack' };
  if(bar.options.tree && bar.dom.classList.contains('treeVisible'))
    return { bar, kind: 'tree' };
  return null;
}

// Which dropdown the keys act on: the one whose button was pressed last, since
// two modules can be docked and each carries a bar. A dropdown restored with its
// module was opened by nobody, so fall back to whichever one is on screen.
// A fullscreen overlay - the deck editor, a game's input - owns the keyboard
// while it is up, and nothing behind it may answer.
function selectionBarKeyboardDropdown() {
  if(document.body.classList.contains('overlayActive') || document.body.classList.contains('deckEditorActive'))
    return null;
  selectionBarPrune();
  return selectionBarOpenDropdown(selectionBarKeyboardBar) || selectionBars.map(selectionBarOpenDropdown).find(d=>d) || null;
}

// The arrow keys are only taken where nothing else needs them: they move the
// caret in the JSON text area and step every number input in the editor. The
// tree's own filter box is the exception - typing there and walking what it
// finds is the point of it, and it is where the tree dropdown puts the keyboard.
function selectionBarKeyboardIsFree() {
  const focused = document.activeElement;
  if(!focused || focused === document.body || focused.id == 'jeWidgetSearchBox')
    return true;
  return !focused.isContentEditable && !focused.matches('input:not([type=button]), textarea, select');
}

function selectionBarCloseDropdown(dropdown) {
  const button = dropdown.kind == 'stack' ? dropdown.bar.stackButton : dropdown.bar.treeButton;
  const focusWasInside = document.activeElement && dropdown.bar.dom.contains(document.activeElement);
  if(dropdown.kind == 'stack')
    selectionBarToggleStack(dropdown.bar, true);
  else
    selectionBarToggleTree(dropdown.bar, true);
  // the tree takes its filter box with it when it goes back to the JSON editor,
  // so the keyboard has to be handed to something that is still on screen
  if(focusWasInside && button)
    button.focus();
}

// Ctrl is what pastes the id of a row into the JSON editor, and it is also what
// holds the peeked list open - so while it is doing that it is not read as a
// modifier at all. A list that follows the pointer answers to exactly the keys
// its rows and its help line name, the same ones as a list opened by hand. Which
// of the two the key is has to hold from the moment it goes down rather than
// from the moment the list appears, so it is decided by where the pointer is:
// over the room the key belongs to the peek, and on a row of the list - or
// anywhere else outside the room - it is the modifier it always was.
function selectionBarPeekKeyIsModifier(e) {
  return e.ctrlKey && !selectionBarPeekActive && !selectionBarPointerInRoom;
}

// Escape closes the open dropdown, the arrow keys step through it and Enter
// picks what they landed on. Returns true when the key was used up.
function selectionBarHandleDropdownKey(e) {
  if(selectionBarPeekKeyIsModifier(e) || e.metaKey || e.altKey)
    return false;
  if([ 'Escape', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter' ].indexOf(e.key) == -1)
    return false;
  // the key repeat of an Escape that already closed a dropdown belongs to that
  // dropdown too - holding the key down must not walk on to closing the module
  if(e.key == 'Escape' && selectionBarSwallowEscapeUp) {
    e.preventDefault();
    return true;
  }
  const dropdown = selectionBarKeyboardDropdown();
  if(!dropdown)
    return false;

  if(e.key == 'Escape') {
    selectionBarCloseDropdown(dropdown);
    // a list Escape has just put away must not come straight back on the next
    // mouse move while the key that opened it is still held
    if(e.getModifierState(SELECTION_BAR_PEEK_KEY))
      selectionBarPeekBlock();
    selectionBarSwallowEscapeUp = true;
    e.preventDefault();
    return true;
  }

  if(!selectionBarKeyboardIsFree())
    return false;

  const step = e.key == 'ArrowDown' ? 1 : e.key == 'ArrowUp' ? -1 : 0;
  if(step) {
    if(dropdown.kind == 'stack')
      selectionBarStepStack(dropdown.bar, step);
    else
      selectionBarStepTree(dropdown.bar, step);
    e.preventDefault();
    return true;
  }

  // a collapsed branch of the tree cannot be stepped into, so the keys that are
  // left over walk it sideways
  if(dropdown.kind == 'tree' && (e.key == 'ArrowRight' || e.key == 'ArrowLeft')) {
    selectionBarWalkTreeSideways(dropdown.bar, e.key == 'ArrowRight');
    e.preventDefault();
    return true;
  }

  if(e.key == 'Enter') {
    const widget = dropdown.kind == 'stack' ? selectionBarStack[dropdown.bar.stackKeyIndex] : widgets.get(dropdown.bar.treeKeyID);
    if(!widget)
      return false;
    if(e.shiftKey && selectedWidgets.indexOf(widget) != -1)
      setSelection(selectedWidgets.filter(w=>w!=widget));
    else if(e.shiftKey)
      setSelection([ widget ].concat(selectedWidgets));
    else
      dropdown.bar.options.onPick(widget);
    e.preventDefault();
    return true;
  }

  return false;
}

function selectionBarResetStackCursor() {
  for(const bar of selectionBars)
    bar.stackKeyIndex = -1;
}

// Where the keyboard is in the list, shown in the list and in the room: the row
// alone does not say which of a stack of look-alikes it means, and the outline
// is the same one hovering a row with the mouse draws.
function selectionBarRenderStackCursor(bar) {
  if(!bar.options.stack || !bar.stackList)
    return;
  if(bar.stackKeyIndex >= selectionBarStack.length)
    bar.stackKeyIndex = -1;
  const rows = [ ...$a('.selectionBarStackRow', bar.stackList) ];
  for(const [ index, row ] of rows.entries())
    row.classList.toggle('selectionBarKeyRow', index === bar.stackKeyIndex);
  const widget = selectionBarStack[bar.stackKeyIndex];
  if(widget && rows[bar.stackKeyIndex]) {
    selectionBarClearHover();
    widget.domElement.classList.add('selectionBarHover');
    rows[bar.stackKeyIndex].scrollIntoView({ block: 'nearest' });
  }
}

function selectionBarStepStack(bar, direction) {
  const count = selectionBarStack.length;
  if(!count)
    return;
  // wraps, the way the Alt+click drill through the same stack does
  bar.stackKeyIndex = bar.stackKeyIndex < 0
    ? (direction > 0 ? 0 : count - 1)
    : (bar.stackKeyIndex + direction + count) % count;
  selectionBarRenderStackCursor(bar);
}

// The rows of the tree, in the order they are on screen. The element carrying a
// widget is the <li> of a leaf and the expander <span> of a branch - the same
// one jeHighlightRow marks - and a row inside a collapsed branch or filtered out
// of the tree has no box at all.
function selectionBarTreeRows() {
  return [ ...$a('#jeTree .key') ].map(key=>({ dom: key.parentElement, id: key.textContent })).filter(row=>row.dom.offsetParent);
}

function selectionBarMoveTreeCursor(bar, id) {
  bar.treeKeyID = id;
  selectionBarUpdateTreeHighlight();
  const row = selectionBarTreeRows().find(row=>row.id === id);
  if(row)
    row.dom.scrollIntoView({ block: 'nearest' });
}

function selectionBarStepTree(bar, direction) {
  const rows = selectionBarTreeRows();
  if(!rows.length)
    return;
  const current = rows.findIndex(row=>row.id === bar.treeKeyID);
  const index = current == -1 ? (direction > 0 ? 0 : rows.length - 1) : (current + direction + rows.length) % rows.length;
  selectionBarMoveTreeCursor(bar, rows[index].id);
}

// The <li> of the row the keyboard is on - the element the tree hangs the widget
// id and the nesting on. A branch marks its row with the expander <span> inside
// that <li>, a leaf with the <li> itself.
function selectionBarTreeCursorNode(bar) {
  const row = selectionBarTreeRows().find(row=>row.id === bar.treeKeyID);
  return row ? row.dom.closest('li.jeTreeWidget') : null;
}

// → opens a closed branch and steps into an open one. ← closes an open branch
// and otherwise climbs to the parent, so pressing it twice from somewhere inside
// a branch folds that branch away - which is what "go back up" means in a tree,
// and the only thing the two keys can usefully do beyond ↑ ↓.
function selectionBarWalkTreeSideways(bar, forward) {
  const node = selectionBarTreeCursorNode(bar);
  if(!node)
    return;
  const expander = $(':scope > .jeTreeExpander', node);
  const open = !!expander && expander.classList.contains('jeTreeExpander-down');
  if(expander && open != forward) {
    jeToggleTreeNode(expander, forward);
  } else if(forward) {
    if(open)
      selectionBarStepTree(bar, 1); // an open branch is followed by its first child
  } else {
    const parent = node.parentElement.closest('li.jeTreeWidget');
    if(parent)
      selectionBarMoveTreeCursor(bar, parent.dataset.id);
  }
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

// restoreJsonFocus says whether the JSON text area was what the user was working
// in - the buttons have to read that before they are pressed, since pressing one
// takes the focus off it. The JSON module blurs the text area on every selection
// change, so handing it back here is what makes the scroll position and the
// cursor that jeSelectWidget() just restored usable again.
function selectionBarHistoryNavigate(direction, restoreJsonFocus) {
  let index = selectionBarHistoryIndex + direction;
  while(index >= 0 && index < selectionBarHistory.length && !widgets.has(selectionBarHistory[index]))
    index += direction;
  if(index < 0 || index >= selectionBarHistory.length)
    return;

  const restoreFocus = restoreJsonFocus === undefined ? selectionBarJsonHasFocus() : restoreJsonFocus;
  selectionBarHistoryIndex = index;
  selectionBarHistoryNavigating = true;
  setSelection([ widgets.get(selectionBarHistory[index]) ]);
  selectionBarHistoryNavigating = false;
  if(restoreFocus && jeEnabled && $('#jeText'))
    $('#jeText').focus();
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
    selectionBarKeyboardBar = bar;
    selectionBarToggleStack(bar, true); // one dropdown at a time, they share the space below the bar
    bar.treeContainer.append($('#jeTree'));
    jeDisplayTree();
    // A tree of a few hundred widgets opens on whatever happens to be at the top
    // of it otherwise, and the widget the editor is on is what somebody opening
    // it is looking for. It is also where the keys start: without a cursor the
    // arrows would do nothing at all until one of them had been pressed twice.
    bar.treeKeyID = selectedWidgets.length == 1 ? selectedWidgets[0].id : null;
    jeScrollTreeToSelection();
    selectionBarUpdateTreeHighlight();
    if(focusSearch)
      $('#jeWidgetSearchBox').focus();
  } else {
    bar.treeKeyID = null;
    selectionBarReturnTree(bar);
  }
}

// #jeTree belongs to the JSON editor and is only lent to a bar, so it has to go
// back before the bar it sits in is thrown away - otherwise it is detached and
// $('#jeTree') finds nothing the next time a bar wants it. A bar that was wiped
// without saying so still holds it in its own container, so look there first.
function selectionBarReturnTree(bar) {
  const tree = bar && bar.treeContainer && $('#jeTree', bar.treeContainer) || $('#jeTree');
  if(tree && $('#jeEditArea'))
    $('#jeEditArea').append(tree);
}

function selectionBarUpdateTreeHighlight() {
  if(!selectionBarTreeIsVisible())
    return;
  const treeBar = selectionBars.find(bar=>bar.dom.classList.contains('treeVisible'));
  const selectedIDs = selectedWidgets.map(w=>w.id);
  for(const widgetDOM of $a('#jeTree .key')) {
    widgetDOM.parentElement.classList.toggle('jeHighlightRow', selectedIDs.indexOf(widgetDOM.textContent) != -1);
    widgetDOM.parentElement.classList.toggle('selectionBarKeyRow', !!treeBar && widgetDOM.textContent === treeBar.treeKeyID);
  }
}

/* Rendering */

// Pressing a button moves the keyboard to it, so whether the JSON text area was
// what had it has to be taken on the way down rather than in the click. The
// handler must not hand back what it stored: an inline handler that returns
// false cancels the default of the event it is on, and a mousedown whose default
// is cancelled is a button that is never focused - and, in a browser driven by
// synthetic events, one whose click may not follow at all.
function selectionBarHistoryButton(bar, direction, icon, title) {
  let hadJsonFocus = false;
  const button = selectionBarButton(bar.dom, icon, title, function() {
    selectionBarHistoryNavigate(direction, hadJsonFocus);
    hadJsonFocus = false;
  });
  button.onmousedown = function() {
    hadJsonFocus = selectionBarJsonHasFocus();
  };
  return button;
}

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

  // A bar showing its tree keeps it, so there the peek has no list to show and
  // the count in the corner of the button is the only thing that moves - which
  // reads as a key that does nothing. The button it belongs to says so instead.
  bar.stackButton.classList.toggle('peeking', selectionBarPeekActive && !bar.dom.classList.contains('stackVisible'));

  if(!bar.dom.classList.contains('stackVisible'))
    return;

  // wiping the rows does not fire mouseleave on the one the pointer is over, so
  // its widget would keep the hover outline (and the visibility:important that
  // shows a hidden one) with nothing left on screen to take it off again
  selectionBarClearHover();

  bar.stackList.innerHTML = '';
  const header = div(bar.stackList, 'selectionBarStackHeader');
  header.textContent = selectionBarStack.length
    ? `${selectionBarStack.length} ${selectionBarWhere()}, topmost first`
    : `Nothing ${selectionBarWhere()}`;

  // What the list is, for someone who just opened it: the panel it replaces
  // carried that sentence permanently, and a tooltip is no place for it. A
  // finger has neither the modifiers nor the keys, so a list it filled is only
  // told the one thing it can do.
  // The keys are the same either way, so only the first line differs: a list the
  // pointer is towing along has moved on by the time the pointer has travelled
  // to one of its rows, so it names the keys rather than sending anyone clicking.
  // Escape reaches the list whatever owns the keyboard, but the arrows and Enter
  // belong to the text field that has it - the caret sitting in a line of JSON is
  // the posture the peek gets used in, so the line only offers what will answer.
  const keyHelp = selectionBarKeyboardIsFree()
    ? '<br>↑ ↓ step through the list, Enter selects, Esc closes it.'
    : '<br>Esc closes it.';
  if(selectionBarStack.length)
    div(bar.stackList, 'selectionBarStackHelp', selectionBarStackFromTouch
      ? 'Tap a row to select that widget.'
      : selectionBarPeekActive
      ? 'Following the pointer while Ctrl is held - the key shown selects, Shift with it adds.' + keyHelp
      : 'Click to select, shift-click to add to the selection, or press the key shown.' + keyHelp);

  for(const [ index, widget ] of selectionBarStack.entries()) {
    const hotkey = index < 3 ? `F${index+1}` : index < 10 ? `F${index+3}` : '';
    // the gap where F4 and F5 would be looks like a bug without a word on it
    const keyTitle = hotkey ? `Press ${hotkey} to select this widget - F4 and F5 are missing because the browser keeps those keys` : '';
    const row = div(bar.stackList, 'selectionBarStackRow');
    const notes = selectionBarWidgetNotes(widget);
    row.classList.toggle('selected', selectedWidgets.indexOf(widget) != -1);
    row.innerHTML = `<span class=selectionBarStackKey title="${keyTitle}">${hotkey}</span>`
                  + `<span class=selectionBarStackType>${html(widget.get('type') || 'basic')}</span>`
                  + `<span class=selectionBarStackId>${html(widget.id)}</span>`
                  + `<span class=selectionBarStackNotes>${html(notes)}</span>`;
    // the notes are the first thing a narrow panel takes off the row, so the
    // tooltip carries them - together with the id, which can be cut off too once
    // there is nothing left to give
    row.title = `${widget.id}${notes ? ` - ${notes}` : ''} - z ${widget.calculateZ()}`
              + ' - click to select, shift-click to add to the selection'
              + (jeEnabled && !selectionBarPeekActive ? '\nCtrl+click pastes the id into the JSON text' : '');
    row.onmouseenter = _=>widget.domElement.classList.add('selectionBarHover');
    row.onmouseleave = _=>widget.domElement.classList.remove('selectionBarHover');
    row.onclick = function(e) {
      selectionBarClearHover();
      if(selectionBarPeekKeyIsModifier(e) && jeEnabled)
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
    div(bar.stackList, 'selectionBarStackEmpty', selectionBarPeekActive
      ? 'Nothing under the pointer - move it over a widget while Ctrl is held.'
      : 'Rest the pointer on a widget in the room, or tap one - everything stacked at that spot is listed here.');

  selectionBarRenderStackCursor(bar);
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

// transient is a list that is only up while a key is held: it must not become
// the dropdown that comes back with the module the next time it is opened.
function selectionBarToggleStack(bar, forceClose, transient) {
  if(!bar.options.stack)
    return;
  const open = !forceClose && !bar.dom.classList.contains('stackVisible');
  if(open && bar.dom.classList.contains('treeVisible'))
    selectionBarToggleTree(bar, true);
  if(open)
    selectionBarKeyboardBar = bar;
  else
    selectionBarClearHover(); // the keyboard cursor outlines its row's widget, and the list is about to be gone
  bar.stackKeyIndex = -1;
  if(!transient)
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
  if(bar.highlightButton)
    bar.highlightButton.classList.toggle('active', jeWidgetHighlightingEnabled());
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
    if(selectionBarKeyboardBar === bar)
      selectionBarKeyboardBar = null;
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
    highlight: true,
    onPick: widget=>setSelection([ widget ])
  }, options);

  selectionBarInstallListeners();
  selectionBarPrune();

  const bar = { options };
  bar.stackKeyIndex = -1; // where the arrow keys are in the stack list
  bar.treeKeyID = null;   // and in the tree
  bar.dom = div(target, 'selectionBar');

  if(options.history) {
    bar.backButton    = selectionBarHistoryButton(bar, -1, 'arrow_back',    'Back to the previously selected widget (Tab+Left)');
    bar.forwardButton = selectionBarHistoryButton(bar,  1, 'arrow_forward', 'Forward to the next selected widget (Tab+Right)');
  }
  if(options.tree)
    bar.treeButton = selectionBarButton(bar.dom, 'account_tree', 'The widget tree of the room', _=>selectionBarToggleTree(bar, false, true));
  if(options.stack) {
    const stackTitle = 'The widgets under the pointer, or where you last tapped'
                     + (selectionBarCanAltClick() ? '\nHold Ctrl to open the list and have it follow the pointer.\nAlt+click in the room steps through them.' : '');
    bar.stackButton = selectionBarButton(bar.dom, 'layers', stackTitle, _=>selectionBarToggleStack(bar));
    bar.stackCount = document.createElement('span');
    bar.stackCount.className = 'selectionBarStackCount';
    bar.stackButton.append(bar.stackCount);
  }
  // What it marks is the selection, which is what this bar is about - it used to
  // be a button of the JSON editor's command pane, where it was out of reach of
  // everyone who never opens that.
  if(options.highlight)
    bar.highlightButton = selectionBarButton(bar.dom, 'flashlight_on', 'Outline the selected widgets in the room', _=>jeToggleWidgetHighlighting());

  bar.crumbs = div(bar.dom, 'selectionBarCrumbs');
  // both at the end of the bar, where they can appear and disappear without
  // moving anything: the crumbs before them are left-aligned and only shrink
  bar.drill = div(bar.dom, 'selectionBarDrill');
  bar.coords = div(bar.dom, 'selectionBarCoords');
  bar.coords.title = 'Where the pointer is in the room';
  if(options.tree) {
    bar.treeContainer = div(bar.dom, 'selectionBarTree');
    // the tree itself is borrowed from the JSON editor and handed back, so this
    // line belongs to the container rather than to the tree, and is created here
    div(bar.treeContainer, 'selectionBarDropdownHint', '↑ ↓ walk the tree, → opens a branch, ← closes it or goes to the parent, Enter selects, Esc closes it.');
  }
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
  if(selectionBarKeyboardBar === bar)
    selectionBarKeyboardBar = null;
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
  selectionBarPeekRelease();
  selectionBarCancelScan();
  selectionBarStack = [];
  selectionBarResetStackCursor();
  selectionBarPointer = null;
  selectionBarPointerInRoom = false;
  selectionBarSetPointerCoords(null);
  selectionBarClearHover();
  updateSelectionBars();
}

function selectionBarStateReceived() {
  selectionBarStack = [];
  selectionBarResetStackCursor();
  if(selectionBarTreeIsVisible())
    jeDisplayTree();
  updateSelectionBars();
}
