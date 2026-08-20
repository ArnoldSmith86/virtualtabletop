import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import minifyHTML, { cacheDirectory, cacheKey, loadFromCache, storeInCache } from '../../server/minify.mjs';

// The build is the expensive part of starting the server, so the cache has to be right about when
// it may reuse an entry: a key that misses too often costs half a minute, one that hits when it
// should not serves a client that does not match the checkout.

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-minify-cache-'));
}

// A checkout of symlinks into this one, with the given files replaced by content of their own.
// Changing an input file in place would race with whatever else is building at the same time.
function mirrorCheckout(overrides) {
  const checkout = temporaryDirectory();
  for(const name of [ 'assets', 'client', 'config.json', 'config.template.json', 'node_modules', 'validator' ])
    fs.symlinkSync(`${path.resolve()}/${name}`, `${checkout}/${name}`);

  for(const [ file, content ] of Object.entries(overrides)) {
    const parts = file.split('/');
    for(let depth = 1; depth < parts.length; depth++)
      replaceLinkedDirectory(`${checkout}/${parts.slice(0, depth).join('/')}`);
    fs.rmSync(`${checkout}/${file}`, { force: true });
    fs.writeFileSync(`${checkout}/${file}`, content);
  }
  return checkout;
}

// Turns a symlinked directory into a real one holding a symlink per entry, so that a single file
// inside it can be replaced without touching the directory it points at.
function replaceLinkedDirectory(directory) {
  if(!fs.lstatSync(directory).isSymbolicLink())
    return;
  const source = fs.readlinkSync(directory);
  fs.unlinkSync(directory);
  fs.mkdirSync(directory);
  for(const name of fs.readdirSync(source))
    fs.symlinkSync(`${source}/${name}`, `${directory}/${name}`);
}

function runNode(args, options) {
  return spawnSync(process.execPath, args, {
    cwd: options.cwd || path.resolve(),
    env: { ...process.env, ...options.env },
    encoding: 'utf8'
  });
}

function cacheKeyIn(checkout, env) {
  const load = `import(${JSON.stringify(path.resolve() + '/server/minify.mjs')}).then(m => console.log(m.cacheKey()))`;
  const result = runNode([ '--input-type=module', '-e', load ], { cwd: checkout, env });
  expect(result.stderr).toBe('');
  return result.stdout.trim();
}

// Every field of a build as bytes, so that a string and a Buffer can be compared the same way.
function asBytes(build) {
  return Object.fromEntries(Object.entries(build).map(([ field, value ]) => [
    field, Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8')
  ]));
}

function expectSameBuild(actual, expected) {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  const actualBytes = asBytes(actual);
  const expectedBytes = asBytes(expected);
  for(const field of Object.keys(expectedBytes))
    expect(`${field}: ${actualBytes[field].toString('base64')}`).toBe(`${field}: ${expectedBytes[field].toString('base64')}`);
}

describe('the client bundle cache key', function() {
  let checkouts;

  beforeEach(function() {
    checkouts = [];
  });

  afterEach(function() {
    for(const checkout of checkouts)
      fs.rmSync(checkout, { recursive: true, force: true });
  });

  function checkoutWith(overrides) {
    const checkout = mirrorCheckout(overrides);
    checkouts.push(checkout);
    return checkout;
  }

  test('is the same for an unchanged checkout', function() {
    expect(cacheKey()).toBe(cacheKey());
  });

  // The prebuild step runs in the checkout the server will start from, so a key that depended on
  // where that checkout lives would never hit.
  test('does not depend on the path of the checkout', function() {
    expect(cacheKeyIn(checkoutWith({}))).toBe(cacheKey());
  });

  test('changes when an input file changes', function() {
    const customCSS = fs.readFileSync(path.resolve() + '/client/css/custom.css', 'utf8');
    expect(cacheKeyIn(checkoutWith({ 'client/css/custom.css': customCSS + '\nbody { --cache-key-test: 1; }\n' }))).not.toBe(cacheKey());
  });

  test('changes when a client config value changes', function() {
    expect(cacheKeyIn(checkoutWith({}), { SERVERNAME: 'A Different Tabletop' })).not.toBe(cacheKey());
  });

  test('changes when minification is switched on', function() {
    expect(cacheKeyIn(checkoutWith({}), { MINIFYJAVASCRIPT: 'true' })).not.toBe(cacheKey());
  });
});

describe('a stored client bundle cache entry', function() {
  const key = 'f'.repeat(64);
  let directory;

  beforeEach(function() {
    directory = temporaryDirectory();
  });

  afterEach(function() {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  // Buffers and strings are stored the same way, so the loaded entry has to hand the strings back
  // as strings - the server sends min and editorJSmin as text and the rest as bytes.
  const build = {
    min: '<!doctype html><body>ä ☺</body>',
    gzipped: Buffer.from([ 0x1f, 0x8b, 0x00, 0xff ]),
    editorJSmin: 'const a="ü";\n',
    editorJSgzipped: Buffer.from([ 0x1f, 0x8b, 0x01 ]),
    fflateMin: Buffer.from('fflate'),
    fflateGzipped: Buffer.from([ 0x00, 0x01, 0x02 ]),
    symbolsGzipped: Buffer.from([ 0xff, 0xfe ])
  };

  test('round-trips every field', function() {
    storeInCache(directory, key, build);
    const loaded = loadFromCache(directory, key);
    expectSameBuild(loaded, build);
    for(const field of [ 'min', 'editorJSmin' ])
      expect(typeof loaded[field]).toBe('string');
    for(const field of [ 'gzipped', 'editorJSgzipped', 'fflateMin', 'fflateGzipped', 'symbolsGzipped' ])
      expect(Buffer.isBuffer(loaded[field])).toBe(true);
  });

  test('is refused when one of its files was truncated', function() {
    storeInCache(directory, key, build);
    fs.writeFileSync(`${directory}/${key}/edit.js.gz`, Buffer.from([ 0x1f ]));
    expect(() => loadFromCache(directory, key)).toThrow();
  });

  // Storing does not overwrite an entry that is already there, so an entry that lost a file would
  // stay broken and cost every start a rebuild if it were treated like a good one.
  test('replaces an entry that no longer loads', function() {
    storeInCache(directory, key, build);
    fs.rmSync(`${directory}/${key}/symbols.json.gz`);
    storeInCache(directory, key, build);
    expectSameBuild(loadFromCache(directory, key), build);
  });

  test('is refused when its index is unreadable', function() {
    storeInCache(directory, key, build);
    fs.writeFileSync(`${directory}/${key}/entry.json`, '{ this is not json');
    expect(() => loadFromCache(directory, key)).toThrow();
  });
});

describe('minifyHTML with a cache directory', function() {
  let saveDirectory;
  let built;

  beforeAll(async function() {
    saveDirectory = temporaryDirectory();
    process.env.VTT_SAVE_DIR = saveDirectory;
    built = await minifyHTML();
  }, 180000);

  afterAll(function() {
    delete process.env.VTT_SAVE_DIR;
    fs.rmSync(saveDirectory, { recursive: true, force: true });
  });

  test('stores the build it just made', function() {
    expect(fs.existsSync(`${cacheDirectory()}/${cacheKey()}/entry.json`)).toBe(true);
  });

  test('hands out the identical build on the next call', async function() {
    expectSameBuild(await minifyHTML(), built);
  }, 180000);

  // Stamping an entry as recently used needs ownership of it, which a server that did not write
  // it - the prebuild ran as the deploy user - does not have. That must not cost it the hit.
  test('serves an entry it cannot stamp as used', async function() {
    const utimesSync = fs.utimesSync;
    let stamped = false;
    fs.utimesSync = function() {
      stamped = true;
      throw Object.assign(new Error('EPERM: operation not permitted, utime'), { code: 'EPERM' });
    };
    try {
      expectSameBuild(await minifyHTML(), built);
      expect(stamped).toBe(true);  // the entry was read before the stamp failed, so this was a hit
    } finally {
      fs.utimesSync = utimesSync;
    }
  }, 180000);

  // A cache that can break the server is worse than no cache at all, so anything unreadable has
  // to end up as a plain rebuild.
  test('rebuilds when the stored entry is corrupted', async function() {
    fs.writeFileSync(`${cacheDirectory()}/${cacheKey()}/room.html.gz`, Buffer.from('truncated'));
    expectSameBuild(await minifyHTML(), built);
  }, 180000);
});

// The point of prebuild is that a deploy can pay for the build before the restart, so its exit
// code is what tells the deploy script whether the new server will start quickly - or at all.
describe('server/prebuild.mjs', function() {
  function runPrebuild(options) {
    return runNode([ path.resolve() + '/server/prebuild.mjs' ], options);
  }

  test('fills the cache on the first run and finds it on the second', function() {
    const saveDirectory = temporaryDirectory();
    try {
      const first = runPrebuild({ env: { VTT_SAVE_DIR: saveDirectory } });
      expect(first.stdout + first.stderr).toContain('cache miss');
      expect(first.status).toBe(0);

      const started = Date.now();
      const second = runPrebuild({ env: { VTT_SAVE_DIR: saveDirectory } });
      expect(second.stdout + second.stderr).toContain('cache hit');
      expect(second.status).toBe(0);
      expect(Date.now() - started).toBeLessThan(10000);  // reading an entry instead of building one
    } finally {
      fs.rmSync(saveDirectory, { recursive: true, force: true });
    }
  }, 180000);

  test('exits non-zero when a client file does not parse', function() {
    const saveDirectory = temporaryDirectory();
    const checkout = mirrorCheckout({ 'client/js/audio.js': 'function ( {\n' });
    try {
      const result = runPrebuild({ cwd: checkout, env: { VTT_SAVE_DIR: saveDirectory, MINIFYJAVASCRIPT: 'true' } });
      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toMatch(/ERROR - GENERIC prebuild/);
    } finally {
      fs.rmSync(checkout, { recursive: true, force: true });
      fs.rmSync(saveDirectory, { recursive: true, force: true });
    }
  }, 180000);
});
