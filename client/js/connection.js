import { MessageBuffer, messageBufferHandlers } from './messageBuffer';
let lastTimeout = 1000;
let connection;
let messageCallbacks = {};
let messageBuffers = {};

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
  initMessageBuffers(connection)

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
    setTimeout(startWebSocket, lastTimeout *= 2);
  };

  connection.onmessage = (e) => {
    const { func, args } = JSON.parse(e.data);
    for(const callback of (messageCallbacks[func] || []))
      callback(args);
  };
}

function initMessageBuffers(connection) {
  var mouseBuffer, deltaBuffer, logBuffer;
  mouseBuffer = new MessageBuffer('mouse', 100, messageBufferHandlers.sendLatest, connection);
  deltaBuffer = new MessageBuffer('delta', 10, messageBufferHandlers.sendAll, connection);
  logBuffer = new MessageBuffer('log', 10, messageBufferHandlers.sendAll, connection);
  messageBuffers = {
    'mouse': mouseBuffer,
    'delta': deltaBuffer,
    'log': logBuffer
  }
  console.log(messageBuffers)
}

function onMessage(func, callback) {
  if(!messageCallbacks[func])
    messageCallbacks[func] = [];
  messageCallbacks[func].push(callback);
}

export function toServer(func, args) {
  if(connection.readyState === WebSocket.OPEN)
    if (func in messageBuffers) {
      messageBuffers[func].send(JSON.stringify({ func, args }));
    }
    else {
      connection.send(JSON.stringify({ func, args }));
    }
}

function log(str) {
  toServer('log', str);
}
