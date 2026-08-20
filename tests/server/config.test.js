import fs from 'fs';
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
