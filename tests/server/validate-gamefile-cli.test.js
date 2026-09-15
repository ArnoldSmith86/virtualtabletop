import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// The library check on a pull request tells findings and a broken validator apart by
// looking at stderr: everything it can say about a game file goes to stdout, so anything
// on stderr means the validator stopped without a verdict. A file it cannot read or
// parse is a problem with the file, so it has to come out as a finding like any other.
const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../validator/validate_gamefile_node.js');
let directory = null;

function validate(content) {
  const filename = `${directory}/game.json`;
  fs.writeFileSync(filename, content);
  const result = spawnSync('node', [ cli, filename ], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr };
}

beforeEach(function() {
  directory = fs.mkdtempSync(os.tmpdir() + '/vtt-validate-cli-');
});

afterEach(function() {
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('validator/validate_gamefile_node.js', function() {
  test('reports invalid JSON as a finding', function() {
    const result = validate('{ invalid json');
    expect(result.stdout).toMatch(/^\[\]: Not valid JSON: /);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(1);
  });

  test('reports a file that is not an object as a finding', function() {
    const result = validate('null');
    expect(result.stdout).toBe('[]: Game file must be a JSON object');
    expect(result.stderr).toBe('');
    expect(result.status).toBe(1);
  });

  test('reports a missing file as a finding', function() {
    const result = spawnSync('node', [ cli, `${directory}/nothing.json` ], { encoding: 'utf8' });
    expect(result.stdout.trim()).toMatch(/^\[\]: ENOENT/);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(1);
  });

  test('reports what is wrong with a game file', function() {
    const result = validate(JSON.stringify({ b: { id: 'b', type: 'button' } }));
    expect(result.stdout).toBe('[_meta]: Missing required _meta object');
    expect(result.stderr).toBe('');
    expect(result.status).toBe(1);
  });
});
