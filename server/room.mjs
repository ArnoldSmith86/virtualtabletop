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
    this.players.push(player);
    player.send('state', this.state);
  }

  addWidget(player, widget) {
    this.state[widget.id] = widget;
    this.broadcast('add', widget);
  }

  broadcast(func, args) {
    console.log(this.id, func, args);
    for(const iPlayer of this.players)
      iPlayer.send(func, args);
  }

  load() {
    console.log(`loading room ${this.id}`);
    try {
      this.state = JSON.parse(fs.readFileSync(path.resolve() + '/save/rooms/' + this.id + '.json'));
    } catch {
      this.state = {};
    }
  }

  removePlayer(player) {
    this.players = this.players.filter(e => e != player);
    if(this.players.length == 0) {
      this.unload();
      this.unloadCallback();
    }
  }

  setState(state) {
    this.state = state;
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
