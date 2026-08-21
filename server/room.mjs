import fs from 'fs';
import crypto from 'crypto';

import FileLoader from './fileloader.mjs';
import FileUpdater from './fileupdater.mjs';
import Logging from './logging.mjs';
import Config from './config.mjs';
import FileWriter from './filewriter.mjs';
import { randomHue } from '../client/js/color.js';
import { MIN_BOARD_SIZE, MAX_BOARD_SIZE, normalizeBoardSize } from '../client/js/calculateLayout.js';
import Statistics from './statistics.mjs';
import Zip from './zip.mjs';

// Room IDs are validated against this alphabet before a room is ever created or joined, but every
// place that turns one into a filename strips the rest again - the same defense in depth the state
// and variant IDs get in variantFilename, and the only form static analysis can follow.
export function pathSafeRoomID(roomID) {
  return String(roomID).replace(/[^A-Za-z0-9_-]/g, '_');
}

export default class Room {
  // every room that is currently in memory, so that a room can hand its game shelf to the rooms
  // that auto-link from it without going through the (possibly outdated) file on disk
  static loaded = new Map();

  players = [];
  state = {};
  deltaID = 0;
  lastStatisticsDeltaID = 0;
  lastMouseStateByPlayer = {};

  constructor(id, unloadCallback, publicLibraryUpdatedCallback) {
    this.id = id;
    this.unloadCallback = unloadCallback;
    this.publicLibraryUpdatedCallback = publicLibraryUpdatedCallback;
    Room.loaded.set(id, this);
    this.unloadTimeout = setTimeout(_=>{
      if(this.players.length == 0) {
        Logging.log(`unloading room ${this.id} after 5s without player connection`);
        this.unload();
      }
    }, 5000);
  }

  addLocalPlayer(addingPlayer, playerName) {
    playerName = typeof playerName == 'string' ? playerName.trim() : '';
    if(!playerName || this.state._meta.players[playerName])
      return;
    this.state._meta.players[playerName] = this.newPlayerColor();
    this.sendMetaUpdate();
  }

  async addPlayer(player) {
    Logging.log(`adding player ${player.name} to room ${this.id}`);
    clearTimeout(this.unloadTimeout);
    this.players.push(player);
    player.send('sessionID', player.sessionID);

    if(!this.state._meta.players[player.name])
      this.state._meta.players[player.name] = this.newPlayerColor();

    this.sendMetaUpdate();
    this.state._meta.deltaID = this.deltaID;

    player.send('adminStatus', await this.isAdmin(player.collection));

    if(this.state._meta.redirectTo) {
      player.send('redirect', this.state._meta.redirectTo.url + '/' + this.id);
    } else {
      player.send('state', this.state);
      for (const other of this.players) {
        if (other !== player && this.lastMouseStateByPlayer[other.name])
          player.send('mouse', { player: other.name, mouseState: this.lastMouseStateByPlayer[other.name] });
      }
    }

    if(this.traceIsEnabled()) {
      this.trace('addPlayer', { player: player.name });
      player.send('tracing', 'enable');
    }

    // somebody opening the room is the moment where it matters that its source room gained a game
    // while nobody was here - and unlike the load() path this also runs for a room that stayed in
    // memory the whole time
    if(this.state._meta.linkSourceRoom)
      await this.syncLinkSourceRoom();
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
        } else {
          delete meta.publicLibrary;
        }

        if(type != 'link' || meta.importerTemp)
          this.writeStateToFilesystem(stateID, newVariantID, variant);

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
          // The import report belongs to the game, not to one of its variants.
          // stateID comes from the request, so writing through it must not be
          // able to reach Object.prototype.
          if(meta.importerWarnings && stateID != '__proto__') {
            const gameMeta = this.state._meta.states[stateID];
            gameMeta.importerWarnings = [ ...new Set((gameMeta.importerWarnings || []).concat(meta.importerWarnings)) ];
          }
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
    await this.pushToAutoLinkedRooms();
  }

  addStateToPublicLibrary(player, args) {
    if(!Config.get('allowPublicLibraryEdits'))
      return;

    let id, folder, category;
    if (typeof args === 'string') {
      id = args;
      folder = 'games';
      category = 'Games';
    } else {
      id = args.id;
      folder = args.library;
      category = args.category;
    }

    for(const usedAsset in this.getAssetListForState(id))
      if(!Config.resolveAsset(usedAsset))
        throw new Logging.UserError(404, `Could not find asset /assets/${usedAsset} which is referenced in the state.`);

    const variantData = {};
    for(const variantID in this.state._meta.states[id].variants)
      variantData[variantID] = JSON.parse(fs.readFileSync(this.variantFilename(id, variantID)));

    this.state._meta.states[id].publicLibrary = `${folder}/${this.state._meta.states[id].name.replace(/[^a-zA-Z0-9 _-]/g, '_')}`;
    this.state._meta.states[id].publicLibraryCategory = category;
    fs.mkdirSync(Config.directory('library') + '/' + this.state._meta.states[id].publicLibrary, { recursive: true });
    fs.mkdirSync(Config.directory('library') + '/' + this.state._meta.states[id].publicLibrary + '/assets', { recursive: true });

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

  moveStateWithinPublicLibrary(player, args) {
    if(!Config.get('allowPublicLibraryEdits'))
      return;

    const id = args.id;
    const folder = args.newLibrary;
    const category = args.newCategory;

    const state = this.state._meta.states[id];
    if(!state || !state.publicLibrary || state.publicLibraryCategory === category)
      return;

    const oldPublicLibrary = state.publicLibrary;
    const newPublicLibraryPath = `${folder}/${state.name.replace(/[^a-zA-Z0-9 _-]/g, '_')}`;
    
    // Check if new path exists, ignore move if it maps entirely to the exact same folder string.
    if(oldPublicLibrary === newPublicLibraryPath) {
      // Just update metadata if only the category text somehow changed but path remains the same
      state.publicLibraryCategory = category;
    } else {
      fs.mkdirSync(Config.directory('library') + '/' + folder, { recursive: true });
      fs.renameSync(Config.directory('library') + '/' + oldPublicLibrary, Config.directory('library') + '/' + newPublicLibraryPath);
      state.publicLibrary = newPublicLibraryPath;
      state.publicLibraryCategory = category;
    }

    // Refresh memory cache
    this.reloadPublicLibraryGames();
  }

  claimedBy() {
    return this.state._meta.security && this.state._meta.security.adminCollection || null;
  }

  // a protected room hands nothing out that could be turned back into the game: no copies, no
  // linked rooms, no downloads, no share links and no raw state
  contentIsProtected() {
    return !!this.state._meta.contentProtected;
  }

  async collectionAction(action, args) {
    const collection = typeof args.collection == 'string' ? args.collection : '';
    const requireAdmin = async _=>{
      if(!await this.isAdmin(collection))
        throw new Logging.UserError(403, 'You are not the admin of this room. Claim it first.');
    };

    if(action == 'claim') {
      if(!collection.match(/^[A-Za-z0-9_-]{6,64}$/))
        throw new Logging.UserError(403, 'Invalid collection ID.');
      if(this.claimedBy() && !await this.isAdmin(collection))
        throw new Logging.UserError(403, 'This room is already claimed by another collection.');
      // prevent drive-by claiming of enumerated room IDs
      if(!this.players.some(player=>player.collection === collection))
        throw new Logging.UserError(403, 'You have to be a player in the room to claim it.');
      // reserve the claim synchronously so two concurrent claims can't both pass the checks above
      // while hashSecret (async) is still deriving the key, and the second requester loses cleanly
      if(this.claimReservedBy && this.claimReservedBy != collection)
        throw new Logging.UserError(403, 'This room is already claimed by another collection.');
      this.claimReservedBy = collection;
      try {
        this.ensureSalt();
        this.security().adminCollection = await this.hashSecret(collection);
      } finally {
        delete this.claimReservedBy;
      }
      Logging.log(`room ${this.id} was claimed by collection ${this.claimedBy().substring(0, 8)}…`);
    } else if(action == 'unclaim') {
      await requireAdmin();
      delete this.state._meta.security;
      delete this.state._meta.locked;
      delete this.state._meta.contentProtected;
    } else if(action == 'setName') {
      await requireAdmin();
      this.setRoomName(args.name);
    } else if(action == 'setLocked') {
      await requireAdmin();
      if(args.locked)
        this.state._meta.locked = true;
      else
        delete this.state._meta.locked;
    } else if(action == 'setContentProtected') {
      await requireAdmin();
      if(args.contentProtected)
        this.state._meta.contentProtected = true;
      else
        delete this.state._meta.contentProtected;
    } else if(action == 'setPassword') {
      await requireAdmin();
      if(args.password) {
        this.ensureSalt();
        this.security().joinPassword = await this.hashSecret(args.password);
      } else {
        delete this.security().joinPassword;
      }
    } else if(action == 'delete') {
      await requireAdmin();
      return await this.deleteRoom();
    } else {
      throw new Logging.UserError(404, 'Unknown room action.');
    }

    this.writeToFilesystem();
    this.sendMetaUpdate();
    await this.sendAdminStatus();
  }

  async copyFromRoom(sourceRoom, name) {
    Logging.log(`copying room ${sourceRoom.id} to room ${this.id}`);
    const copy = JSON.parse(JSON.stringify(sourceRoom.state));

    copy._meta.players = {};
    delete copy._meta.security;
    delete copy._meta.locked;
    delete copy._meta.contentProtected;
    delete copy._meta.linkSourceRoom;
    delete copy._meta.tracingEnabled;
    delete copy._meta.redirectTo;
    delete copy._meta.returnServer;
    delete copy._meta.returnState;
    if(copy._meta.roomName)
      copy._meta.roomName += ' (copy)';
    for(const id in copy._meta.states)
      if(id.match(/^PL:/))
        delete copy._meta.states[id];

    for(const [ stateID, state ] of Object.entries(copy._meta.states))
      for(const variantID in state.variants)
        if(!state.variants[variantID].link && !state.variants[variantID].plStateID && fs.existsSync(sourceRoom.variantFilename(stateID, variantID)))
          fs.copyFileSync(sourceRoom.variantFilename(stateID, variantID), this.variantFilename(stateID, variantID));

    copy._meta.states = Object.assign(copy._meta.states, this.getPublicLibraryGames());
    this.state = copy;
    this.state._meta.deltaID = this.deltaID;
    if(name !== undefined)
      this.setRoomName(name);
    this.writeToFilesystem();
    this.broadcast('state', this.state);
    this.sendMetaUpdate();
  }

  async deleteRoom() {
    Logging.log(`deleting room ${this.id}`);
    for(const [ stateID, state ] of Object.entries(this.state._meta.states)) {
      if(String(stateID).match(/^PL:/))
        continue;
      for(const variantID in state.variants) {
        const filename = this.variantFilename(stateID, variantID);
        if(fs.existsSync(filename))
          fs.unlinkSync(filename);
      }
    }
    if(fs.existsSync(this.roomFilename()))
      fs.unlinkSync(this.roomFilename());

    this.state = FileUpdater({
      _meta: {
        version: 1,
        metaVersion: 1,
        players: {},
        states: {},
        starred: {}
      }
    });
    this.state._meta.states = Object.assign(this.state._meta.states, this.getPublicLibraryGames());
    for(const player of this.players)
      this.state._meta.players[player.name] = this.newPlayerColor();
    this.state._meta.deltaID = this.deltaID;
    this.broadcast('state', this.state);
    this.sendMetaUpdate();
    await this.sendAdminStatus();
  }

  async getRoomDetails(collection) {
    const meta = this.state._meta;
    const active = meta.activeState || {};
    let game = null;
    for(const id of [ active.saveStateID, active.stateID, active.linkStateID ])
      if(!game && id !== undefined && meta.states[id])
        game = meta.states[id];
    return {
      id: this.id,
      name: meta.roomName || this.id,
      gameName: game && game.name || null,
      image: game && game.image || null,
      claimed: !!this.claimedBy(),
      isAdmin: await this.isAdmin(collection),
      locked: !!meta.locked,
      contentProtected: !!meta.contentProtected,
      hasPassword: !!(meta.security && meta.security.joinPassword),
      autoLink: !!meta.linkSourceRoom,
      players: [...new Set(this.players.map(player=>player.name))].map(name=>({ name, color: meta.players[name] || null }))
    };
  }

  ensureSalt() {
    if(!this.security().salt)
      this.security().salt = crypto.randomBytes(16).toString('hex');
  }

  // async so the key derivation runs in the thread pool instead of blocking the event loop;
  // memoized per salt+secret because the collection listing checks many rooms with the same secret
  hashSecret(secret) {
    const salt = this.state._meta.security && this.state._meta.security.salt || '';
    const cacheKey = `${salt}:${secret}`;
    if(!this.secretHashCache)
      this.secretHashCache = {};
    if(!this.secretHashCache[cacheKey]) {
      if(Object.keys(this.secretHashCache).length >= 100)
        this.secretHashCache = {};
      this.secretHashCache[cacheKey] = new Promise((resolve, reject)=>{
        crypto.scrypt(String(secret), salt, 32, (err, derivedKey)=>err ? reject(err) : resolve(derivedKey.toString('hex')));
      });
    }
    return this.secretHashCache[cacheKey];
  }

  async isAdmin(collection) {
    if(!this.claimedBy() || !collection)
      return false;
    return await this.hashSecret(collection) == this.claimedBy();
  }

  async linkFromRoom(sourceRoom, autoLink, name) {
    Logging.log(`linking room ${sourceRoom.id} to room ${this.id}`);
    this.state._meta.starred = JSON.parse(JSON.stringify(sourceRoom.state._meta.starred || {}));
    if(autoLink)
      this.state._meta.linkSourceRoom = sourceRoom.id;
    if(name !== undefined)
      this.setRoomName(name);
    await this.linkStatesFromRoomState(sourceRoom.state, sourceRoom.id);
    this.writeToFilesystem();
    this.broadcast('state', this.state);
    this.sendMetaUpdate();
  }

  // returns whether anything was actually linked, so the callers that run on every join or shelf
  // change stay silent while the source room has not gained a game
  async linkStatesFromRoomState(sourceState, sourceRoomID) {
    if(!this.state._meta.autoLinkedStates)
      this.state._meta.autoLinkedStates = {};
    let added = false;
    for(const [ id, state ] of Object.entries(sourceState._meta && sourceState._meta.states || {})) {
      if(id.match(/^PL:/) || state.savePlayers || this.state._meta.states[id] || this.state._meta.autoLinkedStates[id])
        continue;
      try {
        await this.addState(id, 'link', `${Config.get('externalURL')}/dl/${sourceRoomID}/${encodeURIComponent(id)}`, '');
        this.state._meta.autoLinkedStates[id] = true;
        added = true;
      } catch(e) {
        Logging.log(`ERROR: linking state ${id} from room ${sourceRoomID} to room ${this.id} failed: ${e}`);
      }
    }
    return added;
  }

  // the other half of syncLinkSourceRoom: a room that is open while its source gains a game would
  // otherwise only notice the next time it is loaded from disk, which for a room somebody is
  // sitting in never happens
  async pushToAutoLinkedRooms() {
    for(const room of [ ...Room.loaded.values() ])
      if(room !== this && room.state && room.state._meta && room.state._meta.linkSourceRoom == this.id)
        await room.syncLinkSourceRoom();
  }

  async mayJoin(collection, password) {
    const security = this.state._meta.security;
    if(!security || !security.joinPassword || await this.isAdmin(collection))
      return true;
    return typeof password == 'string' && await this.hashSecret(password) == security.joinPassword;
  }

  publicMeta(meta) {
    if(!meta || !meta.security)
      return meta;
    const publicCopy = Object.assign({}, meta);
    delete publicCopy.security;
    return publicCopy;
  }

  security() {
    if(!this.state._meta.security)
      this.state._meta.security = {};
    return this.state._meta.security;
  }

  async sendAdminStatus() {
    for(const player of this.players)
      player.send('adminStatus', await this.isAdmin(player.collection));
  }

  // pull the games the source room has gained since the last time. The source is read from memory
  // when it is loaded there - the file on disk is only written when the room is unloaded or by the
  // autosave, so a game added minutes ago is not in it yet
  async syncLinkSourceRoom() {
    const sourceID = this.state._meta.linkSourceRoom;
    if(typeof sourceID != 'string' || !sourceID.match(/^[A-Za-z0-9_-]+$/))
      return;
    if(Room.roomsBeingSynced && Room.roomsBeingSynced[this.id])
      return;
    let sourceState = Room.loaded.get(sourceID) && Room.loaded.get(sourceID).state;
    if(!sourceState) {
      const filename = Config.directory('save') + '/rooms/' + pathSafeRoomID(sourceID) + '.json';
      if(!fs.existsSync(filename))
        return;
      sourceState = JSON.parse(fs.readFileSync(filename));
    }
    try {
      Room.roomsBeingSynced = Room.roomsBeingSynced || {};
      Room.roomsBeingSynced[this.id] = true;
      if(await this.linkStatesFromRoomState(sourceState, sourceID)) {
        this.writeToFilesystem();
        this.sendMetaUpdate();
      }
    } catch(e) {
      Logging.log(`ERROR: syncing linked room ${sourceID} into room ${this.id} failed: ${e}`);
    } finally {
      delete Room.roomsBeingSynced[this.id];
    }
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
    states.VTT[0]._meta = { version: states.VTT[0]._meta.version, gameSettings: states.VTT[0]._meta.gameSettings };
    if(fileContent)
      states = await FileLoader.readStatesFromBuffer(fileContent)

    for(const state of Object.values(states))
      for(const [ i, variant ] of Object.entries(state))
        FileWriter.writeFileSync(`${Config.directory('save')}/states/${this.id}--TEMPSTATE--${filenameSuffix}--${i}.json`, JSON.stringify(variant));

    return filenameSuffix;
  }

  async download(stateID, variantID) {
    const includeAssets = true;
    const files = {};

    if(!stateID && !variantID) {
      for(const sID in this.state._meta.states) {
        const state = await this.download(sID);
        files[state.name] = state.content;
      }

      return {
        name: this.id + '.vttc',
        type: 'application/zip',
        content: await Zip.create(files)
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
      state._meta = { version: state._meta.version, info: { ...s }, gameSettings: state._meta.gameSettings };
      Object.assign(state._meta.info, state._meta.info.variants[vID]);
      this.unsetMetadataForWritingFile(state._meta.info);

      files[`${vID}.json`] = JSON.stringify(state, null, '  ');
      if(includeAssets)
        for(const asset of this.getAssetList(state))
          if(Config.resolveAsset(asset.substr(8)))
            files[asset.substr(1)] = fs.readFileSync(Config.resolveAsset(asset.substr(8)));
    }

    const zipBuffer = await Zip.create(files, true);

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

      const scanFolder = (subLibrary, folder, currentPath, relativePath) => {
        if(!fs.existsSync(currentPath)) return;
        for(const entry of fs.readdirSync(currentPath)) {
          const entryPath = currentPath + '/' + entry;
          const entryRelativePath = relativePath ? relativePath + '/' + entry : entry;
          if(fs.lstatSync(entryPath).isDirectory()) {
            let hasJson = false;
            for(const file of fs.readdirSync(entryPath)) {
              if(file.match(/json$/)) {
                try {
                  const gameFile = JSON.parse(fs.readFileSync(entryPath + '/' + file));
                  const metaInfo = (gameFile._meta && gameFile._meta.info) || {};
                  const name = metaInfo.name || entry;
                  const id = 'PL:' + folder + ':' + name;
                  if(!Room.publicLibrary[id]) {
                    Room.publicLibrary[id] = Object.assign({ name }, metaInfo);
                    Room.publicLibrary[id].publicLibrary = folder + '/' + entryRelativePath;
                    Room.publicLibrary[id].publicLibraryCategory = subLibrary;
                    Room.publicLibrary[id].variants = [];
                  }
                  Room.publicLibrary[id].variants[file.replace(/\.json$/, '')] = {
                    players: metaInfo.players,
                    language: metaInfo.language,
                    variant: metaInfo.variant,
                    variantImage: metaInfo.variantImage,
                    publicLibrary: folder + '/' + entryRelativePath + '/' + file
                  };
                  hasJson = true;
                } catch(e) {
                  Logging.log(`WARNING: Could not load public library game ${entryPath}/${file}: ${e}`);
                }
              }
            }
            if(!hasJson)
              scanFolder(subLibrary, folder, entryPath, entryRelativePath);
          }
        }
      };

      for(const [ subLibrary, folder ] of Object.entries(Config.get('libraries'))) {
        scanFolder(subLibrary, folder, Config.directory('library') + '/' + folder, '');
      }
    }
    Statistics.updateDataInsideStates(Room.publicLibrary);
    return Room.publicLibrary;
  }

  getStateDetails(stateID) {
    if(stateID.match(/^PL:/)) {
      const [ , category, name ] = stateID.split(':');
      for(const [ id, state ] of Object.entries(this.state._meta.states)) {
        if(state.publicLibrary) {
          if(state.publicLibrary.startsWith(category + '/') && state.name.replace(/[^A-Za-z]+/g, '-').toLowerCase().replace(/^-+/, '').replace(/-+$/, '') == name) {
            return Object.assign({}, state, { id });
          }
        }
      }
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
      if(this.state._meta.linkSourceRoom)
        await this.syncLinkSourceRoom();

      this.traceIsEnabled(Config.get('forceTracing') || this.traceIsEnabled());
      this.normalizeGameSettings(this.state._meta.gameSettings);
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
            this.writeStateToFilesystem(id, 0, content);
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
    this.lastMouseStateByPlayer[player.name] = mouseState;
    this.broadcast('mouse', { player: player.name, mouseState });
  }

  moveFile(source, target) {
    if(source == target)
      return;
    FileWriter.copyFileSync(source, target);
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

    if(delta.deltaSendId) {
      player.send('deltaConfirm', { id: delta.deltaSendId });
      delete delta.deltaSendId;
    }

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

  playerIsReferencedInWidgets(playerName) {
    return Object.values(this.state).some(w=>[ w.owner, w.player, w.artist ].some(v=>Array.isArray(v) ? v.indexOf(playerName) != -1 : v == playerName));
  }

  // a player the game still points at can be removed too - the client warns about what stays
  // behind, and those widgets pick the name up again as soon as a player uses it
  removeLocalPlayer(removingPlayer, playerName) {
    if(this.players.filter(p=>p.name == playerName).length)
      return;
    delete this.state._meta.players[playerName];
    this.sendMetaUpdate();
  }

  removePlayer(player) {
    this.trace('removePlayer', { player: player.name });
    Logging.log(`removing player ${player.name} from room ${this.id}`);
    delete this.lastMouseStateByPlayer[player.name];
    this.players = this.players.filter(e => e != player);
    this.cleanupInputForPlayer(player);
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

      // removes the assets directory along with anything else left in the game directory, like a
      // temporary file from a write that was interrupted
      fs.rmSync(this.variantFilename(stateID, 0).replace(/\/[0-9]+\.json$/, ''), { recursive: true, force: true });
    }

    delete this.state._meta.states[stateID];

    if(stateID.match(/^PL:/)) {
      delete Room.publicLibrary;
      this.publicLibraryUpdatedCallback();
    } else {
      this.sendMetaUpdate();
    }
  }

  renamePlayer(renamingPlayer, oldName, newName, updateWidgets, sessionID) {
    newName = typeof newName == 'string' ? newName.trim() : '';
    if(oldName == newName || !newName)
      return;

    const renamedSessions = this.players.filter(p=>p.name == oldName && (sessionID == null || p.sessionID == sessionID));
    if(sessionID != null && !renamedSessions.length)
      return;

    // refuse taking the name of a connected player who is part of the game (seat, owner, artist) -
    // it would secretly reveal that player's hand
    if(this.players.some(p=>p.name == newName) && this.playerIsReferencedInWidgets(newName))
      return;

    Logging.log(`renaming player ${oldName} to ${newName} in room ${this.id}`);
    if(this.state._meta.players[newName] === undefined)
      this.state._meta.players[newName] = sessionID == null ? this.state._meta.players[oldName] : this.newPlayerColor();
    if(this.lastMouseStateByPlayer[oldName] && !this.lastMouseStateByPlayer[newName])
      this.lastMouseStateByPlayer[newName] = this.lastMouseStateByPlayer[oldName];

    for(const player of renamedSessions)
      player.rename(newName);

    // the cursor of the old name only stays meaningful while other sessions still use it
    if(!this.players.filter(p=>p.name == oldName).length)
      delete this.lastMouseStateByPlayer[oldName];

    // when only a single session is renamed (split/view), the old player stays available for the other sessions -
    // except for abandoned guest entries which the disconnect cleanup would no longer catch under the new name
    if(sessionID == null)
      delete this.state._meta.players[oldName];
    else if(oldName.match(/^Guest/) && !this.players.filter(p=>p.name == oldName).length && !this.playerIsReferencedInWidgets(oldName))
      delete this.state._meta.players[oldName];

    if(updateWidgets)
      this.renamePlayerInWidgets(oldName, newName);

    this.sendMetaUpdate();
  }

  renamePlayerInWidgets(oldName, newName) {
    const delta = { s: {} };
    for(const widgetID in this.state) {
      if(widgetID == '_meta')
        continue;
      const changes = {};
      for(const property of [ 'owner', 'player', 'artist' ]) {
        const value = this.state[widgetID][property];
        if(value === oldName)
          changes[property] = newName;
        else if(Array.isArray(value) && value.includes(oldName))
          changes[property] = [...new Set(value.map(p=>p === oldName ? newName : p))];
      }
      if(Object.keys(changes).length) {
        Object.assign(this.state[widgetID], changes);
        delta.s[widgetID] = changes;
      }
    }
    if(Object.keys(delta.s).length) {
      delta.id = ++this.deltaID;
      this.broadcast('delta', delta);
    }
  }

  // Input sessions are tracked by the Player *connection*, not by name, so a
  // rename mid-input doesn't lose a target. The name the initiator used to
  // address each target is remembered and echoed back so the initiating
  // client (which keys its own session by name) still recognizes the result.
  requestInput(player, args) {
    // Dedupe names (the same connection can only show one overlay) and resolve
    // each to a connection.
    const requested = [ ...new Set(args.targets || []) ];
    const targets = requested.map(name=>({ name, player: this.players.find(p=>p.name === name) }));
    // If any requested target is unreachable, cancel the whole session rather
    // than silently dropping them — otherwise the initiator waits on a name
    // that can never answer. This matches the one-cancel-cancels-all rule.
    if(targets.some(t=>!t.player)) {
      player.send('inputResult', { sessionID: args.sessionID, cancelled: true });
      return;
    }
    this.inputRequests = this.inputRequests || Object.create(null);
    this.inputRequests[args.sessionID] = { from: player, remaining: targets };
    for(const target of targets) {
      const overlay = args.overlaysByTarget && args.overlaysByTarget[target.name] || args.overlay;
      const collections = args.collectionsByTarget && args.collectionsByTarget[target.name] || args.collections;
      target.player.send('showInput', { sessionID: args.sessionID, widgetID: args.widgetID, overlay, variables: args.variables, collections });
    }
  }

  inputResult(player, args) {
    const request = this.inputRequests && this.inputRequests[args.sessionID];
    const target = request && request.remaining.find(t=>t.player === player);
    if(request && request.from)
      request.from.send('inputResult', { sessionID: args.sessionID, player: target ? target.name : player.name, cancelled: args.cancelled, variables: args.variables, collections: args.collections });
    if(request) {
      request.remaining = request.remaining.filter(t=>t.player !== player);
      // A single cancellation ends the whole session: close the other targets
      // right here (the initiator's abortInput would arrive too late).
      if(args.cancelled) {
        for(const t of request.remaining)
          t.player.send('hideInput', { sessionID: args.sessionID });
        delete this.inputRequests[args.sessionID];
      } else {
        if(!request.remaining.length)
          delete this.inputRequests[args.sessionID];
        // Move the player who just answered into the "waiting for the rest"
        // overlay by dropping them from the block's waitingFor list.
        this.removeFromInputBlock(args.sessionID, target ? target.name : player.name);
      }
    }
  }

  // The initiator aborted the input: tell every pending target to close it.
  abortInput(player, args) {
    const request = this.inputRequests && this.inputRequests[args.sessionID];
    if(!request || request.from !== player)
      return;
    for(const t of request.remaining)
      t.player.send('hideInput', { sessionID: args.sessionID });
    delete this.inputRequests[args.sessionID];
  }

  // A waiting player pressed cancel on the block overlay: tell the initiator.
  cancelInput(player, args) {
    const block = (this.inputBlocks || {})[args.blockID];
    if(block && block.from)
      block.from.send('inputCancelled', { sessionID: args.blockID });
  }

  cleanupInputForPlayer(player) {
    for(const sessionID in (this.inputRequests || {})) {
      const request = this.inputRequests[sessionID];
      if(request.from === player) {
        // Initiator left: close any overlays its targets are still showing.
        for(const t of request.remaining)
          t.player.send('hideInput', { sessionID });
        delete this.inputRequests[sessionID];
      } else if(request.remaining.some(t=>t.player === player)) {
        // A target left: cancel the whole session and free the others.
        if(request.from)
          request.from.send('inputResult', { sessionID, player: player.name, cancelled: true });
        for(const t of request.remaining)
          if(t.player !== player)
            t.player.send('hideInput', { sessionID });
        delete this.inputRequests[sessionID];
      }
    }
    for(const blockID in (this.inputBlocks || {})) {
      if(this.inputBlocks[blockID].from === player) {
        delete this.inputBlocks[blockID];
        for(const p of this.players)
          p.send('inputBlock', { blockID, show: false });
      }
    }
  }

  inputBlock(player, args) {
    this.inputBlocks = this.inputBlocks || Object.create(null);
    if(args.show) {
      this.inputBlocks[args.blockID] = { from: player, header: args.header, waitingFor: args.waitingFor || [] };
      this.sendInputBlock(args.blockID);
    } else {
      delete this.inputBlocks[args.blockID];
      for(const p of this.players)
        p.send('inputBlock', { blockID: args.blockID, show: false });
    }
  }

  // Show the "waiting for input" overlay to everyone who is not currently being
  // waited on. As players answer they drop out of waitingFor, so a player who
  // just confirmed their own overlay now sees the waiting overlay (with its
  // cancel button) for the players who still have not answered.
  sendInputBlock(blockID) {
    const block = this.inputBlocks && this.inputBlocks[blockID];
    if(!block)
      return;
    for(const p of this.players)
      if(!block.waitingFor.includes(p.name))
        p.send('inputBlock', { blockID, show: true, waitingFor: block.waitingFor, header: block.header });
  }

  // Drop a player who has answered from a block's waitingFor list and refresh
  // the overlay so they (and anyone else no longer waited on) now see it.
  removeFromInputBlock(blockID, name) {
    const block = this.inputBlocks && this.inputBlocks[blockID];
    if(!block)
      return;
    block.waitingFor = block.waitingFor.filter(n => n !== name);
    if(block.waitingFor.length)
      this.sendInputBlock(blockID);
  }

  // The initiator answered its own (local) overlay while others are still
  // pending; move it into the waiting overlay too.
  inputBlockAnswered(player, args) {
    this.removeFromInputBlock(args.sessionID, player.name);
  }

  roomFilename() {
    return Config.directory('save') + '/rooms/' + pathSafeRoomID(this.id) + '.json';
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
      info: metadata,
      gameSettings: this.state._meta.gameSettings
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
    this.writeStateToFilesystem(stateID, variantID, newState);
    if(setToActiveState)
      this.state._meta.activeState = { stateID, variantID };
    this.sendMetaUpdate();
  }

  saveState(player, players, updateCurrentSave) {
    if(updateCurrentSave) {
      const stateID = this.state._meta.activeState.saveStateID;
      this.state._meta.states[stateID].saveDate = +new Date();
      this.writeStateToFilesystem(stateID, 0, this.state);
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
    this.broadcast('meta', { meta: this.state._meta, activePlayers: this.players.map(p=>p.name), sessions: this.players.map(p=>({ sessionID: p.sessionID, player: p.name })) });
  }

  // The board size decides how everyone in the room renders the game and it is written
  // to the game file, so it gets normalized wherever it enters the room - through the
  // Board Settings panel, a loaded game file or a hand edited save. The client applies
  // the same function to what it receives, so the file can never end up describing a
  // board that nobody is playing on.
  normalizeGameSettings(gameSettings, player) {
    if(!gameSettings || gameSettings.boardSize === undefined)
      return;

    const boardSize = normalizeBoardSize(gameSettings.boardSize);
    const changed = !boardSize || boardSize.width != gameSettings.boardSize.width || boardSize.height != gameSettings.boardSize.height;

    if(boardSize)
      gameSettings.boardSize = boardSize;
    else
      delete gameSettings.boardSize;

    if(changed && player)
      player.send('error', `The board size has to be between ${MIN_BOARD_SIZE} and ${MAX_BOARD_SIZE} - using ${boardSize ? `${boardSize.width}x${boardSize.height}` : 'the default'} instead.`);
  }

  setGameSettings(player, gameSettings) {
    const oldLegacyModes = this.state._meta.gameSettings?.legacyModes || {};
    const newLegacyModes = gameSettings.legacyModes || {};

    this.normalizeGameSettings(gameSettings, player);
    this.state._meta.gameSettings = gameSettings;
    this.sendMetaUpdate();

    const legacyModesChanged = JSON.stringify(oldLegacyModes) !== JSON.stringify(newLegacyModes);
    if(legacyModesChanged)
      this.broadcast('state', this.state);
  }

  setLegacyMode(name, value) {
    if(!this.state._meta.gameSettings)
      this.state._meta.gameSettings = {};
    if(!this.state._meta.gameSettings.legacyModes)
      this.state._meta.gameSettings.legacyModes = {};
    this.state._meta.gameSettings.legacyModes[name] = value === 'true';
    this.sendMetaUpdate();
    this.broadcast('state', this.state);
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
          const files = { [`${this.id}.json`]: JSON.stringify(this.state, null, '  ') };
          for(const asset in assetStatus)
            if(!assetStatus[asset] && Config.resolveAsset(asset))
              files['assets/' + asset] = fs.readFileSync(Config.resolveAsset(asset));

          zipBuffer = await Zip.create(files);
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

  // used by the setName room action and when a copied or linked room is given a name right away
  setRoomName(name) {
    const trimmed = String(name || '').trim().substring(0, 64);
    if(trimmed)
      this.state._meta.roomName = trimmed;
    else
      delete this.state._meta.roomName;
  }

  setState(state, player, delayForGameStartRoutine) {
    delete this.state._meta.activeState;

    this.trace('setState', { state });
    const meta = this.state._meta;
    let gameSettings = meta.gameSettings || { legacyModes: {} };
    this.state = state;
    if(this.state._meta) {
      this.state = FileUpdater(this.state);
      gameSettings = (this.state._meta || {}).gameSettings || { legacyModes: {} };
    }
    this.state._meta = meta;
    this.normalizeGameSettings(gameSettings);
    this.state._meta.gameSettings = gameSettings;

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
      this.writeStateToFilesystem(stateID, variantID, variantState);
      delete variant.link;
    }
    delete this.state._meta.states[stateID].link;
    this.sendMetaUpdate();
  }

  unload() {
    if(this.state && this.state._meta && this.state._meta.states && typeof this.state._meta.states == 'object' && this.state._meta.starred && typeof this.state._meta.starred == 'object') {
      const nonPLgames = Object.keys(this.state._meta.states).filter(i=>!i.match(/^PL:/));
      const hasCollectionData = this.state._meta.security && Object.keys(this.state._meta.security).length || this.state._meta.roomName || this.state._meta.linkSourceRoom || this.state._meta.locked || this.state._meta.contentProtected;
      if(Object.keys(this.state).length > 1 || nonPLgames.length || Object.keys(this.state._meta.starred).length || this.state._meta.redirectTo || this.state._meta.returnServer || hasCollectionData) {
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
    if(Room.loaded.get(this.id) === this)
      Room.loaded.delete(this.id);
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
        FileWriter.copyFileSync(Config.resolveAsset(usedAsset), assetsDir + '/' + usedAsset);
  }

  writePublicLibraryMetaToFilesystem(stateID, meta) {
    if(!Config.get('allowPublicLibraryEdits'))
      return;

    for(const variantID in this.state._meta.states[stateID].variants) {
      const state = JSON.parse(fs.readFileSync(this.variantFilename(stateID, variantID)));

      state._meta.info = Object.assign(JSON.parse(JSON.stringify(meta)), JSON.parse(JSON.stringify(meta.variants[variantID])));

      this.unsetMetadataForWritingFile(state._meta.info);

      state._meta.info.lastUpdate = +new Date();

      FileWriter.writeFileSync(this.variantFilename(stateID, variantID), JSON.stringify(state, null, '  '));
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
    if(state._meta.gameSettings)
      copy._meta.gameSettings = JSON.parse(JSON.stringify(state._meta.gameSettings));

    this.unsetMetadataForWritingFile(copy._meta.info);

    copy._meta.info.lastUpdate = +new Date();

    FileWriter.writeFileSync(this.variantFilename(stateID, variantID), JSON.stringify(copy, null, '  '));
  }

  writeStateToFilesystem(stateID, variantID, state) {
    const copy = {...state};
    copy._meta = { version: copy._meta.version, gameSettings: copy._meta.gameSettings };
    FileWriter.writeFileSync(this.variantFilename(stateID, variantID), JSON.stringify(copy, null, '  '));
  }

  writeToFilesystem() {
    const copy = JSON.parse(JSON.stringify(this.state));
    for(const id in copy._meta.states)
      if(id.match(/^PL:/))
        delete copy._meta.states[id];
    const json = JSON.stringify(copy);
    FileWriter.writeFileSync(this.roomFilename(), json);
  }

  variantFilename(stateID, variantID) {
    if(stateID.match(/^PL:/) && String(variantID).match(/^[0-9]+$/))
      return Config.directory('library') + `/${Room.publicLibrary[stateID].publicLibrary}/${variantID}.json`;
    else
      return Config.directory('save') + '/states/' + pathSafeRoomID(this.id) + '-' + stateID.replace(/[^a-z0-9]/g, '_') + '-' + String(variantID).replace(/[^a-z0-9]/g, '_') + '.json';
  }
}
