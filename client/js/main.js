import { $, $a, onLoad, selectFile, asArray, toggleClass } from './domhelpers.js';
import { startWebSocket, toServer } from './connection.js';
import { calculateLayout, calculateEditModuleClasses, isEditSidebarNarrow, isOrientationMismatch, viewportConfig, DEFAULT_VIEWPORT, LAYOUT_CLASSES, MIN_BOARD_SIZE, MAX_BOARD_SIZE } from './calculateLayout.js';

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

export function compareDropTarget(widget, t, exclude){
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

// How dropLimit is read wherever it is enforced: a target holding currentCount
// widgets takes count more only while that stays within the limit. currentCount
// has to leave out the widget being dropped - putting one back where it already
// is does not add to the count. Lines pass their number of stops instead of the
// default children count, because that is what a line's limit bounds. Counting
// the children is left until the limit turns out to be real: children() sorts
// the child array, and the default -1 is what nearly every widget has.
export function exceedsDropLimit(target, count = 1, currentCount = null) {
  const limit = target.get('dropLimit');
  if(!(limit > -1))
    return false;
  return (currentCount === null ? target.children().length : currentCount) + count > limit;
}

function getValidDropTargets(widget, dragged = widget) {
  const targets = [];
  for(const [ _, t ] of dropTargets) {
    if(!t.isVisible())
      continue;

    // if the holder has a drop limit and it's reached, skip the holder -
    // unless the dragged widget is already its child and just goes back in
    if(exceedsDropLimit(t) && t.children().indexOf(widget) == -1)
      continue;

    let isValid = compareDropTarget(widget, t);

    let tt = t;
    while(isValid) {
      if(widget == tt || dragged == tt) {
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

export function getMaxZ(layer) {
  return maxZ[layer] || 0;
}

export async function resetMaxZ(layer) {
  maxZ[layer] = 0;
  for(const w of widgetFilter(w=>w.get('layer')==layer&&w.state.z).sort((a,b)=>a.get('z')-b.get('z')))
    await w.set('z', ++maxZ[layer]);
}

export function updateMaxZ(layer, z) {
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
          setLibraryTypeTab('Tutorials');
        } else if(location.hash == '#About') {
          urlProperties.about = true;
          $('#aboutButton').click();
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
        roomID = normalizeRoomID(urlProperties.askID + $('#enteredID').value);
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
  const targetW = viewportConfig.targetWidth;
  const targetH = viewportConfig.targetHeight;
  const targetAspect = targetW / targetH;

  document.documentElement.style.setProperty('--roomWidth', `${targetW}px`);
  document.documentElement.style.setProperty('--roomHeight', `${targetH}px`);

  const layoutOptions = { toolbarHidden: $('body').className.match(/hiddenToolbar/) != null };

  // set before measuring below - they decide where the module panel sits and how wide the sidebar
  // is, and so how much room is left. Only in edit mode: in play mode there is neither a module
  // panel nor a sidebar and game CSS shouldn't see them.
  $('body').classList.remove('editModulesAbove', 'editModulesOverlay', 'narrowEditSidebar');
  if(edit || jeEnabled) {
    $('body').classList.add(...calculateEditModuleClasses(w, h, viewportConfig));
    toggleClass($('body'), 'narrowEditSidebar', isEditSidebarNarrow(w, h, viewportConfig));
  }

  if(edit || jeEnabled) {
    const targetWidth = targetW / zoom;
    const targetHeight = targetH / zoom;
    const availableRect = getAvailableRoomRectangle();
    const availableWidth = availableRect.right-availableRect.left;
    const availableHeight = availableRect.bottom-availableRect.top;

    scale = availableWidth/availableHeight < targetAspect ? availableWidth/targetWidth : availableHeight/targetHeight;

    const offsetX = offset[0] + (1-zoom)/2*targetW*scale/zoom;
    const offsetY = offset[1] + (1-zoom)/2*targetH*scale/zoom;

    if(availableWidth/availableHeight < targetAspect) {
      document.documentElement.style.setProperty('--editModeRoomLeft', (offsetX + availableRect.left) + 'px');
      document.documentElement.style.setProperty('--editModeRoomTop', (offsetY + availableRect.top + (availableHeight-scale*targetHeight)/2) + 'px');
    } else {
      document.documentElement.style.setProperty('--editModeRoomLeft', (offsetX + availableRect.left + (availableWidth-scale*targetWidth)/2) + 'px');
      document.documentElement.style.setProperty('--editModeRoomTop', (offsetY + availableRect.top) + 'px');
    }
    document.documentElement.style.setProperty('--roomZoom', zoom);
    layoutOptions.scale = scale;
  }

  const layout = calculateLayout(w, h, viewportConfig, layoutOptions);
  scale = layout.scale;
  for(const layoutClass of LAYOUT_CLASSES)
    toggleClass($('body'), layoutClass, layoutClass == layout.layoutClass);
  toggleClass($('body'), 'orientationMismatch', isOrientationMismatch(w, h, viewportConfig));

  document.documentElement.style.setProperty('--scale', scale);
  updateToolbarLayout();
  roomRectangle = $('#roomArea').getBoundingClientRect();
  setSidebar(); // the game details sidebar is a container query on the board, so it flips with it
  if(edit)
    scaleHasChanged(scale);
  refreshIgnoreZoomWidgets();
}

// Everything that has to happen when the board size changed, on top of viewportConfig
// itself: setViewportSize decides whether it did, this applies it. Called from the state
// message (serverstate.js) as well as from the meta message (legacymodes.js) - both carry
// the game settings and either one can be the first to bring in a new board size.
function applyViewportLayout() {
  setScale();
  // no widget changed, but pile handles are placed relative to the board edges
  for(const w of widgets.values())
    if(w.updateHandlePlacement)
      w.updateHandlePlacement();
}

// Each toolbar layout (wide, narrow, horizontal and the one for aspectTooGood) has multiple
// compaction levels in the CSS. Instead of hardcoding a viewport size for each of them, the
// lowest level that makes all buttons fit is used - and if not even the most compact level
// fits, the toolbar becomes scrollable (with arrows hinting at the hidden buttons).
const toolbarCompactionLevels = 4;

function updateToolbarLayout() {
  const toolbar = $('#toolbar');
  if(!toolbar.getClientRects().length)
    return; // hidden in edit mode, in the JSON editor or through the hideToolbar URL property

  // the scroll arrows are flex items that take space away from the buttons, so measuring while
  // they are still there would make the result depend on the previous state - and with that on
  // the direction the window was resized in
  toggleClass($('body'), 'toolbarOverflow', false);

  let fits = false;
  for(let level = 0; level <= toolbarCompactionLevels && !fits; ++level) {
    for(let i = 1; i <= toolbarCompactionLevels; ++i)
      toggleClass($('body'), `toolbarCompact${i}`, i <= level);
    fits = toolbarContentFits(toolbar);
  }
  toggleClass($('body'), 'toolbarOverflow', !fits);
  updateToolbarScrolling();
}

// Applying a compaction level resizes the toolbar, which is also the element that is observed
// for resizes. Doing that from within the ResizeObserver callback makes the browser abort the
// delivery loop and report "ResizeObserver loop completed with undelivered notifications" as an
// error - which the client turns into a crash overlay - so observed resizes are handled in the
// next frame instead, outside of the delivery loop.
let toolbarLayoutIsScheduled = false;

function scheduleToolbarLayoutUpdate() {
  if(toolbarLayoutIsScheduled)
    return;
  toolbarLayoutIsScheduled = true;
  requestAnimationFrame(_=>{
    toolbarLayoutIsScheduled = false;
    updateToolbarLayout();
  });
}

function toolbarContentFits(toolbar) {
  const px = value => parseFloat(value) || 0;
  const horizontal = $('body').classList.contains('horizontalToolbar');
  const toolbarRect = toolbar.getBoundingClientRect();
  const toolbarStyle = getComputedStyle(toolbar);

  let contentEnd = 0;
  for(const child of toolbar.children) {
    if(!child.getClientRects().length)
      continue;
    const rect = child.getBoundingClientRect();
    const style = getComputedStyle(child);
    contentEnd = Math.max(contentEnd, horizontal ? rect.right + px(style.marginRight) : rect.bottom + px(style.marginBottom));
  }
  contentEnd += horizontal ? toolbar.scrollLeft : toolbar.scrollTop;

  const available = horizontal ? toolbarRect.right - px(toolbarStyle.paddingRight) : toolbarRect.bottom - px(toolbarStyle.paddingBottom);
  return contentEnd <= available + 0.5;
}

function updateToolbarScrolling() {
  const toolbar = $('#toolbar');
  const horizontal = $('body').classList.contains('horizontalToolbar');
  const position = horizontal ? toolbar.scrollLeft : toolbar.scrollTop;
  const visible = horizontal ? toolbar.clientWidth : toolbar.clientHeight;
  const content = horizontal ? toolbar.scrollWidth : toolbar.scrollHeight;
  toggleClass($('body'), 'toolbarScrollBack', position > 1);
  toggleClass($('body'), 'toolbarScrollForward', position + visible < content - 1);
  positionToolbarPopups();
  positionToolbarTooltip();
}

// clicking one of the arrows scrolls by roughly one screen and returns true - the arrows are
// pseudo elements, so whether a click on one is reported on the toolbar or on a button that
// scrolled underneath it depends on the scroll position, which is why the caller catches the
// click in the capture phase. A vertical mouse wheel does not scroll a horizontally scrolling
// container, so that is translated in scrollToolbarByWheel below.
function scrollToolbarByArrow(e) {
  const body = $('body').classList;
  if(!body.contains('toolbarOverflow'))
    return false;

  const toolbar = $('#toolbar');
  const rect = toolbar.getBoundingClientRect();
  const horizontal = body.contains('horizontalToolbar');
  const arrow = parseFloat(getComputedStyle(toolbar).getPropertyValue('--toolbarArrowSize')) || 0;
  const back = body.contains('toolbarScrollBack') && (horizontal ? e.clientX < rect.left + arrow : e.clientY < rect.top + arrow);
  const forward = body.contains('toolbarScrollForward') && (horizontal ? e.clientX > rect.right - arrow : e.clientY > rect.bottom - arrow);
  if(back || forward)
    scrollToolbarBy((horizontal ? toolbar.clientWidth : toolbar.clientHeight) * (back ? -0.8 : 0.8), 'smooth');
  return back || forward;
}

function scrollToolbarByWheel(e) {
  if(!$('body').classList.contains('horizontalToolbar') || !$('body').classList.contains('toolbarOverflow') || e.deltaX)
    return;
  // deltaMode says whether the wheel reports pixels, lines or pages
  scrollToolbarBy(e.deltaY * ([ 1, 16, $('#toolbar').clientWidth ][e.deltaMode] || 1));
  e.preventDefault();
}

function scrollToolbarBy(amount, behavior) {
  const horizontal = $('body').classList.contains('horizontalToolbar');
  $('#toolbar').scrollBy({ [horizontal ? 'left' : 'top']: amount, behavior });
}

const toolbarPopups = [ { popup: '#options', button: '#optionsButton' }, { popup: '#zoomControls', button: '#zoom2xButton' } ];

// While the toolbar scrolls, it clips everything that reaches outside of it - so the sound and
// zoom popups are positioned relative to the viewport instead of relative to their button.
function positionToolbarPopups() {
  const overflow = $('body').classList.contains('toolbarOverflow');
  const horizontal = $('body').classList.contains('horizontalToolbar');
  const toolbarRect = $('#toolbar').getBoundingClientRect();
  for(const { popup: selector } of toolbarPopups) {
    const popup = $(selector);
    if(!overflow || popup.classList.contains('hidden')) {
      resetToolbarFlyout(popup);
      continue;
    }
    const anchorRect = popup.parentNode.getBoundingClientRect();
    if(horizontal)
      positionToolbarFlyout(popup, anchorRect.left + 32 - popup.offsetWidth, toolbarRect.top - popup.offsetHeight - 2);
    else
      positionToolbarFlyout(popup, toolbarRect.right + 4, anchorRect.top - 2);
  }
}

// the same for the tooltip of the button the mouse is on - the wide toolbar shows its tooltips
// inside of the toolbar, so those are not clipped and stay where the CSS puts them
let hoveredToolbarButton = null;
let positionedTooltip = null;

function positionToolbarTooltip() {
  if(positionedTooltip)
    resetToolbarFlyout(positionedTooltip);
  positionedTooltip = null;

  const body = $('body').classList;
  if(!hoveredToolbarButton || body.contains('wideToolbar'))
    return;
  const tooltip = $('.tooltip', hoveredToolbarButton);
  if(!tooltip)
    return;

  // the sound and zoom popups open exactly where the tooltip of their button goes
  for(const { popup, button } of toolbarPopups) {
    if(hoveredToolbarButton == $(button) && !$(popup).classList.contains('hidden')) {
      positionedTooltip = tooltip;
      tooltip.style.display = 'none';
      return;
    }
  }
  if(!body.contains('toolbarOverflow'))
    return;

  positionedTooltip = tooltip;
  const toolbarRect = $('#toolbar').getBoundingClientRect();
  const buttonRect = hoveredToolbarButton.getBoundingClientRect();
  if(body.contains('horizontalToolbar'))
    positionToolbarFlyout(tooltip, buttonRect.left + (buttonRect.width - tooltip.offsetWidth)/2, toolbarRect.top - tooltip.offsetHeight - 2);
  else
    positionToolbarFlyout(tooltip, toolbarRect.right + 4, buttonRect.top + (buttonRect.height - tooltip.offsetHeight)/2);
}

function positionToolbarFlyout(element, left, top) {
  element.style.right = 'auto';
  element.style.left = Math.max(0, Math.min(left, window.innerWidth - element.offsetWidth)) + 'px';
  element.style.top = Math.max(0, Math.min(top, window.innerHeight - element.offsetHeight)) + 'px';
}

function resetToolbarFlyout(element) {
  element.style.top = element.style.left = element.style.right = element.style.display = '';
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

async function uploadAsset(multipleCallback, fileTypes) {
  if(typeof(multipleCallback) === "function") {
    return selectFile('BINARY', async function (f) {
      let uploadPath = await _uploadAsset(f).catch(e=>{
        alert(`Uploading failed: ${e.toString()}`);
        return null;
      });
      multipleCallback(uploadPath, f.name)
    }).catch(e=>{
      if(e.message !== 'File selection cancelled.')
        alert(`Error: ${e.toString()}`);
    });
  }
  else {
    return selectFile('BINARY', null, fileTypes).then(_uploadAsset).catch(e=>{
      if(e.message !== 'File selection cancelled.')
        alert(`Uploading failed: ${e.toString()}`);
      return null;
    });
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
// Images that turned out not to be SVGs once they were loaded. Their contents can't be
// replaced, so they are used as they are instead of being wrapped into a broken data URL.
const nonSVGCache = {};

// Loads an image and returns its text if it is an SVG whose contents can be replaced, null if it
// is anything else. What decides that are the bytes of the file and not its name: an uploaded
// asset is served from /assets/<hash>_<size> without any extension at all, so only the built-in
// game pieces have a URL that says what they are. Rejects when the file can't be read - that says
// nothing about what it is, so every caller decides for itself what to assume then. The SVG
// replacement editor asks the same question about the same file and goes through here too.
export async function fetchSVG(url) {
  const mappedURL = mapAssetURLs(url);
  const response = await fetch(mappedURL);
  if(!response.ok)
    throw new Error(`Loading ${url} failed with status ${response.status}.`);
  // /assets/<hash> and /i/** are served by vtt itself, so their content type can be trusted, and a
  // bitmap saying so is the common case - no reason to pull a multi-megabyte PNG through the wire
  // and decode it as text just to find no <svg> in it. Everywhere else the header is whatever a
  // foreign host claims, and an SVG mislabeled as a bitmap used to work, so there the bytes decide.
  const contentType = /^(assets|i)\//.test(mappedURL) ? response.headers.get('content-type') || '' : '';
  if(contentType && !/svg|xml|text|octet-stream/i.test(contentType)) {
    if(response.body && response.body.cancel)
      response.body.cancel();
    return null;
  }
  const text = await response.text();
  return /<svg/i.test(text) ? text : null;
}

export function getSVG(url, replaces, callback) {
  // like the cached SVG below this returns the finished value right away, so the callback - which
  // exists to tell the widget that the file has arrived - isn't needed and isn't called
  if(nonSVGCache[url])
    return mapAssetURLs(url);

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
    // an image that can't be loaded is treated like one that is not an SVG: the widget then uses
    // the URL as it is, which is all a browser needs anyway - an external image is blocked from
    // fetch() by CORS but still displays fine as a background-image
    fetchSVG(url).catch(_=>null).then(t=>{
      const callbacks = svgCache[url];
      if(t !== null) {
        svgCache[url] = t;
      } else {
        nonSVGCache[url] = true;
        delete svgCache[url];
      }
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
      setJEenabled, setJEroutineLogging, setZoomAndOffset, resetZoomAndPan, toggleEditMode, getEdit,
      toServer, batchStart, batchEnd, setDeltaCause, sendPropertyUpdate, getUndoProtocol, setUndoProtocol, sendRawDelta, getDelta,
      addWidgetLocal, updateWidgetId, removeWidgetLocal,
      loadZipLibrary, waitForZipLibrary, zipBlob,
      generateUniqueWidgetID, unescapeID, regexEscape, setScale, getScale, getRoomRectangle, getMaxZ, getZoomLevel,
      uploadAsset, _uploadAsset, mapAssetURLs, fetchSVG, pickSymbol, pickAudio, cancelAudioPicker, toNotoMonochrome, skipForNotoMonochrome, selectFile, triggerDownload,
      config, getPlayerDetails, roomID, getDeltaID, widgets, widgetFilter, isOverlayActive,
      viewportConfig, DEFAULT_VIEWPORT, MIN_BOARD_SIZE, MAX_BOARD_SIZE, calculateEditModuleClasses, isOrientationMismatch,
      html, formField,
      Widget, BasicWidget, Button, Canvas, Card, Deck, Dice, Holder, Label, Line, Pile, Scoreboard, Seat, Spinner, Timer,
      toHex, contrastAnyColor,
      asArray, compute_ops, positionNames, expressionError, expressionNames,
      eventCoords,
      getCurrentGameSettings, legacyMode, getEnabledLegacyModes, LEGACY_MODES
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
  resetZoomAndPan();
  if(edit)
    openEditor();
  showOverlay();
  setScale();
}

onLoad(function() {
  on('#pileOverlay', 'click', e=>e.target.id=='pileOverlay'&&showOverlay());

  on('#gridOverlay', 'click', e=>e.target.id=='gridOverlay'&&showOverlay());

  on('#toolbar > img', 'click', e=>$('#statesButton').click());

  on('#toolbar', 'scroll', updateToolbarScrolling);
  $('#toolbar').addEventListener('click', function(e) {
    if(scrollToolbarByArrow(e))
      e.stopPropagation(); // the arrow was clicked, not the button that scrolled underneath it
  }, true);
  on('#toolbar', 'click', _=>updateToolbarScrolling()); // a click may have toggled a popup
  on('#toolbar', 'wheel', scrollToolbarByWheel);
  on('#toolbar', 'mouseover', e=>{
    hoveredToolbarButton = e.target.closest('.toolbarButton');
    positionToolbarTooltip();
  });
  on('#toolbar', 'mouseleave', _=>{
    hoveredToolbarButton = null;
    positionToolbarTooltip();
  });
  // catches everything that resizes the toolbar without a setScale, especially it becoming visible again
  new ResizeObserver(scheduleToolbarLayoutUpdate).observe($('#toolbar'));
  document.fonts.ready.then(_=>updateToolbarLayout()); // the icon font changes the button sizes

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
      // the returned promises reject when the browser denies the request (for
      // example inside an iframe without allowfullscreen) - don't treat that
      // as a client error
      if(!document.fullscreenElement)
        document.documentElement.requestFullscreen().catch(e=>console.warn(`Could not enter fullscreen mode: ${e.message}`));
      else
        document.exitFullscreen().catch(e=>console.warn(`Could not exit fullscreen mode: ${e.message}`));
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
  on('#showToolbarButton', 'click', function() {
    $('body').classList.remove('hiddenToolbar');
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
  if(!location.href.includes('/game/') && !location.href.includes('/tutorial/') && !location.href.includes('/library/'))
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
