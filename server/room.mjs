export default class Room {
  players = [];
  state = 1;

  constructor(id) {
    this.id = id;
  }

  addPlayer(player) {
    this.players.push(player);
    player.send("roomState", this.state);
  }

  translateWidget(player, widgetID, position) {
    console.log("translate", this.id, widgetID, position);
    for(const iPlayer of this.players)
      iPlayer.send("translate", { id: widgetID, pos: position });
  }
}
