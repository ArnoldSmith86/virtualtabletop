import fs from 'fs';
import path from 'path';
import v8 from 'v8';

import express from 'express';
import http from 'http';
import CRC32 from 'crc-32';

import AssetType  from './server/assettype.mjs';
import WebSocket  from './server/websocket.mjs';
import FileLoader from './server/fileloader.mjs';
import FileUpdater from './server/fileupdater.mjs';
import FileWriter from './server/filewriter.mjs';
import TTS        from './server/ttsimport.mjs';
import Player     from './server/player.mjs';
import Room, { pathSafeRoomID } from './server/room.mjs';
import Collections from './server/collections.mjs';
import PublicRooms from './server/publicrooms.mjs';
import LibraryDecks from './server/librarydecks.mjs';
import { readEmojiVariants } from './server/emojivariants.mjs';
import MinifyHTML from './server/minify.mjs';
import Logging    from './server/logging.mjs';
import Config     from './server/config.mjs';
import Statistics from './server/statistics.mjs';

let crawlers = [];
try { crawlers = JSON.parse(fs.readFileSync('node_modules/crawler-user-agents/crawler-user-agents.json', 'utf8')); } catch {}

const app = express();
const server = http.Server(app);
const router = express.Router();

const savedir = Config.directory('save');
const assetsdir = Config.directory('assets');
const sharedLinks = fs.existsSync(savedir + '/shares.json') ? JSON.parse(fs.readFileSync(savedir + '/shares.json')) : {};
const customWidgets = fs.existsSync(path.resolve() + '/assets/widgets.json') ? JSON.parse(fs.readFileSync(path.resolve() + '/assets/widgets.json')) : { widgets: [], groups: [] };
const emojiVariants = readEmojiVariants();


const serverStart = +new Date();

app.use(Config.get('urlPrefix'), router);

fs.mkdirSync(assetsdir, { recursive: true });
fs.mkdirSync(savedir + '/rooms',  { recursive: true });
fs.mkdirSync(savedir + '/states', { recursive: true });
fs.mkdirSync(savedir + '/links',  { recursive: true });
fs.mkdirSync(savedir + '/errors', { recursive: true });
fs.mkdirSync(savedir + '/collections', { recursive: true });

async function ensureRoomIsLoaded(id) {
  if(!id.match(/^[A-Za-z0-9_-]+$/))
    return false;
  if(!activeRooms.has(id)) {
    const room = new Room(id, function() {
      activeRooms.delete(id);
    }, function() {
      Logging.log(`The public library was edited in room ${id}. Reloading in every room...`);
      LibraryDecks.invalidateCache();
      for(const [ _, room ] of activeRooms)
        room.reloadPublicLibraryGames();
    });
    await room.load();
    activeRooms.set(id, room);
  }
  return true;
}

// remembering issued IDs closes the race where a second request draws the same ID
// while the first room is still loading and neither active nor saved to disk
const recentlyIssuedRoomIDs = new Map();
function getEmptyRoomID() {
  let id = null;
  while(!id || activeRooms.has(id) || recentlyIssuedRoomIDs.get(id) > Date.now() - 60000 || fs.existsSync(savedir + '/rooms/' + id + '.json'))
    id = Math.random().toString(36).substring(3, 7);
  for(const [ issuedID, issuedAt ] of recentlyIssuedRoomIDs)
    if(issuedAt < Date.now() - 60000)
      recentlyIssuedRoomIDs.delete(issuedID);
  recentlyIssuedRoomIDs.set(id, Date.now());
  return id;
}

function roomExists(roomID) {
  if(!String(roomID).match(/^[A-Za-z0-9_-]+$/))
    return false;
  return activeRooms.has(roomID) || fs.existsSync(savedir + '/rooms/' + pathSafeRoomID(roomID) + '.json');
}

function roomIsLocked(roomID) {
  const room = activeRooms.get(roomID);
  return !!(room && room.state && room.state._meta && room.state._meta.locked);
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

// the admin of a protected room wants nothing handed out that can be turned back into the game,
// and none of these endpoints carries a collection ID, so they are closed for everybody - the
// admin turns the protection off for as long as they need to export something
function roomContentIsProtected(roomID) {
  const room = activeRooms.get(roomID);
  return !!(room && room.state && room.state._meta && room.state._meta.contentProtected);
}

const contentProtectedMessage = 'The admin of this room protected its content.';

async function downloadState(res, roomID, stateID, variantID) {
  if(await ensureRoomIsLoaded(roomID)) {
    if(roomContentIsProtected(roomID))
      return res.status(403).send(contentProtectedMessage);
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

  // the icon pickers fetch symbols.json whole, so it is served from the buffer that was gzipped at
  // startup; a client that does not accept gzip falls through to express.static below
  const symbolsLastModified = (function() {
    try {
      return fs.statSync(path.resolve() + '/assets/fonts/symbols.json').mtime.toUTCString();
    } catch(e) {
      return null;
    }
  })();
  router.get('/i/fonts/symbols.json', function(req, res, next) {
    res.setHeader('Vary', 'Accept-Encoding');
    if(!result.symbolsGzipped || !req.headers['accept-encoding'] || !req.headers['accept-encoding'].match(/\bgzip\b/))
      return next();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Encoding', 'gzip');
    if(symbolsLastModified)
      res.setHeader('Last-Modified', symbolsLastModified); // express.static sent this - keep revalidation working
    res.send(result.symbolsGzipped);
  });

  router.use('/i', express.static(path.resolve() + '/assets'));

  function sendMinified(req, res, minified, gzipped) {
    // the body depends on the request header, so anything caching this in between has to key on it
    res.setHeader('Vary', 'Accept-Encoding');
    if(req.headers['accept-encoding'] && req.headers['accept-encoding'].match(/\bgzip\b/)) {
      res.setHeader('Content-Encoding', 'gzip');
      res.send(gzipped);
    } else {
      res.send(minified);
    }
  }

  router.get('/scripts/:name', function(req, res, next) {
    if(req.params.name != 'fflate')
      return next();  // without this the request would just hang
    res.setHeader('Content-Type', 'application/javascript');
    sendMinified(req, res, result.fflateMin, result.fflateGzipped);
  });

  router.post('/assetcheck', express.json({ limit: '10mb' }), function(req, res) {
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

      const contentType = AssetType.contentType(content);
      if(contentType)
        res.setHeader('Content-Type', contentType);
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

  async function handleGetState(req, res, next, includeMeta) {
    ensureRoomIsLoaded(req.params.room).then(function(isLoaded) {
      if(isLoaded) {
        if(roomContentIsProtected(req.params.room))
          return res.status(403).send(contentProtectedMessage);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        const roomState = activeRooms.get(req.params.room).state;
        const state = {...roomState};
        delete state._meta;
        if(includeMeta)
          state._meta = { version: roomState._meta.version, gameSettings: roomState._meta.gameSettings };
        res.send(JSON.stringify(state, null, '  '));
      } else {
        res.status(404).send('Invalid room.');
      }
    }).catch(next);
  }

  router.get('/state/:room', function(req, res, next) {
    handleGetState(req, res, next, true);
  });

  router.get('/state/:room/false', function(req, res, next) {
    handleGetState(req, res, next, false);
  });

  router.put('/state/:room', express.json({ limit: '10mb' }), function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if(typeof req.body == 'object') {
      ensureRoomIsLoaded(req.params.room).then(function(isLoaded) {
        if(isLoaded) {
          if(roomIsLocked(req.params.room))
            return res.status(403).send('Room is locked.');
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

  router.put('/setLegacyMode/:room/:name/:value', function(req, res, next) {
    ensureRoomIsLoaded(req.params.room).then(function(isLoaded) {
      if(isLoaded) {
        if(roomIsLocked(req.params.room))
          return res.status(403).send('Room is locked.');
        activeRooms.get(req.params.room).setLegacyMode(req.params.name, req.params.value);
        res.send('OK');
      }
    }).catch(next);
  });

  router.options('/api/addShareToRoom/:room/:share', allowCORS);
  router.get('/api/addShareToRoom/:room/:share', function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const isPublicLibraryGame = req.params.share.match(/^PL:([a-z-]+):([a-z-]+)$/);
    if(!isPublicLibraryGame && !sharedLinks[`/s/${req.params.share}`])
      return res.sendStatus(404);

    ensureRoomIsLoaded(req.params.room).then(async function(isLoaded) {
      if(isLoaded) {
        if(roomIsLocked(req.params.room))
          return res.status(403).send('Room is locked.');
        const newStateID = await activeRooms.get(req.params.room).addShare(req.params.share);
        res.send(newStateID);
      } else {
        res.status(404).send('Invalid room.');
      }
    }).catch(next);
  });

  async function shareDetails(shareID) {
    const isPublicLibraryGame = shareID.match(/^PL:([a-z-]+):([a-z-]+)$/);
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

  router.get('/api/library/decks', function(req, res, next) {
    LibraryDecks.getIndex().then(function(index) {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(index));
    }).catch(next);
  });

  router.get('/api/library/decks/:library/:game/:file/:deck', function(req, res, next) {
    LibraryDecks.getDeck(req.params.library, req.params.game, req.params.file, req.params.deck).then(function(deck) {
      if(!deck)
        return res.sendStatus(404);
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(deck));
    }).catch(next);
  });

  // the skin tone forms the noto-emoji directory holds, for the pickers' variant flyout: the
  // directory is checked into the repository and does not change while the server runs, so the
  // list is read at startup like the other checked-in data and this hands out what is in memory
  router.get('/api/emojiVariants', function(req, res, next) {
    res.json(emojiVariants);
  });

  router.get('/api/widgets', function(req, res, next) {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(customWidgets));
  });

  router.put('/api/widgets', express.json({ limit: '10mb' }), function(req, res, next) {
    if (!Config.get('allowPublicLibraryEdits')) return res.status(403).send('Public library edits are disabled.');
    const data = req.body;
    if (typeof data === 'object' && data !== null) {
      customWidgets.widgets = Array.isArray(data.widgets) ? data.widgets : [];
      customWidgets.groups = Array.isArray(data.groups) ? data.groups : [];
    }
    FileWriter.writeFileSync(path.resolve() + '/assets/widgets.json', JSON.stringify(customWidgets, null, 2));
    res.send('OK');
  });

  router.get('/api/roomcollection/:collection', function(req, res, next) {
    (async function() {
      if(!Collections.isValidID(req.params.collection))
        return res.status(400).send('Invalid collection ID.');
      const rooms = [];
      for(const roomID of Collections.get(req.params.collection).rooms) {
        // don't let listing instantiate rooms that don't exist (anymore)
        if(!roomExists(roomID))
          continue;
        if(await ensureRoomIsLoaded(roomID))
          rooms.push(await activeRooms.get(roomID).getRoomDetails(req.params.collection));
      }
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({ rooms }));
    })().catch(next);
  });

  // the response is the same for everyone, so cache it briefly: it makes the anonymous
  // endpoint cheap to poll and keeps idle public rooms from being loaded from disk on every request
  let publicRoomsCache = null;
  router.get('/api/publicrooms', function(req, res, next) {
    (async function() {
      if(!publicRoomsCache || publicRoomsCache.time < Date.now() - 10000) {
        const rooms = [];
        for(const roomID of PublicRooms.get()) {
          try {
            // heal the list when a published room was deleted or its file was removed
            if(!roomExists(roomID)) {
              PublicRooms.remove(roomID);
              continue;
            }
            if(await ensureRoomIsLoaded(roomID)) {
              if(activeRooms.get(roomID).isPublic()) {
                const details = await activeRooms.get(roomID).getRoomDetails(null);
                delete details.players; // the anonymous listing only gets the count, not who is playing
                rooms.push(details);
              } else {
                PublicRooms.remove(roomID);
              }
            }
          } catch(e) {
            Logging.log(`ERROR: skipping room ${roomID} in the public rooms listing: ${e}`);
          }
        }
        publicRoomsCache = { time: Date.now(), body: JSON.stringify({ rooms }) };
      }
      res.setHeader('Content-Type', 'application/json');
      res.send(publicRoomsCache.body);
    })().catch(next);
  });

  router.put('/api/roomcollection/:collection/add/:room', function(req, res, next) {
    if(!Collections.isValidID(req.params.collection) || !req.params.room.match(/^[A-Za-z0-9_-]+$/))
      return res.status(400).send('Invalid collection or room ID.');
    if(!roomExists(req.params.room))
      return res.status(404).send('Room does not exist.');
    if(!Collections.addRoom(req.params.collection, req.params.room))
      return res.status(400).send('Collection is full.');
    res.send('OK');
  });

  router.put('/api/roomcollection/:collection/remove/:room', function(req, res, next) {
    if(!Collections.isValidID(req.params.collection) || !req.params.room.match(/^[A-Za-z0-9_-]+$/))
      return res.status(400).send('Invalid collection or room ID.');
    Collections.removeRoom(req.params.collection, req.params.room);
    res.send('OK');
  });

  router.post('/api/room/:room/:action', express.json({ limit: '10kb' }), function(req, res, next) {
    ensureRoomIsLoaded(req.params.room).then(async function(isLoaded) {
      if(!isLoaded)
        return res.status(404).send('Invalid room.');
      await activeRooms.get(req.params.room).collectionAction(req.params.action, req.body || {});
      publicRoomsCache = null; // publish/unpublish/rename/delete should show up immediately
      res.send('OK');
    }).catch(next);
  });

  router.post('/api/copyRoom', express.json({ limit: '10kb' }), function(req, res, next) {
    (async function() {
      const { source, mode } = req.body || {};
      if(typeof source != 'string' || !source.match(/^[A-Za-z0-9_-]+$/))
        return res.status(400).send('Invalid source room.');
      if(!await ensureRoomIsLoaded(source))
        return res.status(404).send('Invalid room.');
      const sourceRoom = activeRooms.get(source);
      if(!await sourceRoom.mayJoin(req.body.collection, req.body.password))
        return res.status(403).send('Room is password protected.');
      // unlike the download endpoints this one does carry a collection ID, so the admin of a
      // protected room can still copy their own room
      if(sourceRoom.contentIsProtected() && !await sourceRoom.isAdmin(req.body.collection))
        return res.status(403).send(contentProtectedMessage);
      const name = typeof req.body.name == 'string' ? req.body.name : undefined;
      const targetID = getEmptyRoomID();
      await ensureRoomIsLoaded(targetID);
      if(mode == 'link')
        await activeRooms.get(targetID).linkFromRoom(sourceRoom, !!req.body.autoLink, name);
      else
        await activeRooms.get(targetID).copyFromRoom(sourceRoom, name);
      res.send(targetID);
    })().catch(next);
  });

  router.post('/api/decksFromLink', express.json({ limit: '1mb' }), function(req, res, next) {
    (async function() {
      if(typeof req.body != 'object' || req.body === null || typeof req.body.link != 'string' || !req.body.link.match(/^https?:\/\//))
        throw new Logging.UserError(400, 'Please provide a link.');
      // Keep this endpoint TTS-specific: only ever fetch resolved Steam Workshop
      // items, not arbitrary URLs (defense-in-depth against SSRF).
      if(!TTS.isTTSlink(req.body.link))
        throw new Logging.UserError(400, 'Please enter a Tabletop Simulator Steam Workshop link (…/filedetails/?id=…).');

      let states;
      try {
        states = await FileLoader.readStatesFromLink(req.body.link);
      } catch(e) {
        if(e instanceof Logging.UserError)
          throw e;
        Logging.log(`ERROR LOADING FILE: ${e.toString()}`);
        throw new Logging.UserError(404, 'Unable to load and convert the game behind that link.');
      }
      if(!states || typeof states != 'object')
        throw new Logging.UserError(404, 'Unable to load and convert the game behind that link.');

      const decks = [];
      for(const [ stateID, variants ] of Object.entries(states)) {
        const variantList = Object.values(variants || {});
        for(const [ variantIndex, rawVariant ] of variantList.entries()) {
          if(!rawVariant || typeof rawVariant != 'object' || !rawVariant._meta)
            continue;
          let variant;
          try {
            variant = FileUpdater(rawVariant);
          } catch(e) {
            continue;
          }
          const source = variantList.length > 1 ? `${stateID} #${variantIndex + 1}` : stateID;
          const widgets = Object.entries(variant).filter(([ id, w ])=>id != '_meta' && w && typeof w == 'object');

          // single pass over widgets: collect decks and group card counts by deck
          const deckEntries = [];
          const cardCountsByDeck = {};
          for(const [ id, w ] of widgets) {
            if(w.type == 'deck') {
              deckEntries.push([ id, w ]);
            } else if(w.type == 'card' && w.deck != null && w.cardType != null) {
              (cardCountsByDeck[w.deck] || (cardCountsByDeck[w.deck] = {}));
              cardCountsByDeck[w.deck][w.cardType] = (cardCountsByDeck[w.deck][w.cardType] || 0) + 1;
            }
          }
          for(const [ deckID, deck ] of deckEntries) {
            const rawCounts = cardCountsByDeck[deckID] || {};
            // only count cardTypes registered on the deck: addDeckWithCards recreates
            // cards from deck.cardTypes, so the badge stays equal to what gets imported
            const cardTypes = (deck.cardTypes && typeof deck.cardTypes == 'object') ? deck.cardTypes : {};
            const cardCounts = {};
            for(const cardType in rawCounts)
              if(Object.prototype.hasOwnProperty.call(cardTypes, cardType))
                cardCounts[cardType] = rawCounts[cardType];
            decks.push({ deck: Object.assign({}, deck, { id: deckID }), cardCounts, source });
          }
        }
      }
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(decks));
    })().catch(next);
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
      if(isLoaded) {
        if(roomContentIsProtected(req.params.room))
          return res.status(403).send(contentProtectedMessage);
        activeRooms.get(req.params.room).writeToFilesystem();
      }

      const newLink = `/s/${Math.random().toString(36).substring(3, 11)}`;
      sharedLinks[newLink] = target;
      FileWriter.writeFileSync(savedir + '/shares.json', JSON.stringify(sharedLinks));
      res.send(Config.get('urlPrefix') + newLink.replace(/^\/s\//, '/game/'));
    }).catch(next);
  });

  router.get('/edit.js', function(req, res, next) {
    res.setHeader('Content-Type', 'text/javascript');
    sendMinified(req, res, result.editorJSmin, result.editorJSgzipped);
  });

  function createBotPattern(crawlers) {
    if(crawlers.length == 0)
      return new RegExp('^$');

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
  router.get('/game/:shareID/:name/ROOM\\::roomInPath', gameRoomHandler);
  router.get('/tutorial/:plName/ROOM\\::roomInPath', gameRoomHandler);
  router.get('/library/:folder/:plName', gameRoomHandler);
  async function gameRoomHandler(req, res, next) {
    try {
      let roomID = String(req.params.room);
      if(!Config.get('roomNamesCaseSensitive'))
        roomID = roomID.toLowerCase();

      if(!roomID.match(/^[A-Za-z0-9_-]+$/)) {
        res.send('Invalid characters in room ID.');
        return;
      }

      if(botPattern.test(req.headers['user-agent'])) {
        let ogOutput = `<meta property="og:title" content="${Config.get('serverName')}" />`;
        res.setHeader('Content-Type', 'text/html');

        if(roomID) {
          if(await ensureRoomIsLoaded(roomID)) {
            const room = activeRooms.get(roomID);
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
          const routeFolderMap = { game: 'games', tutorial: 'tutorials' };
          const routeFolder = req.params.folder || routeFolderMap[req.url.split('/')[1]] || req.url.split('/')[1];
          const share = await shareDetails(req.params.shareID || `PL:${routeFolder}:${req.params.plName}`);
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
        sendMinified(req, res, result.min, result.gzipped);
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

  router.put('/createTempState/:room/:tempID', express.raw({ limit: '500mb' }), function(req, res, next) {
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
        FileWriter.writeFileSync(assetsdir + filename, content);
      res.send(`/assets${filename}`);
    } catch(e) {
      res.status(404).send('Downloading external asset failed.');
    }
  });

  router.put('/asset', express.raw({ limit: '10mb' }), function(req, res) {
    const filename = `/${CRC32.buf(req.body)}_${req.body.length}`;
    if(!Config.resolveAsset(filename.substr(1)))
      FileWriter.writeFileSync(assetsdir + filename, req.body);
    res.send(`/assets${filename}`);
  });

  async function handleAddState(req, res, next) {
    if(!validateInput(res, next, [ req.params.id, req.params.addAsVariant ])) return;
    ensureRoomIsLoaded(req.params.room).then(function(isLoaded) {
      if(isLoaded) {
        if(roomIsLocked(req.params.room))
          return res.status(403).send('Room is locked.');
        activeRooms.get(req.params.room).addState(req.params.id, req.params.type, req.body, req.params.name, req.params.addAsVariant).then(function() {
          res.send('OK');
        }).catch(next);
      }
    }).catch(next);
  }

  router.put('/addState/:room/:id/:type/:name/:addAsVariant', express.raw({ limit: '500mb' }), handleAddState);
  router.put('/addState/:room/:id/:type/:name', express.raw({ limit: '500mb' }), handleAddState);

  router.get('/saveCurrentState/:room/:mode/:name', async function(req, res, next) {
    if(!validateInput(res, next, [ req.params.mode ])) return;
    ensureRoomIsLoaded(req.params.room).then(function(isLoaded) {
      if(isLoaded) {
        if(roomIsLocked(req.params.room))
          return res.status(403).send('Room is locked.');
        activeRooms.get(req.params.room).saveCurrentState(req.params.mode, req.params.name);
        res.send('OK');
      }
    }).catch(next);
  });

  router.put('/moveServer/:room/:returnServer/:returnState', express.raw({ limit: '500mb' }), async function(req, res, next) {
    ensureRoomIsLoaded(req.params.room).then(function(isLoaded) {
      if(isLoaded) {
        if(roomIsLocked(req.params.room))
          return res.status(403).send('Room is locked.');
        activeRooms.get(req.params.room).receiveState(req.body, req.params.returnServer, req.params.returnState).then(function() {
          res.send('OK');
        }).catch(next);
      }
    }).catch(next);
  });

  const feedbackCooldowns = new Map();
  router.put('/clientError', express.json({ limit: '50mb' }), function(req, res, next) {
    if(typeof req.body == 'object') {
      // the feedback button makes this endpoint one click away for every visitor, so
      // rate limit those reports (crash reports stay unlimited - they can't be spammed
      // without actually crashing the client)
      if(req.body.type == 'feedback') {
        if(feedbackCooldowns.size > 1000)
          for(const [ ip, time ] of feedbackCooldowns)
            if(Date.now() - time > 15000)
              feedbackCooldowns.delete(ip);
        if(Date.now() - (feedbackCooldowns.get(req.ip) || 0) < 15000) {
          res.send('Please wait a few seconds before sending more feedback.');
          return;
        }
        feedbackCooldowns.set(req.ip, Date.now());
      }
      const errorID = Math.random().toString(36).substring(2, 10).padEnd(8, '0');
      fs.writeFileSync(savedir + '/errors/' + errorID + '.json', JSON.stringify(req.body, null, '  '));
      Logging.log(`${req.body.type == 'feedback' ? 'Feedback' : 'ERROR: Client error'} ${errorID}: ${req.body.message}`);
      res.send(errorID);
    } else {
      res.send('not a valid JSON object');
    }
  });

  router.use(Logging.userErrorHandler);

  router.use(Logging.errorHandler);

  server.on('error', function(e) {
    if(server.listening) {
      Logging.handleGenericException('HTTP server', e);
      return;
    }

    const port = Config.get('port');
    // Config.get prefers the environment variable, so pointing at config.json would be the wrong
    // advice for a deployment that sets PORT - the documented way to configure the Docker image
    const portSource = process.env.PORT !== undefined ? 'the PORT environment variable' : '"port" in config.json';
    if(e.code == 'EADDRINUSE')
      Logging.logFatal(`ERROR - Port ${port} is already in use. Stop the program listening on it or set a different port via ${portSource}. If you just restarted VirtualTabletop, wait a few seconds and try again.`);
    else if(e.code == 'EACCES')
      Logging.logFatal(`ERROR - Not allowed to listen on port ${port}. Ports below 1024 usually require root privileges. Run VirtualTabletop with sudo, put it behind a reverse proxy, or set a different port via ${portSource}.`);
    else
      Logging.handleFatalException(`listening on port ${port}`, e);
    process.exit(1);
  });

  server.listen(Config.get('port'), function() {
    Logging.log(`Listening on ${server.address().port}`);
    autosaveRooms();
  });
});

const activeRooms = new Map();
const ws = new WebSocket(server, serverStart, function(connection, { playerName, roomID, collection, password }) {
  ensureRoomIsLoaded(roomID).then(async function(isLoaded) {
    if(!isLoaded)
      return;
    const room = activeRooms.get(roomID);
    if(!await room.mayJoin(collection, password))
      return connection.toClient('passwordRequired', typeof password == 'string');

    // the connection might switch from another room without reconnecting
    if(connection.currentPlayer) {
      connection.currentPlayer.detach();
      connection.currentPlayer.room.removePlayer(connection.currentPlayer);
    }
    const player = new Player(connection, playerName, room, collection);
    connection.currentPlayer = player;
    await room.addPlayer(player);
  }).catch(e=>Logging.handleGenericException(`player ${playerName} connected to room ${roomID}`, e));
});

['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'].forEach((eventType) => {
  process.on(eventType, function() {
    // a process that never took over the port shares its save directory with the instance that
    // did, so it must not write anything back on the way out
    if(server.listening) {
      for(const [ _, room ] of activeRooms)
        room.unload();
      Statistics.writeToFilesystem();
    }
    if(eventType != 'exit')
      process.exit();
  });
});

