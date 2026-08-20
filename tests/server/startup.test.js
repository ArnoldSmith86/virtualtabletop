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
  const child = spawn(process.execPath, [ 'server.mjs' ], {
    cwd: rootDir,
    env: Object.assign({}, process.env, { PORT: String(port), VTT_SAVE_DIR: saveDir })
  });
  // a server that manages to bind would otherwise run forever and outlive the test run
  const result = new Promise(function(resolve) {
    let stdout = '';
    let stderr = '';
    const giveUp = setTimeout(function() {
      child.kill('SIGKILL');
      resolve({ code: null, stdout, stderr });
    }, 30000);
    child.stdout.on('data', d=>stdout += d);
    child.stderr.on('data', d=>stderr += d);
    child.on('close', function(code) {
      clearTimeout(giveUp);
      resolve({ code, stdout, stderr });
    });
  });
  return { child, result };
}

describe('server startup with an unavailable port', function() {
  let blocked, saveDir, server, result;

  beforeAll(async function() {
    blocked = await occupyPort();
    saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-startup-'));
    server = startServer(blocked.port, saveDir);
    result = await server.result;
  }, 60000);

  afterAll(async function() {
    server.child.kill('SIGKILL');
    await blocked.release();
    fs.rmSync(saveDir, { recursive: true, force: true });
  });

  test('explains what is wrong instead of dumping an unhandled error event', function() {
    expect(result.stderr).toContain(`Port ${blocked.port} is already in use`);
    expect(result.stderr).not.toContain('Unhandled \'error\' event');
    expect(result.stderr).not.toContain('EADDRINUSE');
  });

  test('names the environment variable the port came from', function() {
    expect(result.stderr).toContain('set a different port via the PORT environment variable');
  });

  test('reports the failure on stderr so it survives a redirected stdout', function() {
    expect(result.stdout).not.toContain('is already in use');
  });

  test('exits with a failure code', function() {
    expect(result.code).toBe(1);
  });

  test('does not write statistics into the save directory of the running instance', function() {
    expect(fs.existsSync(path.join(saveDir, 'statistics.json'))).toBe(false);
  });
});
