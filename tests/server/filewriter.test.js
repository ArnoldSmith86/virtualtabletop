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

  test('writes a file asynchronously and leaves no temporary file behind', async function() {
    await FileWriter.writeFile(filename, '{"a":1}');
    expect(fs.readFileSync(filename, 'utf8')).toEqual('{"a":1}');
    expect(fs.readdirSync(directory)).toEqual([ 'test.json' ]);
  });

  test('keeps the event loop running while writing', async function() {
    let ticks = 0;
    const ticker = setInterval(()=>++ticks, 1);
    await FileWriter.writeFile(filename, Buffer.alloc(8 * 1024 * 1024));
    clearInterval(ticker);

    expect(ticks).toBeGreaterThan(0);
  });

  test('does not replace a newer synchronous write', async function() {
    const write = FileWriter.writeFile(filename, Buffer.alloc(8 * 1024 * 1024, 'a'));
    FileWriter.writeFileSync(filename, 'new');
    await write;

    expect(fs.readFileSync(filename, 'utf8')).toEqual('new');
    expect(fs.readdirSync(directory)).toEqual([ 'test.json' ]);
  });

  test('removes the temporary file when an asynchronous rename fails', async function() {
    fs.mkdirSync(filename);
    await expect(FileWriter.writeFile(filename, 'new')).rejects.toThrow();
    expect(fs.readdirSync(directory)).toEqual([ 'test.json' ]);
  });

  test('keeps the old file when writing the temporary file fails', function() {
    fs.writeFileSync(filename, 'old');
    // a directory in the place of the temporary file makes writing it fail
    fs.mkdirSync(filename + '.tmp');
    expect(()=>FileWriter.writeFileSync(filename, 'new')).toThrow();
    expect(fs.readFileSync(filename, 'utf8')).toEqual('old');
  });

  test('removes the temporary file when the rename fails', function() {
    // a directory in the place of the target makes renaming the temporary file onto it fail
    fs.mkdirSync(filename);
    expect(()=>FileWriter.writeFileSync(filename, 'new')).toThrow();
    expect(fs.readdirSync(directory)).toEqual([ 'test.json' ]);
  });

  test('copies a file and leaves no temporary file behind', function() {
    const source = directory + '/source.json';
    fs.writeFileSync(source, '{"a":1}');
    FileWriter.copyFileSync(source, filename);
    expect(fs.readFileSync(filename, 'utf8')).toEqual('{"a":1}');
    expect(fs.readdirSync(directory).sort()).toEqual([ 'source.json', 'test.json' ]);
  });

  test('keeps the old file when copying fails', function() {
    fs.writeFileSync(filename, 'old');
    expect(()=>FileWriter.copyFileSync(directory + '/does-not-exist.json', filename)).toThrow();
    expect(fs.readFileSync(filename, 'utf8')).toEqual('old');
    expect(fs.readdirSync(directory)).toEqual([ 'test.json' ]);
  });
});
