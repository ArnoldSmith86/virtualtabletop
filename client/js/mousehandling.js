import { getCurrentOverlayId, getEditMode } from './overlaystate.js';
import { viewportConfig } from './calculateLayout.js';

let usedTouch = false;
let mouseTarget = null;
let doubleClickTimeout = null;
let scrollbarDrag = false;
const mouseStatus = {};

// Whether a press landed on the scrollbar of an element that scrolls its own overflow - the body
// of a scoreboard with more rounds than fit. offsetX/offsetY are measured from the padding box,
// which is the client box plus the scrollbars, so a coordinate between the client box and the
// scrollbar the element actually reserves room for is on that scrollbar. The room it reserves is
// what is left of the border box once the client box and the borders are taken off it: an element
// with an overlay scrollbar, or none at all, reserves nothing and has no strip to hit - the same
// coordinate is inside its border there, which is part of the widget like any other pixel of it.
function pressedScrollbar(e) {
  const el = e.target;
  if(!el || !el.clientWidth && !el.clientHeight)
    return false;
  const style = getComputedStyle(el);
  const border = side => parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0;
  const barWidth = el.offsetWidth - el.clientWidth - border('left') - border('right');
  const barHeight = el.offsetHeight - el.clientHeight - border('top') - border('bottom');
  return barWidth > 0 && e.offsetX > el.clientWidth && e.offsetX <= el.clientWidth + barWidth
      || barHeight > 0 && e.offsetY > el.clientHeight && e.offsetY <= el.clientHeight + barHeight;
}

function eventCoords(name, e) {
  let coords;
  if(name == 'touchend' || name == 'touchcancel')
    coords = e.changedTouches[0];
  else if(name == 'touchstart' || name == 'touchmove')
    coords = e.targetTouches[0];
  else
    coords = e;
  let x = (coords.clientX - roomRectangle.left) / scale / zoomScale;
  let y = (coords.clientY - roomRectangle.top) / scale / zoomScale;
  if (!edit || zoom == 1) {
    x = Math.max(0, Math.min(viewportConfig.targetWidth, x));
    y = Math.max(0, Math.min(viewportConfig.targetHeight, y));
  }
  return {x, y, clientX: coords.clientX, clientY: coords.clientY};
}

// Finish a drag whose mouseup never reached the drag handling below, because one
// of the checks in handleInput() returned before it. The widget would otherwise
// stay detached from its holder and flagged as being dragged for every player
// until somebody picks it up again, and would keep following the cursor with the
// button up. It is dropped where the drag last moved to; the release is not
// treated as a click, because we don't know what it was released over.
async function endDrag(target) {
  const ms = target && mouseStatus[target.id];
  if(!ms)
    return;
  delete mouseStatus[target.id];

  // while the state is being replaced the dragged widget may already be gone
  if(isLoading || ms.status == 'initial' || !ms.moveTarget || widgets.get(ms.moveTarget.get('id')) !== ms.moveTarget)
    return;

  batchStart();
  try {
    setDeltaCause(`${playerName} dragged ${ms.moveTarget.get('id')}`);
    // like the mouseup branch below: let a mousemove that is still being
    // processed finish first, so no move lands after the drag has ended
    await ms.dragChain;
    await ms.moveTarget.moveEnd(ms.coords, ms.localAnchor);
  } finally {
    batchEnd();
  }
}

async function inputHandler(name, e) {
  // Releasing the mouse button always ends the drag. Forget the drag target right
  // away, before handleInput() can return early or await a click routine that runs
  // for a long time (DELAY, INPUT, ...) - until then the released widget would stay
  // the target of everything below, and of the pointer position sent to the server.
  // endDrag() then takes care of a mouseup that never reached the drag handling at
  // all. Touch has no equivalent of mouseTarget, so a touchend is left to
  // handleInput(), which finds its widget through the element the touch started on.
  const dragTarget = mouseTarget;
  if(name == 'mouseup')
    mouseTarget = null;
  try {
    await handleInput(name, e, dragTarget);
  } finally {
    if(name == 'mouseup')
      await endDrag(dragTarget);
  }
}

async function handleInput(name, e, dragTarget) {
  // Dragging a scrollbar scrolls and does nothing else: the press is neither a click on the widget
  // behind it nor the start of a drag, and neither are the moves and the release that follow it.
  // The release can happen outside the window, where no mouseup reaches us - so a move with no
  // button held ends the drag as well, rather than leaving it latched until the next press.
  if(name == 'mousedown')
    scrollbarDrag = pressedScrollbar(e);
  else if(name == 'mousemove' && !e.buttons)
    scrollbarDrag = false;
  if(scrollbarDrag) {
    if(name == 'mouseup')
      scrollbarDrag = false;
    return;
  }

  const isMiddleMouseButton = name.startsWith('mouse') && e.button == 1;
  if(edit && !isMiddleMouseButton && editInputHandler(name, e))
    return;

  if(isLoading || overlayActive || e.target.id == 'jeText' || e.target.id == 'jeCommands')
    return;

  const editMovable = !isMiddleMouseButton && (edit || jeEnabled && e.ctrlKey);

  // a card's write object is a contenteditable div rather than a form control, but a click on it belongs to
  // the text the same way a click on a text field does
  const textInput = [ 'TEXTAREA', 'INPUT', 'BUTTON', 'OPTION', 'LABEL', 'SELECT' ].indexOf(e.target.tagName) != -1
                 || e.target.isContentEditable && String(e.target.className).match(/cardFaceObject/);
  if(!dragTarget && textInput) {
    // while editing, a click on the text field of a label or on the write object of a card is not meant
    // to type but to reach the widget below it, so that it can be selected and moved
    const widgetText = e.target.parentNode && (e.target.parentNode.className.match(/label/) || String(e.target.className).match(/cardFaceObject/));
    if(!editMovable || !widgetText)
      return;
  }

  if(name == 'mousedown' || name == 'touchstart') {
    if (!window.getSelection().isCollapsed)
      window.getSelection().collapseToEnd();
    document.activeElement.blur();
  }
  let target = e.target;
  while(target && (!target.id || target.id.slice(0,2) != 'w_' || !widgets.has(unescapeID(target.id.slice(2))))) {
    if(target.id == 'editor')
      return;
    target = target.parentNode;
  }

  if(!usedTouch && name == 'touchstart') {
    usedTouch = true;
    $('body').classList.add('usedTouch');
  }

  e.preventDefault();

  const coords = eventCoords(name, e);
  mouseCoords = [Math.round(coords.x), Math.round(coords.y)];
  if(name == 'mousedown')
    mouseTarget = target;
  else if(name == 'mousemove' || name == 'mouseup')
    target = dragTarget;

  if(target && target.id) {
    let widget = widgets.get(unescapeID(target.id.slice(2)));
    // A widget can be replaced while an input event is still in flight (for
    // example, immediately after its ID is renamed in the properties editor).
    // The saved mouse target then refers to a removed DOM node, not a widget.
    // The drag still has to end - endDrag() only discards its state in that case.
    if(!widget)
      return;
    batchStart();
    // batchEnd() has to run even if a routine triggered by the drop or click below
    // throws: batchStart() increments batchDepth and sendDelta() only sends anything
    // while that is 0, so a leaked batch stops this client from syncing altogether.
    try {
      if(!edit && (!jeEnabled || !e.ctrlKey) && widget.passthroughMouse) {
        if(name == 'mousedown' || name == 'touchstart') {
          await widget.mouseRaw('down', coords);
        } else if (name == 'mouseup' || name == 'touchend' || name == 'touchcancel') {
          await widget.mouseRaw('up', coords);
        } else if (name == 'mousemove' || name == 'touchmove') {
          await widget.mouseRaw('move', coords);
        }
      } else if(name == 'mousedown' || name == 'touchstart') {
        mouseStatus[target.id] = {
          status: 'initial',
          start: new Date(),
          downCoords: coords,
          moveTarget: widget
        };
        const ms = mouseStatus[target.id];
        // a recorded trace is a playback with no server behind it, so a widget dragged out of place
        // would simply stay there and stop showing what the record it belongs to looked like
        if($('body').classList.contains('trace'))
          ms.moveTarget = null;
        let movable = ms.moveTarget && ms.moveTarget.get(editMovable ? 'movableInEdit' : 'movable');
        while (ms.moveTarget && !movable) {
          let parent = ms.moveTarget.get('parent');
          if(parent && widgets.has(parent)) {
            ms.moveTarget = widgets.get(parent);
            movable = ms.moveTarget.get(editMovable ? 'movableInEdit' : 'movable');
          } else {
            ms.moveTarget = null;
            movable = false;
          }
        }
        if (movable) {
          ms.localAnchor = ms.moveTarget.coordLocalFromCoordClient({x: coords.clientX, y: coords.clientY});
        }
      } else if((name == 'mouseup' || name == 'touchend' || name == 'touchcancel') && mouseStatus[target.id]) {
        const ms = mouseStatus[target.id];
        // End the drag synchronously, before the first await below: a mousemove that
        // is delivered while the drop is still being processed would otherwise queue
        // another move and drag the widget back out of where it was just dropped.
        delete mouseStatus[target.id];
        const timeSinceStart = +new Date() - ms.start;
        const pixelsMoved = ms.coords ? Math.abs(ms.coords.x - ms.downCoords.x) + Math.abs(ms.coords.y - ms.downCoords.y) : 0;
        if(ms.status != 'initial' && ms.moveTarget) {
          setDeltaCause(`${playerName} dragged ${widget.id}`);
          // let every mousemove that is still being processed finish first so that the
          // drop happens after the last one instead of racing with it
          await ms.dragChain;
          await ms.moveTarget.moveEnd(coords, ms.localAnchor);
        }
        if(ms.status == 'initial' || timeSinceStart < 250 && pixelsMoved < 10) {
          let editClickHandled = false;
          if(edit && !isMiddleMouseButton)
            editClickHandled = await editClick(widget, e.button, e);
          else if(jeEnabled && !isMiddleMouseButton)
            editClickHandled = await jeClick(widget, e);

          if(!editClickHandled) {
            if(!target.classList.contains('longtouch')) {
              if(!widget.get('doubleClickRoutine')) {
                setDeltaCause(`${playerName} clicked ${widget.id}`);
                await widget.click();
              } else if(doubleClickTimeout) {
                clearTimeout(doubleClickTimeout);
                doubleClickTimeout = null;
                setDeltaCause(`${playerName} double clicked ${widget.id}`);
                await widget.doubleClick();
              } else {
                doubleClickTimeout = setTimeout(async () => {
                  doubleClickTimeout = null;
                  batchStart();
                  try {
                    setDeltaCause(`${playerName} clicked ${widget.id}`);
                    await widget.click();
                  } finally {
                    batchEnd();
                  }
                }, 350);
              }
            } else {
              widget.domElement.classList.remove('longtouch');
            }
          }
        }
      } else if((name == 'mousemove' || name == 'touchmove') && mouseStatus[target.id]) {
        const ms = mouseStatus[target.id];
        setDeltaCause(`${playerName} dragged ${widget.id}`);
        const isFirstMove = ms.status == 'initial';
        if(isFirstMove)
          ms.status = 'moving';
        ms.coords = coords;
        if(ms.moveTarget) {
          setDeltaCause(`${playerName} dragged ${widget.id}`);
          // Mouse events are handled asynchronously, so several of them can be in
          // flight at once. Queue the moves instead of running them in parallel so
          // the widget always ends up where the most recent event put it - and so
          // that the drop in the mouseup branch above happens after all of them.
          ms.dragChain = Promise.resolve(ms.dragChain).then(async _ => {
            // a move that a newer mousemove already replaced does not need to run:
            // that one will put the widget, its hover target and its parent where
            // the cursor is now. Without this the queue can grow under load and the
            // widget visibly lags behind the cursor.
            if(!isFirstMove && ms.coords !== coords)
              return;
            if(isFirstMove)
              await ms.moveTarget.moveStart();
            await ms.moveTarget.move(coords, ms.localAnchor);
          }).catch(error => {
            // keep the chain resolvable - a rejected one would make every later move
            // and the drop in the mouseup branch above fail as well - but still let
            // the error reach the client error reporter in tracing.js, which is where
            // it would have ended up as an unhandled rejection before the chain
            setTimeout(_=>{ throw error; });
          });
          await ms.dragChain;
        }
      }
    } finally {
      batchEnd();
    }
  }

  clientPointer.style.top = `${coords.clientY}px`;
  clientPointer.style.left = `${coords.clientX}px`;

  let hoveredWidgetsWithHiddenCursor = document.elementsFromPoint(coords.clientX, coords.clientY).map(el => widgets.get(unescapeID(el.id.slice(2)))).filter(w => w != null && w.requiresHiddenCursor());

  const ctx = { activeOverlay: getCurrentOverlayId(), editMode: getEditMode() };
  if(hoveredWidgetsWithHiddenCursor.length) {
    toServer('mouse', { hidden: true, ...ctx });
  } else {
    toServer('mouse', {
      x: Math.round(coords.x),
      y: Math.round(coords.y),
      pressed: (e.buttons & 1 == 1) || name == 'touchstart' || name == 'touchmove',
      target: mouseTarget ? unescapeID(mouseTarget.id.slice(2)) : null,
      ...ctx
    });
  }
}

async function keyHandler(e) {
  if(isLoading || overlayActive || $('body').classList.contains('edit') || e.target.tagName == 'INPUT' || e.target.tagName == 'TEXTAREA')
    return;

  batchStart();
  for(const widget of widgetFilter(w=>w.get('hotkey')===e.key&&w.isVisible()).sort((a,b)=>String(a.get('id')).localeCompare(b.get('id'))))
    await widget.click();
  batchEnd();
}

onLoad(function() {
  [ 'touchstart', 'touchend', 'touchmove', 'touchcancel', 'mousedown', 'mousemove', 'mouseup', 'contextmenu' ].forEach(function(event) {
    window.addEventListener(event, e => inputHandler(event, e));
  });
  window.addEventListener('keydown', e => keyHandler(e));
});
