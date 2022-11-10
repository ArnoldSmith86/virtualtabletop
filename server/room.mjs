import fs from 'fs';

import JSZip from 'jszip';
import fetch from 'node-fetch';
import FileLoader from './fileloader.mjs';
import FileUpdater from './fileupdater.mjs';
import Logging from './logging.mjs';
import Config from './config.mjs';
import Statistics from './statistics.mjs';

export default class Room {
  players = [];
  state = {};
  deltaID = 0;
  lastStatisticsDeltaID = 0;

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
      throw new Logging.UserError(404, 'Unable to load and add the game.');
    }

    for(const state in states) {
      for(const v in states[state]) {
        const newVariantID = String(addAsVariant ? this.state._meta.states[stateID].variants.length : 0);
        let name = type == 'file' && srcName || 'Unnamed';
        if(state.match(/\.pcio$/))
          name = state;

        const variant = states[state][v];
        const meta = (variant._meta || {}).info || {
          name: name.replace(/\.pcio/, ''),
          image: '',
          rules: '',
          bgg: '',
          year: '',
          mode: '',
          time: '',
          players: '',
          language: '',
          variant: '',
          link: '',
          attribution: ''
        };

        if(stateID.match(/^PL:/))
          return this.writePublicLibraryToFilesystem(stateID, newVariantID, variant);

        if(type != 'link')
          fs.writeFileSync(this.variantFilename(stateID, newVariantID), JSON.stringify(variant));

        const variantMeta = {
          players: meta.players,
          language: meta.language,
          variant: meta.variant,
          variantImage: meta.variantImage
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
        delete meta.variantImage;

        if(addAsVariant) {
          if(!this.state._meta.states[stateID].variants[newVariantID])
            this.state._meta.states[stateID].variants[newVariantID] = variantMeta;
          else if(type != 'link')
            delete this.state._meta.states[stateID].variants[newVariantID].link;
          if(!this.state._meta.states[stateID].attribution)
            this.state._meta.states[stateID].attribution = meta.attribution;
          if(meta.attribution && meta.attribution != this.state._meta.states[stateID].attribution)
            this.state._meta.states[stateID].attribution += '\n\n--\n\n'+meta.attribution;
        } else {
          meta.variants = [ variantMeta ];
          this.state._meta.states[stateID] = meta;
        }

        addAsVariant = true;
      }


      if(!initialAddAsVariant) {
        addAsVariant = false;
        stateID = Math.random().toString(36).substring(3, 7);
      }
    }
    this.sendMetaUpdate();
  }

  addStateToPublicLibrary(player, id) {
    if(!Config.get('allowPublicLibraryEdits'))
      return;

    const variantData = {};
    for(const variantID in this.state._meta.states[id].variants)
      variantData[variantID] = JSON.parse(fs.readFileSync(this.variantFilename(id, variantID)));

    this.state._meta.states[id].publicLibrary = `games/${this.state._meta.states[id].name.replace(/[^a-zA-Z0-9 _-]/g, '_')}`;
    fs.mkdirSync(Config.directory('library') + '/' + this.state._meta.states[id].publicLibrary);
    fs.mkdirSync(Config.directory('library') + '/' + this.state._meta.states[id].publicLibrary + '/assets');

    Room.publicLibrary['PL:NEW'] = this.state._meta.states['PL:NEW'] = this.state._meta.states[id];
    for(const variantID in this.state._meta.states[id].variants) {
      this.state._meta.states['PL:NEW'].variants[variantID] = JSON.parse(JSON.stringify(Object.assign(this.state._meta.states['PL:NEW'], this.state._meta.states['PL:NEW'].variants[variantID])));
      delete this.state._meta.states['PL:NEW'].variants[variantID].variants;
      this.writePublicLibraryToFilesystem('PL:NEW', variantID, variantData[variantID]);
    }

    this.removeState(player, id);
  }

  broadcast(func, args, exceptPlayer) {
    if(func != 'mouse')
      this.trace('broadcast', { func, args, exceptPlayer: exceptPlayer?.name });
    for(const player of this.players)
      if(player != exceptPlayer)
        player.send(func, args);
  }

  async createTempState(tempID, fileContent) {
    const filenameSuffix = tempID || String(+new Date()) + Math.random().toString(36).substring(3, 7);

    let states = { VTT: [ {...this.state} ] };
    states.VTT[0]._meta = { version: states.VTT[0]._meta.version };
    if(fileContent)
      states = await FileLoader.readStatesFromBuffer(fileContent)

    for(const state of Object.values(states))
      for(const [ i, variant ] of Object.entries(state))
        fs.writeFileSync(`${Config.directory('save')}/states/${this.id}--TEMPSTATE--${filenameSuffix}--${i}.json`, JSON.stringify(variant));

    return filenameSuffix;
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

    const s = this.state._meta.states[stateID];

    for(const vID of variantID ? [ variantID ] : Object.keys(s.variants)) {
      const v = s.variants[vID];
      if(!v)
        throw new Logging.UserError(404, `Variant ${vID} does not exist.`);

      let state = null;
      if(v.link)
        state = await FileLoader.readVariantFromLink(v.link);
      else
        state = JSON.parse(fs.readFileSync(this.variantFilename(stateID, vID)));
      state._meta = { version: state._meta.version, info: { ...s } };
      Object.assign(state._meta.info, state._meta.info.variants[vID]);
      delete state._meta.info.variants;
      delete state._meta.info.link;
      delete state._meta.info.publicLibrary;
      delete state._meta.info.publicLibraryCategory;
      delete state._meta.info.starred;

      zip.file(`${vID}.json`, JSON.stringify(state, null, '  '));
      if(includeAssets)
        for(const asset of this.getAssetList(state))
          if(Config.resolveAsset(asset.substr(8)))
            zip.file(asset.substr(1), fs.readFileSync(Config.resolveAsset(asset.substr(8))));
    }

    const zipBuffer = await zip.generateAsync({type:'nodebuffer', compression: 'DEFLATE'});

    let name = s.name + '.vtt';
    if(s.savePlayers)
      name = `${s.name} ${new Date(s.saveDate).toISOString().substr(0,10)} ${s.savePlayers}.vtts`;

    return {
      name,
      type: 'application/zip',
      content: zipBuffer
    };
  }

  editState(player, id, meta, variantInput, variantOperationQueue) {
    const variants = this.state._meta.states[id].variants;

    const renameVariantFile = (stateID, oldVariantID, newVariantID)=>{
      if(oldVariantID == player.name && fs.existsSync(this.variantFilename(stateID, oldVariantID)) || oldVariantID != player.name && !variants[oldVariantID].plStateID && !variants[oldVariantID].link)
        fs.renameSync(this.variantFilename(stateID, oldVariantID), this.variantFilename(stateID, newVariantID));
    };

    for(const o of variantOperationQueue) {

      if(o.operation == 'create' || o.operation == 'save') {
        if(String(o.filenameSuffix).match(/^([0-9]+|[0-9a-z]{4})[0-9a-z]{4}$/)) {
          const prefix = `${Config.directory('save')}/states/${this.id}--TEMPSTATE--${o.filenameSuffix}--`;
          for(let i=0; fs.existsSync(`${prefix}${i}.json`); ++i) {
            fs.renameSync(`${prefix}${i}.json`, this.variantFilename(id, o.operation == 'save' ? o.variantID : variants.length));
            if(o.operation == 'create')
              variants.push({});
          }
        }
      }

      if(o.operation == 'newLink') {
        variants.push(o.variant);
      }

      if(o.operation == 'up') {
        if(o.variantID) {
          renameVariantFile(id, o.variantID,   player.name);
          renameVariantFile(id, o.variantID-1, o.variantID);
          renameVariantFile(id, player.name,   o.variantID-1);

          variants.splice(o.variantID-1, 0, variants.splice(o.variantID, 1)[0]);
        } else {
          renameVariantFile(id, o.variantID, player.name);
          for(let i=1; i<variants.length; ++i)
            renameVariantFile(id, i, i-1);
          renameVariantFile(id, player.name, variants.length-1);

          variants.push(variants.shift());
        }
      }

      if(o.operation == 'down') {
        if(o.variantID < variants.length-1) {
          renameVariantFile(id, o.variantID,   player.name);
          renameVariantFile(id, o.variantID+1, o.variantID);
          renameVariantFile(id, player.name,   o.variantID+1);

          variants.splice(o.variantID+1, 0, variants.splice(o.variantID, 1)[0]);
        } else {
          renameVariantFile(id, o.variantID, player.name);
          for(let i=variants.length-2; i>=0; --i)
            renameVariantFile(id, i, i+1);
          renameVariantFile(id, player.name, 0);

          variants.unshift(variants.pop());
        }
      }

      if(o.operation == 'delete') {
        if(!variants[o.variantID].plStateID && !variants[o.variantID].link)
          fs.unlinkSync(this.variantFilename(id, o.variantID));
        for(let i=o.variantID+1; i<variants.length; ++i)
          renameVariantFile(id, i, i-1);

        variants.splice(o.variantID, 1);
      }

    }

    for(const variantID in variantInput)
      Object.assign(variants[variantID], variantInput[variantID]);

    meta.variants = variants;
    Object.assign(this.state._meta.states[id], meta);

    if(String(id).match(/^PL:/))
      this.writePublicLibraryMetaToFilesystem(id, meta);

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
                const id = 'PL:' + subLibrary.toLowerCase() + ':' + gameFile._meta.info.name
                if(!Room.publicLibrary[id]) {
                  Room.publicLibrary[id] = gameFile._meta.info;
                  Room.publicLibrary[id].publicLibrary = subLibrary.toLowerCase() + '/' + dir;
                  Room.publicLibrary[id].publicLibraryCategory = subLibrary;
                  Room.publicLibrary[id].variants = [];
                }
                Room.publicLibrary[id].variants[file.replace(/\.json$/, '')] = {
                  players: gameFile._meta.info.players,
                  language: gameFile._meta.info.language,
                  variant: gameFile._meta.info.variant,
                  variantImage: gameFile._meta.info.variantImage,
                  publicLibrary: subLibrary.toLowerCase() + '/' + dir + '/' + file
                };
                delete gameFile._meta.info.players;
                delete gameFile._meta.info.language;
                delete gameFile._meta.info.variant;
                delete gameFile._meta.info.variantImage;
              }
            }
          }
        }
      }
    }
    Statistics.updateDataInsideStates(Room.publicLibrary);
    return Room.publicLibrary;
  }

  async load(fileOrLink, player) {
    const emptyState = {
      _meta: {
        version: 1,
        metaVersion: 1,
        players: {},
        states: {},
        starred: {}
      }
    };

    if(!fileOrLink && !fs.existsSync(this.roomFilename())) {
      Logging.log(`creating room ${this.id}`);
      this.state = FileUpdater(emptyState);
      this.state._meta.states = Object.assign(this.state._meta.states, this.getPublicLibraryGames());
      this.traceIsEnabled(Config.get('forceTracing'));
    } else if(!fileOrLink) {
      Logging.log(`loading room ${this.id}`);
      this.state = FileUpdater(JSON.parse(fs.readFileSync(this.roomFilename())));
      this.state._meta.states = Object.assign(this.state._meta.states, this.getPublicLibraryGames());

      this.migrateOldPublicLibraryLinks();
      await this.updateLinkedStates();
      this.removeInvalidPublicLibraryLinks(player);

      this.traceIsEnabled(Config.get('forceTracing') || this.traceIsEnabled());
      this.broadcast('state', this.state);
    } else {
      let newState = emptyState;
      try {
        if(fileOrLink.match(/^http/))
          newState = await FileLoader.readVariantFromLink(fileOrLink);
        else
          newState = JSON.parse(fs.readFileSync(fileOrLink));
      } catch(e) {
        newState = null;
      }
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

    if(!fileOrLink)
      this.trace('init', { initialState: this.state });
  }

  async loadState(player, stateID, variantID) {
    const stateInfo = this.state._meta.states[stateID];
    const variantInfo = stateInfo.variants[variantID];

    if(variantInfo.link)
      await this.load(variantInfo.link, player);
    else
      await this.load(this.variantFilename(stateID, variantID), player);

    if(stateInfo.savePlayers)
      this.state._meta.activeState = { saveStateID: stateID, stateID: stateInfo.saveState, variantID: stateInfo.saveVariant };
    else
      this.state._meta.activeState = { stateID, variantID };

    this.sendMetaUpdate();
  }

  migrateOldPublicLibraryLinks() {
    function plTarget(match) {
      if(!match)
        return null;
      if(match[1])
        return `PL:tutorials:${match[2]}`;
      if([ 'Decks', 'Dice', 'Marbles', 'Other Widgets', 'Spinners', 'Symbols' ].indexOf(match[2]) > -1)
        return `PL:assets:${match[2]}`;
      return `PL:games:${match[2]}`;
    }

    if(!this.state._meta.metaVersion) {
      if(!this.state._meta.starred)
        this.state._meta.starred = {};
      for(const [ id, state ] of Object.entries(this.state._meta.states)) {
        const target = plTarget(state.link && state.link.match(/\/library\/(Tutorial - )?(.*)\.vtt/))
        if(target && this.state._meta.states[target]) {
          const targetState = this.state._meta.states[target];
          let allVariantsFromPL = true;
          for(const [ vID, variant ] of Object.entries(state.variants))
            if((variant.link && variant.link.indexOf(state.link)) !== 0)
              allVariantsFromPL = false;
          if(allVariantsFromPL && state.name == targetState.name && state.image == targetState.image) {
            Logging.log(`migrating ${target} in room ${this.id}`);
            this.state._meta.starred[targetState.publicLibrary] = true;
            Statistics.toggleStateStar(targetState.publicLibrary, true);
            this.removeState(undefined, id);
            continue;
          }
          delete state.link;
        } else if(target) {
          Logging.log(`could not migrate public library state ${target} in room ${this.id}`);
        }

        for(const [ vID, variant ] of Object.entries(state.variants)) {
          const target = plTarget(variant.link && variant.link.match(/\/library\/(Tutorial - )?(.*)\.vtt/))
          if(target && this.state._meta.states[target]) {
            for(const [ targetVid, targetVariant ] of Object.entries(this.state._meta.states[target].variants)) {
              if(targetVariant.players == variant.players && (targetVariant.language.match(variant.language) || targetVariant.language === '' && variant.language == 'UN') && targetVariant.variant == variant.variant) {
                this.state._meta.states[id].variants[vID] = {
                  plStateID: target,
                  plVariantID: targetVid
                };
                Logging.log(`migrating variant to ${target}/${targetVid} in room ${this.id}`);
              }
            }
          }

          if(target && !this.state._meta.states[id].variants[vID].plStateID) {
            Logging.log(`could not migrate variant to public library state ${target} in room ${this.id}`);
          }
        }
      }

      for(const [ id, state ] of Object.entries(this.state._meta.states)) {
        if(state.publicLibrary)
          continue;

        const newVariants = [];
        for(const [ variantID, variant ] of Object.entries(state.variants)) {
          if(!variant.plStateID && !variant.link)
            fs.renameSync(this.variantFilename(id, variantID), this.variantFilename(id, newVariants.length));
          newVariants.push(variant);
        }
        state.variants = newVariants;
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

  removeInvalidPublicLibraryLinks(player) {
    for(const [ id, state ] of Object.entries(this.state._meta.states)) {
      const operations = [];
      for(const [ variantID, variant ] of Object.entries(state.variants))
        if(variant.plStateID && (!this.state._meta.states[variant.plStateID] || !this.state._meta.states[variant.plStateID].variants[variant.plVariantID]))
          operations.push({ operation: 'delete', variantID });
      if(operations.length)
        this.editState(player, id, state, state.variants, operations);
    }
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
    if(stateID.match(/^PL:/) && !Config.get('allowPublicLibraryEdits'))
      return;

    for(const variantID in this.state._meta.states[stateID].variants) {
      const savefile = this.variantFilename(stateID, variantID);
      if(fs.existsSync(savefile))
        fs.unlinkSync(savefile);
    }

    if(stateID.match(/^PL:/)) {
      this.state._meta.states[stateID].variants = [];
      this.writePublicLibraryAssetsToFilesystem(stateID);

      fs.rmdirSync(this.variantFilename(stateID, 0).replace(/\/[0-9]+\.json$/, '/assets'));
      fs.rmdirSync(this.variantFilename(stateID, 0).replace(/\/[0-9]+\.json$/, ''));
    }

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

  saveState(player, players) {
    const id = Math.random().toString(36).substring(3, 7);

    this.state._meta.states[id] = {...this.state._meta.states[this.state._meta.activeState.stateID]};
    this.state._meta.states[id].variants = [];
    this.state._meta.states[id].saveState = this.state._meta.activeState.stateID;
    this.state._meta.states[id].saveVariant = this.state._meta.activeState.variantID;
    this.state._meta.states[id].savePlayers = players;
    this.state._meta.states[id].saveDate = +new Date();

    delete this.state._meta.states[id].publicLibrary;
    delete this.state._meta.states[id].publicLibraryCategory;
    delete this.state._meta.states[id].starred;
    delete this.state._meta.states[id].link;

    this.addState(id, 'room', null, null, id);

    this.state._meta.states[id].variants[0].variant = players;
    this.state._meta.states[id].variants[0].players = this.state._meta.states[this.state._meta.activeState.stateID].variants[this.state._meta.activeState.variantID].players;

    this.sendMetaUpdate();
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
            if(!assetStatus[asset] && Config.resolveAsset(asset))
              zip.file('assets/' + asset, fs.readFileSync(Config.resolveAsset(asset)));

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
    delete this.state._meta.activeState;

    this.trace('setState', { state });
    const meta = this.state._meta;
    this.state = state;
    if(this.state._meta)
      this.state = FileUpdater(this.state);
    this.state._meta = meta;
    this.broadcast('state', state);
  }

  toggleStateStar(player, publicLibraryName) {
    if(this.state._meta.starred[publicLibraryName])
      delete this.state._meta.starred[publicLibraryName];
    else
      this.state._meta.starred[publicLibraryName] = 1;

    Statistics.toggleStateStar(publicLibraryName, this.state._meta.starred[publicLibraryName]);
    for(const state of Object.values(this.state._meta.states))
      if(state.publicLibrary == publicLibraryName)
        state.stars += this.state._meta.starred[publicLibraryName] ? 1 : -1;

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

  async unlinkState(player, stateID) {
    for(const [ variantID, variant ] of Object.entries(this.state._meta.states[stateID].variants)) {
      const variantState = await FileLoader.readVariantFromLink(variant.link);
      fs.writeFileSync(this.variantFilename(stateID, variantID), JSON.stringify(variantState, null, '  '));
      delete variant.link;
    }
    delete this.state._meta.states[stateID].link;
    this.sendMetaUpdate();
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

  async updateLinkedStates() {
    for(const [ id, state ] of Object.entries(this.state._meta.states)) {
      if(state.link) {
        try {
          await this.addState(id, 'link', state.link);
        } catch(e) {
          Logging.log(`ERROR: updating linked state ${id} in room ${this.id} failed: ${e}`);
        }
      }
    }
  }

  updateTimeStatistics() {
    if(this.deltaID > this.lastStatisticsDeltaID && this.state._meta.activeState && this.state._meta.activeState.stateID.match(/^PL/)) {
      Statistics.updateTimeStatistics(this.state._meta.states[this.state._meta.activeState.stateID].publicLibrary, this.players.length);
      this.lastStatisticsDeltaID = this.deltaID;
    }
  }

  writePublicLibraryAssetsToFilesystem(stateID) {
    if(!Config.get('allowPublicLibraryEdits'))
      return;

    const assetsDir = this.variantFilename(stateID, 0).replace(/\/[0-9]+\.json$/, '/assets');

    const usedAssets = {};
    for(const vID in this.state._meta.states[stateID].variants)
      for(const asset of this.getAssetList(JSON.parse(fs.readFileSync(this.variantFilename(stateID, vID)))))
        usedAssets[asset.split('/')[2]] = true;

    const savedAssets = {};
    for(const file of fs.readdirSync(assetsDir))
      savedAssets[file] = true;

    for(const savedAsset in savedAssets)
      if(!usedAssets[savedAsset])
        fs.unlinkSync(assetsDir + '/' + savedAsset);

    for(const usedAsset in usedAssets)
      if(!savedAssets[usedAsset])
        fs.copyFileSync(Config.directory('assets') + '/' + usedAsset, assetsDir + '/' + usedAsset);
  }

  writePublicLibraryMetaToFilesystem(stateID, meta) {
    if(!Config.get('allowPublicLibraryEdits'))
      return;

    for(const variantID in this.state._meta.states[stateID].variants) {
      const state = JSON.parse(fs.readFileSync(this.variantFilename(stateID, variantID)));

      state._meta.info = Object.assign(JSON.parse(JSON.stringify(meta)), JSON.parse(JSON.stringify(meta.variants[variantID])));

      delete state._meta.info.id;
      delete state._meta.info.variants;
      delete state._meta.info.starred;
      delete state._meta.info.publicLibrary;
      delete state._meta.info.publicLibraryCategory;

      fs.writeFileSync(this.variantFilename(stateID, variantID), JSON.stringify(state, null, '  '));
    }

    this.writePublicLibraryAssetsToFilesystem(stateID);

    delete Room.publicLibrary;
    this.getPublicLibraryGames();
  }

  writePublicLibraryToFilesystem(stateID, variantID, state) {
    if(!Config.get('allowPublicLibraryEdits'))
      return;

    const copy = JSON.parse(JSON.stringify(state));
    copy._meta = {
      version: copy._meta.version,
      info: JSON.parse(JSON.stringify(this.state._meta.states[stateID].variants[variantID]))
    };

    delete copy._meta.info.publicLibrary;
    delete copy._meta.info.publicLibraryCategory;
    delete copy._meta.info.starred;
    delete copy._meta.info.link;
    delete copy._meta.info.variants;

    fs.writeFileSync(this.variantFilename(stateID, variantID), JSON.stringify(copy, null, '  '));
    this.writePublicLibraryAssetsToFilesystem(stateID);
  }

  writeToFilesystem() {
    const copy = JSON.parse(JSON.stringify(this.state));
    for(const id in copy._meta.states)
      if(id.match(/^PL:/))
        delete copy._meta.states[id];
    const json = JSON.stringify(copy);
    fs.writeFileSync(this.roomFilename(), json);
  }

  variantFilename(stateID, variantID) {
    if(stateID.match(/^PL:/) && String(variantID).match(/^[0-9]+$/))
      return Config.directory('library') + `/${Room.publicLibrary[stateID].publicLibrary}/${variantID}.json`;
    else
      return Config.directory('save') + '/states/' + this.id + '-' + stateID.replace(/[^a-z0-9]/g, '_') + '-' + String(variantID).replace(/[^a-z0-9]/g, '_') + '.json';
  }
}
