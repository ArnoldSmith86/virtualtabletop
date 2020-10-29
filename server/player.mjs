export default class Player {
  constructor(connection, room) {
    this.connection = connection;
    this.room = room;

    connection.addMessageHandler(this.messageReceived);
  }

  messageReceived = (func, args) => {
    if(func == "translate")
      this.room.translateWidget(this, args.id, args.pos);
  }

  send(func, args) {
    this.connection.toClient(func, args);
  }
}
