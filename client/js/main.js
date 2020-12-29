let scale = 1;
let roomRectangle;
let overlayActive = false;

let urlProperties = {};

let maxZ = {};
const dropTargets = new Map();

function getValidDropTargets(widget) {
  const targets = [];
  for(const [ _, t ] of dropTargets) {
    let isValid = true;
    for(const key in t.p('dropTarget')) {
      if(widget.p(key) != t.p('dropTarget')[key] && (key != 'type' || widget.p(key) != 'deck' || t.p('dropTarget')[key] != 'card')) {
        isValid = false;
        break;
      }
    }

    let tt = t;
    while(true) {
      if(widget == tt) {
        isValid = false;
        break;
      }

      if(tt.p('parent'))
        tt = widgets.get(tt.p('parent'));
      else
        break;
    }

    if(isValid)
      targets.push(t);
  }
  return targets;
}

function getMaxZ(layer) {
  return maxZ[layer] || 0;
}

function updateMaxZ(layer, z) {
  maxZ[layer] = Math.max(maxZ[layer] || 0, z);
}

function showOverlay(id) {
  for(const d of $a('.overlay'))
    if(d.id != id)
      d.style.display = 'none';
  if(id) {
    const style = $(`#${id}`).style;
    style.display = style.display === 'flex' ? 'none' : 'flex';
    $('#roomArea').className = style.display === 'flex' ? 'hasOverlay' : '';
    overlayActive = style.display === 'flex';

    //Hack to focus on the Go button for the input overlay
    if (id == 'buttonInputOverlay') {
      $('#buttonInputGo').focus();
    }
  } else {
    $('#roomArea').className = '';
    overlayActive = false;
  }
}

function checkURLproperties() {
  try {
    urlProperties = JSON.parse(decodeURIComponent(location.hash.substr(1)));
  } catch(e) {}

  if(urlProperties.hideToolbar) {
    $('#toolbar').style.display = 'none';
    document.documentElement.style.setProperty('--toolbarSize', 0);
  }
  if(urlProperties.askID) {
    on('#askIDoverlay button', 'click', function() {
      roomID = urlProperties.askID + $('#enteredID').value;
      toServer('room', { playerName, roomID });
      showOverlay();
    });
    showOverlay('askIDoverlay');
  }
}

function setScale() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  scale = w/h < 1600/1000 ? w/1600 : h/1000;
  document.documentElement.style.setProperty('--scale', scale);
  roomRectangle = $('#roomArea').getBoundingClientRect();
}

async function uploadAsset() {
  return selectFile('BINARY').then(async function(file) {
    const response = await fetch('/asset', {
      method: 'PUT',
      headers: {
        'Content-type': 'application/octet-stream'
      },
      body: file.content
    });

    return response.text();
  });
}

onLoad(function() {
  on('#pileOverlay', 'click', e=>e.target.id=='pileOverlay'&&showOverlay());

  on('.toolbarButton', 'click', function(e) {
    const overlay = e.target.dataset.overlay;
    if(overlay)
      showOverlay(overlay);
  });

  on('#fullscreenButton', 'click', function() {
    if(document.documentElement.requestFullscreen) {
      if(!document.fullscreenElement)
        document.documentElement.requestFullscreen();
      else
        document.exitFullscreen();
    } else if(document.documentElement.webkitRequestFullscreen) {
      if(!document.webkitFullscreenElement)
        document.documentElement.webkitRequestFullScreen();
      else
        document.webkitExitFullscreen();
    }
  });
  checkURLproperties();
  setScale();
  startWebSocket();

  onMessage('warning', alert);
  onMessage('error', alert);
});

window.onresize = function(event) {
  setScale();
}

window.onkeyup = function(event) {
  if(event.key == 'Escape')
    showOverlay();
}

window.onerror = function(msg, url, line, col, err) {
  log(`ERROR ${msg} < ${err.stack.trim().replace(/\n/g, ' < ')}`);
  location.reload();
}
