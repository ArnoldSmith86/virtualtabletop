import fs from 'fs';
import os from 'os';

import FileWriter from '../../server/filewriter.mjs';

let directory = null;
let filename = null;

beforeEach(function() {
  directory = fs.mkdtempSync(os.tmpdir() + '/vtt-filewriter-');
  filename = directory + '/test.json';
});

afterEach(function() {
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('server/filewriter.mjs', function() {
  test('writes a new file and leaves no temporary file behind', function() {
    FileWriter.writeFileSync(filename, '{"a":1}');
    expect(fs.readFileSync(filename, 'utf8')).toEqual('{"a":1}');
    expect(fs.readdirSync(directory)).toEqual([ 'test.json' ]);
  });

  test('replaces the content of an existing file', function() {
    fs.writeFileSync(filename, 'old content that is longer than the new one');
    FileWriter.writeFileSync(filename, 'new');
    expect(fs.readFileSync(filename, 'utf8')).toEqual('new');
    expect(fs.readdirSync(directory)).toEqual([ 'test.json' ]);
  });

  test('writes buffers as-is', function() {
    FileWriter.writeFileSync(filename, Buffer.from([ 0, 1, 2, 255 ]));
    expect(Buffer.compare(fs.readFileSync(filename), Buffer.from([ 0, 1, 2, 255 ]))).toEqual(0);
  });

  test('keeps the old file when writing the temporary file fails', function() {
    fs.writeFileSync(filename, 'old');
    // a directory in the place of the temporary file makes writing it fail
    fs.mkdirSync(filename + '.tmp');
    expect(()=>FileWriter.writeFileSync(filename, 'new')).toThrow();
    expect(fs.readFileSync(filename, 'utf8')).toEqual('old');
  });
});
