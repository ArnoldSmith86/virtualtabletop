import fs from 'fs';
import os from 'os';
import path from 'path';

import Config from '../../server/config.mjs';

// The client config ends up in the inline <script> of room.html, so anybody who opens a room can
// read all of it. That makes both directions of this comparison interesting: an entry the client
// needs has to be in there, and an entry it does not need must not be - config.json holds server
// internals like the save directory and the secret adminURL.
function clientJSfiles(dir = 'client/js', out = []) {
  for(const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = path.join(dir, entry.name);
    if(entry.isDirectory() && entry.name != 'lib')  // client/js/lib is third party code
      clientJSfiles(name, out);
    else if(entry.isFile() && entry.name.endsWith('.js'))
      out.push(name);
  }
  return out;
}

// Read the names out of the client source instead of listing them here, so that this covers every
// use of the global config object and not just the ones somebody remembered to add.
function configKeysUsedByClient() {
  const keys = new Set();
  for(const file of clientJSfiles())
    for(const [ , key ] of fs.readFileSync(file, 'utf8').matchAll(/(?<![\w.$])config\.([A-Za-z_$][\w$]*)/g))
      keys.add(key);
  return [ ...keys ].sort();
}

describe('client config', () => {
  test('contains every entry the client reads', () => {
    const used = configKeysUsedByClient();
    expect(used.length).toBeGreaterThan(0);  // the client source was read, not an empty match
    for(const key of used)
      expect(Object.keys(Config.getClientConfig())).toContain(key);
  });

  test('contains nothing else', () => {
    expect(Object.keys(Config.getClientConfig()).sort()).toEqual(configKeysUsedByClient());
  });

  test('keeps the server-only entries out of the browser', () => {
    const clientConfig = Config.getClientConfig();
    for(const key of [ 'adminURL', 'directories', 'legacyServers', 'port' ])
      expect(clientConfig).not.toHaveProperty(key);
  });
});

describe('config bootstrap', function() {
  let directory = null;
  let repository = null;

  // the Config singleton bootstraps its files relative to the working directory, so a temporary
  // directory holding just the two templates is enough to exercise a first start
  beforeEach(function() {
    repository = process.cwd();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-config-'));
    fs.mkdirSync(path.join(directory, 'client/css'), { recursive: true });
    fs.copyFileSync(path.join(repository, 'config.template.json'), path.join(directory, 'config.template.json'));
    fs.copyFileSync(path.join(repository, 'client/css/custom_template.css'), path.join(directory, 'client/css/custom_template.css'));
    process.chdir(directory);
  });

  afterEach(function() {
    process.chdir(repository);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('creates config.json and custom.css from their templates on the first start', async function() {
    await import('../../server/config.mjs?firstStart');
    expect(fs.readFileSync(path.join(directory, 'config.json'), 'utf8')).toEqual(fs.readFileSync(path.join(directory, 'config.template.json'), 'utf8'));
    expect(fs.readFileSync(path.join(directory, 'client/css/custom.css'), 'utf8')).toEqual(fs.readFileSync(path.join(directory, 'client/css/custom_template.css'), 'utf8'));
    expect(fs.readdirSync(directory).filter(file=>file.match(/tmp$/))).toEqual([]);
    expect(fs.readdirSync(path.join(directory, 'client/css')).filter(file=>file.match(/tmp$/))).toEqual([]);
  });

  test('leaves no config.json behind when creating it fails', async function() {
    // a directory in the place of the temporary file makes writing it fail
    fs.mkdirSync(path.join(directory, 'config.json.tmp'));
    await expect(import('../../server/config.mjs?failingFirstStart')).rejects.toThrow();
    expect(fs.existsSync(path.join(directory, 'config.json'))).toEqual(false);
  });
});
