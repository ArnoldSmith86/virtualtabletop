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

// properties that change on their own during any drag, that the suggestions
// already say in words of their own - a card that ends up in another holder is a
// MOVE, not a "Set parent of card1 to discard" - or that only exist to drive the
// engine: rollCount is what makes a die that lands on the face it already showed
// still roll on screen, and a routine that sets it says nothing about the game.
const routineRecorderIgnoredProperties = [
  'id', 'type', 'deck', 'cardType', 'parent', 'x', 'y', 'z', 'owner',
  'dragging', 'hoverTarget', 'hoverParent', 'dropShadowWidget', 'dropShadowOwner',
  'movedByButton', 'onlyVisibleForSeat', 'linkedToSeat', 'rollCount'
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
  drawRoutineRecordingLabel(editor);
  editor.render();
}

export function stopRoutineRecording() {
  if(!activeRoutineRecording)
    return;
  const editor = activeRoutineRecording.editor;
  activeRoutineRecording = null;
  openRoutineGesture = null;
  $('body').classList.remove('editorRoutineRecording');
  removeRoutineRecordingLabel();
  if(editor.domElement.isConnected)
    editor.render();
}

// Which routine the room is being recorded into, said in the room. The frame on
// its own only says "something here is being written down"; the routine it goes
// into is named in the sidebar, which is scrollable and usually scrolled
// somewhere else by the time three gestures have been done.
function drawRoutineRecordingLabel(editor) {
  removeRoutineRecordingLabel();
  const area = $('#roomArea');
  if(!area)
    return;
  const label = document.createElement('div');
  label.id = 'routineRecordingLabel';
  label.textContent = `recording → ${[ editor.widgetID, editor.routineKey ].filter(Boolean).join(' · ')}`;
  area.appendChild(label);
}

function removeRoutineRecordingLabel() {
  const label = $('#routineRecordingLabel');
  if(label)
    label.remove();
}

// A gesture nobody meant - a slip onto the wrong holder, a drag done only to put
// the room back the way it was - can be taken off the card. Only the reading of
// it goes: an operation already added from it stays in the routine, the way
// anything else added to a routine stays until it is deleted there.
export function forgetRoutineGesture(gesture) {
  const recording = routineRecordingState();
  if(!recording)
    return;
  const at = recording.gestures.indexOf(gesture);
  if(at == -1)
    return;
  recording.gestures.splice(at, 1);
  recording.editor.render();
}

// A click in the room while a recording runs belongs to the recording, never to
// the widget: selecting it would re-render the sidebar out from under the panel
// the suggestions are in, and running its click routine would play the game
// instead of describing it. The gesture itself is taken by the pointer hooks
// below, which see the release whether this swallowed the click or not.
//
// This is also where the recording learns that the release was a click at all.
// Whether a press-release is one is the engine's call, not the recorder's: a
// release under 10px and 250ms is a click even though every mousemove on the way
// really did move the widget (see mousehandling.js), so a hand that shakes by
// two pixels must still record "clicked the die", not "dragged it to 402, 301".
// This runs from exactly the branch that decided so, and before the release
// reaches routineRecorderPointerUp().
function handleRoutineRecorderClick() {
  if(!routineRecordingState())
    return false;
  if(openRoutineGesture)
    openRoutineGesture.clicked = true;
  return true;
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
  openRoutineGesture = { before: routineRecorderChain(widget), changes: {}, existed: [ ...widgets.keys() ] };
}

// A delta is part of the gesture unless somebody else made it. Every delta says
// who caused it (setDeltaCause in serverstate.js writes "<player> dragged x"),
// and another player moving something across the table while the author drags a
// card is not part of what the author just did. A delta with no cause at all
// counts: the cause is dropped again after every flush, so the second half of a
// drop that flushes twice arrives without one.
function routineRecorderOwnDelta(delta) {
  if(typeof delta.c != 'string')
    return true;
  const player = String((getPlayerDetails() || {}).playerName || '');
  return Boolean(player) && delta.c.substr(0, player.length+1) == `${player} `;
}

// What changed while the gesture was running, taken from the deltas rather than
// from a snapshot of the whole room: a holder that turns a card face up as it
// enters is the one part of a drag the drag itself does not say.
function routineRecorderReceiveDelta(delta) {
  if(!openRoutineGesture || !delta || !delta.s || !routineRecorderOwnDelta(delta))
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
  const gesture = describeRoutineGesture(raw, collectionsAroundRecording(recording));
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

// the collections an operation added by this recording could read - see
// RoutineEditor.collectionsInScope()
function collectionsAroundRecording(recording) {
  const editor = recording.editor;
  return editor && editor.collectionsInScope ? editor.collectionsInScope() : [];
}

// What the gesture did, in the terms the suggestions are built from. The widget
// that moved is the first one up the chain whose place changed - a press on a
// card pinned to a board drags the board - and a gesture that moved nothing at
// all is a click on the widget the press landed on.
function describeRoutineGesture(raw, collections=[]) {
  const before = raw.before.filter(entry=>routineRecorderWidget(entry.id) === entry.widget);
  if(!before.length)
    return null;

  // A widget the gesture brought into existence has no properties worth
  // offering: dropping a card on a card makes a pile, and every property that
  // pile reports (its size, its type) is the room building it rather than
  // something a routine would ever set. The author never made it and cannot
  // find it in the room either, so naming it in a suggestion says nothing.
  const changes = {};
  for(const id in raw.changes)
    if(!raw.existed || raw.existed.indexOf(id) != -1)
      changes[id] = raw.changes[id];

  const placeChanged = entry=>entry.parent !== (entry.widget.get('parent') || null)
    || Math.round(entry.x) != Math.round(entry.widget.get('x')) || Math.round(entry.y) != Math.round(entry.widget.get('y'));
  // whether this was a click is the engine's answer (see handleRoutineRecorderClick);
  // the coordinates are only asked when the release never reached it, because it
  // happened over the sidebar or an overlay rather than over the room
  const moved = raw.clicked ? null : before.find(placeChanged);
  const subject = moved || before[0];
  const widget = subject.widget;
  const destination = routineRecorderDestination(widget);

  const gesture = {
    key: ++routineGestureCounter,
    widget,
    widgetID: subject.id,
    type: widget.get('type') || 'basic',
    from: subject.parent,
    to: destination.to,
    x: destination.x,
    y: destination.y,
    dragged: Boolean(moved),
    changes
  };
  gesture.reparented = gesture.dragged && gesture.from !== gesture.to;
  gesture.label = routineGestureWords(gesture);
  gesture.suggestions = routineGestureSuggestions(gesture, collections);
  return gesture;
}

// Where the drag put the widget, in terms an operation can name. Dropping a card
// onto a card puts it into a pile the drop invents (see updatePiles): that pile
// is gone again as soon as it holds one card, and no operation takes one as a
// destination anyway - MOVE moves widgets into holders and seats. So a
// destination that is not one of those is read as the place it stands in, at the
// coordinates it stands at: stacking two cards on the table means "put it there",
// not "put it into o0ur", and stacking them inside a holder means the card never
// left that holder.
function routineRecorderDestination(widget) {
  let place = widget.get('parent') || null;
  let x = widget.get('x') || 0;
  let y = widget.get('y') || 0;
  // x and y are counted from whatever the widget is in, so a place further up
  // the chain is only reached by adding what stands between them
  for(let steps = 0; steps < 10 && place !== null && !isHolderLike(place); steps++) {
    const container = routineRecorderWidget(place);
    x += container ? container.get('x') || 0 : 0;
    y += container ? container.get('y') || 0 : 0;
    place = container ? container.get('parent') || null : null;
  }
  return { to: isHolderLike(place) ? place : null, x: Math.round(x), y: Math.round(y) };
}

// What to call a widget in the headline. The ids a game is built out of are
// generated as often as they are chosen - a card is "pyn6" and the pile a
// holder made around it is "o0ur", neither of which the author ever typed or
// can find in the room - so the headline says what kind of thing it was as
// well. A widget with no type of its own (a plain button, a label) is named by
// its id alone, which is the one an author did choose.
function routineRecorderName(id) {
  const widget = routineRecorderWidget(id);
  const type = widget && widget.get('type');
  return type && type != 'basic' ? `the ${type} ${id}` : String(id);
}

function routineRecorderPlace(id) {
  return id === null ? 'the table' : routineRecorderName(id);
}

function routineGestureWords(gesture) {
  if(gesture.reparented)
    return `dragged ${routineRecorderName(gesture.widgetID)} from ${routineRecorderPlace(gesture.from)} to ${routineRecorderPlace(gesture.to)}`;
  if(gesture.dragged)
    return `dragged ${routineRecorderName(gesture.widgetID)} to ${gesture.x}, ${gesture.y}`;
  return `clicked ${routineRecorderName(gesture.widgetID)}`;
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

// how many suggestions one gesture is worth reading through before the card
// stops being a list and becomes a wall
const routineSuggestionLimit = 8;

// Every reading of a gesture worth offering, in the order they are worth looking
// at: what was literally just done first, then the ways a routine generalizes it
// (all of them instead of one, every player instead of the one dropped on), then
// what those two widgets are usually asked to do next.
//
// The two kinds are collected apart so that the limit can prefer what the room
// did on its own over the readings of the gesture: a room with seats in it makes
// the ordinary dealing gesture produce more readings than fit, and the reading
// that would fall off the end is the one watching the pointer could never
// produce - "the hand turned the card face up as it went in". Half the list is
// kept for those, and whatever they leave unused goes back to the gesture.
function routineGestureSuggestions(gesture, collections=[]) {
  const fromGesture = [];
  const fromRoom = [];
  const into = list=>((why, operation)=>list.push({ why, operation }));

  if(gesture.reparented)
    reparentSuggestions(gesture, into(fromGesture), collections);
  else if(gesture.dragged)
    repositionSuggestions(gesture, into(fromGesture));
  else
    clickSuggestions(gesture, into(fromGesture));
  propertySuggestions(gesture, into(fromRoom));

  const suggestions = [];
  const seen = [];
  const take = (list, limit)=>{
    for(const suggestion of list) {
      if(suggestions.length >= limit)
        return;
      const key = JSON.stringify(suggestion.operation);
      if(seen.indexOf(key) != -1)
        continue;
      seen.push(key);
      suggestions.push(suggestion);
    }
  };

  const roomShare = Math.min(fromRoom.length, Math.floor(routineSuggestionLimit/2));
  take(fromGesture, routineSuggestionLimit - roomShare);
  take(fromRoom, routineSuggestionLimit);
  take(fromGesture, routineSuggestionLimit);
  return suggestions;
}

function reparentSuggestions(gesture, add, collections=[]) {
  const { from, to, widgetID } = gesture;
  const face = changedDuringGesture(gesture, widgetID, 'activeFace');

  if(to === null) {
    // out of a holder onto the table: the only operation that puts a widget at a
    // spot of its own is MOVEXY, and it takes them out of a holder
    if(isHolderLike(from)) {
      add('take one out onto the table', { func: 'MOVEXY', from, count: 1, x: gesture.x, y: gesture.y });
      add('take all of them out', { func: 'MOVEXY', from, count: 'all', x: gesture.x, y: gesture.y });
    }
    // x and y are counted from whatever the widget is in, so taking it out on
    // its own drops it wherever its old coordinates land in the room. The two
    // that follow are what makes it stay where it was let go of - which is why
    // they say "and", the way the clauses of one gesture do.
    add('just take it out of whatever it is in', { func: 'SET', property: 'parent', value: null, collection: [ widgetID ] });
    add('and put it exactly there', { func: 'SET', property: 'x', value: gesture.x, collection: [ widgetID ] });
    add('and at that height', { func: 'SET', property: 'y', value: gesture.y, collection: [ widgetID ] });
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
  // "whatever an earlier operation picked" is the DEFAULT collection, which only
  // exists once something in the routine before this point has filled it -
  // offering it anywhere else writes an operation that is an error as soon as it
  // is added ("no input given and collection DEFAULT is undefined")
  if(collections.indexOf('DEFAULT') != -1)
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

// Rolling a die is the one thing a routine does by clicking rather than by an
// operation of its own: a die that is clicked and has nothing else to do rolls
// (see Dice.click). So the roll IS the click, told to leave out whatever would
// stop it - a click routine the author gave the die instead, or a die players
// are not allowed to click at all.
function diceRollOperation(widget, collection) {
  const routine = Array.isArray(widget.get('clickRoutine'));
  const clickable = Boolean(widget.get('clickable'));
  const mode = routine && !clickable ? 'ignoreAll' : routine ? 'ignoreClickRoutine' : !clickable ? 'ignoreClickable' : null;
  return mode ? { func: 'CLICK', collection, mode } : { func: 'CLICK', collection };
}

// what the die shows on that face, for the aside next to the operation:
// activeFace counts the faces from 0, and a die nearly always has something
// else printed on them
function diceFaceValue(widget, face) {
  const values = typeof widget.getValueMap == 'function' ? widget.getValueMap() : [];
  const value = values[face];
  return value === undefined || value === null || typeof value == 'object' ? null : String(value);
}

// a die that has no faces yet - one just added to the room, one whose faces are
// still being typed - counts them modulo zero, which is not a face to put it on
function diceActiveFace(widget) {
  const face = typeof widget.activeFace == 'function' ? widget.activeFace() : Math.round(widget.get('activeFace'));
  return Number.isFinite(face) ? face : 0;
}

function clickSuggestions(gesture, add) {
  const { widgetID, type, widget } = gesture;
  const collection = [ widgetID ];

  // Clicking a die rolls it and setting its face puts it on one on purpose, so
  // both are offered in those words - and before the plain click below, which
  // for a die is the same operation under a name that never says "roll".
  if(type == 'dice') {
    add('roll it the way clicking it does', diceRollOperation(widget, collection));
    const face = diceActiveFace(widget);
    const shows = diceFaceValue(widget, face);
    add(`put it on a face instead of rolling it${shows === null ? '' : ` - it is showing ${shows}`}`, { func: 'SET', property: 'activeFace', value: face, collection });
  }

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
}

// What the room did by itself while the gesture ran - the properties a holder,
// a routine or a legacy mode set on the way. They are what a recording adds over
// watching the pointer: a drop that turns the card face up says so.
function propertySuggestions(gesture, add) {
  for(const id in gesture.changes) {
    const changes = gesture.changes[id];
    const widget = routineRecorderWidget(id);
    if(!changes || typeof changes != 'object' || !widget)
      continue;
    for(const property in changes) {
      if(routineRecorderIgnoredProperties.indexOf(property) != -1 || property.charAt(0) == '_' || property.match(/Routine$/))
        continue;
      const value = changes[property];
      const collection = [ id ];
      // FLIP only turns over what has a flip() of its own (a card, a basic
      // widget); it passes silently over a die or a spinner, whose faces are
      // reached by setting the face instead
      if(property == 'activeFace' && typeof value == 'number')
        add(`${id} ended up on that face`, typeof widget.flip == 'function'
          ? { func: 'FLIP', collection, face: value }
          : { func: 'SET', property, value, collection });
      else if(property == 'rotation' && typeof value == 'number')
        add(`${id} ended up turned that way`, { func: 'ROTATE', collection, mode: 'set', angle: value });
      else if(value === null || [ 'string', 'number', 'boolean' ].indexOf(typeof value) != -1)
        add(`${id} got ${property} while you did that`, { func: 'SET', property, value, collection });
    }
  }
}
