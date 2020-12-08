let scale = 1;
let roomRectangle;
let overlayActive = false;

let maxZ = {};
const dropTargets = new Map();

function getValidDropTargets(widget) {
  const targets = [];
  for(const [ _, t ] of dropTargets) {
    let isValid = true;
    for(const key in t.p('dropTarget')) {
      if(widget.p(key) != t.p('dropTarget')[key]) {
        isValid = false;
        break;
      }
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
  } else {
    $('#roomArea').className = '';
    overlayActive = false;
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
  return selectFile('BINARY').then(async function(contents) {
    const response = await fetch('/asset', {
      method: 'PUT',
      headers: {
        'Content-type': 'application/octet-stream'
      },
      body: contents
    });

    return response.text();
  });
}

onLoad(function() {
  on('.toolbarButton', 'click', function(e) {
    const overlay = e.target.dataset.overlay;
    if(overlay)
      showOverlay(overlay);
  });

  on('#fullscreenButton', 'click', function() {
    if(!document.fullscreenElement)
      document.documentElement.requestFullscreen();
    else
      document.exitFullscreen();
  });
  setScale();

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

window.onerror = (msg, url, line, col)=>log(`ERROR: ${msg} - line ${line} - column ${col}`);
