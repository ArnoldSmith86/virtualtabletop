import ws from 'ws';

import Connection from './connection.mjs';

export default class WebSocket {
  connections = [];

  constructor(port, newPlayerCallback) {
    this.server = new ws.Server({ port });
    this.newPlayerCallback = newPlayerCallback;

    this.server.on('connection', this.newConnection);
  }

  newConnection = ws => {
    this.connections.push(new Connection(this, ws, this.newPlayerCallback));
  }
}
