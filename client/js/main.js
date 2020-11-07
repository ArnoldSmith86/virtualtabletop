const roomID = self.location.pathname.substr(1);
const widgets = new Map();
const dropTargets = new Map();

const deferredCards = {};

function addWidget(widget) {
  let w;
  if(widget.type == 'card') {
    if(widgets.has(widget.deck)) {
      w = new Card(widget, $('.surface'), widgets.get(widget.deck));
    } else {
      if(!deferredCards[widget.deck])
        deferredCards[widget.deck] = [];
      deferredCards[widget.deck].push(widget);
    }
  } else if(widget.type == 'deck') {
    w = new Deck(widget, $('.surface'));
    for(const c of deferredCards[widget.id] || [])
      widgets.set(c.id, new Card(c, $('.surface'), w));
    delete deferredCards[widget.id];
  } else if(widget.type == 'spinner')
    w = new Spinner(widget, $('.surface'));
  else
    w = new BasicWidget(widget, $('.surface'));
  widgets.set(widget.id, w);
  if(widget.dropTarget)
    dropTargets.set(widget.id, w);
}

function getValidDropTargets(widget) {
  const targets = [];
  for(const t of dropTargets) {
    let isValid = true;
    for(const key in t.dropTarget) {
      if(widget[key] != t.dropTarget[key]) {
        isValid = false;
        break;
      }
    }
    if(isValid)
      targets.push(t);
  }
  return targets;
}

window.addEventListener('mousemove', function(event) {
  toServer('mouse', [ event.clientX, event.clientY ]);
});

function getMaxZ(layer) {
  let maxZ = -1;
  for(const [ id, widget ] of widgets)
    if((widget.sourceObject.layer || 0) == layer)
      maxZ = Math.max(maxZ, widget.sourceObject.z || 0);
  return maxZ;
}

function objectToWidget(o) {
  if(!o.id)
    o.id = Math.random().toString(36).substring(3, 7);
  toServer('add', o);
}

function setScale() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  document.documentElement.style.setProperty('--scale', w/h < 1600/1000 ? w/1600 : h/1000);
}

onLoad(function() {
  onMessage('add', addWidget);
  onMessage('state', function(args) {
    for(const widget of $a('.widget'))
      widget.parentNode.removeChild(widget);
    widgets.clear();
    dropTargets.clear();
    for(const widgetID in args)
      if(widgetID != '_meta')
        addWidget(args[widgetID]);
  });
  onMessage('translate', function(args) {
    widgets.get(args.id).setPositionFromServer(...args.pos);
  });
  onMessage('update', function(args) {
    widgets.get(args.id).receiveUpdate(args);
  });

  on('.toolbarButton', 'click', function(e) {
    const overlay = e.target.dataset.overlay;
    if(overlay) {
      for(const d of $a('.overlay'))
        if(d.id != overlay)
          d.style.display = 'none';
      const style = $(`#${overlay}`).style;
      style.display = style.display === 'flex' ? 'none' : 'flex';
      $('#roomArea').className = style.display === 'flex' ? 'hasOverlay' : '';
    }
  });

  on('#uploadButton', 'click', function() {
    selectFile().then(function(file) {
      var req = new XMLHttpRequest();
      req.open('PUT', self.location.pathname, true);
      req.setRequestHeader('Content-Type', 'application/octet-stream');
      req.send(file);
    });
  });

  on('#addWidget', 'click', function() {
    objectToWidget(JSON.parse($('#widgetText').value));
    $('.toolbarButton').dispatchEvent(new MouseEvent('click', {bubbles: true}));
  });

  setScale();
});

window.onresize = function(event) {
  setScale();
}
