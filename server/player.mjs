export default class Player {
  constructor(connection, room) {
    this.connection = connection;
    this.room = room;
  }

  send(func, args) {
    this.connection.toClient(func, args);
  }
}
