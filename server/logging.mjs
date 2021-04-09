class UserError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function log(message) {
  console.log(new Date().toISOString(), message);
}

function logError(message, e) {
  log(`ERROR - ${message} - ${e.stack.replace(/\n/g, '\\n')}`);
}

function userErrorHandler(err, req, res, next) {
  if(err instanceof UserError)
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
  userErrorHandler,
  errorHandler,
  handleWebSocketException,
  handleGenericException
}
