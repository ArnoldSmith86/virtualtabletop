const VERSION = 2;

export default function FileUpdater(state) {
  const v = state._meta.version;
  if(v == VERSION)
    return state;

  for(const id in state)
    updateProperties(state[id], v);

  state._meta.version = VERSION;
  return state;
}

function updateProperties(properties, v) {
  if(typeof properties != 'object')
    return;

  if(!properties.type)
    updateProperties(properties.faces);
  if(properties.type == 'deck')
    updateProperties(properties.cardDefaults);
  if(properties.type == 'deck' && typeof properties.cardTypes == 'object')
    for(const cardType in properties.cardTypes)
      updateProperties(properties.cardTypes[cardType]);

  for(const property in properties)
    if(property.match(/Routine$/))
      updateRoutine(properties[property], v);
}

function updateRoutine(routine, v) {
  if(!Array.isArray(routine))
    return;

  v<2 && v2UpdateSelectDefault(routine);
}

function v2UpdateSelectDefault(routine) {
  let isNotFirstSelect = {};
  for(const operation of routine) {
    if(operation.func == 'SELECT') {
      if(operation.mode === undefined && isNotFirstSelect[operation.collection || 'DEFAULT'])
        operation.mode = 'add';
      if(operation.mode == 'set')
        delete operation.mode;
      isNotFirstSelect[operation.collection || 'DEFAULT'] = true;
    }
  }
}
