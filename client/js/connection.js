let lastTimeout = 1000;
let lastOverlay = null;
let connection;
let serverStart = null;
let userNavigatedAway = false;
let outdated = false;
let messageCallbacks = {};

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
      showOverlay('connectionLostOverlay', true);
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
        showServerRestartOverlay();
        preventReconnect();
        connection.close();
      }
      serverStart = args;
    }

    for(const callback of (messageCallbacks[func] || []))
      callback(args);
  };
}

// The overlay that comes up when the connection drops explains that it is expected back and
// suggests reloading or switching rooms, none of which applies to a restart: reconnecting has been
// switched off and the page is reloading by itself. Say that instead, and offer the reload right
// away for whoever does not want to wait out the delay that spreads the clients over a few seconds.
export function showServerRestartOverlay() {
  $('#connectionLostOverlay').classList.add('serverRestarting');
  showOverlay('connectionLostOverlay', true);
}

// True once this page has seen the server it is talking to restart: everything it was served -
// the client bundle it is running included - can be from a build the server no longer has.
export function clientIsOutdated() {
  return outdated;
}

// The editor is a second bundle that is only fetched the first time edit mode is opened, so by
// then the server may already be a different build - one whose editor does not fit the client
// bundle this page is running. Ask for the build this page belongs to rather than for the editor
// as such, so a server that has been replaced refuses the request instead of handing out a half
// that does not fit: checking first and importing afterwards leaves a window in between in which
// the server changes and the answer to the check no longer describes what arrives.
export function editModeURL() {
  // a page that has never been connected does not know which build served it, so it has nothing to
  // ask for and takes whatever the server has
  return serverStart == null ? './edit.js' : `./edit.js?serverStart=${encodeURIComponent(serverStart)}`;
}

// The socket only learns about a restart once it manages to reconnect, while the new server starts
// answering over HTTP the moment it binds the port - so in between, this page still believes it is
// up to date. Ask the server directly rather than going by the last thing the socket heard.
// Resolves to whether it answered at all: a server that does not is a server in the middle of
// restarting, which says on its own that nothing is to be expected from it right now.
export async function checkForServerRestart() {
  let response;
  try {
    response = await fetch('edit.js', { method: 'HEAD', cache: 'no-store' });
  } catch(error) {
    console.error('Could not ask the server which build it is running.', error);
    return false;
  }

  // a page that has never been connected has nothing to compare against: its bundle came from
  // whichever server answered the request for the page itself, which nothing here has seen
  const currentStart = response.headers.get('X-Server-Start');
  if(serverStart != null && currentStart != null && currentStart != serverStart)
    outdated = true;

  return response.ok;
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
