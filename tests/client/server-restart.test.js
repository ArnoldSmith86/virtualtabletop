import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// connection.js reaches the rest of the client through the concatenated bundle rather than through
// imports, so evaluate it out of its scope with a Location and a timer of our own: the real
// Location cannot be replaced in jsdom, and what the reload is called on is exactly the point here.
//
// Two things the harness relies on: connection.js has no import statement (one would be a syntax
// error inside a Function body), and every global it touches is a parameter below - a missing one
// shows up as a ReferenceError from whichever handler was exercised.
const connectionSource = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/js/connection.js'), 'utf8');
const loadConnection = new Function('location', 'setTimeout', 'WebSocket', 'fetch', 'showOverlay', '$', '$a', 'rand', 'urlProperties', 'playerName', 'roomID',
  connectionSource.replace(/^export /gm, '') + `;
  return { startWebSocket, clientIsOutdated, checkForServerRestart, editModeURL, editModeLoadFailed, showServerRestartOverlay };
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

function startedClient(onReload, serving) {
  const timers = [];
  const sockets = [];
  const requests = [];
  const overlays = [];

  function FakeWebSocket(url) {
    this.url = url;
    this.readyState = 1;
    this.send = _=>{};
    this.close = _=>this.closed = true;
    sockets.push(this);
  }
  FakeWebSocket.OPEN = 1;

  // which server is currently answering HTTP: 'serving' is the start id it reports for /edit.js,
  // undefined means it cannot be reached at all
  async function fakeFetch(url, options) {
    requests.push({ url, options });
    if(serving === undefined)
      throw new TypeError('Failed to fetch');
    return {
      ok: true,
      status: 200,
      headers: { get: name=>name == 'X-Server-Start' ? String(serving) : null }
    };
  }

  const client = loadConnection(fakeLocation(onReload), (callback, delay)=>timers.push({ callback, delay }), FakeWebSocket, fakeFetch,
    id=>overlays.push(id), _=>null, _=>[], _=>0, {}, 'tester', 'testroom');
  client.startWebSocket();

  return {
    clientIsOutdated: client.clientIsOutdated,
    checkForServerRestart: client.checkForServerRestart,
    editModeURL: client.editModeURL,
    editModeLoadFailed: client.editModeLoadFailed,
    showServerRestartOverlay: client.showServerRestartOverlay,
    requests,
    overlays,
    connect: _=>sockets[sockets.length-1].onopen(),
    disconnect: _=>sockets[sockets.length-1].onclose(),
    reconnectDelays: _=>timers.map(timer=>timer.delay),
    serverStart: value=>sockets[0].onmessage({ data: JSON.stringify({ func: 'serverStart', args: value }) }),
    // a timer calls what it was given without a receiver, whatever object it came from
    runTimers: _=>timers.splice(0).forEach(timer=>timer.callback())
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

    test('Then the overlay says what is happening instead of promising a reconnect', () => {
      const client = startedClient(_=>{});
      client.serverStart(1000);
      client.serverStart(2000);

      // the connection is not coming back and the page is going away, so neither "it should be
      // reestablished in a few moments" nor "use a different room" applies any longer
      expect(client.overlays).toContain('serverRestartOverlay');
    });

    test('Then the page knows that it is outdated before the reload happens', () => {
      const client = startedClient(_=>{});
      client.serverStart(1000);
      expect(client.clientIsOutdated()).toBe(false);
      client.serverStart(2000);
      expect(client.clientIsOutdated()).toBe(true);
    });
  });

  describe('Given a server that has restarted but has not been reconnected to yet', () => {
    test('Then asking it directly shows that the page is outdated', async () => {
      const client = startedClient(_=>{}, 2000);
      client.serverStart(1000);
      expect(client.clientIsOutdated()).toBe(false);

      await client.checkForServerRestart();

      expect(client.requests[0].options.method).toBe('HEAD');
      expect(client.clientIsOutdated()).toBe(true);
    });

    test('Then asking a server that did not restart leaves the page alone', async () => {
      const client = startedClient(_=>{}, 1000);
      client.serverStart(1000);

      await client.checkForServerRestart();

      expect(client.clientIsOutdated()).toBe(false);
    });

    test('Then asking a server that cannot be reached says so instead of claiming anything', async () => {
      const client = startedClient(_=>{});
      client.serverStart(1000);

      expect(await client.checkForServerRestart()).toBe(false);

      expect(client.clientIsOutdated()).toBe(false);
    });
  });

  describe('Given a restart that was noticed over HTTP rather than over the socket', () => {
    test('Then reconnecting does not take the notice away again before the reload', () => {
      const client = startedClient(_=>{}, 2000);
      client.connect();
      client.serverStart(1000);

      client.showServerRestartOverlay();
      client.disconnect();

      // the page is going away, so there is nothing left to reconnect for: another socket to a
      // server this build no longer fits would only put the connection status back on screen
      // next to the notice, a second before the reload
      expect(client.reconnectDelays()).toEqual([]);
    });
  });

  describe('Given a page that is about to fetch the editor bundle', () => {
    test('Then it asks for the build it is running rather than for whatever is being served', () => {
      const client = startedClient(_=>{});
      client.serverStart(1000);

      // the server compares this against its own start and refuses when it no longer matches, so a
      // restart between deciding to fetch the bundle and fetching it cannot slip a mismatched
      // editor into this page - a check of its own before the import could not rule that out
      expect(client.editModeURL()).toBe('./edit.js?serverStart=1000');
    });

    test('Then a second attempt is a request the browser has not seen fail', () => {
      const client = startedClient(_=>{});
      client.serverStart(1000);

      // a dynamic import that failed is remembered as failed for that URL and re-thrown without
      // another request, so retrying the same one could only ever repeat the failure - while the
      // build being asked for has to stay the same
      client.editModeLoadFailed();
      const second = client.editModeURL();
      client.editModeLoadFailed();

      expect(second).not.toBe('./edit.js?serverStart=1000');
      expect(second).toContain('serverStart=1000');
      expect(client.editModeURL()).not.toBe(second);
    });

    test('Then a page that has never been connected takes whatever the server has', () => {
      const client = startedClient(_=>{});

      // nothing here has seen which build served this page, so there is nothing to ask for
      expect(client.editModeURL()).toBe('./edit.js');
    });
  });

  describe('Given a connection that was lost and came back', () => {
    test('Then the next disconnect is retried as quickly as the first one was', () => {
      const client = startedClient(_=>{}, 1000);
      client.connect();
      client.serverStart(1000);
      client.disconnect();
      client.connect();
      client.serverStart(1000);
      client.disconnect();

      // a backoff that is never reset keeps doubling for the lifetime of the tab, which delays
      // noticing a restart by minutes in a session that has hiccuped a few times
      expect(client.reconnectDelays()).toEqual([ 2000, 2000 ]);
    });

    test('Then a socket that is accepted but never works keeps backing off', () => {
      const client = startedClient(_=>{}, 1000);
      client.connect();
      client.disconnect();
      client.connect();
      client.disconnect();

      // a server that accepts the connection and drops it without ever saying anything is as away
      // as one that refuses it, and every open tab hammering it every two seconds does not help
      expect(client.reconnectDelays()).toEqual([ 2000, 4000 ]);
    });

    test('Then a server that stays away is retried less and less often', () => {
      const client = startedClient(_=>{}, 1000);
      client.disconnect();
      client.disconnect();
      client.disconnect();

      expect(client.reconnectDelays()).toEqual([ 2000, 4000, 8000 ]);
    });
  });
});
