import fs from 'fs';

import JSZip from 'jszip';
import fetch from 'node-fetch';
import FileLoader from './fileloader.mjs';
import FileUpdater from './fileupdater.mjs';
import Logging from './logging.mjs';
import Config from './config.mjs';

export default class Room {
  players = [];
  state = {};
  deltaID = 0;

  constructor(id, unloadCallback) {
    this.id = id;
    this.unloadCallback = unloadCallback;
    this.unloadTimeout = setTimeout(_=>{
      if(this.players.length == 0) {
        Logging.log(`unloading room ${this.id} after 5s without player connection`);
        this.unload();
      }
    }, 5000);
  }

  addPlayer(player) {
    Logging.log(`adding player ${player.name} to room ${this.id}`);
    clearTimeout(this.unloadTimeout);
    this.players.push(player);

    if(!this.state._meta.players[player.name])
      this.state._meta.players[player.name] = this.newPlayerColor();

    this.sendMetaUpdate();
    this.state._meta.deltaID = this.deltaID;

    if(this.state._meta.redirectTo) {
      player.send('redirect', this.state._meta.redirectTo.url + '/' + this.id);
    } else {
      player.send('state', this.state);
    }

    if(this.traceIsEnabled()) {
      this.trace('addPlayer', { player: player.name });
      player.send('tracing', 'enable');
    }
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
        fs.writeFileSync(Config.directory('save') + '/errors/' + Math.random().toString(36).substring(3, 7), src);
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
    if(func != 'mouse')
      this.trace('broadcast', { func, args, exceptPlayer: exceptPlayer?.name });
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
          if(fs.existsSync(Config.directory('assets') + asset.substr(7)))
            zip.file(asset.substr(1), fs.readFileSync(Config.directory('assets') + asset.substr(7)));
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
    return [...new Set(JSON.stringify(state).match(/\/assets\/-?[0-9]+_[0-9]+/g) || [])];
  }

  getRedirection() {
    if(this.state._meta.redirectTo)
      return this.state._meta.redirectTo.url + '/' + this.id;
    else
      return null;
  }

  getPublicLibraryGames() {
    if(!Room.publicLibrary) {
      Room.publicLibrary = {};
      for(const subLibrary of [ 'Games', 'Tutorials', 'Assets' ]) {
        for(const dir of fs.readdirSync(Config.directory('library') + '/' + subLibrary.toLowerCase())) {
          const gameDir = Config.directory('library') + '/' + subLibrary.toLowerCase() + '/' + dir;
          if(fs.lstatSync(gameDir).isDirectory()) {
            for(const file of fs.readdirSync(gameDir)) {
              if(file.match(/json$/)) {
                const gameFile = JSON.parse(fs.readFileSync(gameDir + '/' + file));
                const id = 'PL:' + gameFile._meta.info.name
                if(!Room.publicLibrary[id]) {
                  Room.publicLibrary[id] = gameFile._meta.info;
                  Room.publicLibrary[id].publicLibrary = subLibrary.toLowerCase() + '/' + dir;
                  Room.publicLibrary[id].publicLibraryCategory = subLibrary;
                  Room.publicLibrary[id].variants = {};
                }
                Room.publicLibrary[id].variants[file] = JSON.parse(JSON.stringify(gameFile._meta.info));
                Room.publicLibrary[id].variants[file].publicLibrary = subLibrary.toLowerCase() + '/' + dir + '/' + file;
              }
            }
          }
        }
      }
    }
    return Room.publicLibrary;
  }

  async load(fileOrLink, player) {
    const emptyState = {
      _meta: {
        version: 1,
        metaVersion: 1,
        players: {},
        states: {}
      }
    };

    if(!fileOrLink && !fs.existsSync(this.roomFilename())) {
      Logging.log(`creating room ${this.id}`);
      this.state = FileUpdater(emptyState);
      this.state._meta.states = Object.assign(this.state._meta.states, this.getPublicLibraryGames());
    } else if(!fileOrLink) {
      Logging.log(`loading room ${this.id}`);
      this.state = FileUpdater(JSON.parse(fs.readFileSync(this.roomFilename())));
      this.state._meta.states = Object.assign(this.state._meta.states, this.getPublicLibraryGames());

      this.migrateOldPublicLibraryLinks();

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

    if(!fileOrLink) {
      this.traceIsEnabled(Config.get('forceTracing') || this.traceIsEnabled());
      this.trace('init', { initialState: this.state });
    }
  }

  async loadState(player, stateID, variantID) {
    const variantInfo = this.state._meta.states[stateID].variants[variantID];

    if(variantInfo.link)
      await this.load(variantInfo.link, player);
    else
      await this.load(this.variantFilename(stateID, variantID), player);
  }

  migrateOldPublicLibraryLinks() {
    if(!this.state._meta.metaVersion) {
      if(!this.state._meta.starred)
        this.state._meta.starred = {};
      for(const [ id, state ] of Object.entries(this.state._meta.states)) {
        const match = state.link && state.link.match(/\/library\/(?:Tutorial - )?(.*)\.vtt/);
        if(match && this.state._meta.states[`PL:${match[1]}`]) {
          const targetState = this.state._meta.states[`PL:${match[1]}`];
          let allVariantsFromPL = true;
          for(const [ vID, variant ] of Object.entries(state.variants))
            if((variant.link && variant.link.indexOf(state.link)) !== 0)
              allVariantsFromPL = false;
          if(allVariantsFromPL && state.name == targetState.name && state.image == targetState.image) {
            Logging.log(`migrating PL:${match[1]} in room ${this.id}`);
            this.state._meta.starred[targetState.publicLibrary] = true;
            this.removeState(player, id);
            continue;
          }
        } else if(match) {
          Logging.log(`could not migrate public library game ${match[1]} in room ${this.id}`);
        }

        for(const [ vID, variant ] of Object.entries(state.variants)) {
          const match = variant.link && variant.link.match(/\/library\/(?:Tutorial - )?(.*)\.vtt/);
          if(match && this.state._meta.states[`PL:${match[1]}`]) {
            for(const [ targetVid, targetVariant ] of Object.entries(this.state._meta.states[`PL:${match[1]}`].variants)) {
              if(targetVariant.players == variant.players && targetVariant.language == variant.language && targetVariant.variant == variant.variant) {
                this.state._meta.states[id].variants[vID] = {
                  plStateID: `PL:${match[1]}`,
                  plVariantID: targetVid
                };
                Logging.log(`migrating variant to PL:${match[1]}/${targetVid} in room ${this.id}`);
              }
            }
          }

          if(match && !this.state._meta.states[id].variants[vID].plStateID) {
            Logging.log(`could not migrate variant to public library game ${match[1]} in room ${this.id}`);
          }
        }
      }
      this.state._meta.metaVersion = 1;
    }
  }

  mouseMove(player, mouseState) {
    this.broadcast('mouse', { player: player.name, mouseState });
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
    const v = [240, 220, 120, 200, 240, 240];
    const value = v[Math.floor(hue/60)] * (60 - hue%60) / 60 + v[Math.ceil(hue/60) % 6] * (hue%60) / 60;
    const f = n => {
      const k = (n + hue / 30) % 12;
      const c = .5 - .5 * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(value * c).toString(16).padStart(2, '0');
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

  receiveInvalidDelta(player, delta, widgetID, property) {
    Logging.log(`WARNING: received conflicting delta data for property ${property} of widget ${widgetID} from player ${player.name} in room ${this.id} - sending game state at ${this.deltaID}`);
    this.state._meta.deltaID = ++this.deltaID;
    player.send('state', this.state);
  }

  async receiveState(zipBody, returnServer, returnState) {
    delete this.state._meta.redirectTo;
    if(returnServer != 'RETURN') {
      this.state._meta.returnServer = returnServer;
      this.state._meta.returnState = returnState == 'true';
    }
    if(zipBody && zipBody.length) {
      await this.addState('serverMove', 'file', zipBody, 'source', false);
      await this.loadState(null, 'serverMove', 'serverMove');
      this.removeState(null, 'serverMove');
    }
  }

  recolorPlayer(renamingPlayer, playerName, color) {
    this.state._meta.players[playerName] = color;
    this.sendMetaUpdate();
  }

  removePlayer(player) {
    this.trace('removePlayer', { player: player.name });
    Logging.log(`removing player ${player.name} from room ${this.id}`);

    this.players = this.players.filter(e => e != player);
    if(player.name.match(/^Guest/) && !this.players.filter(e => e.name == player.name).length)
      if(!Object.values(this.state).filter(w=>w.player==player.name||w.owner==player.name||Array.isArray(w.owner)&&w.owner.indexOf(player.name)!=-1).length)
        delete this.state._meta.players[player.name];

    this.sendMetaUpdate();
    if(this.players.length == 0)
      this.unload();
  }

  removeState(player, stateID) {
    this.deleteUnusedVariantFiles(stateID, this.state._meta.states[stateID], { variants: {} });
    delete this.state._meta.states[stateID];
    this.sendMetaUpdate();
  }

  renamePlayer(renamingPlayer, oldName, newName) {
    if(oldName == newName)
      return;

    Logging.log(`renaming player ${oldName} to ${newName} in room ${this.id}`);
    this.state._meta.players[newName] = this.state._meta.players[newName] || this.state._meta.players[oldName];
    delete this.state._meta.players[oldName];

    for(const player of this.players)
      if(player.name == oldName)
        player.rename(newName);

    this.sendMetaUpdate();
  }

  roomFilename() {
    return Config.directory('save') + '/rooms/' + this.id + '.json';
  }

  sendMetaUpdate() {
    this.broadcast('meta', { meta: this.state._meta, activePlayers: this.players.map(p=>p.name) });
  }

  async setRedirect(player, target) {
    try {
      let targetServer = Config.get('betaServers')[target] || Config.get('legacyServers')[target];
      const isReturn = target == 'return';
      if(isReturn)
        targetServer = { url:this.state._meta.returnServer, return:false };

      if(targetServer) {
        const assets = [];
        for(const asset of this.getAssetList(this.state))
          assets.push(asset.substr(8));

        const result = await fetch(targetServer.url + '/assetcheck', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(assets)
        });

        const assetStatus = await result.json();

        let zipBuffer = '';
        if(!isReturn || this.state._meta.returnState) {
          const zip = new JSZip();
          zip.file(`${this.id}.json`, JSON.stringify(this.state, null, '  '));
          for(const asset in assetStatus)
            if(!assetStatus[asset] && fs.existsSync(Config.directory('assets') + '/' + asset))
              zip.file('assets/' + asset, fs.readFileSync(Config.directory('assets') + '/' + asset));

          zipBuffer = await zip.generateAsync({type:'nodebuffer'});
        }

        const putResult = await fetch(targetServer.url + '/moveServer/' + this.id + '/' + (isReturn ? 'RETURN' : encodeURIComponent(Config.get('externalURL'))) + '/' + (targetServer.return ? 'true' : 'false'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: zipBuffer
        });
        const putText = await putResult.text();
        if(putText != 'OK')
          throw Error(`moveServer failed: ${putText}`);

        this.state._meta.redirectTo = targetServer;
        this.broadcast('redirect', targetServer.url + '/' + this.id);
      }
    } catch(e) {
      Logging.handleGenericException('setRedirect', e);
      player.send('error', 'There was a problem setting up the redirection. The other server might be offline.');
    }
  }

  setState(state) {
    this.trace('setState', { state });
    const meta = this.state._meta;
    this.state = state;
    if(this.state._meta)
      this.state = FileUpdater(this.state);
    this.state._meta = meta;
    this.broadcast('state', state);
  }

  toggleStateStar(player, publicLibraryName) {
    if(!this.state._meta.starred)
      this.state._meta.starred = {};
    this.state._meta.starred[publicLibraryName] = !this.state._meta.starred[publicLibraryName];
    this.sendMetaUpdate();
  }

  trace(source, payload) {
    if(!this.traceIsEnabled() && source == 'client' && payload.type == 'enable') {
      this.traceIsEnabled(true);
      payload.initialState = this.state;
    }

    if(this.traceIsEnabled()) {
      payload.servertime = +new Date;
      payload.source = source;
      payload.serverDeltaID = this.deltaID;
      const suffix = source == 'unload' ? '\n]' : ',\n';
      fs.appendFileSync(this.tracingFilename, `  ${JSON.stringify(payload)}${suffix}`);
    }
  }

  traceIsEnabled(setEnabled) {
    if(setEnabled && this.state && this.state._meta) {
      this.state._meta.tracingEnabled = true;

      this.tracingFilename = `${Config.directory('save')}/${this.id}-${+new Date}.trace`;
      this.broadcast('tracing', 'enable');
      fs.writeFileSync(this.tracingFilename, '[\n');
      Logging.log(`tracing enabled for room ${this.id} to file ${this.tracingFilename}`);
    }
    return this.state && this.state._meta && this.state._meta.tracingEnabled;
  }

  unload() {
    if(this.state && this.state._meta) {
      if(Object.keys(this.state).length > 1 || Object.keys(this.state._meta.states).length || this.state._meta.redirectTo || this.state._meta.returnServer) {
        Logging.log(`unloading room ${this.id}`);
        this.writeToFilesystem();
      } else {
        Logging.log(`destroying room ${this.id}`);
        if(fs.existsSync(this.roomFilename()))
          fs.unlinkSync(this.roomFilename());
      }
    } else {
      Logging.log(`unloading broken room ${this.id}`);
    }
    this.trace('unload', {});
    this.unloadCallback();
  }

  writeToFilesystem() {
    const json = JSON.stringify(this.state);
    fs.writeFileSync(this.roomFilename(), json);
  }

  variantFilename(stateID, variantID) {
    if(stateID.match(/^PL:/))
      return Config.directory('library') + '/' + Room.publicLibrary[stateID].variants[variantID].publicLibrary;
    else
      return Config.directory('save') + '/states/' + this.id + '-' + stateID.replace(/[^a-z0-9]/g, '_') + '-' + variantID.replace(/[^a-z0-9]/g, '_') + '.json';
  }
}
