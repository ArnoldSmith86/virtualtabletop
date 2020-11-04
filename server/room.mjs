import fs from 'fs';
import path from 'path';

import PCIO from './pcioimport.mjs';

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

  addState(player, type, src, meta) {
    const room = this;
    (async function() {
      let state = room.state;
      if(type == 'file')
        state = await PCIO(Buffer.from(src.replace(/^data.*?,/, ''), 'base64'));

      meta.id = Math.random().toString(36).substring(3, 7);

      if(type == 'link') {
        meta.src = src;
      } else {
        fs.writeFileSync(path.resolve() + '/save/states/' + room.id + '-' + meta.id + '.json', JSON.stringify(state));
      }

      meta.type = type;
      room.state._meta.states.push(meta);
      room.sendMetaUpdate();
    })();
  }

  addWidget(player, widget) {
    this.state[widget.id] = widget;
    this.broadcast('add', widget);
  }

  broadcast(func, args) {
    console.log(this.id, func, args);
    for(const player of this.players)
      player.send(func, args);
  }

  load(file) {
    if(!file)
      file = path.resolve() + '/save/rooms/' + this.id + '.json';

    console.log(`loading room ${this.id}`);
    try {
      this.state = JSON.parse(fs.readFileSync(file));
    } catch {
      this.state = {};
    }
    if(!this.state._meta)
      this.state._meta = {};
    if(!this.state._meta.players)
      this.state._meta.players = {};
    if(!this.state._meta.states)
      this.state._meta.states = [];
  }

  loadState(player, stateID) {
    const meta = this.state._meta;
    this.load(path.resolve() + '/save/states/' + this.id + '-' + meta.states.filter(s=>s.id==stateID)[0].id + '.json');
    this.state._meta = meta;
    this.broadcast('state', this.state);
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

  translateWidget(player, widgetID, position) {
    this.state[widgetID].x = position[0];
    this.state[widgetID].y = position[1];
    this.broadcast('translate', { id: widgetID, pos: position });
  }

  unload() {
    console.log(`unloading room ${this.id}`);
    const json = JSON.stringify(this.state);
    if(json != '{}')
      fs.writeFileSync(path.resolve() + '/save/rooms/' + this.id + '.json', json);
  }
}
