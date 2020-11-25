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
  return [ coords.clientX, coords.clientY ];
}

function inputHandler(name, e) {
  if(!mouseTarget && [ "TEXTAREA", "INPUT", "BUTTON", "OPTION" ].indexOf(e.target.tagName) != -1)
    if(!edit || !e.target.parentNode || !e.target.parentNode.className.match(/label/))
      return;
  e.preventDefault();

  let target = e.target;
  while(target && (!target.id || !widgets.has(target.id)))
    target = target.parentNode;

  const coords = eventCoords(name, e);
  if(name == 'mousedown')
    mouseTarget = target;
  else if(name == 'mousemove' || name == 'mouseup')
    target = mouseTarget;

  if(target && target.id) {
    if(name == 'mousedown' || name == 'touchstart') {
      mouseStatus[target.id] = {
        status: 'initial',
        downCoords: coords
      };
    } else if(name == 'mouseup' || name == 'touchend') {
      batchStart();
      if(mouseStatus[target.id].status == 'initial') {
        if(edit)
          editClick(widgets.get(target.id));
        else if(widgets.get(target.id).click)
          widgets.get(target.id).click();
      } else if(mouseStatus[target.id].widget.p(edit ? 'movableInEdit' : 'movable')) {
        mouseStatus[target.id].widget.moveEnd();
      }
      delete mouseStatus[target.id];
      batchEnd();
    } else if(name == 'mousemove' || name == 'touchmove') {
      batchStart();
      if(mouseStatus[target.id].status == 'initial') {
        const targetRect = target.getBoundingClientRect();
        const downCoords = mouseStatus[target.id].downCoords;
        mouseStatus[target.id] = {
          status: 'moving',
          offset: [ downCoords[0] - (targetRect.left + targetRect.width/2), downCoords[1] - (targetRect.top + targetRect.height/2) ],
          widget: widgets.get(target.id)
        };
        if(mouseStatus[target.id].widget.p(edit ? 'movableInEdit' : 'movable'))
          mouseStatus[target.id].widget.moveStart();
      }
      const x = Math.floor((coords[0] - roomRectangle.left - mouseStatus[target.id].offset[0]) / scale);
      const y = Math.floor((coords[1] - roomRectangle.top  - mouseStatus[target.id].offset[1]) / scale);
      if(mouseStatus[target.id].widget.p(edit ? 'movableInEdit' : 'movable'))
        mouseStatus[target.id].widget.move(x, y);
      batchEnd();
    }
  }

  if(name == 'mouseup')
    mouseTarget = null;
  if(name == 'mousemove' || name == 'touchmove')
    toServer('mouse', [ Math.floor((coords[0] - roomRectangle.left)/scale), Math.floor((coords[1] - roomRectangle.top)/scale) ]);
}

onLoad(function() {
  [ 'touchstart', 'touchend', 'touchmove', 'mousedown', 'mousemove', 'mouseup', 'contextmenu' ].forEach(function(event) {
    window.addEventListener(event, e => inputHandler(event, e));
  });
});
