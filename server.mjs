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
import Config     from './server/config.mjs';
import Statistics from './server/statistics.mjs';

const app = express();
const server = http.Server(app);
const router = express.Router();

const savedir = Config.directory('save');
const assetsdir = Config.directory('assets');
const sharedLinks = fs.existsSync(savedir + '/shares.json') ? JSON.parse(fs.readFileSync(savedir + '/shares.json')) : {};

const serverStart = +new Date();

app.use(Config.get('urlPrefix'), router);

fs.mkdirSync(assetsdir, { recursive: true });
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

function validateInput(res, next, values) {
  for(const value of values) {
    if(value && !value.match(/^[A-Za-z0-9.: _-]+$/)) {
      next(new Logging.UserError(403, 'Invalid characters in parameters'));
      return false;
    }
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
    for(const [ _, room ] of activeRooms) {
      try {
        room.updateTimeStatistics();
        room.writeToFilesystem();
      } catch(e) {
        Logging.handleGenericException('autosaveRooms', e);
      }
    }
    Statistics.writeToFilesystem();
  }, 60*1000);
}

MinifyRoom().then(function(result) {
  router.use('/', express.static(path.resolve() + '/client'));

  // fonts.css is specifically made available for use from card html iframe. It must
  // be fetched from the root in order for the relative paths to fonts to work.
  // Additionally allow cached use of fonts for a short period of time to allow
  // immediate rendering in subframes.
  function cache5m(req, res, next) {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Expires', new Date(Date.now() + 300000).toUTCString());
    next();
  }
  router.get('/fonts.css', cache5m);
  router.get('/i/fonts/', cache5m);
  router.use('/fonts.css', express.static(path.resolve() + '/client/css/fonts.css'));

  router.use('/i', express.static(path.resolve() + '/assets'));

  router.get('/scripts/:name', function(req, res) {
    res.setHeader('Content-Type', 'application/javascript');
    if(req.params.name == 'jszip')
      res.send(fs.readFileSync('node_modules/jszip/dist/jszip.min.js'));
  });

  router.post('/assetcheck', bodyParser.json({ limit: '10mb' }), function(req, res) {
    const result = {};
    if(Array.isArray(req.body))
      for(const asset of req.body)
        if(asset.match(/^[0-9_-]+$/))
          result[asset] = !!Config.resolveAsset(asset);
    res.send(result);
  });

  router.get('/assets/:game/:name', function(req, res) {
    const highest_allowed_directory = path.join(Config.directory('library'), "games") + "/";
    const filepath = path.join(highest_allowed_directory, req.params.game, "assets", req.params.name);
    // security guard against escaping the highest_allowed_directory
    if (filepath.indexOf(highest_allowed_directory) !== 0) {
      res.sendStatus(404);
    }

    fs.access(filepath, fs.F_OK, (err) => {
      if (err) {
        res.sendStatus(404);
      } else {
        res.sendFile(filepath);
      }
    });
  });

  router.get('/assets/:name', function(req, res) {
    if(!req.params.name.match(/^[0-9_-]+$/) || !Config.resolveAsset(req.params.name)) {
      res.sendStatus(404);
      return;
    }

    fs.readFile(Config.resolveAsset(req.params.name), function(err, content) {
      if(!content) {
        res.sendStatus(404);
        Logging.log(`WARNING: Could not load asset ${req.params.name}`);
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
        Logging.log(`WARNING: Unknown file type of asset ${req.params.name}`);

      res.setHeader('Cache-Control', 'public, max-age=30000000');
      res.setHeader('Expires', new Date(Date.now() + 30000000000).toUTCString());
      res.send(content);
    });
  });

  router.post('/heapsnapshot', function(req, res) {
    v8.getHeapSnapshot().pipe(fs.createWriteStream('memory.heapsnapshot'));
  });

  router.post('/quit', function(req, res) {
    process.exit();
  });

  router.get('/', function(req, res) {
    let id = null;
    while(!id || fs.existsSync(savedir + '/rooms/' + id + '.json'))
      id = Math.random().toString(36).substring(3, 7);
    res.redirect(id);
  });

  router.get('/dl/:room/:state/:variant', function(req, res, next) {
    downloadState(res, req.params.room, req.params.state, req.params.variant).catch(next);
  });

  router.get('/dl/:room/:state', function(req, res, next) {
    downloadState(res, req.params.room, req.params.state).catch(next);
  });

  router.get('/dl/:room', function(req, res, next) {
    downloadState(res, req.params.room).catch(next);
  });

  function allowCORS(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(200);
  }

  router.options('/state/:room', allowCORS);

  router.get('/state/:room', function(req, res, next) {
    ensureRoomIsLoaded(req.params.room).then(function(isLoaded) {
      if(isLoaded) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        const state = {...activeRooms.get(req.params.room).state};
        delete state._meta;
        res.send(JSON.stringify(state, null, '  '));
      }
    }).catch(next);
  });

  router.put('/state/:room', bodyParser.json({ limit: '10mb' }), function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
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

  router.options('/api/addShareToRoom/:room/:share', allowCORS);
  router.get('/api/addShareToRoom/:room/:share', function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if(!sharedLinks[`/s/${req.params.share}`])
      return res.sendStatus(404);

    const tokens = sharedLinks[`/s/${req.params.share}`].split('/');
    ensureRoomIsLoaded(req.params.room).then(function(isLoaded) {
      if(isLoaded) {
        activeRooms.get(req.params.room).addState(req.params.share, 'link', `${Config.get('externalURL')}/s/${req.params.share}/name.vtt`, '');
        res.send('OK');
      }
    }).catch(next);
  });

  router.options('/api/shareDetails/:share', allowCORS);
  router.get('/api/shareDetails/:share', function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if(!sharedLinks[`/s/${req.params.share}`])
      return res.sendStatus(404);

    const tokens = sharedLinks[`/s/${req.params.share}`].split('/');
    ensureRoomIsLoaded(tokens[2]).then(function(isLoaded) {
      if(isLoaded) {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(activeRooms.get(tokens[2]).state._meta.states[tokens[3]]));
      }
    }).catch(next);
  });

  router.get('/s/:link/:junk', function(req, res, next) {
    if(!sharedLinks[`/s/${req.params.link}`])
      return res.sendStatus(404);

    const tokens = sharedLinks[`/s/${req.params.link}`].split('/');
    downloadState(res, tokens[2], tokens[3]).catch(next);
  });

  router.get('/share/:room/:state', function(req, res, next) {
    const target = `/dl/${req.params.room}/${req.params.state}`;
    for(const link in sharedLinks)
      if(sharedLinks[link] == target)
        return res.send(Config.get('urlPrefix') + link);

    ensureRoomIsLoaded(req.params.room).then(function(isLoaded) {
      if(isLoaded)
        activeRooms.get(req.params.room).writeToFilesystem();

      const newLink = `/s/${Math.random().toString(36).substring(3, 11)}`;
      sharedLinks[newLink] = target;
      fs.writeFileSync(savedir + '/shares.json', JSON.stringify(sharedLinks));
      res.send(Config.get('urlPrefix') + newLink);
    }).catch(next);
  });

  router.get('/:room', function(req, res, next) {
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

  router.get('/createTempState/:room', function(req, res, next) {
    ensureRoomIsLoaded(req.params.room).then(async function(isLoaded) {
      if(isLoaded)
        res.send(await activeRooms.get(req.params.room).createTempState());
    }).catch(next);
  });

  router.put('/createTempState/:room/:tempID', bodyParser.raw({ limit: '500mb' }), function(req, res, next) {
    ensureRoomIsLoaded(req.params.room).then(async function(isLoaded) {
      if(isLoaded && req.params.tempID.match(/^[a-z0-9]{8}$/))
        res.send(await activeRooms.get(req.params.room).createTempState(req.params.tempID, req.body));
    }).catch(next);
  });

  router.put('/asset', bodyParser.raw({ limit: '10mb' }), function(req, res) {
    const filename = `/${CRC32.buf(req.body)}_${req.body.length}`;
    if(!Config.resolveAsset(filename.substr(1)))
      fs.writeFileSync(assetsdir + filename, req.body);
    res.send(`/assets${filename}`);
  });

  router.put('/addState/:room/:id/:type/:name/:addAsVariant?', bodyParser.raw({ limit: '500mb' }), async function(req, res, next) {
    if(!validateInput(res, next, [ req.params.id, req.params.addAsVariant ])) return;
    ensureRoomIsLoaded(req.params.room).then(function(isLoaded) {
      if(isLoaded) {
        activeRooms.get(req.params.room).addState(req.params.id, req.params.type, req.body, req.params.name, req.params.addAsVariant).then(function() {
          res.send('OK');
        }).catch(next);
      }
    }).catch(next);
  });

  router.put('/moveServer/:room/:returnServer/:returnState', bodyParser.raw({ limit: '500mb' }), async function(req, res, next) {
    ensureRoomIsLoaded(req.params.room).then(function(isLoaded) {
      if(isLoaded) {
        activeRooms.get(req.params.room).receiveState(req.body, req.params.returnServer, req.params.returnState).then(function() {
          res.send('OK');
        }).catch(next);
      }
    }).catch(next);
  });

  router.use(Logging.userErrorHandler);

  router.use(Logging.errorHandler);

  server.listen(Config.get('port'), function() {
    Logging.log(`Listening on ${server.address().port}`);
  });
});

const activeRooms = new Map();
const ws = new WebSocket(server, serverStart, function(connection, { playerName, roomID }) {
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
    Statistics.writeToFilesystem();
    if(eventType != 'exit')
      process.exit();
  });
});
