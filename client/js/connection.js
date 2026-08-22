let lastTimeout = 1000;
let lastOverlay = null;
let connection;
let serverStart = null;
let userNavigatedAway = false;
let outdated = false;
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
    lastTimeout = 1000;  // the backoff is about how long the server stays away, not about the tab's age
    showOverlay(null, true);
    showOverlay(lastOverlay);
    if(!urlProperties.askID) {
      toServer('room', { playerName, roomID, collection: getCollectionID(), password: getRoomPassword(roomID) });
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
        outdated = true;
        // the arrow keeps reload() on its Location: a timer calls what it is handed on the window,
        // which throws instead of reloading
        setTimeout(_=>location.reload(), rand()*10000);
        // preventReconnect() below makes onclose skip these, so the connection monitor would keep
        // showing a live connection for the seconds until the reload
        for(const cb of onConnectionCloseCallbacks) cb();
        preventReconnect();
        connection.close();
      }
      serverStart = args;
    }

    for(const callback of (messageCallbacks[func] || []))
      callback(args);
  };
}

// True once this page has seen the server it is talking to restart: everything it was served -
// the client bundle it is running included - can be from a build the server no longer has.
export function clientIsOutdated() {
  return outdated;
}

// The socket only learns about a restart once it manages to reconnect, while the new server starts
// answering over HTTP the moment it binds the port - so in between, a bundle that is fetched on
// demand already comes from the new build while this page still believes it is up to date. Ask the
// server that serves that bundle who it is rather than going by the last thing the socket heard.
// Throws when it cannot be reached, which is just as good a reason not to fetch anything from it.
export async function checkForServerRestart() {
  const response = await fetch('edit.js', { method: 'HEAD', cache: 'no-store' });
  if(!response.ok)
    throw new Error(`Server answered ${response.status} when asked which build it is running`);

  // a page that has never been connected has nothing to compare against: its bundle came from
  // whichever server answered the request for the page itself, which nothing here has seen
  const currentStart = response.headers.get('X-Server-Start');
  if(serverStart != null && currentStart != null && currentStart != serverStart)
    outdated = true;
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
