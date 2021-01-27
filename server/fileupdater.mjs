const VERSION = 2;

export default function FileUpdater(state) {
  const v = state._meta.version;
  if(v == VERSION)
    return state;

  for(const id in state) {
    const w = state[id];

    if(v < 2 && state[id].type == 'deck' && Array.isArray(w.faceTemplates)) {
      for(const face of faceTemplates) {
        if(Array.isArray(face.objects)) {
          for(const object of face.objects) {
            if(object.valueType != 'static' && object.value) {
              if(typeOf object.dynamicProperties != 'object')
                object.dynamicProperties = { value: object.value }
              else
                object.dynamicProperties.value = object.value;
              delete object.value;
            }
            delete object.valueType;
          }
        }
      }
    }   

  }

  state._meta.version = VERSION;
  return state;
}
