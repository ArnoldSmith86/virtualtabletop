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
    if(func == 'addState')
      this.room.addState(this, args.type, args.src, args.meta);
    if(func == 'loadState')
      this.room.loadState(this, args);
    if(func == 'log')
      console.log(args);
    if(func == 'mouse')
      this.room.mouseMove(this, args);
    if(func == 'playerColor')
      this.room.recolorPlayer(this, args.player, args.color);
    if(func == 'remove')
      this.room.removeWidget(this, args);
    if(func == 'removeState')
      this.room.removeState(this, args);
    if(func == 'rename')
      this.room.renamePlayer(this, args.oldName, args.newName);
    if(func == 'translate')
      this.room.translateWidget(this, args.id, args.pos);
    if(func == 'update')
      this.room.updateWidget(this, args);
  }

  rename(newName) {
    this.name = newName;
    this.send('rename', newName);
  }

  send(func, args) {
    this.connection.toClient(func, args);
  }
}
