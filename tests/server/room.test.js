import fs from 'fs';
import os from 'os';
import path from 'path';

import Room from '../../server/room.mjs';

let directory = null;
let source = null;

const moveFile = (from, to)=>Room.prototype.moveFile.call(null, from, to);

beforeEach(function() {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-room-'));
  source = path.join(directory, '0.json');
  fs.writeFileSync(source, '{"a":1}');
});

afterEach(function() {
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('server/room.mjs', function() {
  test('moveFile moves a file to its new name', function() {
    moveFile(source, path.join(directory, '1.json'));
    expect(fs.readdirSync(directory)).toEqual([ '1.json' ]);
    expect(fs.readFileSync(path.join(directory, '1.json'), 'utf8')).toEqual('{"a":1}');
  });

  test('moveFile keeps the file when source and target are the same', function() {
    moveFile(source, source);
    expect(fs.readFileSync(source, 'utf8')).toEqual('{"a":1}');
  });
});
