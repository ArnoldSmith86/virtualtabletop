import fs from 'fs';

import JSZip from 'jszip';
import fetch from 'node-fetch';
import FileLoader from './fileloader.mjs';
import FileUpdater from './fileupdater.mjs';
import Logging from './logging.mjs';
import Config from './config.mjs';
import { randomHue } from '../client/js/color.js';
import Statistics from './statistics.mjs';

export default class Room {
  players = [];
  state = {};
  deltaID = 0;
  lastStatisticsDeltaID = 0;

  constructor(id, unloadCallback, publicLibraryUpdatedCallback) {
    this.id = id;
    this.unloadCallback = unloadCallback;
    this.publicLibraryUpdatedCallback = publicLibraryUpdatedCallback;
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

  async addShare(shareID) {
    if(shareID.match(/^PL:/)) {
      const state = this.getStateDetails(shareID);
      if(!this.state._meta.starred[state.publicLibrary])
        this.toggleStateStar(null, state.publicLibrary);
      return state.id;
    } else {
      await this.addState(shareID, 'link', `${Config.get('externalURL')}/s/${shareID}/name.vtt`, '');
      return shareID;
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

        const variant = states[state][v];
        const meta = Object.assign({
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
        }, (variant._meta || {}).info || {});

        if(stateID.match(/^PL:/)) {
          this.writePublicLibraryToFilesystem(stateID, newVariantID, variant);
          this.writePublicLibraryAssetsToFilesystem(stateID);
          delete Room.publicLibrary;
          this.publicLibraryUpdatedCallback();
          return;
        }

        if(type != 'link' || meta.importerTemp)
          fs.writeFileSync(this.variantFilename(stateID, newVariantID), JSON.stringify(variant));

        let variantMeta = {
          players: meta.players,
          language: meta.language,
          variant: meta.variant,
          variantImage: meta.variantImage
        };

        if(String(meta.link).match(/#[^#\/]+\/[^#\/]+/))
          variantMeta.link = meta.link;
        if(meta.plStateID) {
          variantMeta = {
            plStateID: meta.plStateID,
            plVariantID: meta.plVariantID
          };
        }

        if(type == 'link' && !meta.importerTemp) {
          const baseLink = src.replace(/#[^#]*$/, '');
          meta.link = `${baseLink}#${state}`;
          if(!variantMeta.link && !variantMeta.plStateID) {
            variantMeta.link = `${meta.link}/${v}`;
            if(src.match(/#[^#\/]+\/[^#\/]+/))
              meta.link = variantMeta.link;
          }
        }

        delete meta.players;
        delete meta.language;
        delete meta.variant;
        delete meta.variantImage;

        meta.lastUpdate = +new Date();

        if(addAsVariant) {
          if(!this.state._meta.states[stateID].variants[newVariantID])
            this.state._meta.states[stateID].variants[newVariantID] = variantMeta;
          else if(type != 'link' || meta.importerTemp)
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

        if(type == 'state')
          this.state._meta.activeState = { stateID, variantID: newVariantID };

        if(meta.importerTemp) {
          meta.importer = meta.importerTemp;
          delete meta.importerTemp;
        }
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

    for(const usedAsset in this.getAssetListForState(id))
      if(!Config.resolveAsset(usedAsset))
        throw new Logging.UserError(404, `Could not find asset /assets/${usedAsset} which is referenced in the state.`);

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
    this.writePublicLibraryAssetsToFilesystem('PL:NEW');
    delete Room.publicLibrary;
    this.publicLibraryUpdatedCallback();

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
      this.unsetMetadataForWritingFile(state._meta.info);

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
        this.moveFile(this.variantFilename(stateID, oldVariantID), this.variantFilename(stateID, newVariantID));
    };

    for(const o of variantOperationQueue) {

      if(o.operation == 'create' || o.operation == 'save') {
        if(String(o.filenameSuffix).match(/^([0-9]+|[0-9a-z]{4})[0-9a-z]{4}$/)) {
          const prefix = `${Config.directory('save')}/states/${this.id}--TEMPSTATE--${o.filenameSuffix}--`;
          for(let i=0; fs.existsSync(`${prefix}${i}.json`); ++i) {
            this.moveFile(`${prefix}${i}.json`, this.variantFilename(id, o.operation == 'save' ? o.variantID : variants.length));
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

  getAssetListForState(stateID) {
    const usedAssets = {};
    for(const vID in this.state._meta.states[stateID].variants)
      for(const asset of this.getAssetList(JSON.parse(fs.readFileSync(this.variantFilename(stateID, vID)))))
        usedAssets[asset.split('/')[2]] = true;
    return usedAssets;
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
                const id = 'PL:' + subLibrary.toLowerCase() + ':' + gameFile._meta.info.name;
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

  getStateDetails(stateID) {
    if(stateID.match(/^PL:/)) {
      const [ , category, name ] = stateID.split(':');
      for(const [ id, state ] of Object.entries(this.state._meta.states))
        if(state.publicLibrary && state.publicLibraryCategory.toLowerCase() == `${category}s` && state.name.replace(/[^A-Za-z]+/g, '-').toLowerCase().replace(/^-+/, '').replace(/-+$/, '') == name)
          return Object.assign({}, state, { id });
    } else {
      return this.state._meta.states[stateID];
    }
  }

  getVariantMetadata(stateID, variantID) {
    const meta = Object.assign({}, this.state._meta.states[stateID], this.state._meta.states[stateID].variants[variantID]);
    this.unsetMetadataForWritingFile(meta);
    return meta;
  }

  async load(fileOrLink, player, delayForGameStartRoutine) {
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
      this.migrateBrokenSaveWithoutVersion();
      await this.updateLinkedStates();
      this.removeInvalidPublicLibraryLinks(player);

      this.traceIsEnabled(Config.get('forceTracing') || this.traceIsEnabled());
      this.broadcast('state', this.state);
    } else {
      let newState = emptyState;
      let errorMessage = 'Error loading state.';
      try {
        if(fileOrLink.match(/^http/))
          newState = await FileLoader.readVariantFromLink(fileOrLink);
        else
          newState = JSON.parse(fs.readFileSync(fileOrLink));
      } catch(e) {
        errorMessage = `Error loading state:\n${e.toString()}`;
        newState = null;
      }
      if(newState) {
        Logging.log(`loading room ${this.id} from ${fileOrLink}`);
        this.setState(newState, player, delayForGameStartRoutine);
      } else {
        Logging.log(`loading room ${this.id} from ${fileOrLink} FAILED: ${errorMessage}`);
        this.setState(emptyState, player, false);
        if(player)
          player.send('error', errorMessage);
      }
    }

    if(!this.state._meta || typeof this.state._meta.version !== 'number')
      throw Error('Room state has invalid meta information.');

    if(!fileOrLink)
      this.trace('init', { initialState: this.state });
  }

  async loadState(player, stateID, variantID, linkSourceStateID, delayForGameStartRoutine) {
    const stateInfo = this.state._meta.states[stateID];
    const variantInfo = stateInfo.variants[variantID];

    if(variantInfo.link)
      await this.load(variantInfo.link, player, delayForGameStartRoutine);
    else
      await this.load(this.variantFilename(stateID, variantID), player, delayForGameStartRoutine);

    if(linkSourceStateID != stateID)
      this.state._meta.activeState = { linkStateID: linkSourceStateID, stateID, variantID };
    else if(stateInfo.savePlayers && stateInfo.saveLinkState)
      this.state._meta.activeState = { saveStateID: stateID, stateID: stateInfo.saveState, variantID: stateInfo.saveVariant, linkStateID: stateInfo.saveLinkState };
    else if(stateInfo.savePlayers)
      this.state._meta.activeState = { saveStateID: stateID, stateID: stateInfo.saveState, variantID: stateInfo.saveVariant };
    else
      this.state._meta.activeState = { stateID, variantID };

    this.sendMetaUpdate();
  }

  migrateBrokenSaveWithoutVersion() {
    // a bug caused some savegames to be written to disk without file version
    // this guesses and adds the missing version by looking at the save date and comparing it to the commit time of version bumps
    if(this.state._meta.metaVersion < 2) {
      this.state._meta.metaVersion = 2;
      for(const [ id, state ] of Object.entries(this.state._meta.states)) {
        if(state.savePlayers) {
          const content = JSON.parse(fs.readFileSync(this.variantFilename(id, 0)));
          if(!content._meta || !content._meta.version) {
            if(state.saveDate >= 1676062683000)
              content._meta = { version: 12 };
            else if(state.saveDate >= 1674097185000)
              content._meta = { version: 11 };
            else if(state.saveDate >= 1674011502000)
              content._meta = { version: 10 };
            else if(state.saveDate >= 1672556492000)
              content._meta = { version: 9 };
            else
              content._meta = { version: 8 };
            Logging.log(`setting missing file version to ${content._meta.version} for ${id} in room ${this.id}`);
            fs.writeFileSync(this.variantFilename(id, 0), JSON.stringify(content));
          }
        }
      }
    }
  }

  migrateOldPublicLibraryLinks() {
    function plTarget(match) {
      if(!match)
        return null;
      if(match[2] == 'JSON User Guide')
        return `tutorials/JSON Editor User Guide`;

      let target = `games/${match[2]}`;
      if(match[1] == 'Tutorial')
        target = `tutorials/${match[2]}`;
      if(match[1] == 'Assets')
        target = `assets/${match[2]}`;
      return decodeURI(target);
    }

    const comparisonMap = {
      'JSON Editor User Guide': 'JSON User Guide',
      '/assets/1479011481_9212': '/assets/1368104302_9195'
    };
    for(const [ from, to ] of Object.entries(comparisonMap))
      comparisonMap[to] = from;
    function compareNameAndImage(a, b) {
      return (a.name == b.name || a.name == comparisonMap[b.name]) && (a.image == b.image || a.image == comparisonMap[b.image]);
    }

    if(!this.state._meta.metaVersion) {
      if(!this.state._meta.starred)
        this.state._meta.starred = {};
      for(const [ id, state ] of Object.entries(this.state._meta.states)) {
        const target = plTarget(state.link && state.link.match(/\/library\/(?:(Tutorial|Assets) - )?(.*)\.vtt/))
        if(target) {
          let foundTargetState = false;
          let migratedToTargetState = false;
          for(const [ targetID, targetState ] of Object.entries(this.state._meta.states)) {
            if(targetState.publicLibrary == target) {
              foundTargetState = true;
              let allVariantsFromPL = true;
              for(const [ vID, variant ] of Object.entries(state.variants))
                if((variant.link && variant.link.indexOf(state.link)) !== 0)
                  allVariantsFromPL = false;
              if(allVariantsFromPL && compareNameAndImage(state, targetState)) {
                Logging.log(`migrating ${target} in room ${this.id}`);
                if(!this.state._meta.starred[targetState.publicLibrary])
                  Statistics.toggleStateStar(targetState.publicLibrary, true);
                this.state._meta.starred[targetState.publicLibrary] = true;
                this.removeState(undefined, id);
                migratedToTargetState = true;
                break;
              }
              delete state.link;
            }
          }
          if(migratedToTargetState)
            continue;

          if(!foundTargetState)
            Logging.log(`could not migrate public library state ${target} in room ${this.id}`);
        }

        for(const [ vID, variant ] of Object.entries(state.variants)) {
          const target = plTarget(variant.link && variant.link.match(/\/library\/(?:(Tutorial|Assets) - )?(.*)\.vtt/))
          if(target) {
            let foundTargetState = false;
            for(const [ targetID, targetState ] of Object.entries(this.state._meta.states)) {
              if(targetState.publicLibrary == target) {
                for(const [ targetVid, targetVariant ] of Object.entries(targetState.variants)) {
                  if(targetVariant.players == variant.players && (targetVariant.language.match(variant.language) || targetVariant.language === '' && variant.language == 'UN') && targetVariant.variant == variant.variant || targetState.variants.length == 1 || target == 'games/Diced' && targetVid == 0) {
                    this.state._meta.states[id].variants[vID] = {
                      plStateID: targetID,
                      plVariantID: targetVid
                    };
                    Logging.log(`migrating variant to ${target}/${targetVid} in room ${this.id}`);
                    foundTargetState = true;
                    break;
                  }
                }
                break;
              }
            }
          }

          if(target && !this.state._meta.states[id].variants[vID].plStateID)
            Logging.log(`could not migrate variant to public library state ${target} in room ${this.id}`);

          if(!target && !state.publicLibrary) {
            // map languages that existed in the old public library to their new values
            const languageMap = { BR: 'pt-BR', CN: 'zh-CN', DE: 'de-DE', GB: 'en-GB', UN: '', US: 'en-US' };
            if(languageMap[variant.language] !== undefined)
              variant.language = languageMap[variant.language]

            // move attribution from variant to state
            if(!state.attribution)
              state.attribution = variant.attribution;
            if(variant.attribution && variant.attribution != state.attribution)
              state.attribution += '\n\n--\n\n'+variant.attribution;
            delete variant.attribution;
          }
        }
      }

      for(const [ id, state ] of Object.entries(this.state._meta.states)) {
        if(state.publicLibrary)
          continue;

        const newVariants = [];
        for(const [ variantID, variant ] of Object.entries(state.variants)) {
          if(variant.plStateID || variant.link) {
            newVariants.push(variant);
          } else if(fs.existsSync(this.variantFilename(id, variantID))) {
            this.moveFile(this.variantFilename(id, variantID), this.variantFilename(id, newVariants.length));
            newVariants.push(variant);
          }
        }
        state.variants = newVariants;
      }

      this.state._meta.metaVersion = 1;
    }
  }

  mouseMove(player, mouseState) {
    this.broadcast('mouse', { player: player.name, mouseState });
  }

  moveFile(source, target) {
    fs.copyFileSync(source, target, fs.constants.COPYFILE_FICLONE);
    fs.unlinkSync(source);
  }

  newPlayerColor() {
    return randomHue(this.state._meta.players)
  }

  playAudio(args) {
    for(const player of this.players)
      if(args.players.length === 0 || args.players.includes(player.name))
        player.send('audio', args);
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

    if(this.waitingForDeltaFromPlayer == player) {
      delete this.waitingForDeltaFromPlayer;
      this.broadcast('state', this.state, player);
      this.sendMetaUpdate();
    } else {
      this.broadcast('delta', delta, player);
    }
  }

  receiveInvalidDelta(player, delta, widgetID, property) {
    Logging.log(`WARNING: received conflicting delta data for property ${property} of widget ${widgetID} from player ${player.name} in room ${this.id} - sending game state at ${this.deltaID}`);

    let serverDelta = {s: {}};
    let changed = false;
    // Remove shadow from actively dragged widget in the case of a conflict.
    for (let widgetID in this.state) {
      if (this.state[widgetID].dropShadowOwner == player.name) {
        const clonedFrom = this.state[widgetID].clonedFrom;
        serverDelta.s[widgetID] = null;
        if (clonedFrom) {
          serverDelta.s[clonedFrom] = {
            dropShadowWidget: null
          };
        }
        changed = true;
      }
    }
    if (changed)
      this.receiveDelta(player, serverDelta);

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
      await this.loadState(null, 'serverMove', 0);
      this.removeState(null, 'serverMove');
    }
  }

  recolorPlayer(renamingPlayer, playerName, color) {
    this.state._meta.players[playerName] = color;
    this.sendMetaUpdate();
  }

  reloadPublicLibraryGames() {
    for(const id in this.state._meta.states)
      if(id.match(/^PL:/))
        delete this.state._meta.states[id];
    this.state._meta.states = Object.assign(this.state._meta.states, this.getPublicLibraryGames());
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

    if(stateID.match(/^PL:/)) {
      delete Room.publicLibrary;
      this.publicLibraryUpdatedCallback();
    } else {
      this.sendMetaUpdate();
    }
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

  saveCurrentState(mode, name) {
    const active = this.state._meta.activeState;
    if(mode == 'activeVariant' && active) {
      if(active.stateID.match(/^PL:/) && !Config.get('allowPublicLibraryEdits'))
        return;
      this.saveCurrentState_write(active.stateID, active.variantID, this.getVariantMetadata(active.stateID, active.variantID));
      if(active.stateID.match(/^PL:/))
        this.writePublicLibraryAssetsToFilesystem(active.stateID);
    }
    if(mode == 'addVariant' && active) {
      if(active.stateID.match(/^PL:/) && !Config.get('allowPublicLibraryEdits'))
        return;
      this.saveCurrentState_write(active.stateID, this.state._meta.states[active.stateID].variants.length, Object.assign(this.getVariantMetadata(active.stateID, active.variantID), { language: '', variant: '', players: '' }));
      if(active.stateID.match(/^PL:/))
        this.writePublicLibraryAssetsToFilesystem(active.stateID);
    }
    if(mode == 'addState')
      this.saveCurrentState_write(Math.random().toString(36).substring(3, 7), 0, { name });
    if(mode == 'quickSave')
      this.saveCurrentState_write('quicksave', this.state._meta.states['quicksave'] ? this.state._meta.states['quicksave'].variants.length : 0, { name: 'Quicksave', variant: `${new Date().toISOString().substr(0,16).replace(/T/, ' ')}` }, false);
  }

  saveCurrentState_write(stateID, variantID, metadata, setToActiveState=true) {
    metadata.lastUpdate = +new Date();

    const newState = {...this.state};
    newState._meta = {
      version: this.state._meta.version,
      info: metadata
    };
    if(!this.state._meta.states[stateID]) {
      this.state._meta.states[stateID] = Object.assign({}, metadata);
      this.state._meta.states[stateID].variants = [];
      delete this.state._meta.states[stateID].players;
      delete this.state._meta.states[stateID].language;
      delete this.state._meta.states[stateID].variant;
    }
    this.state._meta.states[stateID].variants[variantID] = {
      players:  metadata.players,
      language: metadata.language,
      variant:  metadata.variant
    };
    fs.writeFileSync(this.variantFilename(stateID, variantID), JSON.stringify(newState, null, '  '));
    if(setToActiveState)
      this.state._meta.activeState = { stateID, variantID };
    this.sendMetaUpdate();
  }

  saveState(player, players, updateCurrentSave) {
    if(updateCurrentSave) {
      const stateID = this.state._meta.activeState.saveStateID;
      const newContent = {...this.state};
      newContent._meta = { version: this.state._meta.version };
      this.state._meta.states[stateID].saveDate = +new Date();
      fs.writeFileSync(this.variantFilename(stateID, 0), JSON.stringify(newContent));
      return this.sendMetaUpdate();
    }

    const id = Math.random().toString(36).substring(3, 7);

    let targetState = null;
    for(const id of [ this.state._meta.activeState.saveStateID, this.state._meta.activeState.stateID, this.state._meta.activeState.linkStateID ])
      if(this.state._meta.states[id])
        targetState = this.state._meta.states[id];

    if(!targetState)
      throw new Logging.UserError(404, 'Could not find base state for saving the game.');

    this.state._meta.states[id] = {...targetState};
    this.state._meta.states[id].variants = [];
    this.state._meta.states[id].saveState = this.state._meta.activeState.stateID;
    this.state._meta.states[id].saveVariant = this.state._meta.activeState.variantID;
    if(this.state._meta.activeState.linkStateID)
      this.state._meta.states[id].saveLinkState = this.state._meta.activeState.linkStateID;
    this.state._meta.states[id].savePlayers = players;
    this.state._meta.states[id].saveDate = +new Date();

    this.unsetMetadataForWritingFile(this.state._meta.states[id], false);

    this.addState(id, 'room', null, null, id);

    this.state._meta.states[id].variants[0].variant = players;
    this.state._meta.states[id].variants[0].players = targetState.variants[this.state._meta.activeState.variantID].players;

    this.state._meta.activeState.saveStateID = id;

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

  setState(state, player, delayForGameStartRoutine) {
    delete this.state._meta.activeState;

    this.trace('setState', { state });
    const meta = this.state._meta;
    this.state = state;
    if(this.state._meta)
      this.state = FileUpdater(this.state);
    this.state._meta = meta;

    if(delayForGameStartRoutine) {
      for(const [ id, w ] of Object.entries(state)) {
        if(w.gameStartRoutine) {
          this.waitingForDeltaFromPlayer = player;
          player.send('state', state);
          return;
        }
      }
    }

    this.broadcast('state', state);
    this.sendMetaUpdate();
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
    if(this.state && this.state._meta && this.state._meta.states && typeof this.state._meta.states == 'object' && this.state._meta.starred && typeof this.state._meta.starred == 'object') {
      const nonPLgames = Object.keys(this.state._meta.states).filter(i=>!i.match(/^PL:/));
      if(Object.keys(this.state).length > 1 || nonPLgames.length || Object.keys(this.state._meta.starred).length || this.state._meta.redirectTo || this.state._meta.returnServer) {
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

  unsetMetadataForWritingFile(meta, deleteVariants=true) {
    delete meta.id;
    delete meta.publicLibrary;
    delete meta.publicLibraryCategory;
    delete meta.starred;
    delete meta.stars;
    delete meta.timePlayed;
    delete meta.link;
    if(deleteVariants)
      delete meta.variants;
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
    const usedAssets = this.getAssetListForState(stateID);

    if(!fs.existsSync(assetsDir))
      fs.mkdirSync(assetsDir);

    const savedAssets = {};
    for(const file of fs.readdirSync(assetsDir))
      savedAssets[file] = true;

    for(const savedAsset in savedAssets)
      if(!usedAssets[savedAsset])
        fs.unlinkSync(assetsDir + '/' + savedAsset);

    for(const usedAsset in usedAssets)
      if(!savedAssets[usedAsset])
        fs.copyFileSync(Config.resolveAsset(usedAsset), assetsDir + '/' + usedAsset);
  }

  writePublicLibraryMetaToFilesystem(stateID, meta) {
    if(!Config.get('allowPublicLibraryEdits'))
      return;

    for(const variantID in this.state._meta.states[stateID].variants) {
      const state = JSON.parse(fs.readFileSync(this.variantFilename(stateID, variantID)));

      state._meta.info = Object.assign(JSON.parse(JSON.stringify(meta)), JSON.parse(JSON.stringify(meta.variants[variantID])));

      this.unsetMetadataForWritingFile(state._meta.info);

      state._meta.info.lastUpdate = +new Date();

      fs.writeFileSync(this.variantFilename(stateID, variantID), JSON.stringify(state, null, '  '));
    }

    this.writePublicLibraryAssetsToFilesystem(stateID);

    delete Room.publicLibrary;
    this.publicLibraryUpdatedCallback();
  }

  writePublicLibraryToFilesystem(stateID, variantID, state) {
    if(!Config.get('allowPublicLibraryEdits'))
      return;

    const copy = JSON.parse(JSON.stringify(state));
    copy._meta = {
      version: copy._meta.version,
      info: JSON.parse(JSON.stringify(this.state._meta.states[stateID].variants[variantID]))
    };

    this.unsetMetadataForWritingFile(copy._meta.info);

    copy._meta.info.lastUpdate = +new Date();

    fs.writeFileSync(this.variantFilename(stateID, variantID), JSON.stringify(copy, null, '  '));
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
