import fs from 'fs';

import Config from './config.mjs';

// A list of room IDs whose admins made them publicly visible in the rooms overlay.

function filename() {
  return Config.directory('save') + '/publicRooms.json';
}

export default {
  get() {
    try {
      const rooms = JSON.parse(fs.readFileSync(filename()));
      if(Array.isArray(rooms))
        return rooms;
    } catch(e) {}
    return [];
  },

  add(roomID) {
    const rooms = this.get();
    if(rooms.indexOf(roomID) == -1) {
      if(rooms.length >= 500)
        return false;
      rooms.push(roomID);
      fs.writeFileSync(filename(), JSON.stringify(rooms));
    }
    return true;
  },

  remove(roomID) {
    const rooms = this.get();
    if(rooms.indexOf(roomID) != -1)
      fs.writeFileSync(filename(), JSON.stringify(rooms.filter(r=>r!=roomID)));
  }
};
