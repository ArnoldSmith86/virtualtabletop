import { toServer } from './connection.js';
import { $, $a, onLoad, unescapeID, mapAssetURLs } from './domhelpers.js';
import { getElementTransformRelativeTo } from './geometry.js';
import { playerName } from './overlays/players.js';

let roomID = normalizeRoomID(self.location.pathname.replace(/.*\//, ''));
let isLoading = true;

export const widgets = new Map();

let deferredCards = {};
let deferredChildren = {};

let delta = { s: {} };
let deltaChanged = false;
let deltaID = 0;
let batchDepth = 0;
let overlayShownForEmptyRoom = false;

let triggerGameStartRoutineOnNextStateLoad = false;

let undoProtocol = [];

function normalizeRoomID(roomID) {
  if(!config.roomNamesCaseSensitive)
    roomID = roomID.toLowerCase();
  return roomID;
}

function applyCustomCss(gameSettings) {
  let style = document.getElementById('globalCss');
  if (style)
    style.innerHTML = '';
  if (gameSettings && (gameSettings.globalCss || gameSettings.cursorCss)) {
    if (!style) {
      style = document.createElement('style');
      style.id = 'globalCss';
      document.head.appendChild(style);
    }
    const cssText = (gameSettings.globalCss || '') + (gameSettings.cursorCss ? '\n\n' + gameSettings.cursorCss : '');
    style.appendChild(document.createTextNode(mapAssetURLs(cssText)));
  }
}

function generateUniqueWidgetID() {
  let id;
  do {
    id = rand().toString(36).substring(3, 7);
  } while (widgets.has(id));
  return id;
}

export function addWidget(widget, instance) {
  if(widget.parent && !widgets.has(widget.parent)) {
    if(!deferredChildren[widget.parent])
      deferredChildren[widget.parent] = [];
    deferredChildren[widget.parent].push(widget);
    return;
  }

  const id = widget.id;
  if(!id) {
    console.error(`Could not add widget!`, widget, 'widget without ID');
    return;
  }

  let w;

  if(instance != undefined) {
    w = instance;
  } else if(widget.type == 'card') {
    if(widgets.has(widget.deck)) {
      if(widgets.get(widget.deck).get('type') == 'deck') {
        w = new Card(id);
      } else {
        console.error(`Could not add widget!`, widget, 'card with invalid deck');
        return;
      }
    } else {
      if(!deferredCards[widget.deck])
        deferredCards[widget.deck] = [];
      deferredCards[widget.deck].push(widget);
      return;
    }
  } else if(widget.type == 'button') {
    w = new Button(id);
  } else if(widget.type == 'canvas') {
    w = new Canvas(id);
  } else if(widget.type == 'deck') {
    w = new Deck(id);
  } else if(widget.type == 'dice') {
    w = new Dice(id);
  } else if(widget.type == 'holder') {
    w = new Holder(id);
  } else if(widget.type == 'label') {
    w = new Label(id);
  } else if(widget.type == 'pile') {
    w = new Pile(id);
  } else if(widget.type == 'scoreboard') {
    w = new Scoreboard(id);
  } else if(widget.type == 'seat') {
    w = new Seat(id);
  } else if(widget.type == 'spinner') {
    w = new Spinner(id);
  } else if(widget.type == 'timer') {
    w = new Timer(id);
  } else {
    w = new BasicWidget(id);
  }

  try {
    widgets.set(widget.id, w);
    w.applyInitialDelta(widget);
  } catch(e) {
    console.error(`Could not add widget!`, widget, e);
    removeWidget(widget.id);
    return;
  }

  if(widget.type == 'deck')
    for(const c of deferredCards[widget.id] || [])
      addWidget(c);
  delete deferredCards[widget.id];

  for(const c of deferredChildren[widget.id] || [])
    addWidget(c);
  delete deferredChildren[widget.id];
}

async function addWidgetLocal(widget) {
  if (!widget.id)
    widget.id = generateUniqueWidgetID();
  else
    widget.id = String(widget.id);

  if(widget.parent && !widgets.has(widget.parent)) {
    console.error(`Refusing to add widget ${widget.id} with invalid parent ${widget.parent}.`);
    return null;
  }

  if(widget.type == 'card' && widget.deck && !widgets.has(widget.deck)) {
    console.error(`Refusing to add widget ${widget.id} with invalid deck ${widget.deck}.`);
    return null;
  }

  if(widget.type == 'card' && widget.deck && !widgets.get(widget.deck).get('cardTypes')[widget.cardType]) {
    console.error(`Refusing to add widget ${widget.id} with invalid cardType ${widget.cardType}.`);
    return null;
  }

  const isNewWidget = !widgets.has(widget.id);
  if(isNewWidget)
    addWidget(widget);
  sendPropertyUpdate(widget.id, widget);
  sendDelta();
  batchStart();
  if(isNewWidget)
    for(const [ w, routine ] of StateManaged.globalUpdateListeners['id'] || [])
      await w.evaluateRoutine(routine, { widgetID: widget.id, oldValue: null, value: widget.id }, { widget: [ widgets.get(widget.id) ] });
  batchEnd();
  return widget.id;
}

async function updateWidgetId(widget, oldID) {
  const children = Widget.prototype.children.call(widgets.get(oldID)); // use Widget.children even for holders so it doesn't filter
  const cards = widgetFilter(w=>w.get('deck')==oldID);

  for(const child of children)
    sendPropertyUpdate(child.get('id'), 'parent', null);
  for(const card of cards)
    sendPropertyUpdate(card.get('id'), 'deck', null);
  await removeWidgetLocal(oldID, true);
  
  const id = await addWidgetLocal(widget);

  // Restore children
  for(const child of children)
    sendPropertyUpdate(child.get('id'), 'parent', id);
  for(const card of cards)
    sendPropertyUpdate(card.get('id'), 'deck', id);

  // Change inheritFrom on widgets inheriting from altered widget
  for (const inheritor of StateManaged.inheritFromMapping[oldID]) {
    const oldInherits = inheritor.get('inheritFrom');
    let newInherits;
    if(typeof oldInherits == "string") {
      newInherits = id;
    } else {
      newInherits = {...oldInherits};
      newInherits[id] = newInherits[oldID];
      delete newInherits[oldID]
    }
    await inheritor.set('inheritFrom', newInherits)
  };

  // Change dropTargets that specifially target the old ID
  for(const [ _, t ] of dropTargets) {
    const originalDropTarget = JSON.stringify(t.get('dropTarget'));
    const dropTarget = JSON.parse(originalDropTarget);
    if(dropTarget && dropTarget.id == oldID)
      dropTarget.id = id;
    if(Array.isArray(dropTarget))
      for(const d of dropTarget)
        if(d && d.id == oldID)
          d.id = id;
    if(originalDropTarget != JSON.stringify(dropTarget))
      await t.set('dropTarget', dropTarget);
  }

  // Update references in routines
  const updateParam = function(a, func, param) {
    if(a.func == func && Array.isArray(a[param])) {
      const index = a[param].indexOf(oldID);
      if(index != -1)
        a[param][index] = id;
    } else if(a.func == func && a[param] == oldID) {
      a[param] = id;
    }
  };
  for(const [ _, w ] of widgets) {
    for(const [ key, value ] of Object.entries(w.state)) {
      if(key.endsWith('Routine') && Array.isArray(value)) {
        const json = JSON.stringify(value);
        const copy = JSON.parse(json);

        for(const a of copy) {
          updateParam(a, 'CALL', 'widget');
          updateParam(a, 'CANVAS', 'canvas');
          updateParam(a, 'COUNT', 'holder');
          updateParam(a, 'FLIP', 'holder');
          updateParam(a, 'LABEL', 'label');
          updateParam(a, 'MOVE', 'from');
          updateParam(a, 'MOVE', 'to');
          updateParam(a, 'MOVEXY', 'from');
          updateParam(a, 'RECALL', 'holder');
          updateParam(a, 'ROTATE', 'holder');
          updateParam(a, 'SCORE', 'seats');
          updateParam(a, 'SHUFFLE', 'holder');
          updateParam(a, 'SORT', 'holder');
          updateParam(a, 'TIMER', 'timer');

          if(a.func == 'SELECT' && !a.property || [ 'parent', 'id', 'deck' ].includes(a.property)) {
            if(a.value == oldID)
              a.value = id;
            else if(Array.isArray(a.value) && a.value.indexOf(oldID) != -1)
              a.value[a.value.indexOf(oldID)] = id;
          }

          for(const property of [ 'collection', 'source' ]) {
            if(Array.isArray(a[property])) {
              const index = a[property].indexOf(oldID);
              if(index != -1)
                a[property][index] = id;
            }
          }
        }

        let newJSON = JSON.stringify(copy).replace(/\$\{PROPERTY [^}]+ OF ([^}]+)\}/g, (match, p1) => {
          if(p1 == oldID)
            return match.replace(regexEscape(p1), id);
          return match;
        });

        if(newJSON != json)
          await w.set(key, JSON.parse(newJSON));
      }
    }
  }

  // If widget is a deck, update dropTarget properties on holder widgets.
  if (widget.type === 'deck') {
    for (const w of widgetFilter(w => w.get('dropTarget') && asArray(w.get('dropTarget')).some(d => d && d.deck === oldID))) {
      if(Array.isArray(w.get('dropTarget'))) {
        const dropTarget = w.get('dropTarget').map(d =>
          d && d.deck === oldID ? { ...d, deck: id } : d
        );
        await w.set('dropTarget', dropTarget);
      } else {
        await w.set('dropTarget', { ...w.get('dropTarget'), deck: id });
      }
    }
  }

  // If widget is a seat, change widgets with onlyVisibleForSeat and linkedToSeat naming that seat.
  if(widget.type == 'seat') {
    for(const prop of ['onlyVisibleForSeat', 'linkedToSeat']) {
      for(const w of widgetFilter(w => w.get(prop) && asArray(w.get(prop)).includes(oldID))) {
        if(typeof w.get(prop) === 'string') {
          await w.set(prop, id)
        } else {
          const vis = [...w.get(prop)];
          vis[vis.indexOf(oldID)] = id;
          await w.set(prop, vis)
        }
      }
    }
  }

  // Finally, change any seats that use the old id as a hand.
  for(const w of widgetFilter(w => w.get('type') == 'seat' && w.get('hand') == oldID))
    await w.set('hand', id);
}

export function batchStart() {
  ++batchDepth;
}

export function batchEnd() {
  --batchDepth;
  sendDelta();
}

export function flushDelta() {
  const currentBatchDepth = batchDepth;
  const currentDeltaCause = delta.c;
  batchDepth = 0;
  sendDelta();
  if(currentDeltaCause)
    delta.c = currentDeltaCause;
  batchDepth = currentBatchDepth;
}

function setDeltaCause(cause) {
  if(!delta.c)
    delta.c = cause;
}

function getDeltaID() {
  return deltaID;
}

function receiveDelta(delta) {
  addDeltaEntryToUndoProtocol(delta);

  // the order of widget changes is not necessarily correct and in order to avoid cyclic children, this first moves affected widgets to the top level
  for(const widgetID in delta.s)
    if(delta.s[widgetID] && delta.s[widgetID].parent !== undefined && delta.s[widgetID].id === undefined)
      widgets.get(widgetID).setLimbo(true);

  for(const widgetID in delta.s)
    if(delta.s[widgetID] !== null && !widgets.has(widgetID))
      addWidget(delta.s[widgetID]);

  for(const widgetID in delta.s) {
    if(delta.s[widgetID] !== null && widgets.has(widgetID)) { // check widgets.has because addWidget above MIGHT have failed
      if(delta.s[widgetID].type !== undefined && delta.s[widgetID].type !== widgets.get(widgetID).get('type')) {
        const currentState = widgets.get(widgetID).state;
        removeWidget(widgetID);
        addWidget(Object.assign(currentState, delta.s[widgetID]));
        for(const child of widgetFilter(w=>w.get('parent')===widgetID))
          child.applyDelta({ parent: widgetID });
      } else {
        widgets.get(widgetID).applyDelta(delta.s[widgetID]);
      }
    }
  }

  for(const widgetID in delta.s)
    if(delta.s[widgetID] === null && widgets.has(widgetID))
      removeWidget(widgetID);

  if(typeof edit != 'undefined' && edit)
    editorReceiveDelta(delta);
}

function mergeDeltas(firstDelta, secondDelta) {
  const merged = {};
  for(const widgetID in firstDelta) {
    if(firstDelta[widgetID] !== null && secondDelta[widgetID] !== null)
      merged[widgetID] = Object.assign({}, firstDelta[widgetID], secondDelta[widgetID] || {});
    else if(firstDelta[widgetID] === null && secondDelta[widgetID] !== undefined) {
      console.log("merging failed", firstDelta[widgetID], secondDelta[widgetID]);
      return null; // a widget was removed and then another one added with the same ID; a merged delta would have to know which properties the widget had before the first delta removed it in order to unset those
    } else
      merged[widgetID] = null;
  }
  for(const widgetID in secondDelta)
    if(merged[widgetID] === undefined)
      merged[widgetID] = secondDelta[widgetID];
  return merged;
}

function addDeltaEntryToUndoProtocol(delta) {
  const undoDelta = {};

  for(const widgetID in delta.s) {
    if(delta.s[widgetID] === null) {
      if(widgets.has(widgetID))
        undoDelta[widgetID] = JSON.parse(JSON.stringify(widgets.get(widgetID).unalteredState));
    } else if(delta.s[widgetID].id) {
      undoDelta[widgetID] = null;
    } else {
      undoDelta[widgetID] = {};
      for(const property in delta.s[widgetID]) {
        undoDelta[widgetID][property] = widgets.get(widgetID).unalteredState[property];
        if(typeof undoDelta[widgetID][property] == 'undefined')
          undoDelta[widgetID][property] = null;
      }
    }
  }

  // merge with previous delta if it's the same cause
  if(undoProtocol.length && delta.c && delta.c === undoProtocol[undoProtocol.length-1].delta.c) {
    const mergedUndoDelta = mergeDeltas(undoDelta, undoProtocol[undoProtocol.length-1].undoDelta);
    const mergedRedoDelta = mergeDeltas(undoProtocol[undoProtocol.length-1].delta.s, delta.s);

    if(mergedUndoDelta && mergedRedoDelta) {
      undoProtocol[undoProtocol.length-1].undoDelta = mergedUndoDelta;
      undoProtocol[undoProtocol.length-1].delta.s   = mergedRedoDelta;
      return;
    }
  }

  undoProtocol.push({ delta, undoDelta });
}

function addStateEntryToUndoProtocol(state) {
  const undoDelta = {};
  const redoDelta = {...state};
  delete redoDelta._meta;


  for(const id in redoDelta)
    undoDelta[id] = null;

  for(const [ id, widget ] of widgets) {
    if(!redoDelta[id])
      redoDelta[id] = null;

    undoDelta[id] = widget.unalteredState;

    // unset properties of widgets with same ID
    if(redoDelta[id]) {
      for(const property in redoDelta[id])
        if(typeof undoDelta[id][property] == 'undefined')
          undoDelta[id][property] = null;
      for(const property in undoDelta[id])
        if(typeof redoDelta[id][property] == 'undefined')
          redoDelta[id][property] = null;
    }
  }

  undoProtocol.push({ delta: {s:redoDelta,c:'received complete room state'}, undoDelta });
}

function getUndoProtocol() {
  return undoProtocol;
}

function setUndoProtocol(up) {
  undoProtocol = up;
}

function getDelta() {
  return delta;
}

function sendRawDelta(delta) {
  receiveDelta(delta);
  delta.id = deltaID;
  toServer('delta', delta);
}

function receiveDeltaFromServer(delta) {
  deltaID = delta.id;
  receiveDelta(delta);
}

function receiveStateFromServer(args) {
  addStateEntryToUndoProtocol(args);

  // these might only be updated _after_ loading the state but some of the legacy modes need to be applied immediately
  currentGameSettings = args._meta.gameSettings || {};

  mouseTarget = null;
  deltaID = args._meta.deltaID;
  const topSurface = $('#topSurface');
  for(const widget of widgetFilter(w=>w.domElement.parentElement === topSurface))
    widget.applyRemoveRecursive();
  widgets.clear();
  dropTargets.clear();
  maxZ = {};
  StateManaged.globalUpdateListeners = {};
  StateManaged.inheritFromMapping = {};
  let isEmpty = true;
  for(const widgetID in args) {
    if(widgetID != '_meta') {
      if(widgetID != args[widgetID].id) {
        console.error(`Could not add widget!`, widgetID, args[widgetID], 'ID does not equal key in state');
        continue;
      }
      addWidget(args[widgetID]);
      isEmpty = false;
    }
  }

  if(Object.keys(deferredCards).length) {
    for(const [ deckID, widgets ] of Object.entries(deferredCards))
      for(const widget of widgets)
        console.error(`Could not add card "${widget.id}" because its deck "${deckID}" does not exist!`);
    deferredCards = {};
  }
  if(Object.keys(deferredChildren).length) {
    for(const [ deckID, widgets ] of Object.entries(deferredChildren))
      for(const widget of widgets)
        console.error(`Could not add widget "${widget.id}" because its parent "${deckID}" does not exist!`);
    deferredChildren = {};
  }

  resetZoomAndPan();

  if(isLoading) {
    $('#loadingRoomIndicator').remove();
    $('body').classList.remove('loading');
    isLoading = false;
    if(!$('.active.toolbarTab'))
      $('#activeGameButton').click();
  }

  if(isEmpty && !edit && !overlayShownForEmptyRoom && !urlProperties.load && !urlProperties.askID) {
    if(urlProperties.about) {
      $('#aboutButton').click();
    } else {
      $('#statesButton').click();
    }
    overlayShownForEmptyRoom = true;
  }

  toServer('confirm');

  if(typeof jeEnabled != 'undefined' && jeEnabled)
    jeApplyState(args);

  cancelInputOverlay();

  if(triggerGameStartRoutineOnNextStateLoad) {
    triggerGameStartRoutineOnNextStateLoad = false;
    (async function() {
      batchStart();
      for(const [ id, w ] of widgets)
        if(w.get('gameStartRoutine'))
          await w.evaluateRoutine('gameStartRoutine', { widgetID: id }, { widget: [ w ] });
      batchEnd();
    })();
  }
}

function cancelInputOverlay() {
  if($('#activeGameButton[data-overlay=buttonInputOverlay]')) {
    delete $('#activeGameButton').dataset.overlay;
    if($('#buttonInputOverlay').style.display == 'flex')
      showOverlay();

    delta = { s: {} };
    deltaChanged = false;
    batchDepth = 0;
  }
}

function removeWidget(widgetID) {
  try {
    widgets.get(widgetID).applyRemove();
  } catch(e) {
    console.error(`Could not remove widget!`, widgetID, e);
  }
  widgets.delete(widgetID);
  dropTargets.delete(widgetID);
}

async function removeWidgetLocal(widgetID, keepChildren) {
  function getWidgetsToRemove(widgetID) {
    const children = [];
    if(!keepChildren)
      for(const [ childWidgetID, childWidget ] of widgets)
        if(!childWidget.inRemovalQueue && (childWidget.get('parent') == widgetID || childWidget.get('deck') == widgetID))
          children.push(...getWidgetsToRemove(childWidgetID));
    widgets.get(widgetID).inRemovalQueue = true;
    children.push(widgets.get(widgetID));
    return children;
  }

  if(widgets.get(widgetID).inRemovalQueue)
    return;

  for(const w of getWidgetsToRemove(widgetID)) {
    w.isBeingRemoved = true;
    // don't actually set deck and parent to null (only pretend to) because when "receiving" the delta, the applyRemove has to find the parent
    await w.onPropertyChange('deck', w.get('deck'), null);
    if(!w.isLimbo)
      await w.onPropertyChange('parent', w.get('parent'), null);
    sendPropertyUpdate(w.id, null);
  }
}

function sendDelta() {
  if(!batchDepth) {
    if(deltaChanged) {
      receiveDelta(delta);
      delta.id = deltaID;
      toServer('delta', delta);
    }
    delta = { s: {} };
    deltaChanged = false;
  }
}

export function sendPropertyUpdate(widgetID, property, value) {
  if(property === null || typeof property === 'object') {
    delta.s[widgetID] = property;
  } else {
    if(delta.s[widgetID] === undefined)
      delta.s[widgetID] = {};
    if(delta.s[widgetID] !== null)
      delta.s[widgetID][property] = value;
  }
  deltaChanged = true;
  sendDelta();
}

export function widgetFilter(callback) {
  return Array.from(widgets.values()).filter(w=>!w.isBeingRemoved).filter(callback);
}

// --- Remote & multi-player INPUT ------------------------------------------
// INPUT with a `player` parameter shows the overlay on the listed player(s)
// and sends each player's result back to the initiating client, which keeps
// running the routine. When `player` is a list, the fields' variables come
// back keyed by player name (e.g. choosing cards to pass in Hearts).
// A `block` parameter shows every other player a "waiting for input" overlay
// (with a cancel button) while the input is pending.

// A per-page-load token keeps session IDs unique even between two clients that
// happen to share a player name. Uses crypto instead of the seeded game RNG:
// session IDs are transport-level identifiers, not game state, so they must
// not consume rand() (would break test determinism) nor be predictable.
const inputClientToken = crypto.randomUUID();
let inputSessionCounter = 0;
// Keyed by session IDs that may originate from another client, so use
// null-prototype objects to avoid __proto__/constructor key surprises.
const inputSessions = Object.create(null);       // initiator side: sessionID -> session
const remoteInputHandles = Object.create(null);  // target side:    sessionID -> overlay handle

function serializeCollections(collections) {
  const ids = {};
  for(const c in (collections || {}))
    ids[c] = (collections[c] || []).map(w=>w && w.get('id')).filter(Boolean);
  return ids;
}

function resolveCollections(ids) {
  const collections = {};
  for(const c in (ids || {}))
    collections[c] = (ids[c] || []).map(id=>widgets.get(id)).filter(Boolean);
  return collections;
}

// Run an INPUT for one or more players. `showLocal` (optional) is called when
// the initiator itself is among the players; it shows the overlay locally and
// resolves to { variables, collections }. Resolves to a map
// playerName -> { variables, collections }, or rejects if the input is
// cancelled (by a target, by the initiator or via the block overlay).
export function runInput({ widgetID, overlay, players, variables, collections, showLocal }) {
  const sessionID = `${inputClientToken}-${++inputSessionCounter}`;
  const remoteTargets = players.filter(p=>p && p!==playerName);
  const includeSelf = players.includes(playerName);
  const collectionIDs = serializeCollections(collections);

  return new Promise((resolve, reject) => {
    const session = {
      remaining: new Set([ ...remoteTargets, ...(includeSelf ? [ playerName ] : []) ]),
      results: {},
      block: !!overlay.block,
      hasRemote: remoteTargets.length > 0,
      localAbort: null,
      done: false
    };
    inputSessions[sessionID] = session;

    const cleanup = ()=>{
      session.done = true;
      delete inputSessions[sessionID];
      if(session.block)
        endInputBlock(sessionID);
    };

    session.complete = ()=>{
      if(session.done || session.remaining.size)
        return;
      const results = session.results;
      cleanup();
      resolve(results);
    };

    session.cancel = ()=>{
      if(session.done)
        return;
      cleanup();
      if(session.hasRemote)
        toServer('abortInput', { sessionID });
      if(session.localAbort)
        session.localAbort();
      reject(new Error('INPUT cancelled'));
    };

    if(session.block)
      startInputBlock(sessionID, players, overlay.header);

    if(includeSelf && showLocal) {
      showLocal(abort=>{ session.localAbort = abort; })
        .then(result=>{
          if(session.done)
            return;
          session.results[playerName] = result;
          session.remaining.delete(playerName);
          // The initiator answered its own overlay; if others are still pending
          // and we're blocking, join the "waiting for the rest" overlay.
          if(session.block && session.remaining.size)
            toServer('inputBlockAnswered', { sessionID });
          session.complete();
        })
        .catch(()=>session.cancel());
    }

    if(remoteTargets.length) {
      flushDelta();
      toServer('requestInput', { sessionID, widgetID, overlay, variables, collections: collectionIDs, targets: remoteTargets });
    }

    if(!session.remaining.size)
      session.complete();
  });
}

// Target side: show the requested overlay and send the result back.
async function receiveShowInput(args) {
  const widget = widgets.get(args.widgetID);
  // Refuse if the widget is gone or the player is already busy with another
  // input overlay (their own or an earlier session) — clobbering the open
  // overlay would let one click resolve both with the wrong data.
  const busy = Object.keys(remoteInputHandles).length || $('#activeGameButton').dataset.overlay === 'buttonInputOverlay';
  if(!widget || busy) {
    toServer('inputResult', { sessionID: args.sessionID, cancelled: true });
    return;
  }
  const collections = resolveCollections(args.collections);
  // Mirror evaluateRoutine's getCollection: an array source becomes a named
  // collection built from those widget IDs, so `choose` fields with an array
  // `source` work on remote clients too.
  const getCollection = source=>{
    if(Array.isArray(collections[source]))
      return source;
    if(Array.isArray(source)) {
      collections['$remoteSource'] = widgetFilter(w=>source.indexOf(w.id) != -1);
      return '$remoteSource';
    }
    return 'DEFAULT';
  };
  const handle = { aborted: false };
  remoteInputHandles[args.sessionID] = handle;
  try {
    const result = await widget.showInputOverlay(args.overlay, widgets, args.variables || {}, collections, getCollection, [], handle);
    delete remoteInputHandles[args.sessionID];
    if(!handle.aborted)
      toServer('inputResult', { sessionID: args.sessionID, cancelled: false, variables: result.variables, collections: serializeCollections(result.collections) });
  } catch(e) {
    delete remoteInputHandles[args.sessionID];
    if(!handle.aborted)
      toServer('inputResult', { sessionID: args.sessionID, cancelled: true });
  }
}

// Target side: the initiator (or a cancel) asked us to close the overlay.
function receiveHideInput(args) {
  const handle = remoteInputHandles[args.sessionID];
  if(handle) {
    handle.aborted = true;
    delete remoteInputHandles[args.sessionID];
    if(handle.abort)
      handle.abort();
  }
}

// Initiator side: a player's result (or cancellation) came back.
function receiveInputResult(args) {
  const session = inputSessions[args.sessionID];
  if(!session)
    return;
  if(args.cancelled) {
    session.cancel();
    return;
  }
  session.results[args.player] = { variables: args.variables || {}, collections: resolveCollections(args.collections) };
  session.remaining.delete(args.player);
  session.complete();
}

// Initiator side: someone pressed cancel on the block overlay.
function receiveInputCancelled(args) {
  const session = inputSessions[args.sessionID];
  if(session)
    session.cancel();
}

// --- INPUT block overlay --------------------------------------------------
const activeInputBlocks = new Map();

function startInputBlock(sessionID, waitingFor, header) {
  toServer('inputBlock', { blockID: sessionID, show: true, waitingFor, header });
}

function endInputBlock(sessionID) {
  toServer('inputBlock', { blockID: sessionID, show: false });
}

function receiveInputBlock(args) {
  if(args.show)
    activeInputBlocks.set(args.blockID, args);
  else
    activeInputBlocks.delete(args.blockID);
  updateInputBlockOverlay();
}

function updateInputBlockOverlay() {
  const shown = $('#inputBlockOverlay').style.display != 'none';
  if(!activeInputBlocks.size) {
    if(shown)
      showOverlay(null);
    return;
  }
  const lines = [];
  for(const block of activeInputBlocks.values()) {
    const names = (block.waitingFor || []).join(', ');
    lines.push((block.header ? block.header + ' — ' : '') + `Waiting for input from ${names}…`);
  }
  $('#inputBlockText').textContent = lines.join('\n');
  // Don't steal the screen from a player who is filling in their own input
  // overlay, and only toggle showOverlay when actually transitioning to shown
  // (showOverlay flips visibility if the overlay is already open).
  if(!shown && $('#activeGameButton').dataset.overlay !== 'buttonInputOverlay')
    showOverlay('inputBlockOverlay');
}

// Cancel every input the local player is currently waiting on.
function cancelInputBlocks() {
  for(const blockID of activeInputBlocks.keys())
    toServer('cancelInput', { blockID });
}

onLoad(function() {
  onMessage('delta', receiveDeltaFromServer);
  onMessage('state', receiveStateFromServer);
  onMessage('showInput', receiveShowInput);
  onMessage('hideInput', receiveHideInput);
  onMessage('inputResult', receiveInputResult);
  onMessage('inputCancelled', receiveInputCancelled);
  onMessage('inputBlock', receiveInputBlock);
  if($('#inputBlockCancel'))
    $('#inputBlockCancel').addEventListener('click', cancelInputBlocks);
  onMessage('meta', (args) => {
    if(args.meta) {
      applyCustomCss(args.meta.gameSettings);
    }
  });
  setScale();
});
