const smartCloneSourceMap = {};

async function smartCloneRemoveChildren(topCloneID, clone, source, options) {
  for(const child of widgetFilter(w=>w.get('parent') == clone.id)) {
    const childSource = smartCloneSourceMap[topCloneID][child.id];
    const id = childSource && applyReplaces(childSource.id, options.replaces, topCloneID);

    if(!child.get('editorSmartClone'))
      await smartCloneRemoveChildren(topCloneID, child, childSource, options);

    if(!childSource || !widgets.has(childSource.id) || id != childSource.id && !widgets.has(id) || child.get('type') != childSource.get('type') || smartCloneExcludesWidget(topCloneID, childSource, options)) {
      await removeWidgetLocal(child.id);
      delete smartCloneSourceMap[topCloneID][child.id];
      delete smartCloneSourceMap[child.id];
    }
  }
}

function smartCloneExcludesWidget(topCloneID, source, options) {
  if(!source || source.get('type') != 'card' || options && options.includeCards)
    return false;

  // exclude cards unless their deck is part of the cloned group
  const topSource = smartCloneSourceMap[topCloneID] && smartCloneSourceMap[topCloneID][topCloneID];
  let deck = widgets.get(source.get('deck'));
  while(deck) {
    if(deck == topSource)
      return false;
    deck = widgets.get(deck.get('parent'));
  }
  return true;
}

async function smartCloneAddChildren(topCloneID, clone, source, options) {
  for(const child of widgetFilter(w=>w.get('parent') == source.id)) {
    if(smartCloneExcludesWidget(topCloneID, child, options))
      continue;
    let clonedChildren = smartCloneGetClones(child, clone);
    let id = applyReplaces(child.id, options.replaces, topCloneID);
    if(widgets.has(id))
      id = `${clone.id}-${child.id}`; // deterministic so concurrent clients converge on the same widget
    if(widgets.has(id))
      id = generateUniqueWidgetID();
    if(!clonedChildren.length) {
      clonedChildren = [ widgets.get(await addWidgetLocal({ id, type: child.get('type'), parent: clone.id, inheritFrom: inheritDef(child) })) ];
      if(child.get('editorSmartClone')) {
        await clonedChildren[0].set('editorSmartClone', JSON.parse(JSON.stringify(child.get('editorSmartClone'))));
        await smartCloneUpdate(id);
      }
      smartCloneSourceMap[topCloneID][id] = child;
    }
    if(!child.get('editorSmartClone'))
      await smartCloneAddChildren(topCloneID, clonedChildren.pop(), child, options);
  }
}

async function smartCloneUpdateChildren(topCloneID, clone, source, options) {
  for(const [ cloneID, source ] of Object.entries(smartCloneSourceMap[topCloneID])) {
    if(!widgets.has(cloneID) || !widgets.has(source.id)) {
      delete smartCloneSourceMap[topCloneID][cloneID];
      continue;
    }
    const optionsCopy = JSON.parse(JSON.stringify(options));
    if(optionsCopy.flipX !== 'all' && widgets.get(cloneID).get('parent') != topCloneID)
      delete optionsCopy.flipX;
    if(optionsCopy.flipY !== 'all' && widgets.get(cloneID).get('parent') != topCloneID)
      delete optionsCopy.flipY;
    if(cloneID != topCloneID)
      await smartCloneUpdateClone(topCloneID, widgets.get(cloneID), widgets.get(source.id), optionsCopy);
  }
}

function inheritDef(widget) {
  const exceptions = [];
  const type = widget.get('type');
  if(widget.get('movable'))
    exceptions.push("!parent", "!x", "!y", "!dragging", "!hoverParent", "!owner", "!hoverTarget");
  if(widget instanceof BasicWidget && widget.faces().length > 1)
    exceptions.push("!activeFace");
  if(type == 'canvas')
    for(let x=0; x<10; ++x)
      for(let y=0; y<10; ++y)
        exceptions.push("!`c${x}${y}`");
  if(type == 'card')
    exceptions.push("!activeFace");
  if(type == 'dice')
    exceptions.push("!activeFace", "!rollCount");
  if(type == 'label' && widget.get('editable'))
    exceptions.push("!text");
  if(type == 'seat') {
    widgetFilter(w=>w.get('type')=='scoreboard').map(w=>w.get('scoreProperty')).forEach(property=>exceptions.push(`!${property}`));
    exceptions.push("!player", "!color", "!turn", "!index");
  }
  if(type == 'spinner')
    exceptions.push("!angle", "!value");
  if(type == 'timer')
    exceptions.push("!alert", "!milliseconds", "!paused");
  if(exceptions.length)
    return { [widget.id]: exceptions };
  else
    return widget.id;
}

function validPropertiesOfWidget(widget, filter='*') {
  const properties = Object.keys(widget.state).filter(property=>widget.inheritFromIsValid(filter, property));
  for(const [ id, filter ] of Object.entries(widget.inheritFrom()))
    properties.push(...validPropertiesOfWidget(widgets.get(id), filter));
  return properties;
}

function applyReplaces(value, replaces, topCloneID) {
  const modifiedReplaces = JSON.parse(JSON.stringify(replaces||{}));
  let replacedValue = JSON.parse(JSON.stringify(value));
  for(const [ cloneID, source ] of Object.entries(smartCloneSourceMap[topCloneID])) {
    if(cloneID == topCloneID) {
      modifiedReplaces[source.id] = cloneID;
    } else {
      modifiedReplaces[`"${source.id}"`] = `"${cloneID}"`;
      modifiedReplaces[` OF ${source.id}\}`] = ` OF ${cloneID}\}`;
    }
  }
  for(const [ from, to ] of Object.entries(modifiedReplaces)) {
    const regex = new RegExp(from, 'g');
    replacedValue = replacedValue.replace(regex, to);
  }
  return replacedValue;
}

async function smartCloneUpdateClone(topCloneID, clone, source, options) {
  const validProperties = validPropertiesOfWidget(source);
  for(const property of validProperties) {
    if([ 'id', 'parent', 'type', 'inheritFrom' ].indexOf(property) == -1) {
      if(clone.get('type') != 'seat' || [ 'player', 'color', 'turn', 'index', 'score' ].indexOf(property) == -1) {
        const sourceValue = JSON.stringify(source.get(property));
        const currentCloneValue = JSON.stringify(clone.get(property));
        const newCloneValue = applyReplaces(sourceValue, options.replaces, topCloneID);
        const canBeInherited = clone.inheritFromIsValid(clone.inheritFrom()[source.id], property);

        if(newCloneValue === sourceValue && canBeInherited) {

          if(clone.state[property] !== undefined && property != 'editorSmartClone')
            await clone.set(property, null);

        } else {

          if(currentCloneValue !== newCloneValue)
            await clone.set(property, JSON.parse(newCloneValue));

        }
      }
    }
  }

  for(const invalidProperty of Object.keys(clone.state).filter(property=>validProperties.indexOf(property) == -1)) {
    if(clone.inheritFromIsValid(clone.inheritFrom()[source.id], invalidProperty) && invalidProperty != 'inheritFrom')
      await clone.set(invalidProperty, null);
  }

  if(JSON.stringify(clone.get('inheritFrom')) != JSON.stringify(inheritDef(source)))
    await clone.set('inheritFrom', inheritDef(source));

  if(options.flipX) {
    const sourceParentDom = widgets.get(source.get('parent')).domElement;
    const sourceDom = source.domElement;

    // Get bounding rectangles
    const sourceParentRect = sourceParentDom.getBoundingClientRect();
    const sourceRect = sourceDom.getBoundingClientRect();

    // Calculate new X using the bounding rectangles
    const newX = sourceParentRect.width/getScale() - (source.get('x') + sourceRect.width/getScale());
    if(clone.get('x') !== newX)
      await clone.set('x', newX);
  }

  if(options.flipY) {
    const sourceParentDom = widgets.get(source.get('parent')).domElement;
    const sourceDom = source.domElement;

    // Get bounding rectangles
    const sourceParentRect = sourceParentDom.getBoundingClientRect();
    const sourceRect = sourceDom.getBoundingClientRect();

    // Calculate new Y using the bounding rectangles
    const newY = sourceParentRect.height/getScale() - (source.get('y') + sourceRect.height/getScale());
    if(clone.get('y') !== newY)
      await clone.set('y', newY);
  }

  if(clone.get('type') == 'seat') {
    const usedIndices = widgetFilter(w=>w.get('type')=='seat' && w != clone).map(w=>w.get('index'));
    if(usedIndices.includes(clone.get('index'))) {
      let index = 1;
      while(usedIndices.includes(index))
        ++index;
      await clone.set('index', index);
    }
  }
}

function smartCloneGetSource(clone, sourceParent) {
  let id = clone.get('inheritFrom');
  if(typeof id == 'object')
    id = Object.keys(id||{})[0];
  if(widgets.has(id)) {
    const source = widgets.get(id);
    return sourceParent === null || source.get('parent') == sourceParent.id ? source : null;
  } else {
    return null;
  }
}

function smartCloneGetClones(source, cloneParent) {
  return widgetFilter(function(w) {
    let id = w.get('inheritFrom');
    if(typeof id == 'object')
      id = Object.keys(id||{})[0];
    return id == source.id && w.get('parent') == cloneParent.id;
  });
}

function smartCloneProcessSelection(selection) {
  const selectionWithOnlyTopMostClones = [];
  for(const widget of selection) {
    let parent = widget;
    let isClone = false;
    while(parent) {
      if(parent.get('editorSmartClone')) {
        if(!selectionWithOnlyTopMostClones.includes(parent))
          selectionWithOnlyTopMostClones.push(parent);
        isClone = true;
        break;
      }
      parent = widgets.get(parent.get('parent'));
    }

    if(!isClone)
      selectionWithOnlyTopMostClones.push(widget);
  }
  return selectionWithOnlyTopMostClones;
}

function smartCloneInitializeSourceMap(childrenOf=null, topID=null) {
  for(const widget of widgetFilter(w=>childrenOf ? w.get('parent')==childrenOf.id : w.get('editorSmartClone'))) {
    const source = smartCloneGetSource(widget, null);
    if(source) {
      if(!smartCloneSourceMap[topID || widget.id])
        smartCloneSourceMap[topID || widget.id] = {};
      smartCloneSourceMap[topID || widget.id][widget.id] = source;
      smartCloneInitializeSourceMap(widget, topID || widget.id);
    }
  }
}

function smartCloneInit() {
  for(const topCloneID of Object.keys(smartCloneSourceMap))
    delete smartCloneSourceMap[topCloneID];
  smartCloneInitializeSourceMap();
}

async function smartCloneUpdate(topCloneID, remove=false) {
  const clone = widgets.get(topCloneID);
  if(clone && !remove) {
    const source = smartCloneGetSource(clone, null);
    const options = clone.get('editorSmartClone');
    if(!source || typeof options != 'object' || options === null)
      return;
    if(!smartCloneSourceMap[topCloneID])
      smartCloneSourceMap[topCloneID] = {};
    smartCloneSourceMap[topCloneID][topCloneID] = source;
    await smartCloneRemoveChildren(topCloneID, clone, source, options);
    await smartCloneAddChildren(   topCloneID, clone, source, options);
    await smartCloneUpdateChildren(topCloneID, clone, source, options);
  } else if(remove) {
    for(const [ cloneID, source ] of Object.entries(smartCloneSourceMap[topCloneID]))
      await removeWidgetLocal(cloneID);
    delete smartCloneSourceMap[topCloneID];
  }
}

// deltas received while an update is running are queued so changes to one smart clone cascade to smart clones of that clone
let processingDeltas = false;
const queuedDeltas = [];
async function smartCloneDeltaReceived(delta) {
  queuedDeltas.push(delta);
  if(processingDeltas)
    return;

  processingDeltas = true;
  for(let i=0; queuedDeltas.length && i<100; ++i)
    await smartCloneProcessDelta(queuedDeltas.shift());
  queuedDeltas.length = 0;
  processingDeltas = false;
}

async function smartCloneProcessDelta(delta) {
  const needUpdate = {};
  const needRemove = {};
  for(const [ id, d ] of Object.entries(delta.s)) {
    if(d && typeof d.editorSmartClone == 'object' && d.editorSmartClone !== null)
      needUpdate[id] = true;
    if((d === null || d && d.editorSmartClone === null) && smartCloneSourceMap[id])
      delete smartCloneSourceMap[id];

    for(const [ topCloneID, sourceMap ] of Object.entries(smartCloneSourceMap)) {
      if(sourceMap[topCloneID] && id === sourceMap[topCloneID].id && d === null) {
        needUpdate[topCloneID] = true;
        needRemove[topCloneID] = true;
      }

      // update inheritance when a scoreboard changes its scoreProperty
      if(d && d.scoreProperty !== undefined)
        needUpdate[topCloneID] = true;

      for(const [ cloneID, source ] of Object.entries(sourceMap)) {
        if(id === source.id || id === cloneID || d && d.parent === source.id)
          needUpdate[topCloneID] = true;
        if(id === cloneID && d && d.parent !== undefined && Object.keys(sourceMap).indexOf(d.parent) == -1)
          delete smartCloneSourceMap[topCloneID][cloneID];
      }
    }
  }

  batchStart();
  for(const topCloneID of Object.keys(needUpdate))
    await smartCloneUpdate(topCloneID, needRemove[topCloneID]);
  batchEnd();
}
