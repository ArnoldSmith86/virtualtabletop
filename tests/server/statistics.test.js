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

  test('moves a file aside that parses into something other than an object', function() {
    for(const content of [ 'null', '[]', '42', '"statistics"' ]) {
      expectEmpty(load(content));
      expect(fs.readFileSync(filename + '.corrupt', 'utf8')).toEqual(content);
      fs.rmSync(filename + '.corrupt');
    }
  });

  test('moves a file aside whose top level keys have the wrong type', function() {
    expectEmpty(load('{"starsPerState":42,"timePerState":{}}'));
    expect(fs.existsSync(filename + '.corrupt')).toBe(true);
  });

  test('starts with empty statistics when the file cannot be read', function() {
    fs.mkdirSync(filename);
    expectEmpty(new Statistics(filename));
    expect(logs.join('\n')).toMatch(/WARNING.*could not read/);
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
});
