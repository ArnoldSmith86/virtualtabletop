import fs from 'fs';
import path from 'path';

class Config {
  constructor() {
    if(!fs.existsSync(path.resolve() + '/config.json'))
      fs.copyFileSync(path.resolve() + '/config.template.json', path.resolve() + '/config.json');

    this.config = JSON.parse(fs.readFileSync(path.resolve() + '/config.template.json'));
    this.config = Object.assign(this.config, JSON.parse(fs.readFileSync(path.resolve() + '/config.json')));
  }

  directory(index) {
    if(this.config.directories[index][0] == '/')
      return this.config.directories[index];
    else
      return path.resolve() + '/' + this.config.directories[index];
  }

  get(index) {
    return this.config[index];
  }
}

export default new Config();
