const smartCloneSourceMap = {};

async function smartCloneRemoveChildren(topCloneID, clone, source, options) {
  for(const child of widgetFilter(w=>w.get('parent') == clone.id)) {
    const childSource = widgets.get(smartCloneSourceMap[topCloneID][child.id]);
    const id = childSource && applyReplaces(childSource.id, options.replaces, topCloneID);

    smartCloneRemoveChildren(topCloneID, child, childSource, options);

    if(!childSource || id != childSource.id && !widgets.has(id) || child.get('type') != childSource.get('type')) {
      if(childSource)
        console.log('Smart Clone - Removing', [child.id, childSource.id, id], id != childSource.id && !widgets.has(id), child.get('type') != childSource.get('type'));
      else
        console.log('Smart Clone - Removing', [child.id, id], "No Source");
      await removeWidgetLocal(child.id);
      delete smartCloneSourceMap[topCloneID][child.id];
    }
  }
}

async function smartCloneAddChildren(topCloneID, clone, source, options) {
  for(const child of widgetFilter(w=>w.get('parent') == source.id)) {
    let clonedChildren = smartCloneGetClones(child, clone);
    let id = applyReplaces(child.id, options.replaces, topCloneID);
    if(widgets.has(id))
      id = generateUniqueWidgetID();
    if(!clonedChildren.length) {
      console.log('Smart Clone - Adding', id);
      clonedChildren = [ widgets.get(await addWidgetLocal({ id, type: child.get('type'), parent: clone.id, inheritFrom: inheritDef(child) })) ];
      smartCloneSourceMap[topCloneID][id] = child;
    }
    await smartCloneAddChildren(topCloneID, clonedChildren.pop(), child, options);
  }
}

async function smartCloneUpdateChildren(topCloneID, clone, source, options) {
  for(const [ cloneID, source ] of Object.entries(smartCloneSourceMap[topCloneID])) {
    const optionsCopy = JSON.parse(JSON.stringify(options));
    if(optionsCopy.flipX !== 'all' && widgets.get(cloneID).get('parent') != topCloneID)
      delete optionsCopy.flipX;
    if(optionsCopy.flipY !== 'all' && widgets.get(cloneID).get('parent') != topCloneID)
      delete optionsCopy.flipY;
    if(cloneID != topCloneID)
      await smartCloneUpdateClone(topCloneID, widgets.get(cloneID), source, optionsCopy);
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
  if(type == 'seat')
    exceptions.push("!player", "!color", "!turn", "!index", "!score");
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

          if(clone.state[property] !== undefined) {
            console.log('Smart Clone - Removing Property', clone.id, property);
            await clone.set(property, null);
          }

        } else {

          if(currentCloneValue !== newCloneValue) {
            console.log('Smart Clone - Setting Property', clone.id, property, currentCloneValue, newCloneValue);
            await clone.set(property, JSON.parse(newCloneValue));
          }

        }
      }
    }
  }

  for(const invalidProperty of Object.keys(clone.state).filter(property=>validProperties.indexOf(property) == -1)) {
    if(clone.inheritFromIsValid(clone.inheritFrom()[source.id], invalidProperty) && invalidProperty != 'inheritFrom') {
      console.log('Smart Clone - Removing Invalid Property', clone.id, invalidProperty);
      await clone.set(invalidProperty, null);
    }
  }

  if(JSON.stringify(clone.get('inheritFrom')) != JSON.stringify(inheritDef(source))) {
    console.log('Smart Clone - Setting Inherit', clone.id, inheritDef(source));
    await clone.set('inheritFrom', inheritDef(source));
  }

  if(options.flipX) {
    const sourceParentDom = widgets.get(source.get('parent')).domElement;
    const sourceDom = source.domElement;

    // Get bounding rectangles
    const sourceParentRect = sourceParentDom.getBoundingClientRect();
    const sourceRect = sourceDom.getBoundingClientRect();

    // Calculate new X using the bounding rectangles
    const newX = sourceParentRect.width/getScale() - (source.get('x') + sourceRect.width/getScale());
    console.log('Smart Clone - Flipping Property', clone.id, 'x', newX);
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
    console.log('Smart Clone - Flipping Property', clone.id, 'y', newY);
    await clone.set('y', newY);
  }

  if(clone.get('type') == 'seat' && clone.get('index') == source.get('index'))
    await clone.set('index', widgetFilter(w=>w.get('type')=='seat').map(w=>w.get('index')).reduce((a,b)=>Math.max(a,b), 0)+1);
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
  return selection;
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
  smartCloneInitializeSourceMap();
}

async function smartCloneUpdate(topCloneID, remove=false) {
  const clone = widgets.get(topCloneID);
  if(clone && !remove) {
    const source = smartCloneGetSource(clone, null);
    const options = clone.get('editorSmartClone');
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
  console.log('Smart Clone - Updated', topCloneID, smartCloneSourceMap[topCloneID]);
}

let noRecurse = false;
async function smartCloneDeltaReceived(delta) {
  if(noRecurse)
    return;

  console.log('Smart Clone - Delta Received', delta);
  noRecurse = true;
  const needUpdate = {};
  const needRemove = {};
  for(const [ id, d ] of Object.entries(delta.s)) {
    if(d && typeof d.editorSmartClone == 'object' && d.editorSmartClone !== null)
      needUpdate[id] = true;
    if(d === null && smartCloneSourceMap[id])
      delete smartCloneSourceMap[id];

    for(const [ topCloneID, sourceMap ] of Object.entries(smartCloneSourceMap)) {
      if(id === sourceMap[topCloneID].id && d === null) {
        needUpdate[topCloneID] = true;
        needRemove[topCloneID] = true;
      }

      for(const [ cloneID, source ] of Object.entries(sourceMap)) {
        if(id === source.id || id === cloneID || d && d.parent === source.id)
          needUpdate[topCloneID] = true;
        if(id === cloneID && d.parent !== undefined && Object.keys(sourceMap).indexOf(d.parent) == -1)
          delete smartCloneSourceMap[topCloneID][cloneID];
      }
    }
  }

  batchStart();
  for(const topCloneID of Object.keys(needUpdate))
    await smartCloneUpdate(topCloneID, needRemove[topCloneID]);
  batchEnd();
  console.log('Smart Clone - All Updated', smartCloneSourceMap);
  noRecurse = false;
}