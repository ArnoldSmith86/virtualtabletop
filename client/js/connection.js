let lastTimeout = 1000;
let connection;
let serverStart = null;
let messageCallbacks = {};

//used by unit tests until jest supports mocking ESM static imports
export function mockConnection() {
  connection = {
    readyState: false
  }
}

export function startWebSocket() {
  let url = `ws://${location.host}`;
  if(location.protocol == 'https:')
    url = `wss://${location.host}`;
  console.log(`connecting to ${url}`);
  connection = new WebSocket(url);

  connection.onopen = () => {
    if(!urlProperties.askID) {
      toServer('room', { playerName, roomID });
      $('#ghetto-link').href += `#${roomID}`;
    }
  };

  connection.onerror = (error) => {
    console.log(`WebSocket error: ${error}`);
  };

  connection.onclose = () => {
    console.log(`WebSocket closed`);
    if(lastTimeout)
      setTimeout(startWebSocket, lastTimeout *= 2);
  };

  connection.onmessage = (e) => {
    const { func, args } = JSON.parse(e.data);

    if(func == 'serverStart') {
      if(serverStart != null && serverStart != args) {
        console.log('Server restart detected. Reloading...')
        setTimeout(location.reload, Math.random()*10000);
        preventReconnect();
        connection.close();
      }
      serverStart = args;
    }

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
}

function log(str) {
  toServer('log', str);
}
