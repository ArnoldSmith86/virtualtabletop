import fs from 'fs';
import CRC32 from 'crc-32';

import { VERSION } from './fileupdater.mjs';
import PCIO from './pcioimport.mjs';
import TTS from './ttsimport.mjs';
import Logging from './logging.mjs';
import Config from './config.mjs';
import Zip from './zip.mjs';

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

  const headers = requestEtag ? { headers: { 'If-None-Match': requestEtag } } : {};
  let response = null;
  try {
    if(link.match(/\/game\//))
      response = await fetch(await TTS.resolveLink(link.replace(/\/game\//, '/s/')), headers);
    else
      throw new Error('only needs original fetch');
  } catch(e) {
    response = await fetch(await TTS.resolveLink(link), headers);
  }

  currentLinkStatus.time = +new Date();
  currentLinkStatus.status = response.status;

  if(response.status != 304) {
    currentLinkStatus.etag = response.headers.get('etag');
    let states = null;
    const content = Buffer.from(await response.arrayBuffer());
    if(TTS.isTTSlink(link)) {
      states = await TTS.fromBSON(content, link);
    } else {
      states = await readStatesFromBuffer(content, true);
    }
    fs.writeFileSync(`${dirname}/${currentLinkStatus.filename}`, JSON.stringify(states));
  }

  linkStatus[link] = currentLinkStatus;
  fs.writeFileSync(filename, JSON.stringify(linkStatus));
}

async function readStatesFromBuffer(buffer, includeVariantNameList) {
  const entries = Zip.list(buffer);

  if(entries['WorkshopUpload'] !== undefined)
    return { 'TTS': await readVariantsFromBuffer(buffer) };
  if(entries['widgets.json'] !== undefined)
    return { 'PCIO': await readVariantsFromBuffer(buffer) };

  const states = {};
  for(const filename in entries) {
    if(filename.match(/^[^\/]+\.json$/)) {
      const result = { 'VTT': await readVariantsFromBuffer(buffer) };

      if(includeVariantNameList) {
        result._variantNameList = {};
        let i = 0;
        for(const name in entries)
          if(name.match(/^[^\/]+\.json$/))
            result._variantNameList[name.substr(0, name.length-5)] = i++;
      }

      return result;
    }
    if(filename.match(/\.(vtt|pcio)$/)) {
      // the size comes from the zip index, so it has to be checked before unpacking
      if(entries[filename] >= 104857600)
        throw new Logging.UserError(403, `${filename} is bigger than 100 MiB.`);
      states[filename] = await readVariantsFromBuffer((await Zip.read(buffer, [ filename ]))[filename]);
    }
  }
  if(Object.keys(states).length == 0)
    throw new Logging.UserError(404, 'Did not find any JSON files in the ZIP file.');
  return states;
}

function checkForLinkToOwnServer(link) {
  if(!fs.existsSync(Config.directory('save') + '/shares.json'))
    return null;

  const localPrefix = Config.get('externalURL').replace(/[.*+?^${}()|[\]\\]/g, m=>'\\'+m[0]);
  const match = link.match(`^${localPrefix}/(s|game)/([0-9a-z]{8})/`);

  if(match) {
    const sharedLinks = JSON.parse(fs.readFileSync(Config.directory('save') + '/shares.json'));
    const m = sharedLinks['/s/'+match[2]].split('/');

    const states = {};
    states['VTT'] = [];

    const room = JSON.parse(fs.readFileSync(Config.directory('save') + '/rooms/' + m[2] + '.json'));

    if(!room._meta.states[m[3]])
      throw new Logging.UserError(404, 'The link target has been deleted.');

    for(const [ i, variant ] of Object.entries(room._meta.states[m[3]].variants)) {
      const info = Object.assign({...room._meta.states[m[3]]}, variant);
      if(variant.link || variant.plStateID) {
        states['VTT'].push({ _meta: { version: 8, info } });
      } else {
        states['VTT'].push(JSON.parse(fs.readFileSync(Config.directory('save') + `/states/${m[2]}-${m[3]}-${i}.json`)));
        const gameSettings = states['VTT'][i]._meta.gameSettings;
        states['VTT'][i]._meta = { version: states['VTT'][i]._meta.version, info };
        if(gameSettings)
          states['VTT'][i]._meta.gameSettings = gameSettings;
      }
      delete states['VTT'][i]._meta.info.variants;
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

  // if the state ID isn't in there but there is only one state, use that instead
  if(!states[path[0]] && Object.keys(states).length == 1)
    path[0] = Object.keys(states)[0];

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
  const entries = Zip.list(buffer);
  if(Object.keys(entries).filter(f=>f.match(/WorkshopUpload/)).length) {
    return [ await TTS.fromZIP(buffer) ];
  } else if(entries['widgets.json'] !== undefined) {
    return [ await PCIO(buffer) ];
  } else {
    const variants = [];
    for(const filename in entries) {

      if(filename.match(/^[^\/]+\.json$/) && filename != 'asset-map.json') {
        if(entries[filename] >= 20971520)
          throw new Logging.UserError(403, `${filename} is bigger than 20 MiB.`);
        const variant = JSON.parse(await Zip.readString(buffer, filename));
        if(typeof variant._meta.version != 'number' || variant._meta.version > VERSION || variant._meta.version < 0)
          throw new Logging.UserError(403, `Found a valid JSON file but version ${variant._meta.version} is not supported. Please update your server.`);
        const isNumeric = filename.match(/^([0-9]+)\.json$/);
        if(isNumeric)
          variants[isNumeric[1]] = variant;
        else
          variants.push(variant);
      }

      if(filename.match(/^\/?assets/) && !filename.match(/\/$/)) {
        if(entries[filename] >= 10485760)
          throw new Logging.UserError(403, `${filename} is bigger than 10 MiB.`);
        const content = (await Zip.read(buffer, [ filename ]))[filename];
        const targetFile = CRC32.buf(content) + '_' + content.length;
        if(!Config.resolveAsset(targetFile))
          fs.writeFileSync(Config.directory('assets') + '/' + targetFile, content);
      }

    }
    if(!variants.length)
      throw new Logging.UserError(404, 'Did not find any JSON files in the ZIP file.');
    return variants;
  }
}

async function readVariantFromLink(linkAndPath) {
  const link = linkAndPath.replace(/#[^#]*$/, '');
  const path = linkAndPath.replace(/^[^#]*#/, '').split('/');
  const states = await readStatesFromLink(link, true);
  return states[path[0]][states._variantNameList ? states._variantNameList[path[1].replace(/\.json$/, '')] : path[1]];
}

export default {
  downloadLink,
  readStatesFromBuffer,
  readStatesFromLink,
  readVariantFromLink
}
