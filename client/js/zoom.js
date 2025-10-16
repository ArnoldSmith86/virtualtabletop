let zoomScale = 1;
let currentZoomLevel = 1;

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

function resetZoomAndPan() {
  currentZoomLevel = 1;
  document.documentElement.style.setProperty('--roomZoom', 1);
  document.documentElement.style.setProperty('--roomPanX', '0px');
  document.documentElement.style.setProperty('--roomPanY', '0px');
  $('body').classList.remove('zoom2x');
  $('body').classList.remove('panning');
  zoomScale = 1;
  const button = $('#zoom2xButton');
  if(button) {
    const tooltip = button.querySelector('.tooltip');
    if(tooltip)
      tooltip.textContent = `1x Zoom`;
  }
  roomRectangle = $('#room').getBoundingClientRect();
}

onLoad(function() {
  // Zoom functionality with scroll wheel and drag-to-pan
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
    const targetZoom = mainZoomLevels[nextIndex];

    // If going back to 1x, just reset
    if(targetZoom === 1) {
      resetZoomAndPan();
      return;
    }

    // Zoom to center of visible room area
    setZoomLevel(targetZoom);
    const newRoomRect = $('#topSurface').getBoundingClientRect();
    const roomAreaRect = $('#roomArea').getBoundingClientRect();
    const centerPanX = (roomAreaRect.width - newRoomRect.width) / 2;
    const centerPanY = (roomAreaRect.height - newRoomRect.height) / 2;
    const clampedPanX = Math.max(roomAreaRect.width - newRoomRect.width, Math.min(0, centerPanX));
    const clampedPanY = Math.max(roomAreaRect.height - newRoomRect.height, Math.min(0, centerPanY));
    document.documentElement.style.setProperty('--roomPanX', clampedPanX + 'px');
    document.documentElement.style.setProperty('--roomPanY', clampedPanY + 'px');
    roomRectangle = $('#room').getBoundingClientRect();
  });

  // Scroll wheel zoom with zoom-to-cursor (relative to #room)
  on('#roomArea', 'wheel', function(e){
    if(overlayActive)
      return; // allow normal wheel behavior when an overlay is active
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

  // Drag to pan functionality (left mouse only)
  on('#roomArea', 'mousedown', function(e){
    if(e.button !== 0)
      return;
    if(edit)
      return; // disable panning in edit mode
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

  // Middle-click toggle zoom (anchor under cursor)
  on('#roomArea', 'mousedown', function(e){
    if(e.button !== 1)
      return;
    if(edit)
      return; // disable middle-click zoom in edit mode
    if(overlayActive)
      return;
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();

    // Compute relative cursor location inside topSurface
    const roomRect = $('#topSurface').getBoundingClientRect();
    const relX = (e.clientX - roomRect.left) / roomRect.width;
    const relY = (e.clientY - roomRect.top) / roomRect.height;

    // Decide target zoom: toggle 1x <-> 2x
    const targetZoom = currentZoomLevel === 1 ? 2 : 1;
    if(targetZoom === currentZoomLevel)
      return;
    setZoomLevel(targetZoom);

    // Adjust pan to keep cursor anchored
    const newRoomRect = $('#topSurface').getBoundingClientRect();
    const roomAreaRect = $('#roomArea').getBoundingClientRect();
    const panX = (e.clientX - relX * newRoomRect.width - roomAreaRect.left);
    const panY = (e.clientY - relY * newRoomRect.height - roomAreaRect.top);
    const finalPanX = Math.max(roomAreaRect.width - newRoomRect.width, Math.min(0, panX));
    const finalPanY = Math.max(roomAreaRect.height - newRoomRect.height, Math.min(0, panY));
    document.documentElement.style.setProperty('--roomPanX', finalPanX + 'px');
    document.documentElement.style.setProperty('--roomPanY', finalPanY + 'px');
    roomRectangle = $('#room').getBoundingClientRect();
  });

  // Swallow middle-button mouseup to avoid widget interactions
  on('#roomArea', 'mouseup', function(e){
    if(e.button === 1) {
      if(edit)
        return; // nothing to swallow in edit mode
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
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

  // Touch: one-finger pan and pinch-to-zoom
  let touchState = {
    active: false,
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

  function elementIsMovableWidget(el) {
    while(el) {
      if(el.id && el.id.slice(0,2) == 'w_' && el.classList && el.classList.contains('movable'))
        if(widgets.has(unescapeID(el.id.slice(2))))
          return true;
      el = el.parentNode;
    }
    return false;
  }

  function touchOnMovable(touch) {
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    return elementIsMovableWidget(el);
  }

  on('#roomArea', 'touchstart', function(e){
    if(overlayActive)
      return;
    if(edit)
      return; // disable touch pan/zoom in edit mode
    if(e.touches.length == 1) {
      // Start panning only when zoomed and not on draggable widget
      if(currentZoomLevel > 1) {
        // Block if finger is on a movable widget
        if(!touchOnMovable(e.touches[0])) {
          touchState.isPanning = true;
          touchState.startX = e.touches[0].clientX;
          touchState.startY = e.touches[0].clientY;
          touchState.panStartX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanX')) || 0;
          touchState.panStartY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanY')) || 0;
          $('body').classList.add('panning');
        }
      }
    } else if(e.touches.length == 2) {
      // Pinch start
      // If any finger is on a movable widget, do not pinch-zoom
      if(touchOnMovable(e.touches[0]) || touchOnMovable(e.touches[1]))
        return;
      touchState.isPanning = false;
      touchState.isPinching = true;
      touchState.startZoom = currentZoomLevel;
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
    if(overlayActive)
      return;
    if(edit)
      return; // disable touch pan/zoom in edit mode
    if(touchState.isPanning && e.touches.length == 1) {
      // Stop panning if finger moved onto a movable widget
      if(touchOnMovable(e.touches[0]))
        return;
      e.preventDefault();
      const deltaX = e.touches[0].clientX - touchState.startX;
      const deltaY = e.touches[0].clientY - touchState.startY;

      const newPanX = touchState.panStartX + deltaX;
      const newPanY = touchState.panStartY + deltaY;

      const roomRect = $('#topSurface').getBoundingClientRect();
      const areaRect = $('#roomArea').getBoundingClientRect();
      const maxPanX = areaRect.width - roomRect.width;
      const maxPanY = areaRect.height - roomRect.height;

      const clampedPanX = Math.max(maxPanX, Math.min(0, newPanX));
      const clampedPanY = Math.max(maxPanY, Math.min(0, newPanY));

      document.documentElement.style.setProperty('--roomPanX', clampedPanX + 'px');
      document.documentElement.style.setProperty('--roomPanY', clampedPanY + 'px');
      roomRectangle = $('#room').getBoundingClientRect();
    } else if(touchState.isPinching && e.touches.length == 2) {
      // Cancel pinch if any finger is on a movable widget
      if(touchOnMovable(e.touches[0]) || touchOnMovable(e.touches[1]))
        return;
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if(touchState.startDist <= 0)
        return;
      let newZoom = Math.max(1, Math.min(10, Math.round((touchState.startZoom * (dist / touchState.startDist)) * 10) / 10));
      if(newZoom === currentZoomLevel)
        return;
      setZoomLevel(newZoom);

      // Maintain anchor under midpoint
      const newRoomRect = $('#topSurface').getBoundingClientRect();
      const areaRect = $('#roomArea').getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX)/2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY)/2;
      const panX = (midX - touchState.anchorRelX * newRoomRect.width - areaRect.left);
      const panY = (midY - touchState.anchorRelY * newRoomRect.height - areaRect.top);
      const finalPanX = Math.max(areaRect.width - newRoomRect.width, Math.min(0, panX));
      const finalPanY = Math.max(areaRect.height - newRoomRect.height, Math.min(0, panY));
      document.documentElement.style.setProperty('--roomPanX', finalPanX + 'px');
      document.documentElement.style.setProperty('--roomPanY', finalPanY + 'px');
      roomRectangle = $('#room').getBoundingClientRect();
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