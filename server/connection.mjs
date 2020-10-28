export default class Connection {
  constructor(websocket, connection, newPlayerCallback) {
    this.websocket = websocket;
    this.connection = connection;
    this.newPlayerCallback = newPlayerCallback;

    connection.on('message', this.messageReceived);
  }

  fromClient(func, args) {
    if(func == "room")
      this.newPlayerCallback(this, args);
  }

  messageReceived = message => {
    console.log(`from client: ${message}`);
    const { func, args } = JSON.parse(message);
    this.fromClient(func, args);
  }

  toClient(func, args) {
    this.connection.send(JSON.stringify({ func, args }));
  }
}
