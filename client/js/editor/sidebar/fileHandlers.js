/**
 * Extensible file handlers for the Files panel.
 * Register handlers with registerFileHandler({ id, label, filePattern, optionsSchema, apply }).
 */

const fileHandlerRegistry = [];

function registerFileHandler(handler) {
  if (!handler.id || !handler.label || typeof handler.apply !== 'function')
    throw new Error('File handler needs id, label, and apply(content, options)');
  fileHandlerRegistry.push({
    id: handler.id,
    label: handler.label,
    filePattern: handler.filePattern || null,
    optionsSchema: handler.optionsSchema || [],
    apply: handler.apply
  });
}

function getFileHandlersForExtension(ext) {
  const withDot = ext ? '.' + ext : '';
  return fileHandlerRegistry.filter(h => {
    if (!h.filePattern) return true;
    if (typeof h.filePattern === 'string') return ext === h.filePattern || ext === h.filePattern.replace(/^\./, '');
    if (h.filePattern instanceof RegExp) return h.filePattern.test(withDot);
    return false;
  });
}

function getFileHandler(id) {
  return fileHandlerRegistry.find(h => h.id === id);
}

function getAllFileHandlers() {
  return [...fileHandlerRegistry];
}

function csvToArray(text, delimiter) {
  let p = '', row = [''], ret = [row], i = 0, r = 0, s = !0, l;
  for (l of text) {
    if ('"' === l) {
      if (s && l === p) row[i] += l;
      s = !s;
    } else if (delimiter === l && s) l = row[++i] = '';
    else if ('\n' === l && s) {
      if ('\r' === p) row[i] = row[i].slice(0, -1);
      row = ret[++r] = [l = '']; i = 0;
    } else row[i] += l;
    p = l;
  }
  return ret;
}

function unescapeCsvField(v) {
  try {
    if (v && v.match(/^JSON:/))
      return JSON.parse(v.substr(5));
    if (v && v.match(/^-?[0-9]*(\.[0-9]+)?(e[0-9]+)?$/))
      return parseFloat(v);
    if (v) return v;
  } catch (e) {
    return e.toString();
  }
  return v;
}

async function applyCsvToDeck(deckId, csvContent, options = {}) {
  const mode = options.mode || 'set';
  const separator = csvContent.split(';').length > csvContent.split(',').length ? ';' : ',';
  const lines = csvToArray(csvContent, separator);
  const headers = lines[0].map(unescapeCsvField);
  const targetCounts = {};
  const deck = widgets.get(deckId);
  if (!deck || deck.get('type') !== 'deck')
    throw new Error(`Deck ${deckId} not found`);

  const jeStateNow = { ...deck.state, cardTypes: mode === 'set' ? {} : { ...deck.get('cardTypes') } };
  const oldCardTypeIDs = Object.keys(jeStateNow.cardTypes);

  for (let i = 1; i < lines.length; i++) {
    const currentline = lines[i];
    if (lines[i].length === 1 && !lines[i][0]) continue;
    const obj = {};
    for (let j = 0; j < Math.min(headers.length, currentline.length); j++)
      obj[headers[j]] = unescapeCsvField(currentline[j]);
    const cardTypeID = obj['id::INTERNAL'] || generateUniqueWidgetID();
    delete obj['id::INTERNAL'];
    targetCounts[cardTypeID] = obj['cardCount::INTERNAL'];
    delete obj['cardCount::INTERNAL'];
    jeStateNow.cardTypes[cardTypeID] = obj;
  }

  batchStart();
  setDeltaCause(`${getPlayerDetails().playerName} imported CSV to ${deckId} in editor (Files panel)`);

  for (const oldID of oldCardTypeIDs) {
    if (!jeStateNow.cardTypes[oldID]) {
      for (const card of widgetFilter(w => w.get('deck') === deckId && w.get('cardType') === oldID))
        await removeWidgetLocal(card.get('id'));
    }
  }

  await deck.set('cardTypes', jeStateNow.cardTypes);

  for (const [id, targetCount] of Object.entries(targetCounts)) {
    const currentCount = widgetFilter(w => w.get('deck') === deckId && w.get('cardType') === id).length;
    for (let i = 0; i < targetCount - currentCount; ++i) {
      const cardId = await addWidgetLocal({ deck: deckId, type: 'card', cardType: id });
      if (deck.get('parent'))
        await widgets.get(cardId).moveToHolder(widgets.get(deck.get('parent')));
    }
    for (let i = 0; i < currentCount - targetCount; ++i) {
      const card = widgetFilter(w => w.get('deck') === deckId && w.get('cardType') === id)[0];
      if (card) await removeWidgetLocal(card.get('id'));
    }
  }

  batchEnd();
}

function replaceAssetRecursive(obj, oldAsset, newAsset) {
  if (obj === oldAsset) return newAsset;
  if (typeof obj === 'object' && obj != null)
    for (const [key, value] of Object.entries(obj))
      obj[key] = replaceAssetRecursive(value, oldAsset, newAsset);
  return obj;
}

function registerBuiltInHandlers() {
  registerFileHandler({
    id: 'imageReplaceAsset',
    label: 'Replace asset (image)',
    filePattern: /\.(png|jpe?g|gif|webp|svg)$/i,
    optionsSchema: [{ key: 'assetUrl', label: 'Asset to replace', type: 'asset' }],
    async apply(contentBlob, options, _filePath, context = {}) {
      const DEBUG = false;
      if (DEBUG) console.log('[Files imageReplaceAsset] ENTRY', { options, context, optionsKeys: options ? Object.keys(options) : [] });
      const lastAssetUrl = context.lastAssetUrl;
      const assetOpt = options.assetUrl || (options && Object.values(options).find(v => typeof v === 'string' && (/^\/assets\//.test(v) || /^-?[0-9]+_[0-9]+$/.test(v))));
      let oldAsset = lastAssetUrl || assetOpt;
      if (DEBUG) console.log('[Files imageReplaceAsset] resolved target', { lastAssetUrl, assetOpt, oldAssetBeforeNorm: oldAsset });
      if (!oldAsset) throw new Error('No target asset set. Pick an asset in the "Asset to replace" dropdown and run again.');
      if (!oldAsset.startsWith('/assets/'))
        oldAsset = '/assets/' + oldAsset.replace(/^\/+/, '');
      if (DEBUG) console.log('[Files imageReplaceAsset] oldAsset (normalized)', oldAsset);
      const newAsset = await _uploadAsset(contentBlob);
      if (DEBUG) console.log('[Files imageReplaceAsset] newAsset after upload', newAsset);
      if (!newAsset) return;
      const editedWidgetIds = [];
      const hasGetAllAssetsGrouped = typeof getAllAssetsGrouped === 'function';
      const widgetsRef = typeof widgets !== 'undefined' ? widgets : null;
      if (DEBUG) console.log('[Files imageReplaceAsset] getAllAssetsGrouped', { isFunction: hasGetAllAssetsGrouped, widgetsRef: !!widgetsRef, widgetsSize: widgetsRef ? widgetsRef.size : 0, widgetIds: widgetsRef ? [...widgetsRef.keys()].slice(0, 15) : [] });
      const grouped = hasGetAllAssetsGrouped ? getAllAssetsGrouped() : {};
      const groupedKeys = Object.keys(grouped);
      if (DEBUG) {
        console.log('[Files imageReplaceAsset] grouped keys (all known assets)', groupedKeys.length, groupedKeys.slice(0, 20));
        if (widgetsRef && widgetsRef.size) {
          for (const [id, w] of widgetsRef) {
            if (w.get && w.get('type') === 'button') {
              console.log('[Files imageReplaceAsset] sample button widget', { id, stateKeys: w.state ? Object.keys(w.state) : [], image: w.get ? w.get('image') : 'no get' });
              break;
            }
          }
        }
      }
      if (DEBUG) console.log('[Files imageReplaceAsset] lookup grouped[oldAsset]', { oldAsset, found: !!grouped[oldAsset], usesCount: grouped[oldAsset] ? (grouped[oldAsset].uses ? grouped[oldAsset].uses.length : 0) : 0 });
      let assetGroup = grouped[oldAsset];
      if (!assetGroup || !assetGroup.uses || !assetGroup.uses.length) {
        const fallback = assetOpt ? (assetOpt.startsWith('/assets/') ? assetOpt : '/assets/' + assetOpt.replace(/^\/+/, '')) : null;
        if (fallback && fallback !== oldAsset && grouped[fallback] && grouped[fallback].uses && grouped[fallback].uses.length) {
          if (DEBUG) console.log('[Files imageReplaceAsset] fallback to dropdown asset', { fallback });
          oldAsset = fallback;
          assetGroup = grouped[fallback];
        }
      }
      if (assetGroup && assetGroup.uses && assetGroup.uses.length) {
        if (DEBUG) console.log('[Files imageReplaceAsset] assetGroup.uses', assetGroup.uses);
        batchStart();
        setDeltaCause(`${getPlayerDetails().playerName} replaced asset from Files panel`);
        for (const use of assetGroup.uses) {
          const w = widgets.get(use.widget);
          if (DEBUG) console.log('[Files imageReplaceAsset] use', { use, widgetExists: !!w, widgetsMapSize: typeof widgets !== 'undefined' && widgets ? widgets.size : 'no widgets' });
          if (!w) continue;
          const topKey = use.keys[0];
          const property = w.get(topKey);
          const newValue = JSON.parse(JSON.stringify(property).split(oldAsset).join(newAsset));
          await w.set(topKey, newValue);
          if (!editedWidgetIds.includes(use.widget)) editedWidgetIds.push(use.widget);
        }
        batchEnd();
      } else if (DEBUG) {
        console.log('[Files imageReplaceAsset] NO assetGroup or empty uses – checking alternate key');
        const altKey = oldAsset.replace(/^\/assets\//, '');
        console.log('[Files imageReplaceAsset] grouped by /assets/ prefix?', groupedKeys.filter(k => k.includes(altKey)));
      }
      if (DEBUG) console.log('[Files imageReplaceAsset] EXIT', { editedWidgetIds, lastAssetUrl: newAsset });
      return { lastAssetUrl: newAsset, editedWidgetIds };
    }
  });

  registerFileHandler({
    id: 'csvDeckCards',
    label: 'CSV → deck card types',
    filePattern: /\.csv$/i,
    optionsSchema: [
      { key: 'deckId', label: 'Deck', type: 'deck' },
      { key: 'mode', label: 'Mode', type: 'select', options: [{ value: 'set', text: 'Replace' }, { value: 'add', text: 'Add' }] }
    ],
    async apply(contentText, options) {
      const deckId = options.deckId;
      await applyCsvToDeck(deckId, contentText, { mode: options.mode || 'set' });
      const cardIds = widgetFilter(w => w.get('deck') === deckId).map(w => w.get('id'));
      return { editedWidgetIds: [deckId, ...cardIds] };
    }
  });

  registerFileHandler({
    id: 'jsonMultipleWidgets',
    label: 'JSON → multiple widgets ({id1:..., id2:...})',
    filePattern: /\.json$/i,
    optionsSchema: [],
    async apply(contentText) {
      let patches;
      try {
        patches = JSON.parse(contentText);
      } catch (e) {
        throw new Error('Invalid JSON: ' + (e.message || e));
      }
      if (typeof patches !== 'object' || patches === null || Array.isArray(patches))
        throw new Error('Expected a JSON object: { "widgetId1": { "prop": value }, "widgetId2": ... }');
      batchStart();
      setDeltaCause(`${getPlayerDetails().playerName} updated widgets from Files panel`);
      const editedWidgetIds = [];
      for (const [id, patch] of Object.entries(patches)) {
        if (!widgets.has(id)) continue;
        const w = widgets.get(id);
        for (const [key, value] of Object.entries(patch))
          await w.set(key, value);
        editedWidgetIds.push(id);
      }
      batchEnd();
      return { editedWidgetIds };
    }
  });

  registerFileHandler({
    id: 'jsonOneWidget',
    label: 'JSON → one widget ({id, type, ...})',
    filePattern: /\.json$/i,
    optionsSchema: [],
    async apply(contentText) {
      let state;
      try {
        state = JSON.parse(contentText);
      } catch (e) {
        throw new Error('Invalid JSON: ' + (e.message || e));
      }
      if (typeof state !== 'object' || state === null)
        throw new Error('JSON must be an object with an "id" property');
      const id = state.id;
      if (!id)
        throw new Error('JSON must include "id" set to an existing widget id');
      if (!widgets.has(id)) {
        const sample = [...widgets.keys()].slice(0, 5).join(', ');
        throw new Error(`Widget id "${id}" not found. Use an existing id (e.g. ${sample}).`);
      }
      batchStart();
      setDeltaCause(`${getPlayerDetails().playerName} updated widget from Files panel`);
      const w = widgets.get(id);
      for (const [key, value] of Object.entries(state))
        if (key !== 'id') await w.set(key, value);
      batchEnd();
      return { editedWidgetIds: [id] };
    }
  });

  registerFileHandler({
    id: 'jsonOneProperty',
    label: 'JSON → one widget property',
    filePattern: /\.json$/i,
    optionsSchema: [
      { key: 'widgetId', label: 'Widget ID', type: 'string' },
      { key: 'propertyPath', label: 'Property (e.g. text or cardDefaults.width)', type: 'string' }
    ],
    async apply(contentText, options) {
      let value;
      try {
        value = JSON.parse(contentText);
      } catch (e) {
        throw new Error('Invalid JSON: ' + (e.message || e));
      }
      const w = widgets.get(options.widgetId);
      if (!w) throw new Error('Widget not found');
      const path = (options.propertyPath || '').trim().split(/\./).filter(Boolean);
      if (path.length === 0) throw new Error('Property path required');
      const prop = path[0];
      let target = JSON.parse(JSON.stringify(w.get(prop)));
      if (path.length === 1) {
        batchStart();
        setDeltaCause(`${getPlayerDetails().playerName} updated widget property from Files panel`);
        await w.set(prop, value);
        batchEnd();
        return { editedWidgetIds: [options.widgetId] };
      }
      let ptr = target;
      for (let i = 1; i < path.length - 1; i++) ptr = ptr[path[i]];
      ptr[path[path.length - 1]] = value;
      batchStart();
      setDeltaCause(`${getPlayerDetails().playerName} updated widget property from Files panel`);
      await w.set(prop, target);
      batchEnd();
      return { editedWidgetIds: [options.widgetId] };
    }
  });

  registerFileHandler({
    id: 'textLinesProperty',
    label: 'Text (lines) → one widget property as array',
    filePattern: /\.(txt|text)$/i,
    optionsSchema: [
      { key: 'widgetId', label: 'Widget ID', type: 'string' },
      { key: 'propertyPath', label: 'Property', type: 'string' }
    ],
    async apply(contentText, options) {
      const lines = contentText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const w = widgets.get(options.widgetId);
      if (!w) throw new Error('Widget not found');
      const path = (options.propertyPath || '').trim().split(/\./).filter(Boolean);
      if (path.length === 0) throw new Error('Property path required');
      const prop = path[0];
      let target = JSON.parse(JSON.stringify(w.get(prop)));
      if (path.length === 1) {
        batchStart();
        setDeltaCause(`${getPlayerDetails().playerName} updated widget property from Files panel`);
        await w.set(prop, lines);
        batchEnd();
        return { editedWidgetIds: [options.widgetId] };
      }
      let ptr = target;
      for (let i = 1; i < path.length - 1; i++) ptr = ptr[path[i]];
      ptr[path[path.length - 1]] = lines;
      batchStart();
      setDeltaCause(`${getPlayerDetails().playerName} updated widget property from Files panel`);
      await w.set(prop, target);
      batchEnd();
      return { editedWidgetIds: [options.widgetId] };
    }
  });

  registerFileHandler({
    id: 'htmlWidgetProperty',
    label: 'HTML → widget/card property',
    filePattern: /\.(htm|l?html)$/i,
    optionsSchema: [
      { key: 'widgetId', label: 'Widget ID', type: 'string' },
      { key: 'propertyPath', label: 'Property (e.g. text, or faceTemplates.0.objects.1.value)', type: 'string' }
    ],
    async apply(contentHtml, options) {
      const w = widgets.get(options.widgetId);
      if (!w) throw new Error('Widget not found');
      const path = (options.propertyPath || '').trim().split(/\./).filter(Boolean);
      if (path.length === 0) throw new Error('Property path required');
      const prop = path[0];
      let target = JSON.parse(JSON.stringify(w.get(prop)));
      if (path.length === 1) {
        batchStart();
        setDeltaCause(`${getPlayerDetails().playerName} updated widget HTML from Files panel`);
        await w.set(prop, contentHtml);
        batchEnd();
        return { editedWidgetIds: [options.widgetId] };
      }
      let ptr = target;
      for (let i = 1; i < path.length - 1; i++) ptr = ptr[path[i]];
      ptr[path[path.length - 1]] = contentHtml;
      batchStart();
      setDeltaCause(`${getPlayerDetails().playerName} updated widget HTML from Files panel`);
      await w.set(prop, target);
      batchEnd();
      return { editedWidgetIds: [options.widgetId] };
    }
  });
}

registerBuiltInHandlers();

window.getFileHandlersForExtension = getFileHandlersForExtension;
window.getFileHandler = getFileHandler;
window.getAllFileHandlers = getAllFileHandlers;
window.registerFileHandler = registerFileHandler;
window.applyCsvToDeck = applyCsvToDeck;
