import { $, $a, onLoad, selectFile, asArray } from './domhelpers.js';
import { startWebSocket, toServer } from './connection.js';


export let scale = 1;
let roomRectangle;
let overlayActive = false;
let muted = false;
let unmuteVol = 30;
let optionsHidden = true;

var vmEditOverlay;

let urlProperties = {};

let maxZ = {};
export const dropTargets = new Map();

function compareDropTarget(widget, t, exclude){
  for(const dropTargetObject of asArray(t.get('dropTarget'))) {
    let isValidObject = true;
    for(const key in dropTargetObject) {
      if(dropTargetObject[key] != widget.get(key) && (exclude == true || (key != 'type' || widget.get(key) != 'deck' || dropTargetObject[key] != 'card'))) {
        isValidObject = false;
        break;
      }
    }
    if(isValidObject) {
      return true;
    }
  }
  return false;
}

function getValidDropTargets(widget) {
  const targets = [];
  for(const [ _, t ] of dropTargets) {
    // if the holder has a drop limit and it's reached, skip the holder
    if(t.get('dropLimit') > -1 && t.get('dropLimit') <= t.children().length)
      // don't skip it if the dragged widget is already its child
      if(t.children().indexOf(widget) == -1)
        continue;

    let isValid = compareDropTarget(widget, t);

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
    toServer('mouse',{inactive:true})
  } else {
    $('#roomArea').className = '';
    vmEditOverlay.selectedWidget = {};
    overlayActive = false;
  }
}

function checkURLproperties(connected) {
  if(!connected) {

    try {
      if(location.hash) {
        const playerParams = location.hash.match(/^#player:([^:]+):%23([0-9a-f]{6})$/);
        if(playerParams) {
          urlProperties = { player: decodeURIComponent(playerParams[1]), color: '#'+playerParams[2] };
        } else {
          urlProperties = JSON.parse(decodeURIComponent(location.hash.substr(1)));
        }
        history.pushState("", document.title, window.location.pathname);
      }
    } catch(e) {
      console.error('Could not parse URL parameters.', e);
      urlProperties = {};
    }

    if(urlProperties.player) {
      playerName = urlProperties.player;
      localStorage.setItem('playerName', playerName);
    }
    if(urlProperties.hideToolbar) {
      $('#toolbar').style.display = 'none';
      document.documentElement.style.setProperty('--toolbarSize', 0);
    }
    if(urlProperties.askID) {
      on('#askIDoverlay button', 'click', function() {
        roomID = urlProperties.askID + $('#enteredID').value;
        toServer('room', { playerName, roomID });
        $('#legacy-link').href += `#${roomID}`;
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

  } else {

    if(urlProperties.color)
      toServer('playerColor', { player: playerName, color: urlProperties.color });

  }
}

function setScale() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  let vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
  if(jeEnabled) {
    const targetWidth = jeZoomOut ? 3200 : 1600;
    const targetHeight = jeZoomOut ? 2000 : 1000;
    const availableWidth = $('#jeText').offsetLeft;
    if(availableWidth/(h-70) < 1600/1000)
      scale = availableWidth/targetWidth;
    else
      scale = (h-70)/targetHeight;
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

export async function shuffleWidgets(collection) {
  const shuffle = collection.map(widget => {
    return {widget, rand:Math.random()};
  }).sort((a, b)=> a.rand - b.rand);
  for(let i of shuffle) {
    await i.widget.bringToFront();
  }
}

export async function sortWidgets(collection, keys, reverse, locales, options, rearrange) {
  const r = asArray(reverse);
  if(r.length == 0)
    r.push(false);
  const k = asArray(keys).map((key, i, k) => {
    const keyObj = {
      key, 
      locales,
      options
    };
    if(typeof(key) == 'object') {
      return Object.assign(keyObj, key)
    } else {
      return keyObj
    }
  });
  if(rearrange)
    k.push({
      key:"z"
    });
  collection.sort((w1,w2)=>{
    let comp = 0;
    for(const keyObj of k) {
      const key1 = w1.get(keyObj.key);
      const key2 = w2.get(keyObj.key);
      if(key1 === key2)
        continue;
      let i1 = -1;
      let i2 = -1;
      if(Array.isArray(keyObj.order)) {
        const o = keyObj.order.slice().reverse();
        i1 = o.lastIndexOf(key1);
        i2 = o.lastIndexOf(key2);
      }
      if(i1 > -1 || i2 > -1)
        comp = i2 - i1;
      else if(typeof key1 == 'number')
        comp = key1 - key2;
      else if(key1 === null)
        comp = key2 === null ?  0 : -1;
      else if(key2 === null)
        comp = 1;
      else
        comp = key1.localeCompare(key2, keyObj.locales, keyObj.options);
      if(comp != 0) {
        return keyObj.reverse ? -comp : comp;
      }
    }
    return 0;
  });
  if(reverse) {
    collection.reverse();
  }
  if(rearrange) {
    let z = 1;
    for(const w of collection) {
      await w.set('z', ++z);
    }
  }
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
    const response = await fetch('asset', {
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
    fetch(url.replace(/^\//, '')).then(r=>r.text()).then(t=>{
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

  on('#muteButton', 'click', function(){
    if(muted) {
      $('#volume').value = unmuteVol;
      $('#muteButton').classList.remove('muted');
      $a('audio').forEach(function(audio){
        audio.volume = Math.min(audio.getAttribute('maxVolume') * (((10 ** (unmuteVol / 96.025)) / 10) - 0.1), 1);
      });
    } else {
      unmuteVol = document.getElementById('volume').value;
      $('#volume').value = 0;
      $a('audio').forEach(function(audio){
        audio.volume = 0;
      });
      document.getElementById('muteButton').classList.add('muted');
    }
    muted = !muted
  });

  on('#lightsButton', 'click', function(){
    if($('body').classList.contains('lightsOff'))
      $('body').classList.remove('lightsOff');
    else
      $('body').classList.add('lightsOff');
  });

  on('#optionsButton', 'click', function(){
    if(optionsHidden) {
      $('#options').classList.remove('hidden');
    } else {
      $('#options').classList.add('hidden');
    }
    optionsHidden = !optionsHidden
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

  if(Object.keys(config.betaServers).length) {
    for(const betaServerName in config.betaServers) {
      const entry = domByTemplate('template-betaServerList-entry', 'tr');
      $('button', entry).textContent = betaServerName;
      var thisstatus = config.betaServers[betaServerName].return ? 'check' : 'cancel';
      $('.return', entry).textContent = thisstatus;
      $('.return', entry).classList.add(thisstatus);
      $('.description', entry).textContent = config.betaServers[betaServerName].description;
      $('#betaServerList').appendChild(entry);
    }
    on('#betaServerList button', 'click', function(e) {
      toServer('setRedirect', e.target.textContent);
    });
  } else {
    removeFromDOM($('#betaText'));
  }
  onMessage('redirect', function(url) {
    window.location.href = `${url}#player:${encodeURIComponent(playerName)}:${encodeURIComponent(playerColor)}`;
  });
  on('#returnOverlay button', 'click', function() {
    toServer('setRedirect', 'return');
  });

  checkURLproperties(false);
  setScale();
  startWebSocket();

  onMessage('warning', alert);
  onMessage('error', function(message) {
    waitingForStateCreation = null;
    alert(message);
  });
  onMessage('internal_error', function() {
    preventReconnect();
    showOverlay('internalErrorOverlay');
  });
  let checkedOnce = false;
  onMessage('meta', function() {
    if(!checkedOnce)
      checkURLproperties(true);
    checkedOnce = true;
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

if($('#volume')) {
  on('#volume', 'input', function(){ // allows volume to be adjusted in real time
    if(muted) {
      $('#muteButton').classList.remove('muted');
      muted = !muted
    }
    $a('audio').forEach(function(audio){
      audio.volume = Math.min(audio.getAttribute('maxVolume') * (((10 ** ($('#volume').value / 96.025)) / 10) - 0.1), 1);
    });
  });
}
