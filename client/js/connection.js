let lastTimeout = 1000;
let lastOverlay = null;
let connection;
let serverStart = null;
let userNavigatedAway = false;
let messageCallbacks = {};
let onConnectionCloseCallbacks = [];
export function onConnectionClose(cb) { onConnectionCloseCallbacks.push(cb); }

//used by unit tests until jest supports mocking ESM static imports
export function mockConnection() {
  connection = {
    readyState: false
  }
}

export function startWebSocket() {
  let url = location.href.replace(/\/[^\/]*$/, '').replace(/^http/, 'ws');
  console.log(`connecting to ${url}`);
  connection = new WebSocket(url);

  connection.onopen = () => {
    showOverlay(null, true);
    showOverlay(lastOverlay);
    if(!urlProperties.askID) {
      toServer('room', { playerName, roomID });
      if(urlProperties.trace)
        toServer('enableTrace');
    }
  };

  connection.onerror = (error) => {
    console.log(`WebSocket error: ${error}`);
  };

  connection.onclose = () => {
    console.log(`WebSocket closed`);
    if(!userNavigatedAway) {
      lastOverlay = [...$a('.overlay')].filter(d=>d.style.display!='none').map(d=>d.id)[0] || null;
      for(const cb of onConnectionCloseCallbacks) cb();
    }
    if(lastTimeout)
      setTimeout(startWebSocket, lastTimeout *= 2);
  };

  connection.onmessage = (e) => {
    let func, args;
    try {
      ({ func, args } = JSON.parse(e.data));
    } catch(error) {
      // A message that fails to parse was corrupted or truncated in transit
      // (some browsers occasionally deliver incomplete WebSocket frames).
      // Instead of crashing the whole client with an uncaught error, drop the
      // connection so the existing reconnect logic re-syncs the full room state.
      console.error('Could not parse message from server. Reconnecting.', error);
      connection.close();
      return;
    }

    if(func == 'serverStart') {
      if(serverStart != null && serverStart != args) {
        console.log('Server restart detected. Reloading...')
        setTimeout(() => location.reload(), rand()*10000);
        preventReconnect();
        connection.close();
      }
      serverStart = args;
    }

    for(const callback of (messageCallbacks[func] || []))
      callback(args);
  };
}

export function onMessage(func, callback) {
  if(!messageCallbacks[func])
    messageCallbacks[func] = [];
  messageCallbacks[func].push(callback);
}

export function toServer(func, args) {
  if(connection.readyState === WebSocket.OPEN)
    connection.send(JSON.stringify({ func, args }));
}

function preventReconnect() {
  lastTimeout = null;
  userNavigatedAway = true;
}

function log(str) {
  toServer('trace', str);
}

window.onbeforeunload = function() {
  userNavigatedAway = true;
};
