let mouseTarget = null;
const mouseStatus = {};

function eventCoords(name, e) {
  let coords;
  if(name == 'touchend')
    coords = e.changedTouches[0];
  else if(name == 'touchstart' || name == 'touchmove')
    coords = e.targetTouches[0];
  else
    coords = e;
  let x = (coords.clientX - roomRectangle.left) / scale;
  let y = (coords.clientY - roomRectangle.top) / scale;
  if(!jeZoomOut) {
    x = Math.max(0, Math.min(1600, x));
    y = Math.max(0, Math.min(1000, y));
  }
  return {x, y, clientX: coords.clientX, clientY: coords.clientY};
}

async function inputHandler(name, e) {
  if(overlayActive || e.target.id == 'jeText' || e.target.id == 'jeCommands')
    return;

  const editMovable = edit || typeof jeEnabled == 'boolean' && jeEnabled && e.ctrlKey;

  if(!mouseTarget && [ 'TEXTAREA', 'INPUT', 'BUTTON', 'OPTION', 'LABEL', 'SELECT' ].indexOf(e.target.tagName) != -1)
    if(!editMovable || !e.target.parentNode || !e.target.parentNode.className.match(/label/))
      return;

  e.preventDefault();

  if(name == 'mousedown' || name == 'touchstart') {
    if (!window.getSelection().isCollapsed)
      window.getSelection().collapseToEnd();
    document.activeElement.blur();
  }
  let target = e.target;
  while(target && (!target.id || !widgets.has(target.id)))
    target = target.parentNode;

  const coords = eventCoords(name, e);
  if(name == 'mousedown')
    mouseTarget = target;
  else if(name == 'mousemove' || name == 'mouseup')
    target = mouseTarget;

  if(target && target.id) {
    batchStart();
    if(!edit && (!jeEnabled || !e.ctrlKey) && widgets.get(target.id).passthroughMouse) {
      if(name == 'mousedown' || name == 'touchstart') {
        await widgets.get(target.id).mouseRaw('down', coords);
      } else if (name == 'mouseup' || name == 'touchend') {
        await widgets.get(target.id).mouseRaw('up', coords);
      } else if (name == 'mousemove' || name == 'touchmove') {
        await widgets.get(target.id).mouseRaw('move', coords);
      }
    } else if(name == 'mousedown' || name == 'touchstart') {
      mouseStatus[target.id] = {
        status: 'initial',
        start: new Date(),
        downCoords: coords,
        moveTarget: target
      };
      let movable = false;
      let widget;
      while (mouseStatus[target.id].moveTarget && !movable) {
        widget = widgets.get(mouseStatus[target.id].moveTarget.id);
        movable = widget.get(editMovable ? 'movableInEdit' : 'movable');
        if (!movable) {
          do {
            mouseStatus[target.id].moveTarget = mouseStatus[target.id].moveTarget.parentNode;
          } while (mouseStatus[target.id].moveTarget && (!mouseStatus[target.id].moveTarget.id || !widgets.has(mouseStatus[target.id].moveTarget.id)));
        }
      }
      if (movable) {
        mouseStatus[target.id].widget = widget;
        mouseStatus[target.id].localAnchor = widget.coordLocalFromCoordClient({x: coords.clientX, y: coords.clientY});
      }
    } else if(name == 'mouseup' || name == 'touchend' && mouseStatus[target.id]) {
      const ms = mouseStatus[target.id];
      const timeSinceStart = +new Date() - ms.start;
      const pixelsMoved = ms.coords ? Math.abs(ms.coords.x - ms.downCoords.x) + Math.abs(ms.coords.y - ms.downCoords.y) : 0;
      if(ms.status != 'initial' && mouseStatus[target.id].moveTarget)
        await ms.widget.moveEnd(ms.coords, ms.localAnchor);
      if(ms.status == 'initial' || timeSinceStart < 250 && pixelsMoved < 10) {
        if(typeof jeEnabled == 'boolean' && jeEnabled)
          await jeClick(widgets.get(target.id), e);
        else if(edit)
          editClick(widgets.get(target.id));
        else
          if(!target.classList.contains('longtouch'))
            await widgets.get(target.id).click();
        else
          widgets.get(target.id).domElement.classList.remove('longtouch');
      }
      delete mouseStatus[target.id];
    } else if(name == 'mousemove' || name == 'touchmove' && mouseStatus[target.id]) {
      if(mouseStatus[target.id].status == 'initial') {
        mouseStatus[target.id].status = 'moving';
        if(mouseStatus[target.id].moveTarget)
          await mouseStatus[target.id].widget.moveStart();
      }
      mouseStatus[target.id].coords = coords;
      if(mouseStatus[target.id].moveTarget)
        await mouseStatus[target.id].widget.move(coords, mouseStatus[target.id].localAnchor);
    }
    batchEnd();
  }

  if(name == 'mouseup')
    mouseTarget = null;

  toServer('mouse',
    {
      x: Math.round(coords.x),
      y: Math.round(coords.y),
      pressed: (e.buttons & 1 == 1) || name == 'touchstart' || name == 'touchmove',
      target: mouseTarget? mouseTarget.id : null
    });
}

onLoad(function() {
  [ 'touchstart', 'touchend', 'touchmove', 'mousedown', 'mousemove', 'mouseup', 'contextmenu' ].forEach(function(event) {
    window.addEventListener(event, e => inputHandler(event, e));
  });
});
