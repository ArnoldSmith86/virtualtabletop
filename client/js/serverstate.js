const roomID = self.location.pathname.substr(1);

const widgets = new Map();

const deferredCards = {};

let delta = { s: {} };
let batchDepth = 0;

function addWidget(widget) {
  let w;
  if(widget.type == 'card') {
    if(widgets.has(widget.deck)) {
      w = new Card(widget, $('.surface'), widgets.get(widget.deck));
    } else {
      if(!deferredCards[widget.deck])
        deferredCards[widget.deck] = [];
      deferredCards[widget.deck].push(widget);
      return;
    }
  } else if(widget.type == 'deck') {
    w = new Deck(widget, $('.surface'));
  } else if(widget.type == 'holder') {
    w = new Holder(widget, $('.surface'));
  } else if(widget.type == 'spinner')
    w = new Spinner(widget, $('.surface'));
  else if(widget.type == 'label')
    w = new Label(widget, $('.surface'));
  else if(widget.type == 'button')
    w = new Button(widget, $('.surface'));
  else
    w = new BasicWidget(widget, $('.surface'));

  widgets.set(widget.id, w);
  if(w.p('dropTarget'))
    dropTargets.set(widget.id, w);

  for(const c of deferredCards[widget.id] || [])
    addWidget(c);
  delete deferredCards[widget.id];
}

function batchStart() {
  ++batchDepth;
}

function batchEnd() {
  --batchDepth;
  if(!batchDepth) {
    toServer('delta', delta);
    delta = { s: {} };
  }
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

function sendPropertyUpdate(widgetID, property, value) {
  if(property === null || typeof property === 'object') {
    delta.s[widgetID] = property;
  } else {
    if(delta.s[widgetID] === undefined)
      delta.s[widgetID] = {};
    delta.s[widgetID][property] = value;
  }
  if(!batchDepth) {
    toServer('delta', delta);
    delta = { s: {} };
  }
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
