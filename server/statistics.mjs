import fs from 'fs';

import Config from './config.mjs';
import Logging from './logging.mjs';

const statisticsFilename = Config.directory('save') + '/statistics.json';

class Statistics {
  constructor() {
    this.data = this.readFromFilesystem();
  }

  readFromFilesystem() {
    const defaults = {
      starsPerState: {},
      timePerState: {}
    };

    if(!fs.existsSync(statisticsFilename))
      return defaults;

    // Tolerate an empty or truncated file: an unwritten/corrupt statistics.json
    // used to make JSON.parse throw "Unexpected end of JSON input" and crash the
    // server on startup (issue #2993). Fall back to empty statistics instead.
    const raw = fs.readFileSync(statisticsFilename, 'utf8').trim();
    if(raw === '')
      return defaults;

    try {
      return JSON.parse(raw);
    } catch(e) {
      Logging.log(`WARNING - could not parse ${statisticsFilename}, starting with empty statistics: ${e.message}`);
      return defaults;
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
    fs.writeFileSync(statisticsFilename, JSON.stringify(this.data, null, '  '));
  }
}

export default new Statistics();
