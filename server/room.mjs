import fs from 'fs';
import path from 'path';

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
      this.state._meta.players[player.name] = 'red';

    player.send('state', this.state);
    this.sendMetaUpdate();
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

  load() {
    console.log(`loading room ${this.id}`);
    try {
      this.state = JSON.parse(fs.readFileSync(path.resolve() + '/save/rooms/' + this.id + '.json'));
    } catch {
      this.state = {};
    }
    if(!this.state._meta)
      this.state._meta = { players: {} };
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
