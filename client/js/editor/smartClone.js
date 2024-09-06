async function smartCloneRemoveChildren(clone, source, options) {
  for(const child of widgetFilter(w=>w.get('parent') == clone.id)) {
    const childSource = smartCloneGetSource(child, source);
    const id = childSource && applyReplaces(childSource.id, options.replaces);

    if(!childSource || id != childSource.id && !widgets.has(id) || child.get('type') != childSource.get('type'))
      await removeWidgetLocal(child.id);
    else
      smartCloneRemoveChildren(child, childSource, options);
  }
}

async function smartCloneAddChildren(clone, source, options) {
  for(const child of widgetFilter(w=>w.get('parent') == source.id)) {
    let clonedChildren = smartCloneGetClones(child, clone);
    let id = applyReplaces(child.id, options.replaces);
    if(widgets.has(id))
      id = generateUniqueWidgetID();
    if(!clonedChildren.length)
      clonedChildren = [ widgets.get(await addWidgetLocal({ id, type: child.get('type'), parent: clone.id, inheritFrom: inheritDef(child) })) ];
    let clonedChild = clonedChildren.pop();
    await smartCloneUpdateClone(clonedChild, child, options);
    for(const c of clonedChildren)
      await removeWidgetLocal(c.id);
    const secondLevelOptions = JSON.parse(JSON.stringify(options));
    if(secondLevelOptions.flipX !== 'all')
      delete secondLevelOptions.flipX;
    if(secondLevelOptions.flipY !== 'all')
      delete secondLevelOptions.flipY;
    await smartCloneAddChildren(clonedChild, child, secondLevelOptions);
  }
}

function inheritDef(widget) {
  const exceptions = [];
  if(widget.get('movable'))
    exceptions.push("!parent", "!x", "!y");
  if(widget.get('type') == 'seat')
    exceptions.push("!player", "!color", "!turn", "!index");
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

function applyReplaces(value, replaces) {
  let replacedValue = JSON.parse(JSON.stringify(value));
  for(const [ from, to ] of Object.entries(replaces)) {
    const regex = new RegExp(from, 'g');
    replacedValue = replacedValue.replace(regex, to);
  }
  return replacedValue;
}

async function smartCloneUpdateClone(clone, source, options) {
  const validProperties = validPropertiesOfWidget(source);
  for(const property of validProperties) {
    const value = JSON.stringify(source.get(property));
    let replacedValue = applyReplaces(value, options.replaces);
    if(JSON.stringify(clone.get(property)) != replacedValue && [ 'id', 'parent', 'type', 'inheritFrom' ].indexOf(property) == -1)
      if(clone.get('type') != 'seat' || [ 'player', 'color', 'turn', 'index' ].indexOf(property) == -1)
        await clone.set(property, JSON.parse(replacedValue));
  }
  for(const invalidProperty of Object.keys(clone.state).filter(property=>validProperties.indexOf(property) == -1))
    if(clone.inheritFromIsValid(clone.inheritFrom()[source.id], invalidProperty) && invalidProperty != 'inheritFrom')
      await clone.set(invalidProperty, null);
  if(options.flipX) {
    const sourceParentWidth = widgets.get(source.get('parent')).get('width');
    const newX = sourceParentWidth - (source.get('x') + source.get('width'));
    await clone.set('x', newX);
  }
  if(options.flipY) {
    const sourceParentHeight = widgets.get(source.get('parent')).get('height');
    const newY = sourceParentHeight - (source.get('y') + source.get('height'));
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

let noRecurse = false;
async function smartCloneDeltaReceived(delta) {
  if(noRecurse)
    return;

  noRecurse = true;

  const cloneSources = {};
  for(const cloneTarget of widgetFilter(w=>w.get('editorSmartClone'))) {
    const sourceID = smartCloneGetSource(cloneTarget, null).id;
    if(!cloneSources[sourceID])
      cloneSources[sourceID] = [];
    cloneSources[sourceID].push(cloneTarget);
  }

  batchStart();
  for(const [ id, d ] of Object.entries(delta.s)) {
    if(d && d.editorSmartClone !== undefined) {
      const sc = d.editorSmartClone;
      if(typeof sc == 'object' && sc !== null) {
        const clone = widgets.get(id);
        await smartCloneRemoveChildren(clone, smartCloneGetSource(clone, null), sc);
        await smartCloneAddChildren(clone, smartCloneGetSource(clone, null), sc);
      }
    }
    let targetIDs = [ id ];
    let iterator = id;
    while(d && widgets.get(iterator).get('parent') != null) {
      iterator = widgets.get(widgets.get(iterator).get('parent')).id;
      targetIDs.push(iterator);
    }
    for(const [ source, clones ] of Object.entries(cloneSources)) {
      if(d === null || d.parent === null || targetIDs.indexOf(source) != -1) {
        for(const clone of clones) {
          await smartCloneRemoveChildren(clone, smartCloneGetSource(clone, null), clone.get('editorSmartClone'));
          await smartCloneAddChildren(clone, smartCloneGetSource(clone, null), clone.get('editorSmartClone'));
        }
      }
    }
  }
  batchEnd();
  noRecurse = false;
}