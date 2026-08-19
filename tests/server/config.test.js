import fs from 'fs';
import os from 'os';

let directory = null;
let repository = null;

// the Config singleton bootstraps its files relative to the working directory, so a temporary
// directory holding just the two templates is enough to exercise a first start
beforeEach(function() {
  repository = process.cwd();
  directory = fs.mkdtempSync(os.tmpdir() + '/vtt-config-');
  fs.mkdirSync(directory + '/client/css', { recursive: true });
  fs.copyFileSync(repository + '/config.template.json', directory + '/config.template.json');
  fs.copyFileSync(repository + '/client/css/custom_template.css', directory + '/client/css/custom_template.css');
  process.chdir(directory);
});

afterEach(function() {
  process.chdir(repository);
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('server/config.mjs', function() {
  test('creates config.json and custom.css from their templates on the first start', async function() {
    await import('../../server/config.mjs?firstStart');
    expect(fs.readFileSync(directory + '/config.json', 'utf8')).toEqual(fs.readFileSync(directory + '/config.template.json', 'utf8'));
    expect(fs.readFileSync(directory + '/client/css/custom.css', 'utf8')).toEqual(fs.readFileSync(directory + '/client/css/custom_template.css', 'utf8'));
    expect(fs.readdirSync(directory).filter(file=>file.match(/tmp$/))).toEqual([]);
    expect(fs.readdirSync(directory + '/client/css').filter(file=>file.match(/tmp$/))).toEqual([]);
  });

  test('leaves no config.json behind when creating it fails', async function() {
    // a directory in the place of the temporary file makes writing it fail
    fs.mkdirSync(directory + '/config.json.tmp');
    await expect(import('../../server/config.mjs?failingFirstStart')).rejects.toThrow();
    expect(fs.existsSync(directory + '/config.json')).toEqual(false);
  });
});
