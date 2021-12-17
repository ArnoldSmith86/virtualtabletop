import { WebSocketServer } from 'ws';

import Connection from './connection.mjs';

export default class WebSocket {
  constructor(server, serverStart, newPlayerCallback) {
    this.server = new WebSocketServer({ noServer: true });
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
    new Connection(this, ws, this.newPlayerCallback);
  }
}
