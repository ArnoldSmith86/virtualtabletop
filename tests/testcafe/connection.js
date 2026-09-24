import { ClientFunction, Selector } from 'testcafe';

import { prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

// Patches the websocket so that deltas can be held back on demand: the connection stays open and
// the server keeps answering everything else, which is exactly the zombie connection the delta
// confirmation monitor is about. Also counts the confirmations the server sends back.
const interceptConnection = ClientFunction(() => {
  window.deltaConfirmations = 0;
  window.stalledDeltas = null;
  const send = WebSocket.prototype.send;
  WebSocket.prototype.send = function(data) {
    if(!this.isIntercepted) {
      this.isIntercepted = true;
      this.addEventListener('message', e=>{
        if(String(e.data).indexOf('"func":"deltaConfirm"') != -1)
          ++window.deltaConfirmations;
      });
    }
    if(window.stalledDeltas && String(data).indexOf('"func":"delta"') != -1)
      window.stalledDeltas.push([ this, data ]);
    else
      send.call(this, data);
  };
  window.stallDeltas = ()=>window.stalledDeltas = [];
  window.releaseDeltas = ()=>{
    const stalled = window.stalledDeltas;
    window.stalledDeltas = null;
    for(const [ connection, data ] of stalled)
      send.call(connection, data);
  };
});

const deltaConfirmations = ClientFunction(()=>window.deltaConfirmations);
const stallDeltas = ClientFunction(()=>window.stallDeltas());
const releaseDeltas = ClientFunction(()=>window.releaseDeltas());

const statusOverlay = Selector('#statusOverlay');
const statusState = ()=>statusOverlay.getAttribute('data-state');
const statusText = ()=>Selector('#statusOverlay .statusText').innerText;

const setTextRoutine = [ { func: 'SET', property: 'text', value: 'clicked', collection: 'thisButton' } ];

test('Connection monitor escalates while deltas stay unconfirmed', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    firstButton:  { id: 'firstButton',  type: 'button', x: 100, y: 100, clickRoutine: setTextRoutine },
    secondButton: { id: 'secondButton', type: 'button', x: 300, y: 100, clickRoutine: setTextRoutine }
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await interceptConnection();

  // a delta that reaches the server gets confirmed, so no connection warning ever escalates
  await t.click('#w_firstButton');
  await t.expect(deltaConfirmations()).gte(1, { timeout: 5000 });
  await t.wait(6000);
  await t.expect(statusState()).notEql('warn').expect(statusState()).notEql('bad');

  // an unconfirmed one escalates: icon after 5s, message after 10s
  await stallDeltas();
  await t.click('#w_secondButton');
  await t.expect(statusState()).eql('warn', { timeout: 8000 });
  await t.expect(statusState()).eql('bad', { timeout: 8000 });
  await t.expect(statusText()).contains('No response from server');

  // and the confirmations for the deltas that finally get through clear it again
  await releaseDeltas();
  await t.expect(statusOverlay.hasClass('visible')).notOk({ timeout: 5000 });
});
