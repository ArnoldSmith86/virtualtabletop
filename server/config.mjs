import fs from 'fs';
import path from 'path';

import FileWriter from './filewriter.mjs';

// The client config is inlined into room.html and therefore readable by every visitor, so it only
// contains the entries the client code actually uses - the rest (directory layout, the secret
// adminURL, the port, ...) stays on the server. A new "config.foo" in the client needs its key
// listed here; tests/server/config.test.js checks that the two sides agree.
const clientConfigKeys = [
  'aiRoutineEndpoint',
  'allowPublicLibraryEdits',
  'betaServers',
  'customTab',
  'libraries',
  'roomNamesCaseSensitive',
  'serverName',
  'urlPrefix'
];

class Config {
  constructor() {
    if(!fs.existsSync(path.resolve() + '/config.json'))
      FileWriter.copyFileSync(path.resolve() + '/config.template.json', path.resolve() + '/config.json');

    this.config = JSON.parse(fs.readFileSync(path.resolve() + '/config.template.json'));
    this.config = Object.assign(this.config, JSON.parse(fs.readFileSync(path.resolve() + '/config.json')));

    if(!fs.existsSync(path.resolve() + '/client/css/custom.css'))
      FileWriter.copyFileSync(path.resolve() + '/client/css/custom_template.css', path.resolve() + '/client/css/custom.css');
  }

  directory(index) {
    const vttSave = process.env.VTT_SAVE_DIR;
    if(vttSave && (index === 'save' || index === 'assets'))
      return index === 'save' ? vttSave : vttSave + '/assets';
    if(this.config.directories[index][0] == '/')
      return this.config.directories[index];
    else
      return path.resolve() + '/' + this.config.directories[index];
  }

  get(index) {
    const envVar = process.env[index.toUpperCase()];
    return envVar !== undefined ? envVar : this.config[index];
  }

  getClientConfig() {
    return Object.fromEntries(
      clientConfigKeys.map(key => [key, this.get(key)])
    );
  }

  resolveAsset(asset) {
    if(!this.publicLibraryAssets) {
      this.publicLibraryAssets = {};
      for(const category of Object.values(this.config.libraries)) {
        const name = this.directory('library') + '/' + category;
        if(fs.existsSync(name)) {
          for(const dir of fs.readdirSync(name))
            if(fs.existsSync(name + '/' + dir + '/assets'))
              for(const file of fs.readdirSync(name + '/' + dir + '/assets'))
                this.publicLibraryAssets[file] = name + '/' + dir + '/assets/' + file;
        }
      }
    }

    if(!asset.match(/^[0-9_-]+$/))
      return null;
    if(this.publicLibraryAssets[asset])
      return this.publicLibraryAssets[asset];
    if(fs.existsSync(this.directory('assets') + '/' + asset))
      return this.directory('assets') + '/' + asset;
    return null;
  }
}

export default new Config();
