import zlib from 'zlib';

// A PNG reader for the pixel half of Layer F.
//
// Decoding a screenshot needs exactly two things the platform does not hand you: the chunk
// layout and the scanline filters. Both are ~40 lines against zlib, which node has built in, so
// this is here rather than as two more dependencies in package.json - and a decoder that only
// has to read what Chrome and Firefox write can decline everything else instead of guessing.

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p-a), pb = Math.abs(p-b), pc = Math.abs(p-c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// { width, height, channels, pixels } with pixels as one byte per channel, top row first.
export function decodePNG(buffer) {
  if(buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47)
    throw Error('not a PNG file');

  let header = null;
  const compressed = [];
  for(let position=8; position+8<=buffer.length; ) {
    const length = buffer.readUInt32BE(position);
    const type = buffer.toString('ascii', position+4, position+8);
    const data = buffer.subarray(position+8, position+8+length);
    if(type == 'IHDR')
      header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] };
    else if(type == 'IDAT')
      compressed.push(data);
    else if(type == 'IEND')
      break;
    position += length + 12;
  }

  if(!header)
    throw Error('PNG without an IHDR chunk');
  if(header.bitDepth != 8 || header.interlace != 0 || !CHANNELS[header.colorType])
    throw Error(`unsupported PNG: bit depth ${header.bitDepth}, colour type ${header.colorType}, interlace ${header.interlace}`);

  const { width, height } = header;
  const channels = CHANNELS[header.colorType];
  const raw = zlib.inflateSync(Buffer.concat(compressed));
  const stride = width*channels;
  const pixels = Buffer.alloc(height*stride);

  for(let y=0; y<height; ++y) {
    const filter = raw[y*(stride+1)];
    const line = raw.subarray(y*(stride+1)+1, (y+1)*(stride+1)+0);
    for(let x=0; x<stride; ++x) {
      const left  = x >= channels ? pixels[y*stride + x - channels] : 0;
      const up    = y > 0 ? pixels[(y-1)*stride + x] : 0;
      const upleft = x >= channels && y > 0 ? pixels[(y-1)*stride + x - channels] : 0;
      let value = line[x];
      if(filter == 1)      value += left;
      else if(filter == 2) value += up;
      else if(filter == 3) value += (left+up) >> 1;
      else if(filter == 4) value += paeth(left, up, upleft);
      else if(filter != 0) throw Error(`unknown PNG scanline filter ${filter}`);
      pixels[y*stride + x] = value & 0xff;
    }
  }

  return { width, height, channels, pixels };
}

// Compare two decoded images. `tolerance` is per channel, so a pixel counts as different only
// when one of its channels moved further than anti-aliasing would. Returns the count and the
// first differing pixel, because "1284 pixels differ" is a number nobody can act on without
// knowing where.
export function comparePixels(a, b, { tolerance = 8 } = {}) {
  if(a.width != b.width || a.height != b.height)
    return { differing: a.width*a.height, total: a.width*a.height, message: `different sizes: ${a.width}x${a.height} and ${b.width}x${b.height}` };
  if(a.channels != b.channels)
    return { differing: a.width*a.height, total: a.width*a.height, message: `different channel counts: ${a.channels} and ${b.channels}` };

  let differing = 0;
  let first = null;
  for(let index=0; index<a.pixels.length; index += a.channels) {
    let changed = false;
    for(let channel=0; channel<a.channels; ++channel)
      if(Math.abs(a.pixels[index+channel] - b.pixels[index+channel]) > tolerance)
        changed = true;
    if(changed) {
      ++differing;
      if(!first) {
        const pixel = index/a.channels;
        first = { x: pixel%a.width, y: Math.floor(pixel/a.width),
                  a: [ ...a.pixels.subarray(index, index+a.channels) ].join(','),
                  b: [ ...b.pixels.subarray(index, index+a.channels) ].join(',') };
      }
    }
  }

  const total = a.width*a.height;
  return { differing, total, first,
           message: differing ? `${differing} of ${total} pixels differ, first at ${first.x},${first.y}: ${first.a} vs ${first.b}` : 'identical' };
}
