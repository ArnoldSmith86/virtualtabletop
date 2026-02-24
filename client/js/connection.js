let lastTimeout = 1000;
let lastOverlay = null;
let connection;
let pongReceived = true;
let serverStart = null;
let userNavigatedAway = false;
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
    lastTimeout = 500;
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
    const { func, args } = JSON.parse(e.data);

    if(func == 'serverStart') {
      if(serverStart != null && serverStart != args) {
        console.log('Server restart detected. Reloading...')
        setTimeout(location.reload, rand()*10000);
        showOverlay('connectionLostOverlay', true);
        preventReconnect();
        connection.close();
      }
      serverStart = args;
    }

    if(func == 'pong')
      pongReceived = true;

    for(const callback of (messageCallbacks[func] || []))
      callback(args);
  };
}

function onMessage(func, callback) {
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

setInterval(function() {
  if(!pongReceived)
    startWebSocket();
  pongReceived = false;
  toServer('ping');
}, 5000);

window.onbeforeunload = function() {
  userNavigatedAway = true;
};
