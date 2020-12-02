import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import JSZip from 'jszip';

import PCIO from './pcioimport.mjs';

async function downloadLink(link, requestEtag) {
  const response = await fetch(link, requestEtag ? { headers: { 'If-None-Match': requestEtag } } : {});

  if(requestEtag && response.status == 304)
    return { states: null, etag: requestEtag };

  const etag = response.headers.get('etag');
  const states = await readStatesFromFile(await response.buffer());
  return { states, etag };
}

async function readStatesFromFile(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  if(zip.files['widgets.json']) {
    const pcio = await PCIO(buffer);
    return [ pcio ];
  } else {
    const states = [];
    for(const filename in zip.files) {
      if(filename.match(/^[^\/]+\.json$/) && zip.files[filename]._data) {
        if(zip.files[filename]._data.uncompressedSize >= 2097152)
          throw `filename is bigger than 2 MiB.`;
        const state = JSON.parse(await zip.files[filename].async('string'));
        if(state._meta.version !== 1)
          throw `Found a valid JSON file but version ${state._meta.version} is not supported.`;
        states.push(state);
      }
    }
    if(!states.length)
      throw 'Did not find any JSON files in the ZIP file.';
    return states;
  }
}

export default {
  downloadLink,
  readStatesFromFile
}
