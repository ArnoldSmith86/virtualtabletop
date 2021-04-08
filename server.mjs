import fs from 'fs';
import path from 'path';
import v8 from 'v8';

import express from 'express';
import bodyParser from 'body-parser';
import http from 'http';
import CRC32 from 'crc-32';

import WebSocket  from './server/websocket.mjs';
import Player     from './server/player.mjs';
import Room       from './server/room.mjs';
import MinifyRoom from './server/minify.mjs';
import Logging    from './server/logging.mjs';

const app = express();
const server = http.Server(app);

const savedir = path.resolve() + '/save';
const sharedLinks = fs.existsSync(savedir + '/shares.json') ? JSON.parse(fs.readFileSync(savedir + '/shares.json')) : {};

fs.mkdirSync(savedir + '/assets', { recursive: true });
fs.mkdirSync(savedir + '/rooms',  { recursive: true });
fs.mkdirSync(savedir + '/states', { recursive: true });
fs.mkdirSync(savedir + '/links',  { recursive: true });
fs.mkdirSync(savedir + '/errors', { recursive: true });

async function ensureRoomIsLoaded(id) {
  if(!id.match(/^[A-Za-z0-9_-]+$/))
    return false;
  if(!activeRooms.has(id)) {
    const room = new Room(id, function() {
      activeRooms.delete(id);
    });
    await room.load();
    activeRooms.set(id, room);
  }
  return true;
}

async function downloadState(res, roomID, stateID, variantID) {
  if(await ensureRoomIsLoaded(roomID)) {
    const d = await activeRooms.get(roomID).download(stateID, variantID);
    res.setHeader('Content-Type', d.type);
    res.setHeader('Content-Disposition', `attachment; filename="${d.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
    res.send(d.content);
  }
}

function autosaveRooms() {
  setInterval(function() {
    for(const [ _, room ] of activeRooms)
      room.writeToFilesystem();
  }, 60*1000);
}

MinifyRoom().then(function(result) {
  app.use('/', express.static(path.resolve() + '/client'));
  app.use('/i', express.static(path.resolve() + '/assets'));
  app.use('/library', express.static(path.resolve() + '/library'));

  app.get('/assets/:name', function(req, res) {
    if(!req.params.name.match(/^[0-9_-]+$/))
      return;
    fs.readFile(savedir + '/assets/' + req.params.name, function(err, content) {
      if(!content) {
        res.sendStatus(404);
        console.log(new Date().toISOString(), 'WARNING: Could not load asset ' + req.params.name);
        return;
      }

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
        console.log(new Date().toISOString(), 'WARNING: Unknown file type of asset ' + req.params.name);

      res.send(content);
    });
  });

  app.post('/heapsnapshot', function(req, res) {
    v8.getHeapSnapshot().pipe(fs.createWriteStream('memory.heapsnapshot'));
  });

  app.post('/quit', function(req, res) {
    process.exit();
  });

  app.get('/', function(req, res) {
    res.redirect(Math.random().toString(36).substring(3, 7));
  });

  app.get('/dl/:room/:state/:variant', function(req, res, next) {
    downloadState(res, req.params.room, req.params.state, req.params.variant).catch(next);
  });

  app.get('/dl/:room/:state', function(req, res, next) {
    downloadState(res, req.params.room, req.params.state).catch(next);
  });

  app.get('/dl/:room', function(req, res, next) {
    downloadState(res, req.params.room).catch(next);
  });

  app.get('/state/:room', async function(req, res, next) {
    ensureRoomIsLoaded(req.params.room).then(function(isLoaded) {
      if(isLoaded) {
        res.setHeader('Content-Type', 'application/json');
        const state = {...activeRooms.get(req.params.room).state};
        delete state._meta;
        res.send(JSON.stringify(state, null, '  '));
      }
    }).catch(next);
  });

  app.use(bodyParser.json({
    limit: '10mb'
  }));
  app.put('/state/:room', function(req, res, next) {
    if(typeof req.body == 'object') {
      ensureRoomIsLoaded(req.params.room).then(function(isLoaded) {
        if(isLoaded) {
          activeRooms.get(req.params.room).setState(req.body);
          res.send('OK');
        }
      }).catch(next);
    } else {
      res.send('not a valid JSON object');
    }
  });

  app.get('/s/:link/:junk', function(req, res, next) {
    if(!sharedLinks[`/s/${req.params.link}`])
      return res.status(404);

    const tokens = sharedLinks[`/s/${req.params.link}`].split('/');
    downloadState(res, tokens[2], tokens[3]).catch(next);
  });

  app.get('/share/:room/:state', function(req, res) {
    const target = `/dl/${req.params.room}/${req.params.state}`;
    for(const link in sharedLinks)
      if(sharedLinks[link] == target)
        return res.send(link);

    const newLink = `/s/${Math.random().toString(36).substring(3, 11)}`;
    sharedLinks[newLink] = target;
    fs.writeFileSync(savedir + '/shares.json', JSON.stringify(sharedLinks));
    res.send(newLink);
  });

  app.get('/:room', function(req, res, next) {
    ensureRoomIsLoaded(req.params.room).then(function(isLoaded) {
      if(!isLoaded) {
        res.send('Invalid characters in room ID.');
        return;
      }
      if(req.headers['accept-encoding'] && req.headers['accept-encoding'].match(/\bgzip\b/)) {
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Type', 'text/html');
        res.send(result.gzipped);
      } else {
        res.send(result.min);
      }
    }).catch(next);
  });

  app.use(bodyParser.raw({
    limit: '100mb'
  }));

  app.put('/asset', function(req, res) {
    const filename = `/assets/${CRC32.buf(req.body)}_${req.body.length}`;
    if(!fs.existsSync(path.resolve() + '/save' + filename))
      fs.writeFileSync(path.resolve() + '/save' + filename, req.body);
    res.send(filename);
  });

  app.use(Logging.userErrorHandler);

  app.use(Logging.errorHandler);

  server.listen(process.env.PORT || 8272, function() {
    console.log(new Date().toISOString(), 'Listening on ' + server.address().port);
  });
});

const activeRooms = new Map();
const ws = new WebSocket(server, function(connection, { playerName, roomID }) {
  ensureRoomIsLoaded(roomID).then(function(isLoaded) {
    if(isLoaded)
      activeRooms.get(roomID).addPlayer(new Player(connection, playerName, activeRooms.get(roomID)));
  }).catch(e=>Logging.handleGenericException(`player ${playerName} connected to room ${roomID}`, e));
});

autosaveRooms();

['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'].forEach((eventType) => {
  process.on(eventType, function() {
    for(const [ _, room ] of activeRooms)
      room.unload();
    if(eventType != 'exit')
      process.exit();
  });
});
