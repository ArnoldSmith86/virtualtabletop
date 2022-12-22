import fs from 'fs';
import fetch from 'node-fetch';
import JSZip from 'jszip';

import { VERSION } from './fileupdater.mjs';
import PCIO from './pcioimport.mjs';
import Logging from './logging.mjs';
import Config from './config.mjs';

const dirname = Config.directory('save') + '/links';
const filename = dirname + '.json';
const linkStatus = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename)) : {};

async function downloadLink(link) {
  link = link.replace(/#.*/, '');

  let requestEtag = null;
  if(linkStatus[link]) {
    requestEtag = linkStatus[link].etag;
    if(requestEtag === null || linkStatus[link].time > +(new Date()) - 2*60*60*1000)
      return;
  }
  const currentLinkStatus = linkStatus[link] || {
    filename: Math.random().toString(36).substring(3, 9)
  };

  const response = await fetch(link, requestEtag ? { headers: { 'If-None-Match': requestEtag } } : {});

  currentLinkStatus.time = +new Date();
  currentLinkStatus.status = response.status;

  if(response.status != 304) {
    currentLinkStatus.etag = response.headers.get('etag');
    const states = await readStatesFromBuffer(await response.buffer(), true);
    fs.writeFileSync(`${dirname}/${currentLinkStatus.filename}`, JSON.stringify(states));
  }

  linkStatus[link] = currentLinkStatus;
  fs.writeFileSync(filename, JSON.stringify(linkStatus));
}

async function readStatesFromBuffer(buffer, includeVariantNameList) {
  const zip = await JSZip.loadAsync(buffer);

  if(zip.files['widgets.json'])
    return { 'PCIO': await readVariantsFromBuffer(buffer) };

  const states = {};
  for(const filename in zip.files) {
    if(filename.match(/^[^\/]+\.json$/) && zip.files[filename]._data) {
      const result = { 'VTT': await readVariantsFromBuffer(buffer) };

      if(includeVariantNameList) {
        result._variantNameList = {};
        let i = 0;
        for(const name in zip.files)
          if(name.match(/^[^\/]+\.json$/))
            result._variantNameList[name.substr(0, name.length-5)] = i++;
      }

      return result;
    }
    if(filename.match(/\.(vtt|pcio)$/) && zip.files[filename]._data)
      states[filename] = await readVariantsFromBuffer(await zip.files[filename].async('nodebuffer'));
  }
  if(Object.keys(states).length == 0)
    throw new Logging.UserError(404, 'Did not find any JSON files in the ZIP file.');
  return states;
}

function checkForLinkToOwnServer(link) {
  if(!fs.existsSync(Config.directory('save') + '/shares.json'))
    return null;

  const localPrefix = Config.get('externalURL').replace(/[.*+?^${}()|[\]\\]/g, m=>'\\'+m[0]);
  const match = link.match(`^${localPrefix}(/s/[0-9a-z]{8})/`);

  if(match) {
    const sharedLinks = JSON.parse(fs.readFileSync(Config.directory('save') + '/shares.json'));
    const m = sharedLinks[match[1]].split('/');

    const states = {};
    states[m[3]] = [];

    const room = JSON.parse(fs.readFileSync(Config.directory('save') + '/rooms/' + m[2] + '.json'));

    if(!room._meta.states[m[3]])
      throw Error('The link target has been deleted.');

    for(const [ i, variant ] of Object.entries(room._meta.states[m[3]].variants)) {
      const info = Object.assign({...room._meta.states[m[3]]}, variant);
      if(variant.link || variant.plStateID) {
        states[m[3]].push({ _meta: { version: 8, info } });
      } else {
        states[m[3]].push(JSON.parse(fs.readFileSync(Config.directory('save') + `/states/${m[2]}-${m[3]}-${i}.json`)));
        states[m[3]][i]._meta = { version: states[m[3]][i]._meta.version, info };
      }
      delete states[m[3]][i]._meta.info.variants;
    }

    return states;
  }
}

async function readStatesFromLink(linkAndPath, includeVariantNameList) {
  const link = linkAndPath.replace(/#[^#]*$/, '');
  const path = linkAndPath.match(/#/) ? linkAndPath.replace(/^[^#]*#/, '').split('/') : [];

  let states = checkForLinkToOwnServer(link);

  if(!states) {
    await downloadLink(link);
    states = JSON.parse(fs.readFileSync(`${dirname}/${linkStatus[link].filename}`));
  }

  if(path.length == 0) {
    if(!includeVariantNameList)
      delete states._variantNameList;
    return states;
  }

  if(path.length == 1) {
    const returnStates = {};
    returnStates[path[0]] = states[path[0]];
    return returnStates;
  }

  if(path.length == 2) {
    const returnStates = {};
    returnStates[path[0]] = {};
    if(states._variantNameList && states._variantNameList[path[1].replace(/\.json$/, '')])
      returnStates[path[0]][states._variantNameList[path[1].replace(/\.json$/, '')]] = returnStates[path[0]][path[1]] = states[path[0]][states._variantNameList[path[1].replace(/\.json$/, '')]];
    else
      returnStates[path[0]][path[1]] = states[path[0]][path[1]];
    return returnStates;
  }
}

async function readVariantsFromBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  if(zip.files['widgets.json']) {
    return [ await PCIO(buffer) ];
  } else {
    const variants = [];
    for(const filename in zip.files) {

      if(filename.match(/^[^\/]+\.json$/) && filename != 'asset-map.json' && zip.files[filename]._data) {
        if(zip.files[filename]._data.uncompressedSize >= 20971520)
          throw new Logging.UserError(403, `${filename} is bigger than 20 MiB.`);
        const variant = JSON.parse(await zip.files[filename].async('string'));
        if(typeof variant._meta.version != 'number' || variant._meta.version > VERSION || variant._meta.version < 0)
          throw new Logging.UserError(403, `Found a valid JSON file but version ${variant._meta.version} is not supported. Please update your server.`);
        const isNumeric = filename.match(/^([0-9]+)\.json$/);
        if(isNumeric)
          variants[isNumeric[1]] = variant;
        else
          variants.push(variant);
      }

      if(filename.match(/^\/?assets/) && zip.files[filename]._data) {
        if(zip.files[filename]._data.uncompressedSize >= 10485760)
          throw new Logging.UserError(403, `${filename} is bigger than 10 MiB.`);
        const targetFile = zip.files[filename]._data.crc32 + '_' + zip.files[filename]._data.uncompressedSize;
        if(!Config.resolveAsset(targetFile))
          fs.writeFileSync(Config.directory('assets') + '/' + targetFile, await zip.files[filename].async('nodebuffer'));
      }

    }
    if(!variants.length)
      throw new Logging.UserError(404, 'Did not find any JSON files in the ZIP file.');
    return variants;
  }
}

async function readVariantFromLink(linkAndPath) {
  const link = linkAndPath.replace(/#.*/, '');
  const path = linkAndPath.replace(/.*#/, '').split('/');
  const states = await readStatesFromLink(link, true);
  return states[path[0]][states._variantNameList ? states._variantNameList[path[1].replace(/\.json$/, '')] : path[1]];
}

export default {
  downloadLink,
  readStatesFromBuffer,
  readStatesFromLink,
  readVariantFromLink
}
