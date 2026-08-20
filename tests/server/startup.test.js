import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function occupyPort() {
  return new Promise(function(resolve) {
    const blocker = net.createServer();
    blocker.listen(0, function() {
      resolve({ port: blocker.address().port, release: ()=>new Promise(r=>blocker.close(r)) });
    });
  });
}

function startServer(port, saveDir) {
  return new Promise(function(resolve) {
    const child = spawn(process.execPath, [ 'server.mjs' ], {
      cwd: rootDir,
      env: Object.assign({}, process.env, { PORT: String(port), VTT_SAVE_DIR: saveDir })
    });
    let output = '';
    child.stdout.on('data', d=>output += d);
    child.stderr.on('data', d=>output += d);
    child.on('close', code=>resolve({ code, output }));
  });
}

describe('server startup with an unavailable port', function() {
  let blocked, saveDir, result;

  beforeAll(async function() {
    blocked = await occupyPort();
    saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-startup-'));
    result = await startServer(blocked.port, saveDir);
  }, 60000);

  afterAll(async function() {
    await blocked.release();
    fs.rmSync(saveDir, { recursive: true, force: true });
  });

  test('explains what is wrong instead of dumping an unhandled error event', function() {
    expect(result.output).toContain(`Port ${blocked.port} is already in use`);
    expect(result.output).not.toContain('Unhandled \'error\' event');
    expect(result.output).not.toContain('EADDRINUSE');
  });

  test('exits with a failure code', function() {
    expect(result.code).toBe(1);
  });

  test('leaves the save directory of the running instance alone', function() {
    expect(fs.existsSync(path.join(saveDir, 'statistics.json'))).toBe(false);
  });
});
