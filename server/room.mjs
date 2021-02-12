import fs from 'fs';
import path from 'path';

import JSZip from 'jszip';
import FileLoader from './fileloader.mjs';

export default class Room {
  players = [];
  state = {};
  deltaID = 0;

  constructor(id, unloadCallback) {
    this.id = id;
    this.unloadCallback = unloadCallback;

    this.load();
  }

  addPlayer(player) {
    console.log(new Date().toISOString(), `adding player ${player.name} to room ${this.id}`);
    this.players.push(player);

    if(!this.state._meta.players[player.name])
      this.state._meta.players[player.name] = '#ff0000';

    this.state._meta.deltaID = this.deltaID;
    player.send('state', this.state);
    this.sendMetaUpdate();
  }

  async addState(player, id, type, src, addAsVariant) {
    const initialAddAsVariant = addAsVariant;
    let stateID = addAsVariant || id;
    let variantID = id;

    let states = { room: [ this.state ] };
    let etag = null;
    try {
      if(type == 'file')
        states = await FileLoader.readStatesFromBuffer(Buffer.from(src.content.replace(/^data.*?,/, ''), 'base64'));
      if(type == 'link')
        states = await FileLoader.readStatesFromLink(src);
    } catch(e) {
      console.log(new Date().toISOString(), 'ERROR LOADING FILE: ' + e);
      try {
        fs.writeFileSync(path.resolve() + '/save/errors/' + Math.random().toString(36).substring(3, 7), Buffer.from(src.replace(/^data.*?,/, ''), 'base64'));
      } catch(e) {}
      player.send('error', e.toString());
      return;
    }

    for(const state in states) {
      for(const v in states[state]) {
        let name = type == 'file' && src.name || 'Unnamed';
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

    for(const vID of variantID ? [ variantID ] : Object.keys(this.state._meta.states[stateID].variants)) {
      const v = this.state._meta.states[stateID].variants[vID];

      let state = null;
      if(v.link)
        state = await FileLoader.readVariantFromLink(v.link);
      else
        state = JSON.parse(fs.readFileSync(this.variantFilename(stateID, vID)));
      state._meta = { version: this.state._meta.version, info: { ...this.state._meta.states[stateID] } };
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

  async load(fileOrLink) {
    console.log(new Date().toISOString(), `loading room ${this.id}`);
    try {
      if(!fileOrLink)
        this.state = JSON.parse(fs.readFileSync(path.resolve() + '/save/rooms/' + this.id + '.json'));
      else if(fileOrLink.match(/^http/))
        this.setState(await FileLoader.readVariantFromLink(fileOrLink));
      else
        this.setState(JSON.parse(fs.readFileSync(fileOrLink)));

      if(!this.state._meta || this.state._meta.version !== 1)
        throw 'Room state has invalid meta information.';
    } catch(e) {
      console.log(new Date().toISOString(), `RESETTING ROOM ${this.id} because of "${e.toString()}"`);
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
    const variantInfo = this.state._meta.states[stateID].variants[variantID];

    if(variantInfo.link)
      this.load(variantInfo.link);
    else
      this.load(this.variantFilename(stateID, variantID));
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
    delta.id = ++this.deltaID;
    this.broadcast('delta', delta, player);
  }

  receiveInvalidDelta(player, delta, widgetID) {
    console.log(new Date().toISOString(), `WARNING: received conflicting delta data for widget ${widgetID} from player ${player.name} in room ${this.id} - sending game state at ${this.deltaID}`);
    this.state._meta.deltaID = ++this.deltaID;
    player.send('state', this.state);
  }

  recolorPlayer(renamingPlayer, playerName, color) {
    this.state._meta.players[playerName] = color;
    this.sendMetaUpdate();
  }

  removePlayer(player) {
    console.log(new Date().toISOString(), `removing player ${player.name} from room ${this.id}`);
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
    if(Object.keys(this.state).length > 1 || Object.keys(this.state._meta.states).length) {
      console.log(new Date().toISOString(), `unloading room ${this.id}`);
      this.writeToFilesystem();
    } else {
      console.log(new Date().toISOString(), `unloading empty room ${this.id}`);
      const savefile = path.resolve() + '/save/rooms/' + this.id + '.json';
      if(fs.existsSync(savefile))
        fs.unlinkSync(savefile);
    }
  }

  writeToFilesystem() {
    const json = JSON.stringify(this.state);
    fs.writeFileSync(path.resolve() + '/save/rooms/' + this.id + '.json', json);
  }

  variantFilename(stateID, variantID) {
    return path.resolve() + '/save/states/' + this.id + '-' + stateID.replace(/[^a-z0-9]/g, '_') + '-' + variantID.replace(/[^a-z0-9]/g, '_') + '.json';
  }
}
