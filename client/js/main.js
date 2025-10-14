import { $, $a, onLoad, selectFile, asArray } from './domhelpers.js';
import { startWebSocket, toServer } from './connection.js';


export let scale = 1;
let zoomScale = 1;

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

export async function shuffleWidgets(collection, mode = "true random", modeValue = 1, reverseForNonRandom = false) {
  const len = collection.length;
  let indexes = [...Array(len).keys()];
  if (reverseForNonRandom)
    indexes = indexes.reverse();

  let randFunc = (typeof rand === "function") ? rand : Math.random;
  
  const fisherYates = () => {
    for (let i = len-1; i > 0; i--) {
      let j = Math.floor(rand() * (i+1));
      [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
    }
  };

  let fisherYatesSeeded = null;
  if (mode === "seeded") {
    let seed = modeValue;
    const seededRand = function() {
      const x = Math.sin(seed++) * 10000;
      return Math.round((x - Math.floor(x))*1000000)/1000000;
    };

    fisherYatesSeeded = () => {
      for (let i = len-1; i > 0; i--) {
        let j = Math.floor(seededRand() * (i+1));
        [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
      }
    };
  }
  
  const riffleShuffle = () => {
    const mid = Math.floor(len * (0.45 + randFunc() * 0.1));
    let left = indexes.slice(0, mid);
    let right = indexes.slice(mid);
    const riffled = [];
    while (left.length || right.length) {
      if (left.length && (!right.length || randFunc() < 0.5))
        riffled.push(left.shift());
      if (right.length && (!left.length || randFunc() >= 0.5))
        riffled.push(right.shift());
    }
    indexes = riffled;
  };
  
  const overhandShuffle = () => {
    let newIndexes = [];
    let i = 0;
    while (i < indexes.length) {
      let maxPacketSize = Math.max(1, Math.floor(len * 0.4));
      let packetSize = Math.floor(randFunc() * maxPacketSize) + 1;
      let packet = indexes.slice(i, i + packetSize);
      newIndexes.push(packet);
      i += packetSize;
    }
    newIndexes.reverse();
    indexes = newIndexes.flat();
  };
  
  const reverseMode = () => {
    indexes.reverse();
  };
  
  let iterations = (mode === "riffle" || mode === "overhand") ? modeValue : 1;
  for (let i = 0; i < iterations; i++) {
    switch (mode) {
      case "true random":
        if (reverseForNonRandom)
          indexes = indexes.reverse();
        fisherYates();
        break;
      case "seeded":
        fisherYatesSeeded();
        break;
      case "riffle":
        riffleShuffle();
        break;
      case "overhand":
        overhandShuffle();
        break;
      case "reverse":
        reverseMode();
        break;
      default:
        fisherYates();
        break;
    }
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

function splitSVG(svg) {
  let x = 0, y = 0, first = 1;
  return svg.replace(/([Mm])([^a-zA-Z]+)/g, (m, a, b) => {
    let [X, Y] = b.match(/[+-]?(\d*\.\d+|\d+)([eE][+-]?\d+)?/g);
    if(a == 'M') {
      x = +X;
      y = +Y;
    } else {
      x += +X;
      y += +Y;
      m = `M${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return first ? (first = 0, m) : `"/><path fill="#000" d="${m}`;
  });
}

const svgCache = {};
function getSVG(url, replaces, callback) {
  if(typeof svgCache[url] == 'string') {
    const cacheKey = url + JSON.stringify(replaces);
    if(svgCache[cacheKey])
      return svgCache[cacheKey];

    let svg = svgCache[url];
    if(replaces && Object.values(replaces).filter(v=>Array.isArray(v)).length)
      svg = splitSVG(svg);
    for(const replace in replaces) {
      if(Array.isArray(replaces[replace])) {
        for(const r of asArray(replaces[replace]))
          svg = svg.replace(replace, r);
      } else {
        svg = svg.split(replace).join(replaces[replace]);
      }
    }
    svgCache[cacheKey] = 'data:image/svg+xml,'+encodeURIComponent(svg);
    return svgCache[cacheKey];
  }

  if(!svgCache[url]) {
    svgCache[url] = [];
    fetch(mapAssetURLs(url)).then(r=>r.text()).then(t=>{
      const callbacks = svgCache[url];
      svgCache[url] = t;
      for(const [ c, r ] of callbacks)
        c(getSVG(url, r, _=>{}));
    });
  }

  svgCache[url].push([ callback, replaces ]);
  return '';
}

async function loadEditMode() {
  if(edit === null) {
    edit = false;
    Object.assign(window, {
      $, $a, $c, div, progressButton, loadImage, on, onMessage, showOverlay, sleep, rand, shuffleArray,
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

  // Zoom functionality with scroll wheel and drag-to-pan
  let currentZoomLevel = 1;
  const zoomLevels = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2];
  let isDraggingPan = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panStartX = 0;
  let panStartY = 0;

  // Button click cycles through zoom levels (only main levels)
  on('#zoom2xButton', 'click', function(e){
    const mainZoomLevels = [1, 1.5, 2];
    const currentIndex = mainZoomLevels.indexOf(currentZoomLevel);
    const nextIndex = (currentIndex + 1) % mainZoomLevels.length;
    setZoomLevel(mainZoomLevels[nextIndex]);
  });

  // Scroll wheel zoom with zoom-to-cursor (relative to #room)
  on('#roomArea', 'wheel', function(e){
    e.preventDefault();

    // Calculate relative (0-1) cursor location inside topSurface
    const roomRect = $('#topSurface').getBoundingClientRect();
    const relX = (e.clientX - roomRect.left) / roomRect.width;
    const relY = (e.clientY - roomRect.top) / roomRect.height;

    // Set new zoom level
    const delta = e.deltaY > 0 ? 0.85 : 1.15;
    const newZoomLevel = Math.max(1, Math.min(10, Math.round(currentZoomLevel * delta * 10) / 10));
    if(newZoomLevel === currentZoomLevel) return;
    setZoomLevel(newZoomLevel);

    const newRoomRect = $('#topSurface').getBoundingClientRect();
    const roomAreaRect = $('#roomArea').getBoundingClientRect();

    // Figure out how much we need to pan so the target lands under current mouse
    const panX = (e.clientX - relX * newRoomRect.width - roomAreaRect.left);
    const panY = (e.clientY - relY * newRoomRect.height - roomAreaRect.top);

    // Clamp pan to allowed range based on room size and area size
    const finalPanX = Math.max(roomAreaRect.width - newRoomRect.width, Math.min(0, panX));
    const finalPanY = Math.max(roomAreaRect.height - newRoomRect.height, Math.min(0, panY));
    document.documentElement.style.setProperty('--roomPanX', finalPanX + 'px');
    document.documentElement.style.setProperty('--roomPanY', finalPanY + 'px');
    roomRectangle = $('#room').getBoundingClientRect();
  });


  // Page up/down zoom
  on('body', 'keydown', function(e){
    if(e.key === 'PageUp') {
      e.preventDefault();
      const currentIndex = zoomLevels.indexOf(currentZoomLevel);
      const newIndex = Math.min(zoomLevels.length - 1, currentIndex + 1);
      setZoomLevel(zoomLevels[newIndex]);
    } else if(e.key === 'PageDown') {
      e.preventDefault();
      const currentIndex = zoomLevels.indexOf(currentZoomLevel);
      const newIndex = Math.max(0, currentIndex - 1);
      setZoomLevel(zoomLevels[newIndex]);
    }
  });

  // Drag to pan functionality
  on('#roomArea', 'mousedown', function(e){
    if(currentZoomLevel > 1 && !isDraggingPan) {
      // Check if clicking on a draggable widget
      let target = e.target;
      while(target && (!target.id || target.id.slice(0,2) != 'w_' || !target.classList.contains('movable') || !widgets.has(unescapeID(target.id.slice(2))))) {
        target = target.parentNode;
      }
      
      // Only start panning if not clicking on a widget
      if(!target || !target.id) {
        isDraggingPan = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        panStartX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanX')) || 0;
        panStartY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanY')) || 0;
        $('body').classList.add('panning');
      }
    }
  });

  on('body', 'mousemove', function(e){
    if(isDraggingPan) {
      const deltaX = e.clientX - dragStartX;
      const deltaY = e.clientY - dragStartY;
      
      // Apply delta to pan position
      const newPanX = panStartX + deltaX;
      const newPanY = panStartY + deltaY;
      
      // Clamp pan to valid range
      const maxPanX = 1600 * scale * currentZoomLevel - 1600 * scale;
      const maxPanY = 1000 * scale * currentZoomLevel - 1000 * scale;
      
      const clampedPanX = Math.max(-maxPanX, Math.min(0, newPanX));
      const clampedPanY = Math.max(-maxPanY, Math.min(0, newPanY));
      
      document.documentElement.style.setProperty('--roomPanX', clampedPanX + 'px');
      document.documentElement.style.setProperty('--roomPanY', clampedPanY + 'px');
      roomRectangle = $('#room').getBoundingClientRect();
    }
  });

  on('body', 'mouseup', function(e){
    if(isDraggingPan) {
      isDraggingPan = false;
      $('body').classList.remove('panning');
    }
  });

  on('body', 'mouseleave', function(e){
    if(isDraggingPan) {
      isDraggingPan = false;
      $('body').classList.remove('panning');
    }
  });

  function setZoomLevel(zoomLevel) {
    currentZoomLevel = zoomLevel;
    
    // Update button text to show current zoom
    const button = $('#zoom2xButton');
    const tooltip = button.querySelector('.tooltip');
    tooltip.textContent = `${currentZoomLevel}x Zoom`;
    
    if(currentZoomLevel === 1) {
      // Normal zoom - disable panning
      $('body').classList.remove('zoom2x');
      document.documentElement.style.setProperty('--roomZoom', 1);
      document.documentElement.style.setProperty('--roomPanX', '0px');
      document.documentElement.style.setProperty('--roomPanY', '0px');
      zoomScale = 1;
    } else {
      // Zoomed mode - enable panning
      $('body').classList.add('zoom2x');
      document.documentElement.style.setProperty('--roomZoom', currentZoomLevel);
      
      zoomScale = currentZoomLevel;
    }
    roomRectangle = $('#room').getBoundingClientRect();
  }

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
