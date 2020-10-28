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
}
