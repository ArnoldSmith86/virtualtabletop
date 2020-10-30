export default class Room {
  players = [];
  state = {};

  constructor(id) {
    this.id = id;
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

  translateWidget(player, widgetID, position) {
    this.state[widgetID].x = position[0];
    this.state[widgetID].y = position[1];
    this.broadcast('translate', { id: widgetID, pos: position });
  }
}
