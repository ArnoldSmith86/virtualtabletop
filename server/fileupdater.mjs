const VERSION = 2;

export default function FileUpdater(state) {
  const v = state._meta.version;
  if(v == VERSION)
    return state;

  for(const id in state) {
    const w = state[id];

    if(v == 1 && state[id].type == 'button') {
      let isFirstSelect = true;
      for(const operation of w.clickRoutine) {
        if(operation.func == 'SELECT') {
          if(operation.mode === undefined && !isFirstSelect)
            operation.mode = 'add';
          if(operation.mode == 'set')
            delete operation.mode;
          isFirstSelect = false;
        }
      }
    }

  }

  state._meta.version = VERSION;
  return state;
}
