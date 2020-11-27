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
    if(func == 'addState')
      this.room.addState(this, args.id, args.type, args.src, args.addAsVariant);
    if(func == 'delta')
      this.room.receiveDelta(this, args);
    if(func == 'editState')
      this.room.editState(this, args.id, args.meta);
    if(func == 'loadState')
      this.room.loadState(this, args.stateID, args.variantID);
    if(func == 'log')
      console.log(args);
    if(func == 'mouse')
      this.room.mouseMove(this, args);
    if(func == 'playerColor')
      this.room.recolorPlayer(this, args.player, args.color);
    if(func == 'removeState')
      this.room.removeState(this, args);
    if(func == 'rename')
      this.room.renamePlayer(this, args.oldName, args.newName);
  }

  rename(newName) {
    this.name = newName;
    this.send('rename', newName);
  }

  send(func, args) {
    this.connection.toClient(func, args);
  }
}
