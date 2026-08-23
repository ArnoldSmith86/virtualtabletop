import fs from 'fs';

import Config from './config.mjs';
import FileWriter from './filewriter.mjs';
import Logging from './logging.mjs';

const defaultFilename = Config.directory('save') + '/statistics.json';

function isObject(value) {
  return typeof value == 'object' && value !== null && !Array.isArray(value);
}

function isNumberMap(value) {
  return isObject(value) && Object.values(value).every(count => typeof count == 'number');
}

class Statistics {
  constructor(filename = defaultFilename) {
    this.filename = filename;
    this.writeFailed = false;
    this.data = this.readFromFilesystem();
  }

  // Runs at import time and must never throw - statistics are a nice-to-have and may not keep
  // the server from starting. Anything missing, unreadable, unparseable or shaped differently
  // than expected falls back to empty statistics. The shape is checked deep enough that every
  // value the rest of the class reads is a number, so a half-written file cannot turn into a
  // TypeError while the public library listing is being assembled. A file that does have
  // content is moved aside first: the next autosave would overwrite it within a minute
  // otherwise, while a file truncated mid-write is usually still mostly recoverable by hand.
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
      if(data.starsPerState !== undefined && !isNumberMap(data.starsPerState))
        throw new Error('its starsPerState is not a map of numbers');
      if(data.timePerState !== undefined && !(isObject(data.timePerState) && Object.values(data.timePerState).every(isNumberMap)))
        throw new Error('its timePerState is not a map of maps of numbers');
      return Object.assign(empty, data);
    } catch(e) {
      this.moveAside(e.message);
      return empty;
    }
  }

  // Never overwrites a copy preserved earlier: the bytes of the first corruption are usually the
  // ones worth recovering, so later ones get .corrupt.2, .corrupt.3 and so on.
  moveAside(reason) {
    let corruptFilename = `${this.filename}.corrupt`;
    for(let attempt = 2; fs.existsSync(corruptFilename); ++attempt)
      corruptFilename = `${this.filename}.corrupt.${attempt}`;

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
      state.timePlayed = Object.entries(this.data.timePerState[state.publicLibrary] ?? {}).map(a=>a[0]*a[1]).reduce((a,b)=>a+b, 0);
    }
  }

  updateTimeStatistics(publicLibraryStateID, playerCount) {
    if(!this.data.timePerState[publicLibraryStateID])
      this.data.timePerState[publicLibraryStateID] = {};
    this.data.timePerState[publicLibraryStateID][playerCount] = (this.data.timePerState[publicLibraryStateID][playerCount] ?? 0) + 1;
  }

  // Called from the autosave interval and from the exit handler, neither of which catches
  // anything, so a save directory that cannot be written must not throw here either - it would
  // take the whole server down a minute after startup. Only the transition between working and
  // failing is logged, so a permanently unwritable directory does not fill the log every minute.
  writeToFilesystem() {
    try {
      FileWriter.writeFileSync(this.filename, JSON.stringify(this.data, null, '  '));
      if(this.writeFailed)
        Logging.log(`INFO - ${this.filename} can be written again, statistics are being saved`);
      this.writeFailed = false;
    } catch(e) {
      if(!this.writeFailed)
        Logging.log(`WARNING - could not write ${this.filename}, statistics are collected but not saved: ${e.message}`);
      this.writeFailed = true;
    }
  }
}

export { Statistics };
export default new Statistics();
