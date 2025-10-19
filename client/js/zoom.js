let zoomScale = 1;

function setZoomLevel(zoomLevel) {
  zoomScale = zoomLevel;
  
  $('#zoom2xButton .tooltip').textContent = `${zoomScale}x Zoom`;

  // Zoomed mode - enable panning
  $('body').classList.toggle('zoom2x', zoomScale > 1);
  document.documentElement.style.setProperty('--zoom', zoomScale);
  roomRectangle = $('#room').getBoundingClientRect();
  if(globalThis.refreshIgnoreZoomWidgets)
    globalThis.refreshIgnoreZoomWidgets();
}

function resetZoomAndPan() {
  setZoomLevel(1);
  setPan(0, 0);
  $('body').classList.remove('panning');
}

function setPan(x, y) {
  // Clamp pan to valid range
  const maxPanX = 1600 * scale * zoomScale - 1600 * scale;
  const maxPanY = 1000 * scale * zoomScale - 1000 * scale;
  const clampedPanX = Math.max(-maxPanX, Math.min(0, x));
  const clampedPanY = Math.max(-maxPanY, Math.min(0, y));

  document.documentElement.style.setProperty('--roomPanX', clampedPanX + 'px');
  document.documentElement.style.setProperty('--roomPanY', clampedPanY + 'px');
  roomRectangle = $('#room').getBoundingClientRect();
  if(globalThis.refreshIgnoreZoomWidgets)
    globalThis.refreshIgnoreZoomWidgets();
}

function elementIsMovableWidget(el) {
  while(el) {
    if(el.id && el.id.slice(0,2) == 'w_' && el.classList && (el.classList.contains('movable') || el.classList.contains('canvas')) && widgets.has(unescapeID(el.id.slice(2))))
      return true;
    el = el.parentNode;
  }
  return false;
}

// set zoom level and pan so that the given point in the viewport remains at the same position on the screen
function setZoomAroundPoint(newZoomLevel, viewportPixelX, viewportPixelY) {
  // Calculate relative (0-1) location of point inside topSurface
  const roomRect = $('#topSurface').getBoundingClientRect();
  const relX = (viewportPixelX - roomRect.left) / roomRect.width;
  const relY = (viewportPixelY - roomRect.top) / roomRect.height;

  // Set new zoom level
  if(newZoomLevel === zoomScale) return;
  setZoomLevel(newZoomLevel);

  const newRoomRect = $('#topSurface').getBoundingClientRect();
  const roomAreaRect = $('#roomArea').getBoundingClientRect();

  // Figure out how much we need to pan so the target lands under current mouse
  const panX = (viewportPixelX - relX * newRoomRect.width - roomAreaRect.left);
  const panY = (viewportPixelY - relY * newRoomRect.height - roomAreaRect.top);

  // Clamp pan to allowed range based on room size and area size
  setPan(panX, panY);
}

// set zoom level and pan so that the center of the visible room area remains at the same position on the screen
function setZoomAroundCenter(newZoomLevel) {
  const roomAreaRect = $('#roomArea').getBoundingClientRect();
  const centerX = roomAreaRect.left + roomAreaRect.width / 2;
  const centerY = roomAreaRect.top + roomAreaRect.height / 2;
  setZoomAroundPoint(newZoomLevel, centerX, centerY);
}

onLoad(function() {
  // Zoom functionality with scroll wheel and drag-to-pan
  const zoomLevels = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2];
  let isDraggingPan = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panStartX = 0;
  let panStartY = 0;
  let lastWheelZoomTime = 0;
  const minWheelZoomInterval = 40; // milliseconds between zoom events

  // Button click cycles through zoom levels (only main levels)
  on('#zoom2xButton', 'click', function(e){
    const mainZoomLevels = [1, 1.5, 2];
    const currentIndex = mainZoomLevels.indexOf(zoomScale);
    const nextIndex = (currentIndex + 1) % mainZoomLevels.length;
    const targetZoom = mainZoomLevels[nextIndex];

    // If going back to 1x, just reset
    if(targetZoom === 1) {
      resetZoomAndPan();
      return;
    }

    setZoomAroundCenter(targetZoom);
  });

  // Scroll wheel zoom with zoom-to-cursor (relative to #room)
  on('#roomArea', 'wheel', function(e){
    if(overlayActive)
      return; // allow normal wheel behavior when an overlay is active
    e.preventDefault();

    const now = Date.now();
    if(now - lastWheelZoomTime < minWheelZoomInterval)
      return; // throttle zoom events to prevent excessive zoom speed
    lastWheelZoomTime = now;

    const delta = e.deltaY > 0 ? 0.85 : 1.15;
    const newZoomLevel = Math.max(1, Math.min(10, Math.round(zoomScale * delta * 10) / 10));
    setZoomAroundPoint(newZoomLevel, e.clientX, e.clientY);
  });

  // Page up/down zoom
  on('body', 'keydown', function(e){
    if(!overlayActive && !edit && (e.key === 'PageUp' || e.key === 'PageDown')) {
      e.preventDefault();
      const currentIndex = zoomLevels.indexOf(zoomScale);
      const newIndex = e.key === 'PageUp' ? Math.min(zoomLevels.length - 1, currentIndex + 1) : Math.max(0, currentIndex - 1);
      setZoomAroundCenter(zoomLevels[newIndex]);
    }
  });

  // Drag to pan functionality (left mouse only)
  on('#roomArea', 'mousedown', function(e){
    if(e.button === 0 && !edit && !overlayActive && zoomScale > 1 && !isDraggingPan && !elementIsMovableWidget(e.target)) {
      isDraggingPan = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      panStartX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanX')) || 0;
      panStartY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanY')) || 0;
      $('body').classList.add('panning');
    }
  });

  // Middle-click toggle zoom (anchor under cursor)
  on('#roomArea', 'mousedown', function(e){
    if(e.button !== 1 || edit || overlayActive)
      return;

    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();

    setZoomAroundPoint(zoomScale === 1 ? 2 : 1, e.clientX, e.clientY);
  });

  // Swallow middle-button mouseup to avoid widget interactions
  on('#roomArea', 'mouseup', function(e){
    if(e.button === 1 && !edit && !overlayActive) {
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
  });

  on('body', 'mousemove', function(e){
    if(isDraggingPan)
      setPan(panStartX + (e.clientX - dragStartX), panStartY + (e.clientY - dragStartY));
  });

  on('body', 'mouseup', function(e){
    if(isDraggingPan) {
      isDraggingPan = false;
      $('body').classList.remove('panning');
    }
  });

  // Touch: one-finger pan and pinch-to-zoom
  let touchState = {
    isPanning: false,
    startX: 0,
    startY: 0,
    panStartX: 0,
    panStartY: 0,
    // pinch
    isPinching: false,
    startDist: 0,
    startZoom: 1,
    anchorRelX: 0.5,
    anchorRelY: 0.5
  };

  function touchOnMovable(touch) {
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    return elementIsMovableWidget(el);
  }

  on('#roomArea', 'touchstart', function(e){
    // Start panning only when zoomed and not on draggable widget
    // Block if finger is on a movable widget
    if(!edit && !overlayActive && zoomScale > 1 && e.touches.length == 1 && !touchOnMovable(e.touches[0])) {
      touchState.isPanning = true;
      touchState.startX = e.touches[0].clientX;
      touchState.startY = e.touches[0].clientY;
      touchState.panStartX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanX')) || 0;
      touchState.panStartY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanY')) || 0;
      $('body').classList.add('panning');
    } else if(!overlayActive && e.touches.length == 2 && !touchOnMovable(e.touches[0]) && !touchOnMovable(e.touches[1])) {
      touchState.isPanning = false;
      touchState.isPinching = true;
      touchState.startZoom = zoomScale;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchState.startDist = Math.hypot(dx, dy);
      // Anchor: midpoint relative to room
      const roomRect = $('#topSurface').getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX)/2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY)/2;
      touchState.anchorRelX = (midX - roomRect.left) / roomRect.width;
      touchState.anchorRelY = (midY - roomRect.top) / roomRect.height;
    }
  });

  on('#roomArea', 'touchmove', function(e){
    if(touchState.isPanning && e.touches.length == 1 && !touchOnMovable(e.touches[0])) {
      e.preventDefault();
      setPan(touchState.panStartX + (e.touches[0].clientX - touchState.startX), touchState.panStartY + (e.touches[0].clientY - touchState.startY));
    } else if(touchState.isPinching && e.touches.length == 2 && !touchOnMovable(e.touches[0]) && !touchOnMovable(e.touches[1])) {
      e.preventDefault();
      const dist = Math.hypot((e.touches[0].clientX - e.touches[1].clientX), (e.touches[0].clientY - e.touches[1].clientY));
      if(touchState.startDist <= 0)
        return;
      setZoomAroundPoint(Math.max(1, Math.min(10, Math.round((touchState.startZoom * (dist / touchState.startDist)) * 10) / 10)), (e.touches[0].clientX + e.touches[1].clientX)/2, (e.touches[0].clientY + e.touches[1].clientY)/2);
    }
  });

  on('#roomArea', 'touchend', function(e){
    if(e.touches.length == 0) {
      touchState.isPanning = false;
      touchState.isPinching = false;
      $('body').classList.remove('panning');
    }
  });

  on('body', 'mouseleave', function(e){
    if(isDraggingPan) {
      isDraggingPan = false;
      $('body').classList.remove('panning');
    }
  });
});