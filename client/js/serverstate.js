import { toServer } from './connection.js';
import { $, $a, onLoad, unescapeID } from './domhelpers.js';
import { getElementTransformRelativeTo } from './geometry.js';

let roomID = self.location.pathname.replace(/.*\//, '');
let isLoading = true;

export const topSurface = new Surface($('#topSurface'));

let deltaID = 0;
let overlayShownForEmptyRoom = false;

let triggerGameStartRoutineOnNextStateLoad = false;

function generateUniqueWidgetID(surface) {
  let id;
  do {
    id = rand().toString(36).substring(3, 7);
  } while (surface.widgets.has(id));
  return id;
}

export function addWidget(surface, widget, instance) {
  if(widget.parent && !surface.widgets.has(widget.parent)) {
    if(!surface.deferredChildren[widget.parent])
      surface.deferredChildren[widget.parent] = [];
    surface.deferredChildren[widget.parent].push(widget);
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
    if(surface.widgets.has(widget.deck)) {
      if(surface.widgets.get(widget.deck).get('type') == 'deck') {
        w = new Card(surface, id);
      } else {
        console.error(`Could not add widget!`, widget, 'card with invalid deck');
        return;
      }
    } else {
      if(!surface.deferredCards[widget.deck])
        surface.deferredCards[widget.deck] = [];
      surface.deferredCards[widget.deck].push(widget);
      return;
    }
  } else if(widget.type == 'button') {
    w = new Button(surface, id);
  } else if(widget.type == 'canvas') {
    w = new Canvas(surface, id);
  } else if(widget.type == 'deck') {
    w = new Deck(surface, id);
  } else if(widget.type == 'dice') {
    w = new Dice(surface, id);
  } else if(widget.type == 'holder') {
    w = new Holder(surface, id);
  } else if(widget.type == 'label') {
    w = new Label(surface, id);
  } else if(widget.type == 'pile') {
    w = new Pile(surface, id);
  } else if(widget.type == 'scoreboard') {
    w = new Scoreboard(surface, id);
  } else if(widget.type == 'seat') {
    w = new Seat(surface, id);
  } else if(widget.type == 'spinner') {
    w = new Spinner(surface, id);
  } else if(widget.type == 'timer') {
    w = new Timer(surface, id);
  } else {
    w = new BasicWidget(surface, id);
  }

  try {
    surface.widgets.set(widget.id, w);
    w.applyInitialDelta(widget);
  } catch(e) {
    console.error(`Could not add widget!`, widget, e);
    removeWidget(surface, widget.id);
    return;
  }

  if(widget.type == 'deck')
    for(const c of surface.deferredCards[widget.id] || [])
      addWidget(surface, c);
  delete surface.deferredCards[widget.id];

  for(const c of surface.deferredChildren[widget.id] || [])
    addWidget(surface, c);
  delete surface.deferredChildren[widget.id];
}

async function addWidgetLocal(surface, widget) {
  if (!widget.id)
    widget.id = surface.generateUniqueWidgetID();
  else
    widget.id = String(widget.id);

  if(widget.parent && !surface.widgets.has(widget.parent)) {
    console.error(`Refusing to add widget ${widget.id} with invalid parent ${widget.parent}.`);
    return null;
  }

  if(widget.type == 'card' && widget.deck && !surface.widgets.has(widget.deck)) {
    console.error(`Refusing to add widget ${widget.id} with invalid deck ${widget.deck}.`);
    return null;
  }

  if(widget.type == 'card' && widget.deck && !surface.widgets.get(widget.deck).get('cardTypes')[widget.cardType]) {
    console.error(`Refusing to add widget ${widget.id} with invalid cardType ${widget.cardType}.`);
    return null;
  }

  const isNewWidget = !surface.widgets.has(widget.id);
  if(isNewWidget)
    addWidget(surface, widget);
  sendPropertyUpdate(surface, widget.id, widget);
  sendDelta(surface);
  batchStart(surface);
  if(isNewWidget)
    for(const [ w, routine ] of surface.globalUpdateListeners['id'] || [])
      await w.evaluateRoutine(routine, { widgetID: widget.id, oldValue: null, value: widget.id }, { widget: [ surface.widgets.get(widget.id) ] });
  batchEnd(surface);
  return widget.id;
}

async function updateWidgetId(surface, widget, oldID) {
  const children = Widget.prototype.children.call(surface.widgets.get(oldID)); // use Widget.children even for holders so it doesn't filter
  const cards = surface.widgetFilter(w=>w.get('deck')==oldID);

  for(const child of children)
    sendPropertyUpdate(surface, child.get('id'), 'parent', null);
  for(const card of cards)
    sendPropertyUpdate(surface, card.get('id'), 'deck', null);
  await removeWidgetLocal(surface, oldID, true);
  
  const id = await addWidgetLocal(surface, widget);

  // Restore children
  for(const child of children)
    sendPropertyUpdate(surface, child.get('id'), 'parent', id);
  for(const card of cards)
    sendPropertyUpdate(surface, card.get('id'), 'deck', id);

  // Change inheritFrom on widgets inheriting from altered widget
  for (const inheritor of surface.inheritFromMapping[oldID]) {
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
  for(const [ _, t ] of surface.dropTargets) {
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
  for(const [ _, w ] of surface.widgets) {
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
    for (const w of surface.widgetFilter(w => w.get('dropTarget') && asArray(w.get('dropTarget')).some(d => d && d.deck === oldID))) {
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
      for(const w of surface.widgetFilter(w => w.get(prop) && asArray(w.get(prop)).includes(oldID))) {
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
  for(const w of surface.widgetFilter(w => w.get('type') == 'seat' && w.get('hand') == oldID))
    await w.set('hand', id);
}

export function batchStart(surface) {
  if(!surface)
    surface = topSurface;
  ++surface.batchDepth;
}

export function batchEnd(surface) {
  if(!surface)
    surface = topSurface;
  --surface.batchDepth;
  sendDelta(surface);
}

export function flushDelta() {
  const currentBatchDepth = topSurface.batchDepth;
  const currentDeltaCause = topSurface.delta.c;
  topSurface.batchDepth = 0;
  sendDelta();
  if(currentDeltaCause)
    topSurface.delta.c = currentDeltaCause;
  topSurface.batchDepth = currentBatchDepth;
}

function setDeltaCause(surface, cause) {
  if(typeof surface == 'string') {
    cause = surface;
    surface = topSurface;
  }
  if(!surface.delta.c)
    surface.delta.c = cause;
}

function getDeltaID() {
  return deltaID;
}

function receiveDelta(surface, delta) {
  addDeltaEntryToUndoProtocol(surface, delta);

  // the order of widget changes is not necessarily correct and in order to avoid cyclic children, this first moves affected widgets to the top level
  for(const widgetID in delta.s)
    if(delta.s[widgetID] && delta.s[widgetID].parent !== undefined && delta.s[widgetID].id === undefined)
      surface.widgets.get(widgetID).setLimbo(true);

  for(const widgetID in delta.s)
    if(delta.s[widgetID] !== null && !surface.widgets.has(widgetID))
      addWidget(surface, delta.s[widgetID]);

  for(const widgetID in delta.s) {
    if(delta.s[widgetID] !== null && surface.widgets.has(widgetID)) { // check widgets.has because addWidget above MIGHT have failed
      if(delta.s[widgetID].type !== undefined && delta.s[widgetID].type !== surface.widgets.get(widgetID).get('type')) {
        const currentState = surface.widgets.get(widgetID).state;
        removeWidget(surface, widgetID);
        addWidget(surface, Object.assign(currentState, delta.s[widgetID]));
        for(const child of surface.widgetFilter(w=>w.get('parent')===widgetID))
          child.applyDelta({ parent: widgetID });
      } else {
        surface.widgets.get(widgetID).applyDelta(delta.s[widgetID]);
      }
    }
  }

  for(const widgetID in delta.s)
    if(delta.s[widgetID] === null && surface.widgets.has(widgetID))
      removeWidget(surface, widgetID);

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

function addDeltaEntryToUndoProtocol(surface, delta) {
  const undoDelta = {};

  for(const widgetID in delta.s) {
    if(delta.s[widgetID] === null) {
      if(surface.widgets.has(widgetID))
        undoDelta[widgetID] = JSON.parse(JSON.stringify(surface.widgets.get(widgetID).unalteredState));
    } else if(delta.s[widgetID].id) {
      undoDelta[widgetID] = null;
    } else {
      undoDelta[widgetID] = {};
      for(const property in delta.s[widgetID]) {
        undoDelta[widgetID][property] = surface.widgets.get(widgetID).unalteredState[property];
        if(typeof undoDelta[widgetID][property] == 'undefined')
          undoDelta[widgetID][property] = null;
      }
    }
  }

  // merge with previous delta if it's the same cause
  if(surface.undoProtocol.length && delta.c && delta.c === surface.undoProtocol[surface.undoProtocol.length-1].delta.c) {
    const mergedUndoDelta = mergeDeltas(undoDelta, surface.undoProtocol[surface.undoProtocol.length-1].undoDelta);
    const mergedRedoDelta = mergeDeltas(surface.undoProtocol[surface.undoProtocol.length-1].delta.s, delta.s);

    if(mergedUndoDelta && mergedRedoDelta) {
      surface.undoProtocol[surface.undoProtocol.length-1].undoDelta = mergedUndoDelta;
      surface.undoProtocol[surface.undoProtocol.length-1].delta.s   = mergedRedoDelta;
      return;
    }
  }

  surface.undoProtocol.push({ delta, undoDelta });
}

function addStateEntryToUndoProtocol(surface, state) {
  const undoDelta = {};
  const redoDelta = {...state};
  delete redoDelta._meta;


  for(const id in redoDelta)
    undoDelta[id] = null;

  for(const [ id, widget ] of surface.widgets) {
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

  surface.undoProtocol.push({ delta: {s:redoDelta,c:'received complete room state'}, undoDelta });
}

function getUndoProtocol(surface) {
  return surface.undoProtocol;
}

function setUndoProtocol(surface, up) {
  surface.undoProtocol = up;
}

function getDelta(surface) {
  return surface.delta;
}

function sendRawDelta(delta) {
  receiveDelta(topSurface, delta);
  delta.id = deltaID;
  toServer('delta', delta);
}

function receiveDeltaFromServer(delta) {
  deltaID = delta.id;
  receiveDelta(topSurface, delta);
}

function receiveStateFromServer(args) {
  addStateEntryToUndoProtocol(topSurface, args);

  mouseTarget = null;
  deltaID = args._meta.deltaID;
  for(const widget of topSurface.widgetFilter(w=>w.domElement.parentElement === topSurface.domElement))
    widget.applyRemoveRecursive();
  topSurface.widgets.clear();
  topSurface.dropTargets.clear();
  topSurface.maxZ = {};
  topSurface.globalUpdateListeners = {};
  topSurface.inheritFromMapping = {};
  let isEmpty = true;
  for(const widgetID in args) {
    if(widgetID != '_meta') {
      if(widgetID != args[widgetID].id) {
        console.error(`Could not add widget!`, widgetID, args[widgetID], 'ID does not equal key in state');
        continue;
      }
      addWidget(topSurface, args[widgetID]);
      isEmpty = false;
    }
  }

  if(Object.keys(topSurface.deferredCards).length) {
    for(const [ deckID, widgets ] of Object.entries(topSurface.deferredCards))
      for(const widget of widgets)
        console.error(`Could not add card "${widget.id}" because its deck "${deckID}" does not exist!`);
    topSurface.deferredCards = {};
  }
  if(Object.keys(topSurface.deferredChildren).length) {
    for(const [ deckID, widgets ] of Object.entries(topSurface.deferredChildren))
      for(const widget of widgets)
        console.error(`Could not add widget "${widget.id}" because its parent "${deckID}" does not exist!`);
    topSurface.deferredChildren = {};
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
    $('#statesButton').click();
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
      for(const [ id, w ] of topSurface.widgets)
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

function removeWidget(surface, widgetID) {
  try {
    surface.widgets.get(widgetID).applyRemove();
  } catch(e) {
    console.error(`Could not remove widget!`, widgetID, e);
  }
  surface.widgets.delete(widgetID);
  surface.dropTargets.delete(widgetID);
}

async function removeWidgetLocal(surface, widgetID, keepChildren) {
  function getWidgetsToRemove(widgetID) {
    const children = [];
    if(!keepChildren)
      for(const [ childWidgetID, childWidget ] of surface.widgets)
        if(!childWidget.inRemovalQueue && (childWidget.get('parent') == widgetID || childWidget.get('deck') == widgetID))
          children.push(...getWidgetsToRemove(childWidgetID));
    surface.widgets.get(widgetID).inRemovalQueue = true;
    children.push(surface.widgets.get(widgetID));
    return children;
  }

  if(surface.widgets.get(widgetID).inRemovalQueue)
    return;

  for(const w of getWidgetsToRemove(widgetID)) {
    w.isBeingRemoved = true;
    // don't actually set deck and parent to null (only pretend to) because when "receiving" the delta, the applyRemove has to find the parent
    await w.onPropertyChange('deck', w.get('deck'), null);
    await w.onPropertyChange('parent', w.get('parent'), null);
    sendPropertyUpdate(surface, w.id, null);
  }
}

function sendDelta() {
  if(!topSurface.batchDepth) {
    if(topSurface.deltaChanged) {
      receiveDelta(topSurface, topSurface.delta);
      topSurface.delta.id = deltaID;
      toServer('delta', topSurface.delta);
    }
    topSurface.delta = { s: {} };
    topSurface.deltaChanged = false;
  }
}

export function sendPropertyUpdate(surface, widgetID, property, value) {
  if(property === null || typeof property === 'object') {
    surface.delta.s[widgetID] = property;
  } else {
    if(surface.delta.s[widgetID] === undefined)
      surface.delta.s[widgetID] = {};
    if(surface.delta.s[widgetID] !== null)
      surface.delta.s[widgetID][property] = value;
  }
  surface.deltaChanged = true;
  if(surface === topSurface)
    sendDelta();
}

export function widgetFilter(surface, callback) {
  return Array.from(surface.widgets.values()).filter(w=>!w.isBeingRemoved).filter(callback);
}

onLoad(function() {
  onMessage('delta', receiveDeltaFromServer);
  onMessage('state', receiveStateFromServer);
  setScale();
});
