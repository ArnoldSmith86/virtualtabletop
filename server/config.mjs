import fs from 'fs';
import path from 'path';

class Config {
  constructor() {
    if(!fs.existsSync(path.resolve() + '/config.json'))
      fs.copyFileSync(path.resolve() + '/config.template.json', path.resolve() + '/config.json');

    this.config = JSON.parse(fs.readFileSync(path.resolve() + '/config.json'));
    this.configFallback = JSON.parse(fs.readFileSync(path.resolve() + '/config.template.json'));
  }

  directory(index) {
    if(this.get('directories')[index][0] == '/')
      return this.get('directories')[index];
    else
      return path.resolve() + '/' + this.get('directories')[index];
  }

  get(index) {
    if(this.config[index] !== undefined)
      return this.config[index];
    else
      return this.configFallback[index];
  }
}

export default new Config();
