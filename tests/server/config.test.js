import fs from 'fs';
import os from 'os';
import path from 'path';

let directory = null;
let repository = null;

// the Config singleton bootstraps its files relative to the working directory, so a temporary
// directory holding just the two templates is enough to exercise a first start
beforeEach(function() {
  repository = process.cwd();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-config-'));
  fs.mkdirSync(path.join(directory, 'client/css'), { recursive: true });
  fs.copyFileSync(path.join(repository, 'config.template.json'), path.join(directory, 'config.template.json'));
  fs.copyFileSync(path.join(repository, 'client/css/custom_template.css'), path.join(directory, 'client/css/custom_template.css'));
  process.chdir(directory);
});

afterEach(function() {
  process.chdir(repository);
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('server/config.mjs', function() {
  test('creates config.json and custom.css from their templates on the first start', async function() {
    await import('../../server/config.mjs?firstStart');
    expect(fs.readFileSync(path.join(directory, 'config.json'), 'utf8')).toEqual(fs.readFileSync(path.join(directory, 'config.template.json'), 'utf8'));
    expect(fs.readFileSync(path.join(directory, 'client/css/custom.css'), 'utf8')).toEqual(fs.readFileSync(path.join(directory, 'client/css/custom_template.css'), 'utf8'));
    expect(fs.readdirSync(directory).filter(file=>file.match(/tmp$/))).toEqual([]);
    expect(fs.readdirSync(path.join(directory, 'client/css')).filter(file=>file.match(/tmp$/))).toEqual([]);
  });

  test('leaves no config.json behind when creating it fails', async function() {
    // a directory in the place of the temporary file makes writing it fail
    fs.mkdirSync(path.join(directory, 'config.json.tmp'));
    await expect(import('../../server/config.mjs?failingFirstStart')).rejects.toThrow();
    expect(fs.existsSync(path.join(directory, 'config.json'))).toEqual(false);
  });
});
