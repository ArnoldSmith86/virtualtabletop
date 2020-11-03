export default class Connection {
  constructor(websocket, connection, newPlayerCallback) {
    this.websocket = websocket;
    this.connection = connection;
    this.newPlayerCallback = newPlayerCallback;

    this.closeHandlers = [];
    this.messageHandlers = [];

    connection.on('close', this.closeReceived);
    connection.on('message', this.messageReceived);
  }

  addCloseHandler(callback) {
    this.closeHandlers.push(callback);
  }

  addMessageHandler(callback) {
    this.messageHandlers.push(callback);
  }

  fromClient(func, args) {
    if(func == "room")
      this.newPlayerCallback(this, args);
    for(const handler of this.messageHandlers)
      handler(func, args);
  }

  messageReceived = message => {
    const { func, args } = JSON.parse(message);
    this.fromClient(func, args);
  }

  closeReceived = _ => {
    for(const handler of this.closeHandlers)
      handler();
  }

  toClient(func, args) {
    this.connection.send(JSON.stringify({ func, args }));
  }
}
