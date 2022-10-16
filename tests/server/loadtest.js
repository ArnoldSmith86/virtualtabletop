import fetch from 'node-fetch';
import WebSocket from 'ws';

const target = 'http://localhost:8272';

function wsTest(packets) {
  const ws = new WebSocket(target.replace(/http/, 'ws'));
  ws.on('open', async function open() {
    for(const packet of packets) {
      if(packet[0] == 'WAITFORMETA') {
        await new Promise(function(myResolve, myReject) {
          ws.on('message', function(data) {
            if(JSON.parse(data).func == 'meta')
              myResolve();
          });
        });
      }
      ws.send(JSON.stringify({func: packet[0], args: packet[1]}));
    }
    ws.close();
  });
}

function loadPLgame(room, file, variant) {
  const id = Math.random().toString(36).substring(3, 7);
  fetch(`${target}/addState/${room}/${id}/link/undefined/`, {
    headers: { 'Content-type': 'application/octet-stream' },
    body: `${target}/library/${file}`,
    method: 'PUT'
  }).then(function() {
    wsTest([
      [ 'room', { playerName: 'Bot', roomID: room } ],
      [ 'WAITFORMETA' ],
      [ 'loadState', { stateID: id, variantID: id } ]
    ]);
  });
}

function simpleRequests(n) {
  for(let i=0; i<n; ++i) {
    fetch(`${target}`);
    fetch(`${target}/asd`);
    fetch(`${target}/i/cards-default/${'237894JKQ'.split('').sort(() => Math.random() - 0.5)[0]}${'HSDC'.split('').sort(() => Math.random() - 0.5)[0]}.svg`);
    fetch(`${target}/assets/990537754_175706`);
  }
}

console.log('start');
for(let i=0; i<1000; ++i)
  loadPLgame(`Bot${Math.random().toString(36).substring(3, 7)}`, 'Bhukhar.vtt');
simpleRequests(1000);
console.log('done');
