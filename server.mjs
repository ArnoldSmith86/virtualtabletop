import fs from 'fs';
import path from 'path';
import v8 from 'v8';

import express from 'express';
import bodyParser from 'body-parser';
import http from 'http';
import CRC32 from 'crc-32';
import fetch from 'node-fetch';
import crawlers from 'crawler-user-agents' assert { type: 'json' };;

import WebSocket  from './server/websocket.mjs';
import Player     from './server/player.mjs';
import Room       from './server/room.mjs';
import MinifyHTML from './server/minify.mjs';
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
    }, function() {
      Logging.log(`The public library was edited in room ${id}. Reloading in every room...`);
      for(const [ _, room ] of activeRooms)
        room.reloadPublicLibraryGames();
    });
    await room.load();
    activeRooms.set(id, room);
  }
  return true;
}

function getEmptyRoomID() {
  let id = null;
  while(!id || fs.existsSync(savedir + '/rooms/' + id + '.json'))
    id = Math.random().toString(36).substring(3, 7);
  return id;
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

MinifyHTML().then(function(result) {
  router.use('/', express.static(path.resolve() + '/client'));

  if(Config.get('adminURL')) {
    router.get(Config.get('adminURL'), function(req, res, next) {
      let output = '<h1>Active rooms</h1>';
      for(const [ roomID, room ] of activeRooms) {
        let game = '';
        if(room.state && room.state._meta && room.state._meta.activeState && room.state._meta.states && room.state._meta.states[room.state._meta.activeState.stateID])
          game = ` playing ${room.state._meta.states[room.state._meta.activeState.stateID].name}`;
        output += `<p><b><a href='${roomID}'>${roomID}</a></b>${game}: ${room.players.map(p=>p.name).join(', ')} (${room.deltaID} deltas transmitted)</p>`;
      }
      res.send(output);
    });
  }

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
    res.redirect(getEmptyRoomID());
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
      } else {
        res.status(404).send('Invalid room.');
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
        } else {
          res.status(404).send('Invalid room.');
        }
      }).catch(next);
    } else {
      res.send('not a valid JSON object');
    }
  });

  router.options('/api/addShareToRoom/:room/:share', allowCORS);
  router.get('/api/addShareToRoom/:room/:share', function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const isPublicLibraryGame = req.params.share.match(/^PL:(game|tutorial):([a-z-]+)$/);
    if(!isPublicLibraryGame && !sharedLinks[`/s/${req.params.share}`])
      return res.sendStatus(404);

    ensureRoomIsLoaded(req.params.room).then(async function(isLoaded) {
      if(isLoaded) {
        const newStateID = await activeRooms.get(req.params.room).addShare(req.params.share);
        res.send(newStateID);
      } else {
        res.status(404).send('Invalid room.');
      }
    }).catch(next);
  });

  async function shareDetails(shareID) {
    const isPublicLibraryGame = shareID.match(/^PL:(game|tutorial):([a-z-]+)$/);
    if(!isPublicLibraryGame && !sharedLinks[`/s/${shareID}`])
      return null;

    const roomID  = isPublicLibraryGame ? 'dummy' : sharedLinks[`/s/${shareID}`].split('/')[2];
    const stateID = isPublicLibraryGame ? shareID : sharedLinks[`/s/${shareID}`].split('/')[3];

    if(!await ensureRoomIsLoaded(roomID))
      return null;

    return Object.assign({}, activeRooms.get(roomID).getStateDetails(stateID), { emptyRoomID: getEmptyRoomID() });
  }
  router.options('/api/shareDetails/:share', allowCORS);
  router.get('/api/shareDetails/:share', async function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const details = await shareDetails(req.params.share);
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(details));
    } catch(e) {
      return res.status(404).send('Invalid share.');
    }
  });

  router.get('/s/:link/:junk', function(req, res, next) {
    if(!sharedLinks[`/s/${req.params.link}`])
      return res.status(404).send('Invalid share.');

    const tokens = sharedLinks[`/s/${req.params.link}`].split('/');
    downloadState(res, tokens[2], tokens[3]).catch(next);
  });

  router.get('/share/:room/:state', function(req, res, next) {
    const target = `/dl/${req.params.room}/${req.params.state}`;
    for(const link in sharedLinks)
      if(sharedLinks[link] == target)
        return res.send(Config.get('urlPrefix') + link.replace(/^\/s\//, '/game/'));

    ensureRoomIsLoaded(req.params.room).then(function(isLoaded) {
      if(isLoaded)
        activeRooms.get(req.params.room).writeToFilesystem();

      const newLink = `/s/${Math.random().toString(36).substring(3, 11)}`;
      sharedLinks[newLink] = target;
      fs.writeFileSync(savedir + '/shares.json', JSON.stringify(sharedLinks));
      res.send(Config.get('urlPrefix') + newLink.replace(/^\/s\//, '/game/'));
    }).catch(next);
  });

  router.get('/edit.js', function(req, res, next) {
    res.setHeader('Content-Type', 'text/javascript');
    if(req.headers['accept-encoding'] && req.headers['accept-encoding'].match(/\bgzip\b/)) {
      res.setHeader('Content-Encoding', 'gzip');
      res.send(result.editorJSgzipped);
    } else {
      res.send(result.editorJSmin);
    }
  });

  function createBotPattern(crawlers) {
    // Join all the patterns using the | operator
    const combinedPattern = crawlers.filter(c => c.pattern!='HeadlessChrome').map(c => c.pattern).join('|');

    // Create and return the compiled regex pattern
    return new RegExp(combinedPattern);
  }
  const botPattern = createBotPattern(crawlers);

  router.get('/:room', gameRoomHandler);
  router.get('/game/:plName', gameRoomHandler);
  router.get('/game/:shareID/:name', gameRoomHandler);
  router.get('/tutorial/:plName', gameRoomHandler);
  async function gameRoomHandler(req, res, next) {
    try {
      if(!String(req.params.room).match(/^[A-Za-z0-9_-]+$/)) {
        res.send('Invalid characters in room ID.');
        return;
      }

      if(botPattern.test(req.headers['user-agent'])) {
        let ogOutput = `<meta property="og:title" content="${Config.get('serverName')}" />`;
        res.setHeader('Content-Type', 'text/html');

        if(req.params.room) {
          if(await ensureRoomIsLoaded(req.params.room)) {
            const room = activeRooms.get(req.params.room);
            let game = null;
            if(room.state && room.state._meta && room.state._meta.activeState && room.state._meta.states && room.state._meta.states[room.state._meta.activeState.stateID])
              game = room.state._meta.states[room.state._meta.activeState.stateID];

            if(game) {
              ogOutput += `<meta property="og:description" content="Come play the game ${game.name} with me!" />`;
              ogOutput += `<meta property="og:image" content="${Config.get('externalURL')}/${game.image ? game.image.substr(1) : 'i/branding/android-512.png'}" />`;
            } else {
              ogOutput += `<meta property="og:description" content="Come play with me!" />`;
              ogOutput += `<meta property="og:image" content="${Config.get('externalURL')}/i/branding/android-512.png" />`;
            }
          }
        } else {
          const share = await shareDetails(req.params.shareID || `PL:${req.url.split('/')[1]}:${req.params.plName}`);
          if(share && req.url.split('/')[1] == 'tutorial') {
            ogOutput += `<meta property="og:description" content="Come look at the tutorial ${share.name}!" />`;
            ogOutput += `<meta property="og:image" content="${Config.get('externalURL')}/${share.image ? share.image.substr(1) : 'i/branding/android-512.png'}" />`;
          } else if(share) {
            ogOutput += `<meta property="og:description" content="Come play the game ${share.name} with your friends!" />`;
            ogOutput += `<meta property="og:image" content="${Config.get('externalURL')}/${share.image ? share.image.substr(1) : 'i/branding/android-512.png'}" />`;
          } else {
            ogOutput += `<meta property="og:description" content="Come play with your friends!" />`;
            ogOutput += `<meta property="og:image" content="${Config.get('externalURL')}/i/branding/android-512.png" />`;
          }
        }

        ogOutput += `<p>Your browser identifies as a bot and therefor only receives metadata. Please use a different browser and/or <a href="https://github.com/ArnoldSmith86/virtualtabletop/issues/new">open an issue on GitHub</a>.</p>`;
        res.send(ogOutput);
      } else {
        res.setHeader('Content-Type', 'text/html');
        if(req.headers['accept-encoding'] && req.headers['accept-encoding'].match(/\bgzip\b/)) {
          res.setHeader('Content-Encoding', 'gzip');
          res.send(result.gzipped);
        } else {
          res.send(result.min);
        }
      }
    } catch(e) {
      next(e);
    }
  }

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

  router.put('/asset/:link', async function(req, res) {
    try {
      const content = Buffer.from(await (await fetch(req.params.link)).arrayBuffer());
      const filename = `/${CRC32.buf(content)}_${content.length}`;
      if(!Config.resolveAsset(filename.substr(1)))
        fs.writeFileSync(assetsdir + filename, content);
      res.send(`/assets${filename}`);
    } catch(e) {
      res.status(404).send('Downloading external asset failed.');
    }
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

  router.get('/saveCurrentState/:room/:mode/:name', async function(req, res, next) {
    if(!validateInput(res, next, [ req.params.mode ])) return;
    ensureRoomIsLoaded(req.params.room).then(function(isLoaded) {
      if(isLoaded) {
        activeRooms.get(req.params.room).saveCurrentState(req.params.mode, req.params.name);
        res.send('OK');
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

  router.put('/clientError', bodyParser.json({ limit: '50mb' }), function(req, res, next) {
    if(typeof req.body == 'object') {
      const errorID = Math.random().toString(36).substring(2, 10);
      fs.writeFileSync(savedir + '/errors/' + errorID + '.json', JSON.stringify(req.body, null, '  '));
      Logging.log(`ERROR: Client error ${errorID}: ${req.body.message}`);
      res.send(errorID);
    } else {
      res.send('not a valid JSON object');
    }
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
