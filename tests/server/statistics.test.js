import fs from 'fs';
import os from 'os';

import { Statistics } from '../../server/statistics.mjs';

let directory = null;
let filename = null;
let logs = null;
let consoleLog = null;

beforeEach(function() {
  directory = fs.mkdtempSync(os.tmpdir() + '/vtt-statistics-');
  filename = directory + '/statistics.json';
  logs = [];
  consoleLog = console.log;
  console.log = (...args)=>logs.push(args.join(' '));
});

afterEach(function() {
  console.log = consoleLog;
  fs.chmodSync(directory, 0o755);
  fs.rmSync(directory, { recursive: true, force: true });
});

function load(content) {
  if(content !== undefined)
    fs.writeFileSync(filename, content);
  return new Statistics(filename);
}

function expectEmpty(statistics) {
  expect(statistics.data).toEqual({ starsPerState: {}, timePerState: {} });
}

describe('server/statistics.mjs', function() {
  // Root ignores permission bits, so the cases that need a directory the process cannot write
  // to cannot be provoked when the tests happen to run as root.
  const asUser = process.getuid?.() === 0 ? test.skip : test;

  test('starts with empty statistics when the file does not exist', function() {
    expectEmpty(load());
    expect(logs).toEqual([]);
  });

  test('reads an existing file', function() {
    const statistics = load('{"starsPerState":{"a":3},"timePerState":{"a":{"2":5}}}');
    expect(statistics.data).toEqual({ starsPerState: { a: 3 }, timePerState: { a: { 2: 5 } } });
    expect(logs).toEqual([]);
  });

  test('fills in top level keys the file does not have', function() {
    const statistics = load('{"starsPerState":{"a":3}}');
    expect(statistics.data).toEqual({ starsPerState: { a: 3 }, timePerState: {} });
  });

  test('starts with empty statistics when the file is empty', function() {
    expectEmpty(load(''));
    expect(fs.readdirSync(directory)).toEqual([ 'statistics.json' ]);
  });

  test('starts with empty statistics when the file is whitespace only', function() {
    expectEmpty(load('\n  \n'));
  });

  test('moves a truncated file aside and starts with empty statistics', function() {
    const truncated = '{"starsPerState":{"a":3},"timePerSt';
    expectEmpty(load(truncated));
    expect(fs.existsSync(filename)).toBe(false);
    expect(fs.readFileSync(filename + '.corrupt', 'utf8')).toEqual(truncated);
    expect(logs.join('\n')).toMatch(/WARNING.*moved it to/);
  });

  test.each([ 'null', '[]', '42', '"statistics"' ])('moves a file aside that parses into %s instead of an object', function(content) {
    expectEmpty(load(content));
    expect(fs.readFileSync(filename + '.corrupt', 'utf8')).toEqual(content);
  });

  test.each([
    '{"starsPerState":42}',
    '{"starsPerState":{"a":"3"}}',
    '{"timePerState":[]}',
    '{"timePerState":{"a":42}}',
    '{"timePerState":{"a":{"2":"5"}}}'
  ])('moves a file aside whose content is shaped wrongly: %s', function(content) {
    expectEmpty(load(content));
    expect(fs.readFileSync(filename + '.corrupt', 'utf8')).toEqual(content);
  });

  test('does not overwrite a copy that was preserved earlier', function() {
    expectEmpty(load('{"starsPerState":{"a":3'));
    expectEmpty(load('{"starsPerState":{"b":4'));
    expect(fs.readFileSync(filename + '.corrupt', 'utf8')).toEqual('{"starsPerState":{"a":3');
    expect(fs.readFileSync(filename + '.corrupt.2', 'utf8')).toEqual('{"starsPerState":{"b":4');
  });

  asUser('starts with empty statistics when an unusable file cannot be moved aside', function() {
    fs.writeFileSync(filename, 'not json');
    fs.chmodSync(directory, 0o555);
    expectEmpty(new Statistics(filename));
    expect(logs.join('\n')).toMatch(/WARNING.*moving it to .*failed/);
  });

  test('starts with empty statistics when the file cannot be read', function() {
    fs.mkdirSync(filename);
    expectEmpty(new Statistics(filename));
    expect(logs.join('\n')).toMatch(/WARNING.*could not read/);
  });

  test('reports stars and the summed play time of a state', function() {
    const statistics = load('{"starsPerState":{"a":3},"timePerState":{"a":{"2":5,"4":1}}}');
    const states = { s: { publicLibrary: 'a' }, other: { publicLibrary: 'b' } };
    statistics.updateDataInsideStates(states);
    expect(states.s).toEqual({ publicLibrary: 'a', stars: 3, timePlayed: 14 });
    expect(states.other).toEqual({ publicLibrary: 'b', stars: 0, timePlayed: 0 });
  });

  test('reports no play time for a state without recorded player counts', function() {
    const statistics = load('{"starsPerState":{},"timePerState":{"a":{}}}');
    expect(fs.existsSync(filename + '.corrupt')).toBe(false);
    const states = { s: { publicLibrary: 'a' } };
    statistics.updateDataInsideStates(states);
    expect(states.s.timePlayed).toBe(0);
  });

  test('keeps collecting statistics after falling back to empty ones', function() {
    const statistics = load('not json');
    statistics.toggleStateStar('a', true);
    statistics.updateTimeStatistics('a', 2);
    statistics.writeToFilesystem();
    expect(new Statistics(filename).data).toEqual({ starsPerState: { a: 1 }, timePerState: { a: { 2: 1 } } });
  });

  test('writes what it read back unchanged', function() {
    const statistics = load('{"starsPerState":{"a":3},"timePerState":{"a":{"2":5}}}');
    statistics.writeToFilesystem();
    expect(JSON.parse(fs.readFileSync(filename, 'utf8'))).toEqual(statistics.data);
    expect(fs.readdirSync(directory)).toEqual([ 'statistics.json' ]);
  });

  test('does not throw when the file cannot be written and logs the failure once', function() {
    const statistics = load('{"starsPerState":{"a":3},"timePerState":{}}');
    fs.mkdirSync(filename + '.tmp');

    statistics.writeToFilesystem();
    statistics.writeToFilesystem();
    expect(logs.filter(line=>line.match(/could not write/)).length).toBe(1);

    fs.rmSync(filename + '.tmp', { recursive: true });
    statistics.writeToFilesystem();
    expect(JSON.parse(fs.readFileSync(filename, 'utf8'))).toEqual(statistics.data);
    expect(logs.join('\n')).toMatch(/can be written again/);
  });
});
