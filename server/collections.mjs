import fs from 'fs';
import crypto from 'crypto';

import Config from './config.mjs';

// A collection is a list of room IDs stored under a user provided secret ID.
// The file is keyed by the hash of that ID so the secret never touches the disk.

function filename(collectionID) {
  return Config.directory('save') + '/collections/' + crypto.createHash('sha256').update(String(collectionID)).digest('hex') + '.json';
}

export default {
  isValidID(collectionID) {
    return typeof collectionID == 'string' && !!collectionID.match(/^[A-Za-z0-9_-]{6,64}$/);
  },

  get(collectionID) {
    try {
      const collection = JSON.parse(fs.readFileSync(filename(collectionID)));
      if(Array.isArray(collection.rooms))
        return collection;
    } catch(e) {}
    return { rooms: [] };
  },

  addRoom(collectionID, roomID) {
    const collection = this.get(collectionID);
    if(collection.rooms.indexOf(roomID) == -1) {
      collection.rooms.push(roomID);
      fs.writeFileSync(filename(collectionID), JSON.stringify(collection));
    }
  },

  removeRoom(collectionID, roomID) {
    const collection = this.get(collectionID);
    if(collection.rooms.indexOf(roomID) != -1) {
      collection.rooms = collection.rooms.filter(r=>r!=roomID);
      fs.writeFileSync(filename(collectionID), JSON.stringify(collection));
    }
  }
};
