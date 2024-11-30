import { $, $a, onLoad, selectFile, asArray } from './domhelpers.js';
import { startWebSocket, toServer } from './connection.js';


export let scale = 1;
let roomRectangle;
let overlayActive = false;
let optionsHidden = true;

let edit = null;
export let jeEnabled = null;
let zoom = 1;
let offset = [ 0, 0 ];
let jeRoutineLogging = false;

let urlProperties = {};

let maxZ = {};
export const dropTargets = new Map();

export const clientPointer = $('#clientPointer');

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

    if (jeEnabled && getComputedStyle(t.domElement).getPropertyValue('--foreign') == 'true')
      continue;

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
    const displayStyle = id == 'addOverlay' ? 'grid' : 'flex';
    style.display = !forced && style.display !== 'none' ? 'none' : displayStyle;
    overlayActive = style.display !== 'none';
    if(forced)
      overlayActive = 'forced';

    //Hack to focus on the Go button for the input overlay
    if (id == 'buttonInputOverlay') {
      $('#buttonInputGo').focus();
    }
    if(!isLoading)
      toServer('mouse',{inactive:true})
  } else {
    overlayActive = false;
  }
  $('body').classList.toggle('overlayActive', overlayActive);
}

export function showStatesOverlay(id) {
  showOverlay(id);
  if(id == 'statesOverlay')
    updateFilterOverflow();
  $('#statesButton').dataset.overlay = id;
}

export function isOverlayActive() {
  return overlayActive;
}

function checkURLproperties(connected) {
  if(!connected) {

    try {
      checkForGameURL();
      if(location.hash) {
        const playerParams = location.hash.match(/^#player:([^:]+):%23([0-9a-f]{6})$/);
        if(location.hash == '#tutorials') {
          $('#filterByType').value = 'Tutorials';
        } else if(playerParams) {
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
      toServer('playerColor', { player: playerName, color: toHex(urlProperties.color) });

  }
}

function setZoomAndOffset(newZoom, xOffset, yOffset) {
  zoom = newZoom;
  offset = [ xOffset, yOffset ];
  setScale();
}

function setScale() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  let vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
  if(edit || jeEnabled) {
    const targetWidth = 1600 / zoom;
    const targetHeight = 1000 / zoom;
    const availableRect = getAvailableRoomRectangle();
    const availableWidth = availableRect.right-availableRect.left;
    const availableHeight = availableRect.bottom-availableRect.top;

    scale = availableWidth/availableHeight < 1600/1000 ? availableWidth/targetWidth : availableHeight/targetHeight;

    const offsetX = offset[0] + (1-zoom)/2*1600*scale/zoom;
    const offsetY = offset[1] + (1-zoom)/2*1000*scale/zoom;

    if(availableWidth/availableHeight < 1600/1000) {
      document.documentElement.style.setProperty('--editModeRoomLeft', (offsetX + availableRect.left) + 'px');
      document.documentElement.style.setProperty('--editModeRoomTop', (offsetY + availableRect.top + (availableHeight-scale*targetHeight)/2) + 'px');
    } else {
      document.documentElement.style.setProperty('--editModeRoomLeft', (offsetX + availableRect.left + (availableWidth-scale*targetWidth)/2) + 'px');
      document.documentElement.style.setProperty('--editModeRoomTop', (offsetY + availableRect.top) + 'px');
    }
    document.documentElement.style.setProperty('--roomZoom', zoom);
  } else {
    scale = w/h < 1600/1000 ? w/1600 : h/1000;
  }
  $('body').classList.remove('wideToolbar');
  $('body').classList.remove('horizontalToolbar');
  if(w-scale*1600 + h-scale*1000 < 44) {
    $('body').classList.add('aspectTooGood');
    if(!$('body').className.match(/hiddenToolbar/))
      scale = (w-44)/1600;
  } else {
    $('body').classList.remove('aspectTooGood');
    if(w - scale*1600 > 200)
      $('body').classList.add('wideToolbar');
    else if(w/h < 1600/1000)
      $('body').classList.add('horizontalToolbar');
  }
  document.documentElement.style.setProperty('--scale', scale);
  roomRectangle = $('#roomArea').getBoundingClientRect();
  if(edit)
    scaleHasChanged(scale);
}

function getScale() {
  return scale;
}

function getRoomRectangle() {
  return roomRectangle;
}

export async function shuffleWidgets(collection) {
  // Fisher–Yates shuffle
  const len = collection.length;
  let indexes = [...Array(len).keys()];
  for (let i = len-1; i > 0; i--) {
    let j = Math.floor(rand() * (i+1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  for (let i of indexes) {
    await collection[i].bringToFront();
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
    if(typeof file == 'string')
      file = await (await fetch(file)).arrayBuffer();

    const response = await fetch('asset', {
      method: 'PUT',
      headers: {
        'Content-type': 'application/octet-stream'
      },
      body: file.content || file
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
    const cacheKey = url + JSON.stringify(replaces);
    if(svgCache[cacheKey])
      return svgCache[cacheKey];

    let svg = svgCache[url];
    for(const replace in replaces)
      svg = svg.split(replace).join(replaces[replace]);
    svgCache[cacheKey] = 'data:image/svg+xml,'+encodeURIComponent(svg);
    return svgCache[cacheKey];
  }

  if(!svgCache[url]) {
    svgCache[url] = [];
    fetch(mapAssetURLs(url)).then(r=>r.text()).then(t=>{
      const callbacks = svgCache[url];
      svgCache[url] = t;
      for(const c of callbacks)
        c();
    });
  }

  svgCache[url].push(callback);
  return '';
}

async function loadEditMode() {
  if(edit === null) {
    edit = false;
    Object.assign(window, {
      $, $a, div, progressButton, loadImage, on, onMessage, showOverlay, sleep, rand, shuffleArray,
      setJEenabled, setJEroutineLogging, setZoomAndOffset, toggleEditMode, getEdit,
      toServer, batchStart, batchEnd, setDeltaCause, sendPropertyUpdate, getUndoProtocol, setUndoProtocol, sendRawDelta, getDelta,
      addWidgetLocal, updateWidgetId, removeWidgetLocal,
      loadJSZip, waitForJSZip,
      generateUniqueWidgetID, unescapeID, regexEscape, setScale, getScale, getRoomRectangle, getMaxZ,
      uploadAsset, _uploadAsset, mapAssetURLs, pickSymbol, selectFile, triggerDownload,
      config, getPlayerDetails, roomID, getDeltaID, widgets, widgetFilter, isOverlayActive,
      html, formField,
      Widget, BasicWidget, Button, Canvas, Card, Deck, Dice, Holder, Label, Pile, Scoreboard, Seat, Spinner, Timer,
      toHex, contrastAnyColor,
      asArray, compute_ops,
      eventCoords
    });
    $('body').classList.add('loadingEditMode');
    const editmode = await import('./edit.js');
    $('body').classList.remove('loadingEditMode');
    Object.assign(window, editmode);
    initializeEditMode(currentMetaData);
  }
}

window.addEventListener('keydown', async function(e) {
  if(e.ctrlKey && e.key == 'j') {
    e.preventDefault();
    if(edit) {
      $('#editorToolbar button[icon=close]').click();
    } else if(edit === false) {
      $('#editButton').click();
    } else {
      await loadEditMode();
      $('#editButton').click();
      if(!$('#editorSidebar button[icon=data_object].active'))
        $('#editorSidebar button[icon=data_object]').click();
    }
  }
});

async function toggleEditMode() {
  await loadEditMode();
  if(edit)
    $('body').classList.remove('edit');
  else
    $('body').classList.add('edit');
  edit = !edit;
  if(edit)
    openEditor();
  showOverlay();
  setScale();
}

onLoad(function() {
  on('#pileOverlay', 'click', e=>e.target.id=='pileOverlay'&&showOverlay());

  on('#gridOverlay', 'click', e=>e.target.id=='gridOverlay'&&showOverlay());

  on('#toolbar > img', 'click', e=>$('#statesButton').click());

  on('.toolbarButton', 'click', function(e) {
    if(isLoading) {
      e.stopImmediatePropagation();
      return;
    }
  });

  on('.toolbarButton', 'touchstart', function(e) {
    usedTouch = true;
    $('body').classList.add('usedTouch');
  });

  on('.toolbarTab', 'click', function(e) {
    if(e.currentTarget.classList.contains('active')) {
      if($('#stateDetailsOverlay.notEditing') && $('#stateDetailsOverlay.notEditing').style.display != 'none')
        showStatesOverlay('statesOverlay');
      if(e.currentTarget == $('#activeGameButton') && $('#buttonInputOverlay').style.display == 'none')
        showOverlay();
      e.stopImmediatePropagation();
      return;
    }
    for(const tabButton of $a('.toolbarTab'))
      toggleClass(tabButton, 'active', tabButton == e.currentTarget);

    if(e.currentTarget == $('#editButton') || edit)
      toggleEditMode();
  });

  on('#activeGameButton', 'click', function() {
    showOverlay();
  });

  on('.toolbarButton', 'click', async function(e) {
    const overlay = e.currentTarget.dataset.overlay;
    if(overlay) {
      if(overlay == 'addOverlay')
        await loadEditMode();

      showOverlay(overlay);
      if(overlay == 'statesOverlay')
        updateFilterOverflow();
    }
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
      const entry = domByTemplate('template-betaServerList-entry', {}, 'tr');
      $('button', entry).textContent = betaServerName;
      var thisstatus = config.betaServers[betaServerName].return ? 'check' : 'cancel';
      $('.return', entry).textContent = thisstatus;
      $('.return', entry).classList.add(thisstatus);
      $('.description', entry).textContent = config.betaServers[betaServerName].description;
      $('#betaServerList').appendChild(entry);
    }
    on('#betaServerList button', 'click', function(e) {
      toServer('setRedirect', e.currentTarget.textContent);
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
  if(!location.href.includes('/game/') && !location.href.includes('/tutorial/'))
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
    let tabSuffix = config.customTab || config.serverName || 'VirtualTabletop.io';
    document.title = `${document.location.pathname.split('/').pop()} - ${tabSuffix}`;
    $('#playerInviteURL').innerText = location.href;
  });
});

function getEdit() {
  return edit;
}

function setJEenabled(v) {
  jeEnabled = v;
}

function setJEroutineLogging(v) {
  jeRoutineLogging = v;
}

window.onresize = function(event) {
  setScale();
}

window.onkeyup = function(event) {
  if(event.key == 'Escape') {
    if($('body.edit #editorSidebar button.active'))
      $('#editorSidebar button.active').click();
    else if(edit)
      $('#editorToolbar button[icon=close]').click();
    else if(overlayActive && $('#buttonInputOverlay').style.display == 'none')
      $('#activeGameButton').click();
    else if($('#buttonInputCancel').style.visibility == 'visible')
      $('#buttonInputCancel').click();
  }
}
