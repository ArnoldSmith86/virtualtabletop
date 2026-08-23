import Logging from '../../server/logging.mjs';

// the express body parsers reject an oversized upload with this error, so the client only ever learns
// what went wrong from what the handler turns it into
function tooLargeError(length, limit) {
  const e = new Error('request entity too large');
  e.type = 'entity.too.large';
  e.length = length;
  e.limit = limit;
  return e;
}

// console.log/console.error decide whether a message reaches stdout or stderr
function captureConsole(func) {
  const captured = { stdout: '', stderr: '' };
  const original = { log: console.log, error: console.error };
  console.log = (...args)=>captured.stdout += args.join(' ') + '\n';
  console.error = (...args)=>captured.stderr += args.join(' ') + '\n';
  try {
    func();
  } finally {
    Object.assign(console, original);
  }
  return captured;
}

function fakeResponse() {
  const res = { code: null, body: null };
  res.status = c=>{ res.code = c; return res; };
  res.send = b=>{ res.body = b; return res; };
  return res;
}

describe('server/logging.mjs', function() {
  test('answers an oversized upload with the size and the limit', function() {
    const res = fakeResponse();
    Logging.userErrorHandler(tooLargeError(15000000, 10485760), {}, res, function() {});
    expect(res.code).toBe(413);
    expect(res.body).toBe('The file is 14.3 MiB - the limit is 10 MiB.');
  });

  test('answers an oversized upload of unknown length', function() {
    const res = fakeResponse();
    Logging.userErrorHandler(tooLargeError(undefined, 524288000), {}, res, function() {});
    expect(res.code).toBe(413);
    expect(res.body).toBe('The file is bigger - the limit is 500 MiB.');
  });

  test('passes a UserError through with its own code', function() {
    const res = fakeResponse();
    Logging.userErrorHandler(new Logging.UserError(404, 'Invalid room.'), {}, res, function() {});
    expect(res.code).toBe(404);
    expect(res.body).toBe('Invalid room.');
  });

  test('logs a nonfatal exception with its stack on stdout', function() {
    const captured = captureConsole(()=>Logging.handleGenericException('HTTP server', new Error('boom')));
    expect(captured.stdout).toContain('ERROR - GENERIC HTTP server - Error: boom');
    expect(captured.stderr).toBe('');
  });

  test('logs an exception that ends the process on stderr', function() {
    const captured = captureConsole(()=>Logging.handleFatalException('listening on port 8272', new Error('boom')));
    expect(captured.stderr).toContain('ERROR - GENERIC listening on port 8272 - Error: boom');
    expect(captured.stdout).toBe('');
  });

  test('leaves anything else to the next handler', function() {
    const res = fakeResponse();
    let passed = false;
    Logging.userErrorHandler(new Error('something else'), {}, res, function() { passed = true; });
    expect(passed).toBe(true);
    expect(res.code).toBe(null);
  });
});
