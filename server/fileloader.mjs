import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import JSZip from 'jszip';

import PCIO from './pcioimport.mjs';

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

  const response = await fetch(link, requestEtag ? { headers: { 'If-None-Match': requestEtag } } : {});

  linkStatus[link].time = +new Date();
  linkStatus[link].status = response.status;

  if(response.status != 304) {
    linkStatus[link].etag = response.headers.get('etag');
    const states = await readStatesFromBuffer(await response.buffer());
    fs.writeFileSync(`${dirname}/${linkStatus[link].filename}`, JSON.stringify(states));
  }

  fs.writeFileSync(filename, JSON.stringify(linkStatus));
}

async function readStatesFromBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  if(zip.files['widgets.json'])
    return { 'PCIO': await readVariantsFromBuffer(buffer) };

  const states = [];
  for(const filename in zip.files) {
    if(filename.match(/^[^\/]+\.json$/) && zip.files[filename]._data)
      return { 'VTT': await readVariantsFromBuffer(buffer) };
    if(filename.match(/^[^\/]+\.(vtt|pcio)$/) && zip.files[filename]._data)
      states[filename] = await readVariantsFromBuffer(await zip.files[filename].async('nodebuffer'));
  }
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

      if(filename.match(/^[^\/]+\.json$/) && zip.files[filename]._data) {
        if(zip.files[filename]._data.uncompressedSize >= 2097152)
          throw `${filename} is bigger than 2 MiB.`;
        const variant = JSON.parse(await zip.files[filename].async('string'));
        if(variant._meta.version !== 1)
          throw `Found a valid JSON file but version ${variant._meta.version} is not supported.`;
        variants[filename] = variant;
      }

      if(filename.match(/^\/?assets/) && zip.files[filename]._data && zip.files[filename]._data.uncompressedSize < 2097152) {
        const targetFile = '/assets/' + zip.files[filename]._data.crc32 + '_' + zip.files[filename]._data.uncompressedSize;
        if(!fs.existsSync(path.resolve() + '/save' + targetFile))
          fs.writeFileSync(path.resolve() + '/save' + targetFile, await zip.files[filename].async('nodebuffer'));
      }

    }
    if(!Object.keys(variants).length)
      throw 'Did not find any JSON files in the ZIP file.';
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
