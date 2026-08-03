import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

// fflate is a plain (de)compressor without a file object model: it turns a zip into a
// { name: Uint8Array } map in one go. These helpers add the two things the importers
// need on top of that - listing a zip without unpacking it (so oversized entries can be
// rejected before they are decompressed) and unpacking single entries on demand.

function toU8(buffer) {
  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
}

// { filename: uncompressed size }, directory entries included (their names end in a slash)
function list(buffer) {
  const entries = {};
  unzipSync(toU8(buffer), { filter: e=>(entries[e.name] = e.originalSize, false) });
  return entries;
}

function read(buffer, names) {
  return unzipSync(toU8(buffer), { filter: e=>names.includes(e.name) });
}

function readString(buffer, name) {
  return strFromU8(read(buffer, [ name ])[name]);
}

function create(files, compress) {
  const entries = {};
  for(const [ name, content ] of Object.entries(files))
    entries[name] = typeof content == 'string' ? strToU8(content) : toU8(content);
  return Buffer.from(zipSync(entries, { level: compress ? 6 : 0 }));
}

export default {
  list,
  read,
  readString,
  create
}
