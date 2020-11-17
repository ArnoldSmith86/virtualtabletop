const roomID = self.location.pathname.substr(1);

const widgets = new Map();

const deferredCards = {};
const deferredChildren = {};

let delta = { s: {} };
let batchDepth = 0;

function addWidget(widget) {
  if(widget.parent && !widgets.has(widget.parent)) {
    if(!deferredChildren[widget.parent])
      deferredChildren[widget.parent] = [];
    deferredChildren[widget.parent].push(widget);
    return;
  }

  const id = widget.id;
  let w;

  let parent = $('.surface');
  if(widget.parent)
    parent = widgets.get(widget.parent);

  if(widget.type == 'card') {
    if(widgets.has(widget.deck)) {
      w = new Card(id);
    } else {
      if(!deferredCards[widget.deck])
        deferredCards[widget.deck] = [];
      deferredCards[widget.deck].push(widget);
      return;
    }
  } else if(widget.type == 'deck') {
    w = new Deck(id);
  } else if(widget.type == 'holder') {
    w = new Holder(id);
  } else if(widget.type == 'spinner')
    w = new Spinner(id);
  else if(widget.type == 'label')
    w = new Label(id);
  else if(widget.type == 'button')
    w = new Button(id);
  else
    w = new BasicWidget(id);

  widgets.set(widget.id, w);
  w.applyDelta(widget);
  if(w.p('dropTarget'))
    dropTargets.set(widget.id, w);

  for(const c of deferredCards[widget.id] || [])
    addWidget(c);
  delete deferredCards[widget.id];

  for(const c of deferredChildren[widget.id] || [])
    addWidget(c);
  delete deferredChildren[widget.id];
}

function batchStart() {
  ++batchDepth;
}

function batchEnd() {
  --batchDepth;
  sendDelta();
}

function receiveDelta(delta) {
  for(const widgetID in delta.s) {
    if(delta.s[widgetID] === null) {
      removeWidget(widgetID);
    } else if(!widgets.has(widgetID)) {
      addWidget(delta.s[widgetID]);
    } else {
      widgets.get(widgetID).applyDelta(delta.s[widgetID]);
    }
  }
}

function removeWidget(widgetID) {
  widgets.get(widgetID).remove();
  widgets.delete(widgetID);
}

function sendDelta() {
  if(!batchDepth) {
    receiveDelta(delta);
    toServer('delta', delta);
    delta = { s: {} };
  }
}

function sendPropertyUpdate(widgetID, property, value) {
  if(property === null || typeof property === 'object') {
    delta.s[widgetID] = property;
  } else {
    if(delta.s[widgetID] === undefined)
      delta.s[widgetID] = {};
    delta.s[widgetID][property] = value;
  }
  sendDelta();
}

onLoad(function() {
  onMessage('delta', receiveDelta);
  onMessage('state', function(args) {
    for(const widget of $a('.widget'))
      if(widget.id != 'enlarged')
        widget.remove();
    widgets.clear();
    dropTargets.clear();
    for(const widgetID in args)
      if(widgetID != '_meta')
        addWidget(args[widgetID]);
  });
  setScale();
});
