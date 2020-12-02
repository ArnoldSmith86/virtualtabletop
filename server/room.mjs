import fs from 'fs';
import path from 'path';

import JSZip from 'jszip';
import FileLoader from './fileloader.mjs';

export default class Room {
  players = [];
  state = {};

  constructor(id, unloadCallback) {
    this.id = id;
    this.unloadCallback = unloadCallback;

    this.load();
  }

  addPlayer(player) {
    console.log(`adding player ${player.name} to room ${this.id}`);
    this.players.push(player);

    if(!this.state._meta.players[player.name])
      this.state._meta.players[player.name] = '#ff0000';

    player.send('state', this.state);
    this.sendMetaUpdate();
  }

  async addState(player, id, type, src, addAsVariant) {
    const stateID = addAsVariant || id;
    let variantID = id;

    let states = [ this.state ];
    let etag = null;
    try {
      if(type == 'file')
        states = await FileLoader.readStatesFromFile(Buffer.from(src.replace(/^data.*?,/, ''), 'base64'));
      if(type == 'link') {
        ({ states, etag } = await FileLoader.downloadLink(src));
        if(!etag)
          player.send('warning', 'This link does not provide an Etag header. It will not auto-check for new versions.');
      }
    } catch(e) {
      console.log('ERROR LOADING FILE: ' + e);
      fs.writeFileSync(path.resolve() + '/save/errors/' + Math.random().toString(36).substring(3, 7), Buffer.from(src.replace(/^data.*?,/, ''), 'base64'));
      player.send('error', e.toString());
      return;
    }

    for(const state of states) {
      const meta = (state._meta || {}).info || {
        name: 'Unnamed',
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mOs+Q8AAf0BfcpIqy8AAAAASUVORK5CYII=',
        rules: '',
        bgg: '',
        year: 0,
        mode: 'vs',
        time: 30,
        players: '2-4',
        language: 'US',
        variant: ''
      };

      fs.writeFileSync(path.resolve() + '/save/states/' + this.id + '-' + stateID + '-' + variantID + '.json', JSON.stringify(state));

      const variant = {
        players: meta.players,
        language: meta.language,
        variant: meta.variant
      };
      if(type == 'link') {
        variant.link = src;
        variant.etag = etag;
      }
      delete meta.players;
      delete meta.language;
      delete meta.variant;

      if(addAsVariant) {
        this.state._meta.states[stateID].variants[variantID] = variant;
      } else {
        meta.variants = {};
        meta.variants[variantID] = variant;
        this.state._meta.states[stateID] = meta;
      }

      addAsVariant = true;
      variantID = Math.random().toString(36).substring(3, 7);
    }
    this.sendMetaUpdate();
  }

  broadcast(func, args, exceptPlayer) {
    console.log(this.id, func, args);
    for(const player of this.players)
      if(player != exceptPlayer)
        player.send(func, args);
  }

  async download(stateID, variantID) {
    const zip = new JSZip();

    for(const vID of variantID ? [ variantID ] : Object.keys(this.state._meta.states[stateID].variants)) {
      const filename = path.resolve() + '/save/states/' + this.id + '-' + stateID + '-' + vID + '.json';
      const d = await fs.promises.readFile(filename);
      const state = JSON.parse(d);
      state._meta = { version: this.state._meta.version, info: { ...this.state._meta.states[stateID] } };
      Object.assign(state._meta.info, state._meta.info.variants[vID]);
      delete state._meta.info.variants;

      zip.file(`${vID}.json`, JSON.stringify(state));
    }

    const zipBuffer = await zip.generateAsync({type:'nodebuffer', compression: 'DEFLATE'});
    return {
      name: this.state._meta.states[stateID].name + '.vtt',
      type: 'application/zip',
      content: zipBuffer
    };
  }

  editState(player, id, meta) {
    Object.assign(this.state._meta.states[id], meta);
    this.sendMetaUpdate();
  }

  load(file) {
    if(!file)
      file = path.resolve() + '/save/rooms/' + this.id + '.json';

    console.log(`loading room ${this.id}`);
    try {
      this.state = JSON.parse(fs.readFileSync(file));
      if(this.state._meta.version !== 1)
        throw 'File version is not supported';
    } catch(e) {
      this.state = {
        _meta: {
          version: 1,
          players: {},
          states: {}
        }
      };
    }
  }

  async loadState(player, stateID, variantID) {
    const filename = path.resolve() + '/save/states/' + this.id + '-' + stateID + '-' + variantID + '.json';
    const meta = this.state._meta;
    const variantInfo = meta.states[stateID].variants[variantID];

    if(variantInfo.link && variantInfo.etag) {
      try {
        const { states, etag } = await FileLoader.downloadLink(variantInfo.link, variantInfo.etag);
        if(etag != variantInfo.etag) {
          fs.writeFileSync(filename, JSON.stringify(states[0]));
          variantInfo.etag = etag;
          this.sendMetaUpdate();
        }
      } catch(e) {
        player.send('error', 'Updating state from link failed (will use the previous version): ' + e.toString());
      }
    }

    this.load(filename);
    this.state._meta = meta;
    this.broadcast('state', this.state);
  }

  mouseMove(player, coords) {
    this.broadcast('mouse', { player: player.name, coords });
  }

  receiveDelta(player, delta) {
    for(const widgetID in delta.s) {
      if(delta.s[widgetID] === null) {
        delete this.state[widgetID];
      } else if(this.state[widgetID] === undefined) {
        this.state[widgetID] = delta.s[widgetID];
      } else {
        for(const property in delta.s[widgetID]) {
          if(delta.s[widgetID][property] === null) {
            delete this.state[widgetID][property];
          } else {
            this.state[widgetID][property] = delta.s[widgetID][property];
          }
        }
      }
    }
    this.broadcast('delta', delta, player);
  }

  recolorPlayer(renamingPlayer, playerName, color) {
    this.state._meta.players[playerName] = color;
    this.sendMetaUpdate();
  }

  removePlayer(player) {
    console.log(`removing player ${player.name} from room ${this.id}`);
    this.players = this.players.filter(e => e != player);
    if(this.players.length == 0) {
      this.unload();
      this.unloadCallback();
    }
    this.sendMetaUpdate();
  }

  removeState(player, stateID) {
    delete this.state._meta.states[stateID];
    this.sendMetaUpdate();
  }

  renamePlayer(renamingPlayer, oldName, newName) {
    this.state._meta.players[newName] = this.state._meta.players[newName] || this.state._meta.players[oldName];
    delete this.state._meta.players[oldName];

    for(const player of this.players)
      if(player.name == oldName)
        player.rename(newName);

    this.sendMetaUpdate();
  }

  sendMetaUpdate() {
    this.broadcast('meta', { meta: this.state._meta, activePlayers: this.players.map(p=>p.name) });
  }

  setState(state) {
    const meta = this.state._meta;
    this.state = state;
    this.state._meta = meta;
    this.broadcast('state', state);
  }

  unload() {
    console.log(`unloading room ${this.id}`);
    const json = JSON.stringify(this.state);
    if(json != '{}')
      fs.writeFileSync(path.resolve() + '/save/rooms/' + this.id + '.json', json);
  }
}
