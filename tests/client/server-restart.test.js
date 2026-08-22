import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// connection.js reaches the rest of the client through the concatenated bundle rather than through
// imports, so evaluate it out of its scope with a Location and a timer of our own: the real
// Location cannot be replaced in jsdom, and what the reload is called on is exactly the point here.
const connectionSource = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/js/connection.js'), 'utf8');
const loadConnection = new Function('location', 'setTimeout', 'WebSocket', 'showOverlay', 'rand', 'urlProperties', 'playerName', 'roomID',
  connectionSource.replace(/^export /gm, '') + `;
  return { startWebSocket, clientIsOutdated };
`);

// Location.reload belongs to its Location - a browser throws "Illegal invocation" when it is called
// on anything else, which is what a timer that was handed the bare function does.
function fakeLocation(onReload) {
  const location = {
    href: 'http://localhost:8272/testroom',
    reload() {
      if(this !== location)
        throw new TypeError('Illegal invocation');
      onReload();
    }
  };
  return location;
}

function startedClient(onReload) {
  const timers = [];
  const sockets = [];

  function FakeWebSocket(url) {
    this.url = url;
    this.readyState = 1;
    this.close = _=>this.closed = true;
    sockets.push(this);
  }
  FakeWebSocket.OPEN = 1;

  const client = loadConnection(fakeLocation(onReload), callback=>timers.push(callback), FakeWebSocket, _=>{}, _=>0, {}, 'tester', 'testroom');
  client.startWebSocket();

  return {
    clientIsOutdated: client.clientIsOutdated,
    serverStart: value=>sockets[0].onmessage({ data: JSON.stringify({ func: 'serverStart', args: value }) }),
    // a timer calls what it was given without a receiver, whatever object it came from
    runTimers: _=>timers.splice(0).forEach(callback=>callback())
  };
}

describe('Scenarios: the server the page is talking to restarts', () => {
  describe('Given the server that served the page', () => {
    test('Then the page keeps running', () => {
      let reloads = 0;
      const client = startedClient(_=>reloads++);
      client.serverStart(1000);
      client.serverStart(1000);
      client.runTimers();
      expect(reloads).toBe(0);
      expect(client.clientIsOutdated()).toBe(false);
    });
  });

  describe('Given a server that started after the page was served', () => {
    test('Then the page is actually reloaded', () => {
      let reloads = 0;
      const client = startedClient(_=>reloads++);
      client.serverStart(1000);
      client.serverStart(2000);
      expect(reloads).toBe(0);  // spread over a few seconds so not every client comes back at once
      client.runTimers();
      expect(reloads).toBe(1);
    });

    test('Then the page knows that it is outdated before the reload happens', () => {
      const client = startedClient(_=>{});
      client.serverStart(1000);
      expect(client.clientIsOutdated()).toBe(false);
      client.serverStart(2000);
      expect(client.clientIsOutdated()).toBe(true);
    });
  });
});
