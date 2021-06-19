import fs from 'fs';
import path from 'path';

import JSZip from 'jszip';
import FileLoader from './fileloader.mjs';
import FileUpdater from './fileupdater.mjs';
import Logging from './logging.mjs';

export default class Room {
  players = [];
  state = {};
  deltaID = 0;

  constructor(id, unloadCallback) {
    this.id = id;
    this.unloadCallback = unloadCallback;
  }

  addPlayer(player) {
    Logging.log(`adding player ${player.name} to room ${this.id}`);
    this.players.push(player);

    if(!this.state._meta.players[player.name])
      this.state._meta.players[player.name] = this.newPlayerColor();

    this.sendMetaUpdate();
    this.state._meta.deltaID = this.deltaID;
    player.send('state', this.state);
  }

  async addState(id, type, src, srcName, addAsVariant) {
    const initialAddAsVariant = addAsVariant;
    let stateID = addAsVariant || id;
    let variantID = id;

    let states = { room: [ this.state ] };
    let etag = null;

    if(type == 'link')
      src = src.toString('utf8');

    try {
      if(type == 'file')
        states = await FileLoader.readStatesFromBuffer(src);
      if(type == 'link')
        states = await FileLoader.readStatesFromLink(src);
    } catch(e) {
      Logging.log(`ERROR LOADING FILE: ${e.toString()}`);
      try {
        fs.writeFileSync(path.resolve() + '/save/errors/' + Math.random().toString(36).substring(3, 7), src);
      } catch(e) {}
      throw e;
    }

    for(const state in states) {
      for(const v in states[state]) {
        let name = type == 'file' && srcName || 'Unnamed';
        if(state.match(/\.pcio$/))
          name = state;

        const variant = states[state][v];
        const meta = (variant._meta || {}).info || {
          name: name.replace(/\.pcio/, ''),
          image: '',
          rules: '',
          bgg: '',
          year: 0,
          mode: 'vs',
          time: 30,
          players: '2-4',
          language: 'US',
          variant: '',
          link: '',
          attribution: ''
        };

        if(type != 'link')
          fs.writeFileSync(this.variantFilename(stateID, variantID), JSON.stringify(variant));

        const variantMeta = {
          players: meta.players,
          language: meta.language,
          variant: meta.variant,
          attribution: meta.attribution
        };
        if(type == 'link') {
          const baseLink = src.replace(/#.*/, '');
          meta.link = `${baseLink}#${state}`;
          variantMeta.link = `${meta.link}/${v}`;
          if(src.match(/#.*\//))
            meta.link = variantMeta.link;
        }
        delete meta.players;
        delete meta.language;
        delete meta.variant;
        delete meta.attribution;

        if(addAsVariant) {
          if(!this.state._meta.states[stateID].variants[variantID])
            this.state._meta.states[stateID].variants[variantID] = variantMeta;
          else if(type != 'link')
            delete this.state._meta.states[stateID].variants[variantID].link;
        } else {
          meta.variants = {};
          meta.variants[variantID] = variantMeta;
          this.state._meta.states[stateID] = meta;
        }

        addAsVariant = true;
        variantID = Math.random().toString(36).substring(3, 7);
      }

      if(!initialAddAsVariant) {
        addAsVariant = false;
        stateID = Math.random().toString(36).substring(3, 7);
      }
      variantID = Math.random().toString(36).substring(3, 7);
    }
    this.sendMetaUpdate();
  }

  broadcast(func, args, exceptPlayer) {
    for(const player of this.players)
      if(player != exceptPlayer)
        player.send(func, args);
  }

  deleteUnusedVariantFiles(stateID, oldState, newState) {
    for(const oldVariantID in oldState.variants) {
      if(!newState.variants[oldVariantID]) {
        const savefile = this.variantFilename(stateID, oldVariantID);
        if(fs.existsSync(savefile))
          fs.unlinkSync(savefile);
      }
    }
  }

  async download(stateID, variantID) {
    const includeAssets = true;
    const zip = new JSZip();

    if(!stateID && !variantID) {
      for(const sID in this.state._meta.states) {
        const state = await this.download(sID);
        zip.file(state.name, state.content);
      }

      const zipBuffer = await zip.generateAsync({type:'nodebuffer'});
      return {
        name: this.id + '.vttc',
        type: 'application/zip',
        content: zipBuffer
      };
    }
    if(!this.state._meta.states[stateID])
      throw new Logging.UserError(404, `State ${stateID} does not exist.`);

    for(const vID of variantID ? [ variantID ] : Object.keys(this.state._meta.states[stateID].variants)) {
      const v = this.state._meta.states[stateID].variants[vID];
      if(!v)
        throw new Logging.UserError(404, `Variant ${vID} does not exist.`);

      let state = null;
      if(v.link)
        state = await FileLoader.readVariantFromLink(v.link);
      else
        state = JSON.parse(fs.readFileSync(this.variantFilename(stateID, vID)));
      state._meta = { version: state._meta.version, info: { ...this.state._meta.states[stateID] } };
      Object.assign(state._meta.info, state._meta.info.variants[vID]);
      delete state._meta.info.variants;
      delete state._meta.info.link;

      zip.file(`${vID}.json`, JSON.stringify(state, null, '  '));
      if(includeAssets)
        for(const asset of this.getAssetList(state))
          if(fs.existsSync(path.resolve() + '/save' + asset))
            zip.file(asset, fs.readFileSync(path.resolve() + '/save' + asset));
    }

    const zipBuffer = await zip.generateAsync({type:'nodebuffer', compression: 'DEFLATE'});
    return {
      name: this.state._meta.states[stateID].name + '.vtt',
      type: 'application/zip',
      content: zipBuffer
    };
  }

  async editState(player, id, meta) {
    this.deleteUnusedVariantFiles(id, this.state._meta.states[id], meta);

    // if update links were removed, download their current contents to files
    const currentState = this.state._meta.states[id];
    for(const variantID in meta.variants) {
      if(currentState.variants[variantID].link && !meta.variants[variantID].link) {
        const state = await FileLoader.readVariantFromLink(currentState.variants[variantID].link);
        fs.writeFileSync(this.variantFilename(id, variantID), JSON.stringify(state));
      }
    }

    Object.assign(this.state._meta.states[id], meta);
    this.sendMetaUpdate();
  }

  getAssetList(state) {
    return JSON.stringify(state).match(/\/assets\/-?[0-9]+_[0-9]+/g) || [];
  }

  async load(fileOrLink, player) {
    const emptyState = {
      _meta: {
        version: 1,
        players: {},
        states: {}
      }
    };

    if(!fileOrLink && !fs.existsSync(this.roomFilename())) {
      Logging.log(`creating room ${this.id}`);
      this.state = FileUpdater(emptyState);
    } else if(!fileOrLink) {
      Logging.log(`loading room ${this.id}`);
      this.state = FileUpdater(JSON.parse(fs.readFileSync(this.roomFilename())));
      this.broadcast('state', this.state);
    } else {
      let newState = emptyState;
      if(fileOrLink.match(/^http/))
        newState = await FileLoader.readVariantFromLink(fileOrLink);
      else
        newState = JSON.parse(fs.readFileSync(fileOrLink));
      if(newState) {
        Logging.log(`loading room ${this.id} from ${fileOrLink}`);
        this.setState(newState);
      } else {
        Logging.log(`loading room ${this.id} from ${fileOrLink} FAILED`);
        this.setState(emptyState);
        if(player)
          player.send('error', 'Error loading state.');
      }
    }

    if(!this.state._meta || typeof this.state._meta.version !== 'number')
      throw Error('Room state has invalid meta information.');
  }

  async loadState(player, stateID, variantID) {
    const variantInfo = this.state._meta.states[stateID].variants[variantID];

    if(variantInfo.link)
      await this.load(variantInfo.link, player);
    else
      await this.load(this.variantFilename(stateID, variantID), player);
  }

  mouseMove(player, coords) {
    this.broadcast('mouse', { player: player.name, coords });
  }

  newPlayerColor() {
    let hue = 0;
    const hues = [];
    for(const player in this.state._meta.players) {
      const hex = this.state._meta.players[player];
      const r = parseInt(hex.slice(1,3), 16) / 255;
      const g = parseInt(hex.slice(3,5), 16) / 255;
      const b = parseInt(hex.slice(5,7), 16) / 255;
      const max = Math.max(r,g,b);
      const d = max - Math.min(r,g,b);
      if(d < .25) continue;
      switch(max) {
        case r: hues.push((360 + (g - b) * 60 / d) % 360); break;
        case g: hues.push(120 + (b - r) * 60 / d); break;
        case b: hues.push(240 + (r - g) * 60 / d); break;
      }
    }
    if(hues.length == 0) {
      hue = Math.random() * 360;
    } else {
      const gaps = hues.sort((a,b)=>a-b).map((h, i, a) => (i != (a.length - 1)) ? a[i + 1 ] - h : a[0] + 360 - h);
      const gap = Math.max(...gaps);
      hue = (Math.random() * gap / 3 + hues[gaps.indexOf(gap)] + gap / 3) % 360;
    }
    const f = n => {
      const k = (n + hue / 30) % 12;
      const c = .5 - .5 * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * c).toString(16).padStart(2, '0');
    }
    return `#${f(0)}${f(8)}${f(4)}`;
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
    delta.id = ++this.deltaID;
    this.broadcast('delta', delta, player);
  }

  receiveInvalidDelta(player, delta, widgetID) {
    Logging.log(`WARNING: received conflicting delta data for widget ${widgetID} from player ${player.name} in room ${this.id} - sending game state at ${this.deltaID}`);
    this.state._meta.deltaID = ++this.deltaID;
    player.send('state', this.state);
  }

  recolorPlayer(renamingPlayer, playerName, color) {
    this.state._meta.players[playerName] = color;
    this.sendMetaUpdate();
  }

  removePlayer(player) {
    Logging.log(`removing player ${player.name} from room ${this.id}`);
    this.players = this.players.filter(e => e != player);
    if(this.players.length == 0) {
      this.unload();
      this.unloadCallback();
    }
    this.sendMetaUpdate();
  }

  removeState(player, stateID) {
    this.deleteUnusedVariantFiles(stateID, this.state._meta.states[stateID], { variants: {} });
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

  roomFilename() {
    return path.resolve() + '/save/rooms/' + this.id + '.json';
  }

  sendMetaUpdate() {
    this.broadcast('meta', { meta: this.state._meta, activePlayers: this.players.map(p=>p.name) });
  }

  setState(state) {
    const meta = this.state._meta;
    this.state = state;
    if(this.state._meta)
      this.state = FileUpdater(this.state);
    this.state._meta = meta;
    this.broadcast('state', state);
  }

  unload() {
    if(Object.keys(this.state).length > 1 || Object.keys(this.state._meta.states).length) {
      Logging.log(`unloading room ${this.id}`);
      this.writeToFilesystem();
    } else {
      Logging.log(`destroying room ${this.id}`);
      if(fs.existsSync(this.roomFilename()))
        fs.unlinkSync(this.roomFilename());
    }
  }

  writeToFilesystem() {
    const json = JSON.stringify(this.state);
    fs.writeFileSync(this.roomFilename(), json);
  }

  variantFilename(stateID, variantID) {
    return path.resolve() + '/save/states/' + this.id + '-' + stateID.replace(/[^a-z0-9]/g, '_') + '-' + variantID.replace(/[^a-z0-9]/g, '_') + '.json';
  }
}
