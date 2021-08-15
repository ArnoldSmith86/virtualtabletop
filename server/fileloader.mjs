import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import JSZip from 'jszip';

import { VERSION } from './fileupdater.mjs';
import PCIO from './pcioimport.mjs';
import Logging from './logging.mjs';
import Config from './config.mjs';

const config = new Config();
const dirname = path.resolve() + '/save/links';
const filename = dirname + '.json';
const linkStatus = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename)) : {};

async function downloadLink(link) {
  link = link.replace(/#.*/, '');

  let requestEtag = null;
  if(linkStatus[link]) {
    requestEtag = linkStatus[link].etag;
    if(requestEtag === null || linkStatus[link].time > +(new Date()) - 2*60*60*1000)
      return;
  } else {
    linkStatus[link] = {
      filename: Math.random().toString(36).substring(3, 9)
    };
  }

  // if the link is to our own server, use the local link instead so we can skip external auth, if any
  var actual_link = link;
  if (link.startsWith(config.EXTERNAL_ADDRESS)) {
    actual_link = link.replace(config.EXTERNAL_ADDRESS, config.INTERNAL_ADDRESS);
  }
  const response = await fetch(actual_link, requestEtag ? { headers: { 'If-None-Match': requestEtag } } : {});

  linkStatus[link].time = +new Date();
  linkStatus[link].status = response.status;

  if(response.status != 304) {
    linkStatus[link].etag = response.headers.get('etag');
    const states = await readStatesFromBuffer(await response.buffer());
    fs.writeFileSync(`${dirname}/${linkStatus[link].filename}`, JSON.stringify(states));
  }

  fs.writeFileSync(filename, JSON.stringify(linkStatus));
}

async function transformAssetsPathToRelative(obj) {
  // As of Aug 14, 2021, the json files in the library's vtts contain absolute paths, limiting the server path to root path only. See:
  // https://github.com/ArnoldSmith86/virtualtabletop-library/issues/10
  // https://github.com/ArnoldSmith86/virtualtabletop/issues/712
  // This function changes /assets/* to ./assets/*, effectively making it relative, so the server can be deployed to any directories, not just root.
  // If the new library standard changes in the future (mandate a relative path), we can drop this transformation
  if (obj === null) {
    return obj
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === 'string') {
        obj[i] = obj[i].replace(/^\/assets\//, './assets/')
                       .replace(/^\/i\//, './i/')
                       .replace(/url\s*\(\s*\//g, 'url(./');
      } else {
        await transformAssetsPathToRelative(obj[i])
      }
    }
  } else if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        obj[key] = value.replace(/^\/assets\//, './assets/')
                        .replace(/^\/i\//, './i/')
                        .replace(/url\s*\(\s*\//g, 'url(./');
      } else {
        await transformAssetsPathToRelative(value)
      }
    }
  }
}

async function readStatesFromBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  if(zip.files['widgets.json'])
    return { 'PCIO': await readVariantsFromBuffer(buffer) };

  const states = [];
  for (const filename in zip.files) {
    if (filename.match(/^[^\/]+\.json$/) && zip.files[filename]._data) {
      var result = await readVariantsFromBuffer(buffer);
      await transformAssetsPathToRelative(result)
      return { 'VTT': result };
    }
    if(filename.match(/\.(vtt|pcio)$/) && zip.files[filename]._data)
      states[filename] = await readVariantsFromBuffer(await zip.files[filename].async('nodebuffer'));
  }
  if(states.length == 0)
    throw new Logging.UserError(404, 'Did not find any JSON files in the ZIP file.');
  return states;
}

async function readStatesFromLink(linkAndPath) {
  const link = linkAndPath.replace(/#.*/, '');
  const path = linkAndPath.match(/#/) ? linkAndPath.replace(/.*#/, '').split('/') : [];

  await downloadLink(link);
  const states = JSON.parse(fs.readFileSync(`${dirname}/${linkStatus[link].filename}`));

  if(path.length == 0)
    return states;

  if(path.length == 1) {
    const returnStates = {};
    returnStates[path[0]] = states[path[0]];
    return returnStates;
  }

  if(path.length == 2) {
    const returnStates = {};
    returnStates[path[0]] = {};
    returnStates[path[0]][path[1]] = states[path[0]][path[1]];
    return returnStates;
  }
}

async function readVariantsFromBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  if(zip.files['widgets.json']) {
    const pcio = await PCIO(buffer);
    return { 'PCIO': pcio };
  } else {
    const variants = {};
    for(const filename in zip.files) {

      if(filename.match(/^[^\/]+\.json$/) && filename != 'asset-map.json' && zip.files[filename]._data) {
        if(zip.files[filename]._data.uncompressedSize >= 20971520)
          throw new Logging.UserError(403, `${filename} is bigger than 20 MiB.`);
        const variant = JSON.parse(await zip.files[filename].async('string'));
        if(typeof variant._meta.version != 'number' || variant._meta.version > VERSION || variant._meta.version < 0)
          throw new Logging.UserError(403, `Found a valid JSON file but version ${variant._meta.version} is not supported. Please update your server.`);
        variants[filename] = variant;
      }

      if(filename.match(/^\/?assets/) && zip.files[filename]._data && zip.files[filename]._data.uncompressedSize < 2097152) {
        const targetFile = '/assets/' + zip.files[filename]._data.crc32 + '_' + zip.files[filename]._data.uncompressedSize;
        if(targetFile.match(/^\/assets\/[0-9_-]+$/) && !fs.existsSync(path.resolve() + '/save' + targetFile))
          fs.writeFileSync(path.resolve() + '/save' + targetFile, await zip.files[filename].async('nodebuffer'));
      }

    }
    if(!Object.keys(variants).length)
      throw new Logging.UserError(404, 'Did not find any JSON files in the ZIP file.');
    return variants;
  }
}

async function readVariantFromLink(linkAndPath) {
  const link = linkAndPath.replace(/#.*/, '');
  const path = linkAndPath.replace(/.*#/, '').split('/');
  const states = await readStatesFromLink(link);
  return states[path[0]][path[1]];
}

export default {
  downloadLink,
  readStatesFromBuffer,
  readStatesFromLink,
  readVariantFromLink
}
