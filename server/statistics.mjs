import fs from 'fs';

import Config from './config.mjs';
import FileWriter from './filewriter.mjs';
import Logging from './logging.mjs';

const defaultFilename = Config.directory('save') + '/statistics.json';

function isObject(value) {
  return typeof value == 'object' && value !== null && !Array.isArray(value);
}

class Statistics {
  constructor(filename = defaultFilename) {
    this.filename = filename;
    this.data = this.readFromFilesystem();
  }

  // Runs at import time and must never throw - statistics are a nice-to-have and may not keep
  // the server from starting. Anything missing, unreadable, unparseable or shaped differently
  // than expected falls back to empty statistics. A file that does have content is moved aside
  // first: the next autosave would overwrite it within a minute otherwise, while a file
  // truncated mid-write is usually still mostly recoverable by hand.
  readFromFilesystem() {
    const empty = {
      starsPerState: {},
      timePerState: {}
    };

    let raw;
    try {
      raw = fs.readFileSync(this.filename, 'utf8').trim();
    } catch(e) {
      if(e.code != 'ENOENT')
        Logging.log(`WARNING - could not read ${this.filename}, starting with empty statistics: ${e.message}`);
      return empty;
    }

    if(raw === '')
      return empty;

    try {
      const data = JSON.parse(raw);
      if(!isObject(data))
        throw new Error('it does not contain a JSON object');
      for(const key of Object.keys(empty))
        if(data[key] !== undefined && !isObject(data[key]))
          throw new Error(`its ${key} is not a JSON object`);
      return Object.assign(empty, data);
    } catch(e) {
      this.moveAside(e.message);
      return empty;
    }
  }

  moveAside(reason) {
    const corruptFilename = `${this.filename}.corrupt`;
    try {
      fs.renameSync(this.filename, corruptFilename);
      Logging.log(`WARNING - ${this.filename} is unusable (${reason}), moved it to ${corruptFilename} and starting with empty statistics`);
    } catch(e) {
      Logging.log(`WARNING - ${this.filename} is unusable (${reason}), starting with empty statistics - moving it to ${corruptFilename} failed: ${e.message}`);
    }
  }

  toggleStateStar(publicLibraryStateID, starred) {
    this.data.starsPerState[publicLibraryStateID] = (this.data.starsPerState[publicLibraryStateID] ?? 0) + (starred ? 1 : -1);
  }

  updateDataInsideStates(states) {
    for(const [ id, state ] of Object.entries(states)) {
      state.stars = this.data.starsPerState[state.publicLibrary] || 0;
      if(this.data.timePerState[state.publicLibrary])
        state.timePlayed = Object.entries(this.data.timePerState[state.publicLibrary]).map(a=>a[0]*a[1]).reduce((a,b)=>a+b);
      else
        state.timePlayed = 0;
    }
  }

  updateTimeStatistics(publicLibraryStateID, playerCount) {
    if(!this.data.timePerState[publicLibraryStateID])
      this.data.timePerState[publicLibraryStateID] = {};
    this.data.timePerState[publicLibraryStateID][playerCount] = (this.data.timePerState[publicLibraryStateID][playerCount] ?? 0) + 1;
  }

  writeToFilesystem() {
    FileWriter.writeFileSync(this.filename, JSON.stringify(this.data, null, '  '));
  }
}

export { Statistics };
export default new Statistics();
