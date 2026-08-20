class UserError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function log(message) {
  console.log(new Date().toISOString(), String(message).replace(/\n/g, '\\n'));
}

// the last line before a failed startup exits - operators and log wrappers watch stderr for that
function logFatal(message) {
  console.error(new Date().toISOString(), String(message).replace(/\n/g, '\\n'));
}

function logError(message, e) {
  log(`ERROR - ${message} - ${e.stack}`);
}

function fileSize(bytes) {
  return bytes >= 1048576 ? `${+(bytes/1048576).toFixed(1)} MiB` : `${Math.ceil(bytes/1024)} KiB`;
}

function userErrorHandler(err, req, res, next) {
  if(err.type == 'entity.too.large' || err.message == 'request entity too large')
    res.status(413).send(err.limit ? `The file is ${err.length ? fileSize(err.length) : 'bigger'} - the limit is ${fileSize(err.limit)}.` : 'The file is too big.');
  else if(err instanceof UserError)
    res.status(err.code).send(err.message);
  else
    next(err);
}

function errorHandler(err, req, res, next) {
  logError(`URL ${req.originalUrl}`, err);
  res.status(500).send('Internal Server Error');
}

function handleWebSocketException(func, args, e) {
  logError(`WEBSOCKET ${func} - ${JSON.stringify(args)}`, e);
}

function handleGenericException(origin, e) {
  logError(`GENERIC ${origin}`, e);
}

export default {
  UserError,
  log,
  logFatal,
  userErrorHandler,
  errorHandler,
  handleWebSocketException,
  handleGenericException
}
