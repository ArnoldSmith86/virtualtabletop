import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

import express from 'express';
import bodyParser from 'body-parser';
import http from 'http';

import minify from '@node-minify/core';
import cleanCSS from '@node-minify/clean-css';
import uglifyES from '@node-minify/uglify-es';
import htmlMinifier from '@node-minify/html-minifier';

import WebSocket from './server/websocket.mjs';
import Player from './server/player.mjs';
import Room from './server/room.mjs';
import PCIO from './server/pcioimport.mjs';

const __dirname = path.resolve();
const app = express();
const server = http.Server(app);

fs.mkdirSync(__dirname + '/save/assets', { recursive: true });
fs.mkdirSync(__dirname + '/save/rooms',  { recursive: true });
fs.mkdirSync(__dirname + '/save/states', { recursive: true });

let roomHTML = fs.readFileSync(__dirname + '/client/room.html', {encoding:'utf8'});
let gzippedRoomHTML = '';
minify({
  compressor: cleanCSS,
  input: [
    'client/css/layout.css',
    'client/css/overlays/players.css',
    'client/css/overlays/states.css',
    'client/css/widgets/spinner.css'
  ],
  output: '/tmp/out.css'
}).then(function(min) {
  roomHTML = roomHTML.replace(/ \{\{CSS\}\} /, min);
  return minify({
    compressor: uglifyES,
    input: [
      'client/js/domhelpers.js',
      'client/js/connection.js',
      'client/js/draggable.js',
      'client/js/widgets/widget.js',
      'client/js/widgets/basicwidget.js',
      'client/js/widgets/spinner.js',
      'client/js/overlays/players.js',
      'client/js/overlays/states.js',
      'client/js/main.js'
    ],
    output: '/tmp/out.js'
  });
}).then(function(min) {
  return minify({
    compressor: htmlMinifier,
    content: roomHTML.replace(/ \{\{JS\}\} /, min)
  })
}).then(function(min) {
  roomHTML = min;
  zlib.gzip(min, (err, buffer) => gzippedRoomHTML = buffer);
});

app.use('/', express.static(__dirname + '/client'));

app.use('/assets', express.static(__dirname + '/save/assets'));

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
  if(req.headers['accept-encoding'].match(/\bgzip\b/)) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Content-Type', 'text/html');
    res.send(gzippedRoomHTML);
  } else {
    res.send(roomHTML);
  }
});

app.put('/:id', function(req, res) {
  PCIO(req.body).then(state => activeRooms.get(req.params.id).setState(state));
  res.send();
});

server.listen(process.env.PORT || 8272, function() {
  console.log('Listening on ' + server.address().port);
});

const activeRooms = new Map();
const ws = new WebSocket(server, function(connection, { playerName, roomID }) {
  if(!activeRooms.has(roomID)) {
    activeRooms.set(roomID, new Room(roomID, function() {
      activeRooms.delete(roomID);
    }));
  }
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
