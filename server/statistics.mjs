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

  writeToFilesystem() {
    fs.writeFileSync(statisticsFilename, JSON.stringify(this.data));
  }
}

export default new Statistics();
