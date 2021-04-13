import ws from 'ws';

import Connection from './connection.mjs';

export default class WebSocket {
  connections = [];

  constructor(server, serverStart, newPlayerCallback) {
    this.server = new ws.Server({ noServer: true });
    this.serverStart = serverStart;
    this.newPlayerCallback = newPlayerCallback;

    this.server.on('connection', this.newConnection);

    server.on('upgrade', (request, socket, head) => {
      this.server.handleUpgrade(request, socket, head, socket => {
        this.server.emit('connection', socket, request);
      });
    });
  }

  newConnection = ws => {
    this.connections.push(new Connection(this, ws, this.newPlayerCallback));
  }
}
