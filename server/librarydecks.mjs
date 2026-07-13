import fs from 'fs';
import path from 'path';

import Config from './config.mjs';
import Logging from './logging.mjs';
import Statistics from './statistics.mjs';

// Lazily built catalog of all decks in the public library. Nothing here runs at
// server startup; the cache is generated on the first request to /api/library/decks
// and invalidated when the public library is edited.
let cachePromise = null;

// properties that only make sense in the source game and are stripped before
// a deck (or its cards) gets offered for adding to another game
const contextProperties = [ 'id', 'parent', 'fixedParent', 'owner', 'x', 'y', 'z', 'inheritFrom', 'linkedToSeat', 'onlyVisibleForSeat' ];

function withoutContextProperties(widget) {
  const copy = {...widget};
  for(const property of contextProperties)
    delete copy[property];
  return copy;
}

async function buildCache() {
  const index = [];
  const sources = {};

  for(const library of Object.values(Config.get('libraries'))) {
    const libraryDir = Config.directory('library') + '/' + library;
    if(!fs.existsSync(libraryDir))
      continue;

    for(const game of (await fs.promises.readdir(libraryDir)).sort((a,b)=>a.localeCompare(b))) {
      const seenInGame = new Set();
      let files = [];
      try {
        files = (await fs.promises.readdir(libraryDir + '/' + game)).filter(f=>f.match(/^[0-9]+\.json$/)).sort((a,b)=>parseInt(a)-parseInt(b));
      } catch(e) {
        continue;
      }

      for(const file of files) {
        let state = null;
        try {
          state = JSON.parse(await fs.promises.readFile(libraryDir + '/' + game + '/' + file));
        } catch(e) {
          Logging.log(`WARNING: Could not parse library file ${library}/${game}/${file} while building the deck catalog.`);
          continue;
        }

        for(const [ widgetID, widget ] of Object.entries(state)) {
          if(widgetID == '_meta' || !widget || widget.type != 'deck' || !Object.keys(widget.cardTypes || {}).length)
            continue;

          const cardCount = Object.values(state).filter(w=>w && w.type == 'card' && w.deck == widgetID).length;
          if(!cardCount)
            continue;

          // the same deck often appears unchanged in several variants of a game
          const duplicateKey = JSON.stringify([ widget.cardDefaults, widget.cardTypes, widget.faceTemplates ]);
          if(seenInGame.has(duplicateKey))
            continue;
          seenInGame.add(duplicateKey);

          const info = state._meta && state._meta.info || {};
          const cardDefaults = widget.cardDefaults || {};
          index.push({
            library,
            game,
            gameName: info.name || game,
            // matches the id stars/timePlayed are keyed by (see Statistics)
            publicLibrary: `${library}/${game}`,
            file,
            deck: widgetID,
            cardCount,
            cardTypeCount: Object.keys(widget.cardTypes).length,
            faceCount: Array.isArray(widget.faceTemplates) ? widget.faceTemplates.length : 0,
            cardWidth: cardDefaults.width || 103,
            cardHeight: cardDefaults.height || 160
          });
          sources[`${library}/${game}/${file}/${widgetID}`] = libraryDir + '/' + game + '/' + file;
        }
      }
    }
  }

  return { index, sources };
}

export default {
  async getIndex() {
    if(!cachePromise)
      cachePromise = buildCache().catch(function(e) {
        cachePromise = null;
        throw e;
      });
    const index = (await cachePromise).index;

    // stars and play time change while the cached catalog stays valid, so enrich
    // fresh copies on every request instead of baking them into the cache
    const byPublicLibrary = {};
    for(const entry of index)
      byPublicLibrary[entry.publicLibrary] = { publicLibrary: entry.publicLibrary };
    Statistics.updateDataInsideStates(byPublicLibrary);

    return index.map(entry => Object.assign({}, entry, {
      stars: byPublicLibrary[entry.publicLibrary].stars || 0,
      timePlayed: byPublicLibrary[entry.publicLibrary].timePlayed || 0
    }));
  },

  async getDeck(library, game, file, deck) {
    await this.getIndex();
    const source = (await cachePromise).sources[`${library}/${game}/${file}/${deck}`];
    if(!source)
      return null;

    const state = JSON.parse(await fs.promises.readFile(source));
    if(!state[deck] || state[deck].type != 'deck')
      return null;

    return {
      deck: withoutContextProperties(state[deck]),
      cards: Object.values(state).filter(w=>w && w.type == 'card' && w.deck == deck).map(withoutContextProperties)
    };
  },

  invalidateCache() {
    cachePromise = null;
  }
};
