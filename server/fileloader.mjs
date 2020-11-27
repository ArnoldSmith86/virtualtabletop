import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

import PCIO from './pcioimport.mjs';

export default {
  readStatesFromFile: async function(buffer) {
    try {
      const pcio = await PCIO(buffer, 'base64');
      return [ pcio ];
    } catch(e) {
      const zip = await JSZip.loadAsync(buffer);

      const states = [];
      for(const filename in zip.files) {
        if(filename.match(/\.json$/) && zip.files[filename]._data && zip.files[filename]._data.uncompressedSize < 2097152) {
          const state = JSON.parse(await zip.files[filename].async('string'));
          if(state._meta.version === 0)
            states.push(state);
        }
      }
      return states;
    }
  }
}
