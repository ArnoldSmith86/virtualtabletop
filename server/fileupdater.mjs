const VERSION = 2;

export default function FileUpdater(state) {
  const v = state._meta.version;
  if(v == VERSION)
    return state;

  for(const id in state) {
    const w = state[id];

    if(v == 1 && state[id].type == 'button') {
      for(const operation of w.clickRoutine) {
        if(operation.func == 'SELECT' && operation.mode == 'set')
          delete operation.mode;
        if(operation.func == 'SELECT' && operation.mode === undefined)
          operation.mode = 'add';
      }
    }

  }

  state._meta.version = VERSION;
  return state;
}
