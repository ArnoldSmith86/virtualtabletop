import { toServer } from './connection.js';
import { $, $a, onLoad, unescapeID } from './domhelpers.js';

let roomID = self.location.pathname.replace(/.*\//, '');

export const widgets = new Map();

let deferredCards = {};
let deferredChildren = {};

let delta = { s: {} };
let deltaChanged = false;
let deltaID = 0;
let batchDepth = 0;
let overlayShownForEmptyRoom = false;

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
  } else if(widget.type == 'holder') {
    w = new Holder(id);
  } else if(widget.type == 'label') {
    w = new Label(id);
  } else if(widget.type == 'pile') {
    w = new Pile(id);
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
  if(w.get('dropTarget'))
    dropTargets.set(widget.id, w);

  if(widget.type == 'deck')
    for(const c of deferredCards[widget.id] || [])
      addWidget(c);
  delete deferredCards[widget.id];

  for(const c of deferredChildren[widget.id] || [])
    addWidget(c);
  delete deferredChildren[widget.id];
}

export function batchStart() {
  ++batchDepth;
}

export function batchEnd() {
  --batchDepth;
  sendDelta();
}

function receiveDelta(delta) {
  // the order of widget changes is not necessarily correct and in order to avoid cyclic children, this first moves affected widgets to the top level
  for(const widgetID in delta.s)
    if(delta.s[widgetID] && delta.s[widgetID].parent !== undefined && widgets.has(widgetID))
      $('#topSurface').appendChild(widgets.get(widgetID).domElement);

  for(const widgetID in delta.s)
    if(delta.s[widgetID] !== null && !widgets.has(widgetID))
      addWidget(delta.s[widgetID]);

  for(const widgetID in delta.s)
    if(delta.s[widgetID] !== null && widgets.has(widgetID)) // check widgets.has because addWidget above MIGHT have failed
      widgets.get(widgetID).applyDelta(delta.s[widgetID]);

  for(const widgetID in delta.s)
    if(delta.s[widgetID] === null && widgets.has(widgetID))
      removeWidget(widgetID);

  if(typeof jeEnabled != 'undefined' && jeEnabled)
    jeApplyDelta(delta);
}

function receiveDeltaFromServer(delta) {
  deltaID = delta.id;
  receiveDelta(delta);
}

function receiveStateFromServer(args) {
  mouseTarget = null;
  deltaID = args._meta.deltaID;
  for(const widget of widgetFilter(w=>w.get('parent')===null))
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

  if(isEmpty && !overlayShownForEmptyRoom && !urlProperties.load && !urlProperties.askID) {
    showOverlay('statesOverlay');
    overlayShownForEmptyRoom = true;
  }
  toServer('confirm');

  if(typeof jeEnabled != 'undefined' && jeEnabled)
    jeApplyState(args);
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

onLoad(function() {
  onMessage('delta', receiveDeltaFromServer);
  onMessage('state', receiveStateFromServer);
  setScale();
});
