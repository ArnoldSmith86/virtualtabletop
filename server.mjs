import fs from 'fs';
import path from 'path';
import express from 'express';
import bodyParser from 'body-parser';
import http from 'http';

import WebSocket from './server/websocket.mjs';
import Player from './server/player.mjs';
import Room from './server/room.mjs';
import PCIO from './server/pcioimport.mjs';

const __dirname = path.resolve();
const app = express();
const server = http.Server(app);

fs.mkdirSync(__dirname + '/save/rooms', { recursive: true });

app.use('/', express.static(__dirname + '/client'));

app.post('/quit', function(req, res) {
  process.exit();
});

app.use(bodyParser.raw({
  limit: '100mb'
}))

app.get('/', function(req, res) {
  res.redirect(Math.random().toString(36).substring(3, 7));
});

app.get('/:id', function(req, res) {
  res.sendFile(__dirname + '/client/room.html');
});

app.put('/:id', function(req, res) {
  activeRooms.get(req.params.id).setState(PCIO(req.body));
  res.send();
});

server.listen(process.env.PORT || 8272, function() {
  console.log('Listening on ' + server.address().port);
});

const activeRooms = new Map();
const ws = new WebSocket(8273, function(connection, roomID) {
  if(!activeRooms.has(roomID)) {
    activeRooms.set(roomID, new Room(roomID, function() {
      activeRooms.delete(roomID);
    }));
  }
  console.log(`adding player to room ${roomID}`);
  activeRooms.get(roomID).addPlayer(new Player(connection, activeRooms.get(roomID)));
});

['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'uncaughtException', 'SIGTERM'].forEach((eventType) => {
  process.on(eventType, function() {
    for(const [ _, room ] of activeRooms)
      room.unload();
    if(eventType != 'exit')
      process.exit();
  });
})
