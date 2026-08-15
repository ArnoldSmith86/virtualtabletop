// Recording a routine from what the game author does in the room.
//
// "add operation" asks which operation to write down. The record button next to
// it asks the other way round: do the thing in the room and let the editor say
// which operations would do it. While it is armed, every press-drag-release in
// the room becomes a card of suggestions - the operation that does exactly what
// was just done, plus the ways a routine usually generalizes it - and picking
// one adds it to the routine where "add operation" would have added it.
//
// One gesture is deliberately not one operation. Dragging a card from a hand
// onto the discard pile is "move 1 card out of that hand", "move all of them",
// "take one from every player" or "gather every card back into the deck",
// depending on what the routine is for. The room cannot know which was meant,
// but it knows the four - so it offers them and writes nothing until one is
// picked. A gesture nobody picks anything from costs a card in the list.
//
// While recording, the room answers the way it does for a player rather than
// the way it does in edit mode (see selection.js): the selection band stays out
// of the drag, and a click neither selects the widget nor runs its click
// routine - selecting one would take the editor off the routine being recorded,
// and running it would play the game instead of describing it. A drag does move
// the widget for real, so the next gesture starts from the state the last one
// left behind, which is what makes a sequence of them read as one macro.

// The routine that is being recorded into, the gestures collected so far and
// which of their suggestions were already added. Only one recording runs at a
// time, the way only one widget picker does.
//
// Which routine it is is remembered the way the card worked on last is (see
// activeOperationByWidget): by the widget and the routine inside it, not by the
// editor object. A nested block is built anew every time anything in the routine
// changes - adding the first suggestion would otherwise throw the recording away
// with the editor that collected it.
let activeRoutineRecording = null;

// what is known about the gesture between the press and the release
let openRoutineGesture = null;

let routineGestureCounter = 0;

// properties that change on their own during any drag, or that the suggestions
// already say in words of their own: a card that ends up in another holder is a
// MOVE, not a "Set parent of card1 to discard"
const routineRecorderIgnoredProperties = [
  'id', 'type', 'deck', 'cardType', 'parent', 'x', 'y', 'z', 'owner',
  'dragging', 'hoverTarget', 'hoverParent', 'dropShadowWidget', 'dropShadowOwner',
  'movedByButton', 'onlyVisibleForSeat', 'linkedToSeat'
];

export function isRoutineRecording() {
  return Boolean(activeRoutineRecording);
}

// whether this editor is the one the recording belongs to. The editor object
// that renders the panel is remembered along the way, so a gesture knows where
// to draw itself after the routine was rebuilt around it.
function isRoutineRecordingIn(editor) {
  if(!activeRoutineRecording || !editor)
    return false;
  if(activeRoutineRecording.widgetID !== editor.widgetID || activeRoutineRecording.routineKey !== editor.routineKey)
    return false;
  activeRoutineRecording.editor = editor;
  return true;
}

// the recording to draw into this editor, whether or not it is on screen yet: a
// nested block renders itself in its own constructor, before anything appended
// it anywhere
function routineRecordingIn(editor) {
  return isRoutineRecordingIn(editor) ? activeRoutineRecording : null;
}

// the recording, as long as the routine it belongs to is still on screen: a
// delta can take the widget out of the selection, which throws the sidebar the
// panel lives in away, and the crosshair over the room must not stay behind
function routineRecordingState() {
  if(!activeRoutineRecording)
    return null;
  if(!activeRoutineRecording.editor.domElement.isConnected) {
    stopRoutineRecording();
    editorNote('recording ended: the routine is no longer open');
    return null;
  }
  return activeRoutineRecording;
}

function startRoutineRecording(editor) {
  stopRoutineRecording();
  activeRoutineRecording = { editor, widgetID: editor.widgetID, routineKey: editor.routineKey, gestures: [], added: [] };
  $('body').classList.add('editorRoutineRecording');
  editor.render();
}

function stopRoutineRecording() {
  if(!activeRoutineRecording)
    return;
  const editor = activeRoutineRecording.editor;
  activeRoutineRecording = null;
  openRoutineGesture = null;
  $('body').classList.remove('editorRoutineRecording');
  if(editor.domElement.isConnected)
    editor.render();
}

// A click in the room while a recording runs belongs to the recording, never to
// the widget: selecting it would re-render the sidebar out from under the panel
// the suggestions are in, and running its click routine would play the game
// instead of describing it. The gesture itself is taken by the pointer hooks
// below, which see the release whether this swallowed the click or not.
function handleRoutineRecorderClick() {
  return Boolean(routineRecordingState());
}

// the widget the press landed on plus its ancestors: a press on a widget that is
// pinned to a holder drags the holder, so which of them actually moved is only
// known once the button comes up
function routineRecorderChain(widget) {
  const chain = [];
  for(let w = widget; w && chain.indexOf(w) == -1 && chain.length < 10; w = routineRecorderWidget(w.get('parent')))
    chain.push(w);
  return chain.map(w=>({ widget: w, id: w.get('id'), parent: w.get('parent') || null, x: w.get('x'), y: w.get('y') }));
}

function routineRecorderWidget(id) {
  return id && widgets.has(id) ? widgets.get(id) : null;
}

export function routineRecorderPointerDown(widget) {
  if(!routineRecordingState() || !widget)
    return;
  openRoutineGesture = { before: routineRecorderChain(widget), changes: {} };
}

// What changed while the gesture was running, taken from the deltas rather than
// from a snapshot of the whole room: a holder that turns a card face up as it
// enters is the one part of a drag the drag itself does not say.
function routineRecorderReceiveDelta(delta) {
  if(!openRoutineGesture || !delta || !delta.s)
    return;
  for(const id in delta.s) {
    const properties = delta.s[id];
    if(!properties || typeof properties != 'object')
      continue;
    openRoutineGesture.changes[id] = Object.assign(openRoutineGesture.changes[id] || {}, properties);
  }
}

export function routineRecorderPointerUp() {
  const recording = routineRecordingState();
  const raw = openRoutineGesture;
  openRoutineGesture = null;
  if(!recording || !raw)
    return;
  const gesture = describeRoutineGesture(raw);
  if(!gesture || !gesture.suggestions.length)
    return;
  recording.gestures.push(gesture);
  recording.editor.render();
  scrollRoutineRecordingIntoView(recording.editor);
}

// The panel sits at the end of a routine that is often taller than the sidebar,
// and re-rendering it collapses and re-grows the module, which leaves the scroll
// position wherever the shorter page allowed. So whatever just happened puts
// itself back where it can be read - the room is where the eye was, not here.
function scrollRoutineRecordingIntoView(editor) {
  const gestures = $a('.routine-editor-gesture', editor.domElement);
  const last = gestures[gestures.length-1];
  if(last && last.scrollIntoView)
    last.scrollIntoView({ block: 'nearest' });
}

// What the gesture did, in the terms the suggestions are built from. The widget
// that moved is the first one up the chain whose place changed - a press on a
// card pinned to a board drags the board - and a gesture that moved nothing at
// all is a click on the widget the press landed on.
function describeRoutineGesture(raw) {
  const before = raw.before.filter(entry=>routineRecorderWidget(entry.id) === entry.widget);
  if(!before.length)
    return null;

  const placeChanged = entry=>entry.parent !== (entry.widget.get('parent') || null)
    || Math.round(entry.x) != Math.round(entry.widget.get('x')) || Math.round(entry.y) != Math.round(entry.widget.get('y'));
  const moved = before.find(placeChanged);
  const subject = moved || before[0];
  const widget = subject.widget;

  const gesture = {
    key: ++routineGestureCounter,
    widget,
    widgetID: subject.id,
    type: widget.get('type') || 'basic',
    from: subject.parent,
    to: widget.get('parent') || null,
    x: Math.round(widget.get('x')),
    y: Math.round(widget.get('y')),
    dragged: Boolean(moved),
    changes: raw.changes
  };
  gesture.reparented = gesture.dragged && gesture.from !== gesture.to;
  gesture.label = routineGestureWords(gesture);
  gesture.suggestions = routineGestureSuggestions(gesture);
  return gesture;
}

function routineRecorderPlace(id) {
  return id === null ? 'the table' : id;
}

function routineGestureWords(gesture) {
  if(gesture.reparented)
    return `dragged ${gesture.widgetID} from ${routineRecorderPlace(gesture.from)} to ${routineRecorderPlace(gesture.to)}`;
  if(gesture.dragged)
    return `dragged ${gesture.widgetID} to ${gesture.x}, ${gesture.y}`;
  return `clicked ${gesture.widgetID}`;
}

// the seats whose hand this holder is: dropping a card into a hand is dealing to
// the player sitting there, and MOVE deals to the seat rather than to its holder
// (it sets the owner along the way, which a move into the holder does not)
function seatsWithHand(holderID) {
  if(!holderID)
    return [];
  return widgetFilter(w=>w.get('type') == 'seat' && w.get('hand') == holderID).map(w=>w.get('id')).sort();
}

function everySeatWithAHand() {
  return widgetFilter(w=>w.get('type') == 'seat' && w.get('hand') && widgets.has(w.get('hand'))).map(w=>w.get('id')).sort();
}

function everyHand() {
  return [ ...new Set(widgetFilter(w=>w.get('type') == 'seat' && w.get('hand') && widgets.has(w.get('hand'))).map(w=>w.get('hand'))) ].sort();
}

// RECALL gathers the cards of the decks lying IN a holder, so it is only worth
// offering for a holder that has one
function holderWithDeck(holderID) {
  return Boolean(holderID) && widgetFilter(w=>w.get('type') == 'deck' && w.get('parent') == holderID).length > 0;
}

function isHolderLike(id) {
  const widget = routineRecorderWidget(id);
  return Boolean(widget) && [ 'holder', 'seat' ].indexOf(widget.get('type')) != -1;
}

// the value a property ended up with during this gesture, or undefined when the
// gesture did not touch it
function changedDuringGesture(gesture, id, property) {
  const changes = gesture.changes[id];
  return changes && typeof changes == 'object' ? changes[property] : undefined;
}

// Every reading of a gesture worth offering, in the order they are worth looking
// at: what was literally just done first, then the ways a routine generalizes it
// (all of them instead of one, every player instead of the one dropped on), then
// what those two widgets are usually asked to do next.
function routineGestureSuggestions(gesture) {
  const suggestions = [];
  const seen = [];
  const add = (why, operation)=>{
    const key = JSON.stringify(operation);
    if(seen.indexOf(key) != -1 || suggestions.length >= 8)
      return;
    seen.push(key);
    suggestions.push({ why, operation });
  };

  if(gesture.reparented)
    reparentSuggestions(gesture, add);
  else if(gesture.dragged)
    repositionSuggestions(gesture, add);
  else
    clickSuggestions(gesture, add);

  propertySuggestions(gesture, add);
  return suggestions;
}

function reparentSuggestions(gesture, add) {
  const { from, to, widgetID } = gesture;
  const face = changedDuringGesture(gesture, widgetID, 'activeFace');

  if(to === null) {
    // out of a holder onto the table: the only operation that puts a widget at a
    // spot of its own is MOVEXY, and it takes them out of a holder
    if(isHolderLike(from)) {
      add('take one out onto the table', { func: 'MOVEXY', from, count: 1, x: gesture.x, y: gesture.y });
      add('take all of them out', { func: 'MOVEXY', from, count: 'all', x: gesture.x, y: gesture.y });
    }
    add('just take it out of whatever it is in', { func: 'SET', property: 'parent', value: null, collection: [ widgetID ] });
    return;
  }

  if(from !== null && isHolderLike(from)) {
    add('do exactly this', { func: 'MOVE', from, to, count: 1 });
    add('move everything that is in there', { func: 'MOVE', from, to, count: 'all' });
    if(typeof face == 'number')
      add('and turn them over on the way', { func: 'MOVE', from, to, count: 1, face });
  } else {
    add('do exactly this', { func: 'MOVE', collection: [ widgetID ], to });
  }

  // dealing: dropping into a hand is dealing to the seat it belongs to, and a
  // routine nearly always deals to every seat rather than to one
  const seats = seatsWithHand(to);
  if(seats.length && from !== null && isHolderLike(from)) {
    const everySeat = everySeatWithAHand();
    add(`deal one to ${seats.length > 1 ? 'those seats' : seats[0]}`, { func: 'MOVE', from, to: seats.length > 1 ? seats : seats[0], count: 1 });
    if(everySeat.length > seats.length)
      add('deal one to every player', { func: 'MOVE', from, to: everySeat, count: 1 });
  }

  // collecting: taking a card out of a hand is nearly always done for all of them
  const hands = everyHand();
  if(from !== null && hands.indexOf(from) != -1 && hands.length > 1)
    add('take one from every player', { func: 'MOVE', from: hands, to, count: 1 });

  if(holderWithDeck(to))
    add('gather every card of its deck back in', { func: 'RECALL', holder: to });
  if(holderWithDeck(from))
    add('gather every card back where it came from', { func: 'RECALL', holder: from });
  if(isHolderLike(to))
    add('shuffle what is in there afterwards', { func: 'SHUFFLE', holder: to });
  add('move whatever an earlier operation picked', { func: 'MOVE', to });
}

function repositionSuggestions(gesture, add) {
  const { from, widgetID } = gesture;
  const collection = [ widgetID ];
  // x and y are measured against whatever the widget is in, which is exactly
  // what a SET writes as well. MOVEXY is not the same thing: it takes widgets
  // OUT of a holder and puts them at a spot in the room, which is not what a
  // drag that left the widget where it was did.
  add('put it exactly there', { func: 'SET', property: 'x', value: gesture.x, collection });
  add('and at that height', { func: 'SET', property: 'y', value: gesture.y, collection });
  if(from !== null && isHolderLike(from)) {
    add('re-order what is in there instead', { func: 'SORT', holder: from });
    add('shuffle it instead', { func: 'SHUFFLE', holder: from });
  }
}

function clickSuggestions(gesture, add) {
  const { widgetID, type, widget } = gesture;
  const collection = [ widgetID ];

  add('click it the way a player would', { func: 'CLICK', collection });
  if(Array.isArray(widget.get('clickRoutine')))
    add('run its click routine and wait for it', { func: 'CALL', routine: 'clickRoutine', widget: widgetID });

  if(type == 'card') {
    add('turn it face up', { func: 'FLIP', collection, face: 1 });
    add('turn it face down', { func: 'FLIP', collection, face: 0 });
  }
  if(type == 'holder' || type == 'pile') {
    add('shuffle it', { func: 'SHUFFLE', holder: widgetID });
    add('sort it', { func: 'SORT', holder: widgetID });
    if(holderWithDeck(widgetID))
      add('gather every card of its deck back in', { func: 'RECALL', holder: widgetID });
    add('move something out of it', { func: 'MOVE', from: widgetID, count: 1 });
  }
  if(type == 'seat')
    add('give the turn to it', { func: 'TURN', turnCycle: 'seat', turn: widgetID });
  if(type == 'timer')
    add('start it', { func: 'TIMER', timer: widgetID, mode: 'start' });

  add('change a property of it', { func: 'SET', property: '', value: '', collection });
}

// What the room did by itself while the gesture ran - the properties a holder,
// a routine or a legacy mode set on the way. They are what a recording adds over
// watching the pointer: a drop that turns the card face up says so.
function propertySuggestions(gesture, add) {
  for(const id in gesture.changes) {
    const changes = gesture.changes[id];
    if(!changes || typeof changes != 'object' || !routineRecorderWidget(id))
      continue;
    for(const property in changes) {
      if(routineRecorderIgnoredProperties.indexOf(property) != -1 || property.charAt(0) == '_' || property.match(/Routine$/))
        continue;
      const value = changes[property];
      const collection = [ id ];
      if(property == 'activeFace' && typeof value == 'number')
        add(`${id} ended up on that face`, { func: 'FLIP', collection, face: value });
      else if(property == 'rotation' && typeof value == 'number')
        add(`${id} ended up turned that way`, { func: 'ROTATE', collection, mode: 'set', angle: value });
      else if(value === null || [ 'string', 'number', 'boolean' ].indexOf(typeof value) != -1)
        add(`${id} got ${property} while you did that`, { func: 'SET', property, value, collection });
    }
  }
}
