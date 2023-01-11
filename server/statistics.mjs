import fs from 'fs';

import Config from './config.mjs';

const statisticsFilename = Config.directory('save') + '/statistics.json';

class Statistics {
  constructor() {
    this.data = fs.existsSync(statisticsFilename) ? JSON.parse(fs.readFileSync(statisticsFilename)) : {
      starsPerState: {},
      timePerState: {}
    };
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
