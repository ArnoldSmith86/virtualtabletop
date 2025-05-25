import fs from 'fs';
import path from 'path';

class Config {
  constructor() {
    if(!fs.existsSync(path.resolve() + '/config.json'))
      fs.copyFileSync(path.resolve() + '/config.template.json', path.resolve() + '/config.json');

    this.config = JSON.parse(fs.readFileSync(path.resolve() + '/config.template.json'));
    this.config = Object.assign(this.config, JSON.parse(fs.readFileSync(path.resolve() + '/config.json')));

    if(!fs.existsSync(path.resolve() + '/client/css/custom.css'))
      fs.copyFileSync(path.resolve() + '/client/css/custom_template.css', path.resolve() + '/client/css/custom.css');
  }

  directory(index) {
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
      Object.keys(this.config).map(key => [key, this.get(key)])
    );
  }

  resolveAsset(asset) {
    if(!this.publicLibraryAssets) {
      this.publicLibraryAssets = {};
      for(const category of [ 'games', 'tutorials' ]) {
        const name = this.directory('library') + '/' + category;
        for(const dir of fs.readdirSync(name))
          if(fs.existsSync(name + '/' + dir + '/assets'))
            for(const file of fs.readdirSync(name + '/' + dir + '/assets'))
              this.publicLibraryAssets[file] = name + '/' + dir + '/assets/' + file;
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
