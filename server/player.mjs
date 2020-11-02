export default class Player {
  constructor(connection, name, room) {
    this.connection = connection;
    this.name = name;
    this.room = room;

    connection.addMessageHandler(this.messageReceived);
    connection.addCloseHandler(this.connectionClosed);
  }

  connectionClosed = (func, args) => {
    this.room.removePlayer(this);
  }

  messageReceived = (func, args) => {
    if(func == 'add')
      this.room.addWidget(this, args);
    if(func == 'translate')
      this.room.translateWidget(this, args.id, args.pos);
  }

  send(func, args) {
    this.connection.toClient(func, args);
  }
}
