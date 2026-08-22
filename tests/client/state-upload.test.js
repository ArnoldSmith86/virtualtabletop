import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fflate from 'fflate';

// states.js belongs to the room bundle, which server/minify.mjs concatenates - so it uses
// the helpers of the other files as globals instead of importing them. Evaluate its source
// with stubs for the ones the upload path needs, the way the other overlay tests do.
const dir = path.dirname(fileURLToPath(import.meta.url));
const statesSource = fs.readFileSync(path.join(dir, '../../client/js/overlays/states.js'), 'utf8').replace(/^export /gm, '');

function loadStatesOverlay() {
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
      this.onload({ target: { status: 200 } });
    }
  }

  const scope = new Function('$', '$a', 'onLoad', 'IntersectionObserver', 'fflate', 'alert', 'fetch', 'XMLHttpRequest', `
    ${statesSource};
    return { uploadStateFile };
  `)(
    (selector, parent=document) => parent.querySelector(selector),
    (selector, parent=document) => [ ...parent.querySelectorAll(selector) ],
    () => {},
    class { observe() {} unobserve() {} },
    fflate,
    message => alerts.push(message),
    async () => ({ json: async () => ({}) }),
    XHR
  );

  return Object.assign(scope, { alerts, uploaded });
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
  await overlay.uploadStateFile(file, 'addState/room/id/file/name', (...args)=>meta.push(args), ()=>{}, ()=>{});
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
    expect(overlay.alerts).toEqual([ 'Pictures.zip is not a valid VTT, VTTC, VTTS or PCIO file.' ]);
    expect(overlay.uploaded.length).toBe(0);
  });
});
