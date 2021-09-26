import { $, $a, onLoad, selectFile } from './domhelpers.js';
import { startWebSocket } from './connection.js';


let scale = 1;
let roomRectangle;
let overlayActive = false;

var vmEditOverlay;

let urlProperties = {};

let maxZ = {};
export const dropTargets = new Map();

function getValidDropTargets(widget) {
  const targets = [];
  for(const [ _, t ] of dropTargets) {
    // if the holder has a drop limit and it's reached, skip the holder
    if(t.get('dropLimit') > -1 && t.get('dropLimit') <= t.children().length)
      // don't skip it if the dragged widget is already its child
      if(t.children().indexOf(widget) == -1)
        continue;

    let isValid = true;
    for(const key in t.get('dropTarget')) {
      if(Array.isArray(t.get('dropTarget')[key])) {
        let thisKeyValid = false;
        for (let i = 0; i < (t.get('dropTarget')[key]).length; i++) {
          if((t.get('dropTarget')[key]).includes(widget.get(key))) {
            thisKeyValid = true;
            break;
          }
        }
        if (!(isValid = thisKeyValid))
          break;
      }
      else
        if(widget.get(key) != t.get('dropTarget')[key] && (key != 'type' || widget.get(key) != 'deck' || t.get('dropTarget')[key] != 'card')) {
          isValid = false;
          break;
        }
    }

    let tt = t;
    while(isValid) {
      if(widget == tt) {
        isValid = false;
        break;
      }

      if(tt.get('parent'))
        tt = widgets.get(tt.get('parent'));
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

async function resetMaxZ(layer) {
  maxZ[layer] = 0;
  for(const w of widgetFilter(w=>w.get('layer')==layer&&w.state.z).sort((a,b)=>a.get('z')-b.get('z')))
    await w.set('z', ++maxZ[layer]);
}

function updateMaxZ(layer, z) {
  maxZ[layer] = Math.max(maxZ[layer] || 0, z);
}

export function showOverlay(id, forced) {
  if(overlayActive == 'forced' && !forced)
    return;

  for(const d of $a('.overlay'))
    if(d.id != id)
      d.style.display = 'none';

  if(id) {
    const style = $(`#${id}`).style;
    style.display = !forced && style.display === 'flex' ? 'none' : 'flex';
    $('#roomArea').className = style.display === 'flex' ? 'hasOverlay' : '';
    overlayActive = style.display === 'flex';
    if(forced)
      overlayActive = 'forced';

    //Hack to focus on the Go button for the input overlay
    if (id == 'buttonInputOverlay') {
      $('#buttonInputGo').focus();
    }
  } else {
    $('#roomArea').className = '';
    vmEditOverlay.selectedWidget = {};
    overlayActive = false;
  }
}

function checkURLproperties() {
  try {
    if(location.hash)
      urlProperties = JSON.parse(decodeURIComponent(location.hash.substr(1)));
  } catch(e) {
    console.error('Could not parse URL parameters.', e);
    urlProperties = {};
  }

  if(urlProperties.hideToolbar) {
    $('#toolbar').style.display = 'none';
    document.documentElement.style.setProperty('--toolbarSize', 0);
  }
  if(urlProperties.askID) {
    on('#askIDoverlay button', 'click', function() {
      roomID = urlProperties.askID + $('#enteredID').value;
      toServer('room', { playerName, roomID });
      $('#ghetto-link').href += `#${roomID}`;
      showOverlay();
    });
    showOverlay('askIDoverlay');
  }
  if(urlProperties.css) {
    const link = document.createElement('link');

    link.type = 'text/css';
    link.rel = 'stylesheet';
    link.href = urlProperties.css;

    document.head.appendChild(link);
  }
}

function setScale() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if(jeEnabled) {
    const targetWidth = jeZoomOut ? 3200 : 1600;
    scale = (w-920)/targetWidth;
  } else {
    scale = w/h < 1600/1000 ? w/1600 : h/1000;
  }
  if(w-scale*1600 + h-scale*1000 < 44) {
    $('body').classList.add('aspectTooGood');
    if(!$('body').className.match(/hiddenToolbar/))
      scale = (w-44)/1600;
  } else {
    $('body').classList.remove('aspectTooGood');
  }
  document.documentElement.style.setProperty('--scale', scale);
  roomRectangle = $('#roomArea').getBoundingClientRect();
}

async function uploadAsset(multipleCallback) {
  if(typeof(multipleCallback) === "function") {
    return selectFile('BINARY', async function (f) {
      let uploadPath = await _uploadAsset(f).catch(e=>alert(`Uploading failed: ${e.toString()}`));
      multipleCallback(uploadPath, f.name)
    });
  }
  else {
    return selectFile('BINARY').then(_uploadAsset).catch(e=>alert(`Uploading failed: ${e.toString()}`));
  }
}

async function _uploadAsset(file) {
    const response = await fetch('/asset', {
      method: 'PUT',
      headers: {
        'Content-type': 'application/octet-stream'
      },
      body: file.content
    });

    if(response.status == 413)
      throw 'File is too big.';
    else if(!response.ok)
      throw `${response.status} - ${response.statusText}`;

    return response.text();
}

const svgCache = {};
function getSVG(url, replaces, callback) {
  if(typeof svgCache[url] == 'string') {
    let svg = svgCache[url];
    for(const replace in replaces)
      svg = svg.split(replace).join(replaces[replace]);
    return 'data:image/svg+xml,'+encodeURIComponent(svg);
  }

  if(!svgCache[url]) {
    svgCache[url] = [];
    fetch(url).then(r=>r.text()).then(t=>{
      const callbacks = svgCache[url];
      svgCache[url] = t;
      for(const c of callbacks)
        c();
    });
  }

  svgCache[url].push(callback);
  return '';
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
  on('#hideToolbarButton', 'click', function() {
    $('body').classList.add('hiddenToolbar');
    setScale();
  });

  checkURLproperties();
  setScale();
  startWebSocket();

  onMessage('warning', alert);
  onMessage('error', alert);
  onMessage('internal_error', function() {
    preventReconnect();
    showOverlay('internalErrorOverlay');
  });
});

window.onresize = function(event) {
  setScale();
}

window.onkeyup = function(event) {
  if(event.key == 'Escape') {
    if(overlayActive)
      showOverlay();
    else if(edit)
      toggleEditMode();
    else if(jeEnabled)
      jeToggle();
  }
}
