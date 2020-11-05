const roomID = self.location.pathname.substr(1);

function addWidget(widget) {
  if(widget.type == 'spinner')
    widgets.set(widget.id, new Spinner(widget, $('.surface')));
  else
    widgets.set(widget.id, new BasicWidget(widget, $('.surface')));
}

window.addEventListener('mousemove', function(event) {
  toServer('mouse', [ event.clientX, event.clientY ]);
});

const widgets = new Map();

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

window.addEventListener('DOMContentLoaded', function() {
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
