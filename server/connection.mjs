import Logging from './logging.mjs';

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

  close() {
    this.connection.close();
  }

  fromClient(func, args) {
    if(func == "room")
      this.newPlayerCallback(this, args);
    for(const handler of this.messageHandlers)
      handler(func, args);
  }

  messageReceived = message => {
    try {
      const { func, args } = JSON.parse(message);
      this.fromClient(func, args);
    } catch(e) {
      Logging.handleGenericException('messageReceived', e);
      this.toClient('internal_error', 'unknown');
      this.close();
    }
  }

  closeReceived = _ => {
    for(const handler of this.closeHandlers)
      handler();
  }

  toClient(func, args) {
    this.connection.send(JSON.stringify({ func, args }));
  }
}
