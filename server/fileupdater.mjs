const VERSION = 2;

export default function FileUpdater(state) {
  const v = state._meta.version;
  if(v == VERSION)
    return state;

  const widgetsArray = Array.from(Object.values(state));
  const pileIDs = widgetsArray.filter(w=>w.type=='pile').map(w=>w.id);

  for(const id in state) {
    const w = state[id];

    if(v == 1 && w.parent && pileIDs.indexOf(w.parent) != -1) {

      const pile = widgetsArray.filter(x=>x.id==w.parent)[0];
      w.pile = pile.id;
      w.parent = pile.parent;
      w.x = (w.x || 0) + (pile.x || 4);
      w.y = (w.y || 0) + (pile.y || 4);
      if(w.x == 4)
        delete w.x;
      if(w.y == 4)
        delete w.y;

    }

  }

  for(const pile of pileIDs)
    delete state[pile];

  state._meta.version = VERSION;
  return state;
}
