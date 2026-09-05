import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fflate from 'fflate';

// states.js is a plain script that gets concatenated by server/minify.mjs, so evaluate the
// source with the few things it reaches for outside itself handed in.
const dir = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(dir, '../../client/js/overlays/states.js'), 'utf8');

let alerts = [];

const { uploadStateFile } = new Function('fflate', 'alert', '$', '$a', 'onLoad', 'IntersectionObserver', 'XMLHttpRequest', 'fetch', `${source}
  return { uploadStateFile };
`)(
  fflate,
  message=>alerts.push(message),
  _=>({ value: '', textContent: '', classList: { toggle(){}, add(){}, remove(){} } }),
  _=>[],
  _=>{},
  class { observe(){} unobserve(){} },
  class { constructor(){ this.upload = {}; } open(){} setRequestHeader(){} send(){ this.onload({ target: { status: 200 } }); } },
  async _=>({ json: async _=>({}) })
);

// the archive as the upload sees it: a name and the bytes behind it
function file(name, entries) {
  const zipped = fflate.zipSync(Object.fromEntries(Object.entries(entries).map(
    ([ entryName, content ])=>[ entryName, typeof content == 'string' ? fflate.strToU8(content) : content ]
  )));
  return { name, arrayBuffer: async _=>zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) };
}

function variant(name, extraInfo={}) {
  return JSON.stringify({ _meta: { version: 24, info: { name, ...extraInfo } } });
}

// what metaCallback is handed, or null when the upload never got that far
async function upload(sourceFile) {
  let meta = null;
  await uploadStateFile(sourceFile, 'addState/room/id/file/x', (name, similarName, image, variants, savePlayers, saveDate)=>{
    meta = { name, similarName, image, variants, savePlayers, saveDate };
  }, _=>{}, _=>{});
  return meta;
}

beforeEach(()=>{
  alerts = [];
});

describe('uploading a game file', () => {
  it('reads name, similar name and variants out of a VTT save', async () => {
    const meta = await upload(file('My Game.vtt', {
      '0.json': variant('My Game', { similarName: 'Some Game', savePlayers: 'Alice', saveDate: 12345 }),
      '1.json': variant('My Game', { variant: 'Two players' })
    }));

    expect(meta.name).toBe('My Game');
    expect(meta.similarName).toBe('Some Game');
    expect(meta.savePlayers).toBe('Alice');
    expect(meta.saveDate).toBe(12345);
    expect(meta.variants.length).toBe(2);
    expect(meta.variants[1].variant).toBe('Two players');
    expect(alerts).toEqual([]);
  });

  it('turns an image stored in the file into a data URL', async () => {
    const png = new Uint8Array([ 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00 ]);
    const meta = await upload(file('My Game.vtt', {
      '0.json': variant('My Game', { image: '/assets/1_2' }),
      'assets/1_2': png
    }));

    expect(meta.image).toMatch(/^data:image\/png;base64,iVBO/);
  });

  // a Tabletop Simulator export keeps its save in a subdirectory and carries no VTT metadata:
  // reading it as a variant threw before the server ever got a chance to convert it
  it('falls back to the file name for a TTS export', async () => {
    const meta = await upload(file('Workshop Game.zip', {
      'WorkshopUpload': '{}',
      'Saves/TS_Save_1.json': JSON.stringify({ SaveName: 'Workshop Game', ObjectStates: [] })
    }));

    expect(meta).toEqual({ name: 'Workshop Game', similarName: '', image: null, variants: [{}], savePlayers: null, saveDate: null });
    expect(alerts).toEqual([]);
  });

  it('falls back to the file name for a PCIO export', async () => {
    const meta = await upload(file('Cards.pcio', {
      'widgets.json': JSON.stringify([ { id: 'a', type: 'card' } ]),
      'schemaVersion': '8'
    }));

    expect(meta.name).toBe('Cards');
    expect(meta.variants).toEqual([{}]);
    expect(alerts).toEqual([]);
  });

  // an upload that leaves out assets the server already has carries the list of them as
  // asset-map.json, which is not a variant - the server skips it for the same reason
  it('ignores the asset map next to the variants', async () => {
    const meta = await upload(file('My Game.vtt', {
      '0.json': variant('My Game'),
      'asset-map.json': JSON.stringify({ '1_2': 'assets/1_2' })
    }));

    expect(meta.name).toBe('My Game');
    expect(meta.variants.length).toBe(1);
    expect(alerts).toEqual([]);
  });

  it('falls back to the file name for a root JSON file without metadata', async () => {
    const meta = await upload(file('Bare State.vtt', { '0.json': JSON.stringify({ w: { id: 'w' } }) }));

    expect(meta.name).toBe('Bare State');
    expect(alerts).toEqual([]);
  });

  it('reports an archive that holds no JSON file at all', async () => {
    const meta = await upload(file('Photos.zip', { 'assets/1_2': new Uint8Array([ 1, 2 ]) }));

    expect(meta).toBe(null);
    expect(alerts).toEqual([ 'Photos.zip is not a valid VTT, VTTC, VTTS or PCIO file.' ]);
  });

  it('reports a file that is not a zip', async () => {
    const meta = await upload({ name: 'notes.txt', arrayBuffer: async _=>new Uint8Array([ 1, 2, 3 ]).buffer });

    expect(meta).toBe(null);
    expect(alerts).toEqual([ 'notes.txt is not a valid VTT, VTTC, VTTS or PCIO file.' ]);
  });
});
