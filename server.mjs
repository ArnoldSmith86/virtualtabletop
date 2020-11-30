import fs from 'fs';
import path from 'path';

import express from 'express';
import bodyParser from 'body-parser';
import http from 'http';

import WebSocket  from './server/websocket.mjs';
import Player     from './server/player.mjs';
import Room       from './server/room.mjs';
import MinifyRoom from './server/minify.mjs';

const __dirname = path.resolve();
const app = express();
const server = http.Server(app);

fs.mkdirSync(__dirname + '/save/assets', { recursive: true });
fs.mkdirSync(__dirname + '/save/rooms',  { recursive: true });
fs.mkdirSync(__dirname + '/save/states', { recursive: true });
fs.mkdirSync(__dirname + '/save/errors', { recursive: true });

function ensureRoomIsLoaded(id) {
  if(!activeRooms.has(id)) {
    activeRooms.set(id, new Room(id, function() {
      activeRooms.delete(id);
    }));
  }
}

function downloadState(res, roomID, stateID, variantID) {
  ensureRoomIsLoaded(roomID);
  activeRooms.get(roomID).download(stateID, variantID).then(function(d) {
    res.setHeader('Content-Type', d.type);
    res.setHeader('Content-Disposition', `attachment; filename="${d.name}"`);
    res.send(d.content);
  });
}

MinifyRoom().then(function(result) {
  app.use('/', express.static(__dirname + '/client'));
  app.use('/i', express.static(__dirname + '/assets'));

  app.get('/assets/:name', function(req, res) {
    fs.readFile(__dirname + '/save/assets/' + req.params.name, function(err, content) {
      if(content[0] == 0xff)
        res.setHeader('Content-Type', 'image/jpeg');
      else if(content[0] == 0x89)
        res.setHeader('Content-Type', 'image/png');
      else if(content[0] == 0x3c)
        res.setHeader('Content-Type', 'image/svg+xml');
      else if(content[0] == 0x47)
        res.setHeader('Content-Type', 'image/gif');
      else if(content[0] == 0x52)
        res.setHeader('Content-Type', 'image/webp');
      else
        console.log('WARNING: Unknown file type of asset ' + req.params.name);
      res.send(content);
    });
  });

  app.post('/quit', function(req, res) {
    process.exit();
  });

  app.use(bodyParser.raw({
    limit: '100mb'
  }))

  app.get('/', function(req, res) {
    res.redirect(Math.random().toString(36).substring(3, 7));
  });

  app.get('/dl/:room/:state/:variant', function(req, res) {
    downloadState(res, req.params.room, req.params.state, req.params.variant);
  });

  app.get('/dl/:room/:state', function(req, res) {
    downloadState(res, req.params.room, req.params.state);
  });

  app.get('/:id', function(req, res) {
    if(req.headers['accept-encoding'] && req.headers['accept-encoding'].match(/\bgzip\b/)) {
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Type', 'text/html');
      res.send(result.gzipped);
    } else {
      res.send(result.min);
    }
  });

  server.listen(process.env.PORT || 8272, function() {
    console.log('Listening on ' + server.address().port);
  });
});

const activeRooms = new Map();
const ws = new WebSocket(server, function(connection, { playerName, roomID }) {
  ensureRoomIsLoaded(roomID);
  activeRooms.get(roomID).addPlayer(new Player(connection, playerName, activeRooms.get(roomID)));
});

['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'].forEach((eventType) => {
  process.on(eventType, function() {
    for(const [ _, room ] of activeRooms)
      room.unload();
    if(eventType != 'exit')
      process.exit();
  });
});
