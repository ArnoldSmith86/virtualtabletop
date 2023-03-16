let keyboardMode = false;
let keyboardModeJustEnabled = true;

let enableCounter = 0;

let selectingDropTargetFor = null;

const validKeys = [ 'ArrowLeft', 'ArrowUp', 'Enter', 'ArrowDown', 'ArrowRight' ];
const widgetsByKey = {};

function isClickable(widget) {
  if(widget.get('clickRoutine') && widget.get('clickRoutine').length)
    return true;
  if(widget.get('type') == 'card' && widgets.get(widget.get('deck')).get('faceTemplates').length > 1)
    return true;
  if(!widget.get('type') && widget.faces().length > 1)
    return true;
  if([ 'dice', 'seat', 'spinner' ].indexOf(widget.get('type')) != -1)
    return true;
}

function isForeign(widget) {
  const style = getComputedStyle(widget.domElement);
  return (style.display == "none") || (style.visibility == "hidden") || (style.getPropertyValue('--foreign') == 'true') || !overlap(widget.domElement, $('#roomArea'));
}

function allValidTargets() {
  const valid = widgetFilter(function(w) {
    if(w.get('movable') || w.get('clickable')) {
      const isInPile = w.get('parent') && widgets.get(w.get('parent')).get('type') == 'pile';
      if(w.get('movable'))
        return w.get('type') != 'deck' && !isInPile && !isForeign(w);
      return isClickable(w) && !isForeign(w);
    }
    return false;
  });
  for(const pile of valid.filter(w=>w.get('type') == 'pile'))
    valid.push(widgetFilter(w=>w.get('parent')==pile.id).sort((a,b)=>a.get('z')-b.get('z'))[0]);
  return valid;
}

function allValidDropTargets(widget) {
  return widget.validDropTargets().filter(w=>!isForeign(w));
}

function emulateAnchor(widget) {
  const rect = widget.domElement.getBoundingClientRect();
  return widget.coordLocalFromCoordClient({x: rect.left, y: rect.top});
}

function emulateCoords(widget) {
  const rect = widget.domElement.getBoundingClientRect();
  return {x: (rect.left - roomRectangle.left) / scale, y: (rect.top - roomRectangle.top) / scale, clientX: rect.left, clientY: rect.top};
}

async function widgetSelected(widget) {
  console.log('SELECTED', widget);

  batchStart();
  if(selectingDropTargetFor && selectingDropTargetFor == widget) {
    await widget.click();
    selectingDropTargetFor = null;
  } else if(selectingDropTargetFor) {
    await selectingDropTargetFor.moveStart();
    batchEnd();
    batchStart();
    await selectingDropTargetFor.move(   emulateCoords(widget), emulateAnchor(selectingDropTargetFor));
    batchEnd();
    batchStart();
    await selectingDropTargetFor.move(   emulateCoords(widget), emulateAnchor(selectingDropTargetFor));
    batchEnd();
    batchStart();
    await selectingDropTargetFor.moveEnd(emulateCoords(widget), emulateAnchor(selectingDropTargetFor));
    selectingDropTargetFor = null;
  } else if(!widget.get('movable')) {
    await widget.click();
  } else {
    selectingDropTargetFor = widget;
  }
  batchEnd();

  if(selectingDropTargetFor) {
    if(isClickable(widget))
      showKeyboardHighlights(allValidDropTargets(widget), widget);
    else
      showKeyboardHighlights(allValidDropTargets(widget));
  } else {
    showKeyboardHighlights(allValidTargets());
  }
}

async function moveWidget(widget, key) {
  const coords = emulateCoords(widget);

  if(key == 'ArrowLeft')
    coords.x -= 20;

  if(key == 'ArrowRight')
    coords.x += 20;

  if(key == 'ArrowUp')
    coords.y -= 20;

  if(key == 'ArrowDown')
    coords.y += 20;

  batchStart();
  await widget.moveStart();
  batchEnd();
  batchStart();
  await widget.move(coords, emulateAnchor(widget));
  batchEnd();
  batchStart();
  await widget.move(coords, emulateAnchor(widget));
  batchEnd();
  batchStart();
  await widget.moveEnd(coords, emulateAnchor(widget));
  batchEnd();

  showKeyboardHighlights(allValidDropTargets(widget));
}

function hideKeyboardHighlights() {
  for(const key of validKeys) {
    if(widgetsByKey[key]) {
      for(const widget of widgetsByKey[key]) {
        widget.domElement.classList.remove('keyboardHighlight');
        widget.domElement.classList.remove(key);
      }
    }
    widgetsByKey[key] = [];
  }
}

function sortByPosition(widgets) {
  return widgets.sort((a,b)=>a.domElement.getBoundingClientRect().left-b.domElement.getBoundingClientRect().left || a.domElement.getBoundingClientRect().top-b.domElement.getBoundingClientRect().top);
}

function showKeyboardHighlights(widgets, widgetForEnter) {
  const countPerKey = Math.ceil(widgets.length / (validKeys.length - (widgetForEnter ? 1 : 0)));

  hideKeyboardHighlights();

  let i = 0;
  for(const widget of sortByPosition(widgets)) {
    const key = validKeys[Math.floor(i/countPerKey)];
    widget.domElement.classList.add('keyboardHighlight');
    widget.domElement.classList.add(key);
    widgetsByKey[key].push(widget);
    ++i;
    if(widgetForEnter && validKeys[Math.floor(i/countPerKey)] == 'Enter')
      i += countPerKey;
  }

  if(widgetForEnter) {
    widgetForEnter.domElement.classList.add('keyboardHighlight');
    widgetForEnter.domElement.classList.add('Enter');
    widgetsByKey['Enter'].push(widgetForEnter);
  }

  console.log(widgetsByKey, i, countPerKey);
}

window.addEventListener('keydown', function(e) {
  if(validKeys.indexOf(e.key) != -1)
    ++enableCounter;
});

window.addEventListener('keyup', function(e) {
  if(validKeys.indexOf(e.key) != -1)
    --enableCounter;

  if(enableCounter == 2) {
    keyboardMode = !keyboardMode;
    selectingDropTargetFor = null;
    if(keyboardMode)
      keyboardModeJustEnabled = true;
    $('body').classList.toggle('keyboardMode', keyboardMode);
    if(keyboardMode)
      showKeyboardHighlights(allValidTargets());
    else
      hideKeyboardHighlights();
  } else if(keyboardMode && !keyboardModeJustEnabled && enableCounter == 0) {
    if($('#activeGameButton').dataset.overlay == 'buttonInputOverlay') {
      if(e.key == 'ArrowLeft')
        $('#buttonInputCancel').click();
      if(e.key == 'ArrowRight')
        $('#buttonInputGo').click();
      setTimeout(_=>showKeyboardHighlights(allValidTargets()), 0);
    } else if(widgetsByKey[e.key]) {
      if(widgetsByKey[e.key].length > 1) {
        showKeyboardHighlights(widgetsByKey[e.key]);
      } else if(widgetsByKey[e.key].length) {
        widgetSelected(widgetsByKey[e.key][0]);
      } else if(selectingDropTargetFor) {
        if(e.key == 'Enter') {
          showKeyboardHighlights(allValidTargets());
          selectingDropTargetFor = null;
        } else {
          moveWidget(selectingDropTargetFor, e.key);
        }
      }
    }
  }

  if(enableCounter == 0)
    keyboardModeJustEnabled = false;
});
