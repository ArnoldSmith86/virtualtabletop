import fs from 'fs';
import path from 'path';

import Config from '../../server/config.mjs';

const assetsDir = path.resolve() + '/assets';

describe('bundled assets', () => {
  test('all /i/ links in the ready-made decks exist', () => {
    const missing = [];
    for(const deck of fs.readdirSync(assetsDir + '/decks')) {
      const content = fs.readFileSync(assetsDir + '/decks/' + deck, 'utf8');
      for(const link of new Set(content.match(/\/i\/[^"'\\<>)]+/g) || []))
        if(!fs.existsSync(assetsDir + '/' + decodeURIComponent(link.substr(3))))
          missing.push(`${deck}: ${link}`);
    }
    expect(missing).toEqual([]);
  });

  test('legacy asset names still resolve to their bundled replacement', () => {
    const legacyAssets = JSON.parse(fs.readFileSync(path.resolve() + '/server/legacyassets.json'));
    expect(Object.keys(legacyAssets).length).toBeGreaterThan(0);

    for(const asset in legacyAssets) {
      const target = assetsDir + '/' + legacyAssets[asset];
      expect(asset).toMatch(/^-?[0-9]+_[0-9]+$/);
      expect(fs.existsSync(target)).toBe(true);
      // the name of an uploaded asset is <crc32>_<size> of its content
      expect(fs.statSync(target).size).toBe(+asset.split('_')[1]);
      expect(fs.existsSync(Config.resolveAsset(asset) || '')).toBe(true);
    }
  });
});
