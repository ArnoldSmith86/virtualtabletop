// setImmediate is a node global, but the tests run this module in a jsdom environment
import { setImmediate } from 'timers';
import util from 'util';
import zlib from 'zlib';

import { strFromU8, strToU8, unzip, unzipSync, Zip as ZipStream, ZipPassThrough } from 'fflate';

// fflate is a plain (de)compressor without a file object model: it turns a zip into a
// { name: Uint8Array } map in one go. These helpers add the things the importers need on
// top of that - listing a zip without unpacking it (so oversized entries can be rejected
// before they are decompressed), unpacking single entries on demand, and doing both
// without keeping the event loop busy for seconds on a big game, which would stall every
// room on the server and not just the one that is being downloaded or imported.

// how much data is hashed into an entry's CRC before the event loop gets a turn again
const chunkSize = 1048576;

const deflateRaw = util.promisify(zlib.deflateRaw);

function toU8(buffer) {
  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
}

// a zip entry whose deflate stream was produced elsewhere: the caller pushes the original
// bytes so that fflate computes the CRC and the size, but the compressed bytes are what
// ends up in the archive
class ZipDeflated extends ZipPassThrough {
  constructor(filename, deflated) {
    super(filename);
    this.compression = 8;
    this.deflated = deflated;
  }

  process(chunk, final) {
    if(final)
      this.ondata(null, this.deflated, true);
  }
}

// { filename: uncompressed size }, directory entries included (their names end in a slash)
// this only reads the zip index, nothing is decompressed
function list(buffer) {
  const entries = {};
  unzipSync(toU8(buffer), { filter: e=>(entries[e.name] = e.originalSize, false) });
  return entries;
}

// unzip inflates small entries right away and hands bigger ones to a worker thread
function read(buffer, names) {
  return new Promise((resolve, reject)=>unzip(toU8(buffer), { filter: e=>names.includes(e.name) }, (e, files)=>e ? reject(e) : resolve(files)));
}

async function readString(buffer, name) {
  const content = (await read(buffer, [ name ]))[name];
  if(!content)
    throw new Error(`${name} is not in the zip file.`);
  return strFromU8(content);
}

// entries are streamed into the zip one chunk at a time so that the event loop keeps
// running while a big collection or a game with many assets is packed
// the deflating itself is left to zlib: fflate's streaming deflate emits back references
// that reach in front of the start of the stream, which yields entries that no inflater
// accepts ("invalid distance"), and zlib compresses in the libuv thread pool anyway
function create(files, compress) {
  return new Promise((resolve, reject)=>{
    const chunks = [];
    const zip = new ZipStream((e, chunk, final)=>{
      if(e)
        return reject(e);
      chunks.push(chunk);
      if(final)
        resolve(Buffer.concat(chunks));
    });

    (async ()=>{
      for(const [ name, content ] of Object.entries(files)) {
        const data = typeof content == 'string' ? strToU8(content) : toU8(content);
        const entry = compress ? new ZipDeflated(name, await deflateRaw(data)) : new ZipPassThrough(name);
        zip.add(entry);
        for(let offset=0; offset<data.length || !offset; offset+=chunkSize) {
          entry.push(data.subarray(offset, offset+chunkSize), offset+chunkSize >= data.length);
          await new Promise(next=>setImmediate(next));
        }
      }
      zip.end();
    })().catch(reject);
  });
}

export default {
  list,
  read,
  readString,
  create
}
