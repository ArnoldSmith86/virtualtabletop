import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fflate from 'fflate';

// states.js belongs to the room bundle, which server/minify.mjs concatenates - so it uses
// the helpers of the other files as globals instead of importing them. Evaluate its source
// with stubs for the ones the upload path needs, the way the other overlay tests do.
const dir = path.dirname(fileURLToPath(import.meta.url));
const statesSource = fs.readFileSync(path.join(dir, '../../client/js/overlays/states.js'), 'utf8').replace(/^export /gm, '');

function loadStatesOverlay(serverStatus=200) {
  document.body.innerHTML = `<select id="librarySort"><option value="name">name</option></select>`;

  const alerts = [];
  const uploaded = [];
  class XHR {
    constructor() {
      this.upload = {};
    }
    open() {}
    setRequestHeader() {}
    send(body) {
      uploaded.push(body);
      this.onload({ target: { status: serverStatus, response: 'Unable to load and add the game.' } });
    }
  }

  const scope = new Function('$', '$a', 'onLoad', 'IntersectionObserver', 'fflate', 'alert', 'fetch', 'XMLHttpRequest', 'domByTemplate', 'removeFromDOM', 'rand', 'roomID', `
    ${statesSource};
    return { uploadStateFile, addStateFile };
  `)(
    (selector, parent=document) => parent.querySelector(selector),
    (selector, parent=document) => [ ...parent.querySelectorAll(selector) ],
    () => {},
    class { observe() {} unobserve() {} },
    fflate,
    message => alerts.push(message),
    async () => ({ json: async () => ({}) }),
    XHR,
    () => {
      const dom = document.createElement('div');
      dom.innerHTML = '<img><h3></h3><i></i><span class="ai-badge"></span>';
      return dom;
    },
    node => node.parentNode.removeChild(node),
    () => Math.random(),
    'room'
  );

  return Object.assign(scope, { alerts, uploaded, uploadFailed: [] });
}

function vttFile(name, files) {
  const entries = {};
  for(const [ filename, content ] of Object.entries(files))
    entries[filename] = fflate.strToU8(typeof content == 'string' ? content : JSON.stringify(content));
  const zip = fflate.zipSync(entries);
  // jsdom has no File.arrayBuffer(), and the upload only needs the name and the bytes
  return { name, arrayBuffer: async () => zip.buffer };
}

async function upload(overlay, file) {
  const meta = [];
  await overlay.uploadStateFile(file, 'addState/room/id/file/name', (...args)=>meta.push(args), ()=>{}, failed=>overlay.uploadFailed.push(failed));
  return meta;
}

describe('uploading a game file', () => {
  test('reads name, image and variants from the metadata of the first variant', async () => {
    const overlay = loadStatesOverlay();
    const meta = await upload(overlay, vttFile('Some Game.vtt', {
      '0.json': { _meta: { version: 8, info: { name: 'Some Game', image: 'https://example.com/i.png', savePlayers: 2, saveDate: 1234 } } },
      '1.json': { _meta: { version: 8, info: { name: 'Some Game', variant: 'Advanced' } } }
    }));

    expect(meta.length).toBe(1);
    expect(meta[0][0]).toBe('Some Game');
    expect(meta[0][2]).toBe('https://example.com/i.png');
    expect(meta[0][3].length).toBe(2);
    expect(meta[0][4]).toBe(2);
    expect(overlay.alerts).toEqual([]);
    expect(overlay.uploaded.length).toBe(1);
  });

  // the server accepts a game file without metadata, so reading it must not throw before
  // the file is even sent - the tile is named after the file until the server answers
  test('falls back to the file name when the metadata is missing', async () => {
    const overlay = loadStatesOverlay();
    const meta = await upload(overlay, vttFile('Handwritten.vtt', {
      '0.json': { _meta: { version: 8 }, w1: { id: 'w1' } }
    }));

    expect(meta).toEqual([ [ 'Handwritten', '', null, [ {} ], null, null ] ]);
    expect(overlay.alerts).toEqual([]);
    expect(overlay.uploaded.length).toBe(1);
  });

  // Room.addState names a game after the file it came from and removes the extension itself, so
  // a tile that removed a different set would rename itself once the server answers
  test('removes the same file extensions from the fallback name as the server', async () => {
    const overlay = loadStatesOverlay();
    const noMeta = { '0.json': { _meta: { version: 8 } } };

    expect((await upload(overlay, vttFile('My Game.VTT', noMeta)))[0][0]).toBe('My Game');
    expect((await upload(overlay, vttFile('My Game v1.2.vtt', noMeta)))[0][0]).toBe('My Game v1.2');
    expect((await upload(overlay, vttFile('My Game.data', noMeta)))[0][0]).toBe('My Game.data');
  });

  test('keeps one variant per JSON file when none of them has metadata', async () => {
    const overlay = loadStatesOverlay();
    const meta = await upload(overlay, vttFile('Handwritten.vtt', {
      '0.json': { _meta: { version: 8 }, w1: { id: 'w1' } },
      '1.json': { _meta: { version: 8 }, w2: { id: 'w2' } }
    }));

    expect(meta).toEqual([ [ 'Handwritten', '', null, [ {}, {} ], null, null ] ]);
    expect(overlay.uploaded.length).toBe(1);
  });

  // metadata written by hand or by another tool can hold anything, so nothing in it may be
  // dereferenced as if its type was known
  test('ignores an image that is not a string', async () => {
    const overlay = loadStatesOverlay();
    const meta = await upload(overlay, vttFile('Odd.vtt', {
      '0.json': { _meta: { version: 8, info: { name: 'Odd Game', image: 3 } } }
    }));

    expect(meta).toEqual([ [ 'Odd Game', undefined, null, [ { name: 'Odd Game', image: 3 } ], undefined, undefined ] ]);
    expect(overlay.alerts).toEqual([]);
    expect(overlay.uploaded.length).toBe(1);
  });

  // addVariant writes variantImage into every variant it renders, so a variant that is not an
  // object would throw there - in the "add variant from file" flow before the file is even sent
  test('ignores metadata that is not an object', async () => {
    const overlay = loadStatesOverlay();
    expect(await upload(overlay, vttFile('Odd.vtt', {
      '0.json': { _meta: { version: 8, info: 'bad metadata' } }
    }))).toEqual([ [ 'Odd', '', null, [ {} ], null, null ] ]);

    expect(await upload(overlay, vttFile('Odd.vtt', {
      '0.json': { _meta: { version: 8, info: 'bad metadata' } },
      '1.json': { _meta: { version: 8, info: { name: 'Second Variant' } } }
    }))).toEqual([ [ 'Second Variant', undefined, null, [ {}, { name: 'Second Variant' } ], undefined, undefined ] ]);

    // an array is an object as far as typeof is concerned, and assigning one into a game
    // spreads it in as one property per element
    expect(await upload(overlay, vttFile('Odd.vtt', {
      '0.json': { _meta: { version: 8, info: [ 'bad', 'metadata' ] } }
    }))).toEqual([ [ 'Odd', '', null, [ {} ], null, null ] ]);

    expect(overlay.alerts).toEqual([]);
    expect(overlay.uploaded.length).toBe(3);
  });

  test('falls back to the file name for PCIO and TTS files, whose JSON is not a variant', async () => {
    const overlay = loadStatesOverlay();
    expect(await upload(overlay, vttFile('game.pcio', { 'widgets.json': [ { id: 'w1' } ] })))
      .toEqual([ [ 'game', '', null, [ {} ], null, null ] ]);
    expect(await upload(overlay, vttFile('mod.zip', { 'WorkshopUpload': '', 'Mods/Workshop/1.json': { SaveName: 'Mod' } })))
      .toEqual([ [ 'mod', '', null, [ {} ], null, null ] ]);
    expect(overlay.alerts).toEqual([]);
    expect(overlay.uploaded.length).toBe(2);
  });

  test('uploads a file with unreadable JSON and lets the server report the problem', async () => {
    const overlay = loadStatesOverlay();
    const meta = await upload(overlay, vttFile('Broken.vtt', { '0.json': 'not json at all' }));

    expect(meta).toEqual([ [ 'Broken', '', null, [ {} ], null, null ] ]);
    expect(overlay.uploaded.length).toBe(1);
  });

  test('rejects a file without any JSON in it', async () => {
    const overlay = loadStatesOverlay();
    const meta = await upload(overlay, vttFile('Pictures.zip', { 'image.png': 'not a game' }));

    expect(meta).toEqual([]);
    expect(overlay.alerts).toEqual([ 'Pictures.zip does not contain a game. You can add VTT files (.vtt, .vttc, .vtts), playingcards.io files (.pcio) and Tabletop Simulator workshop files (.zip).' ]);
    expect(overlay.uploaded.length).toBe(0);
  });

  // the "add variant" flow adds its rows before the server has seen the file, so it has to be
  // told that the upload failed to be able to take them back
  test('reports whether the upload succeeded to the done callback', async () => {
    const overlay = loadStatesOverlay();
    await upload(overlay, vttFile('Good.vtt', { '0.json': { _meta: { version: 8 } } }));
    expect(overlay.uploadFailed).toEqual([ false ]);

    const rejected = loadStatesOverlay(404);
    await upload(rejected, vttFile('Broken.vtt', { '0.json': 'not json at all' }));
    await upload(rejected, vttFile('Pictures.zip', { 'image.png': 'not a game' }));
    await upload(rejected, { name: 'Notes.txt', arrayBuffer: async () => fflate.strToU8('not a zip').buffer });
    expect(rejected.uploadFailed).toEqual([ true, true, true ]);
  });

  // the tile is only put into the game list by metaCallback, which a file that is rejected before
  // it is sent never reaches - so the done callback of the game shelf has to cope with a tile that
  // has no parent instead of taking the whole client down with it
  test('drops the tile of a rejected file without throwing', async () => {
    const overlay = loadStatesOverlay();

    await overlay.addStateFile({ name: 'Notes.txt', arrayBuffer: async () => fflate.strToU8('not a zip').buffer });
    await overlay.addStateFile(vttFile('Pictures.zip', { 'image.png': 'not a game' }));

    expect(overlay.alerts.length).toBe(2);
    expect(overlay.uploaded.length).toBe(0);
  });
});
