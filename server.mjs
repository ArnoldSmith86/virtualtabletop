import path from 'path';
import express from 'express';
import http from 'http';

import WebSocket from './server/websocket.mjs';
import Player from './server/player.mjs';
import Room from './server/room.mjs';

const __dirname = path.resolve();
const app = express();
const server = http.Server(app);

app.use('/', express.static(__dirname + '/client'));

app.get('/', function(req, res) {
  res.redirect(Math.random().toString(36).substring(3, 7));
});

app.get('/:id', function(req, res) {
  res.sendFile(__dirname + '/client/room.html');
});

server.listen(process.env.PORT || 8272, function() {
  console.log('Listening on ' + server.address().port);
});

const activeRooms = new Map();
const ws = new WebSocket(8273, function(connection, room) {
  if(!activeRooms.has(room))
    activeRooms.set(room, new Room(room));
  console.log(`adding player to room ${room}`);
  activeRooms.get(room).addPlayer(new Player(connection, activeRooms.get(room)));
});
