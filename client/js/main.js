let lastTimeout = 1000;
let connection;

const roomID = self.location.pathname.substr(1);

let playerName = localStorage.getItem('playerName') || 'Guest' + Math.floor(Math.random()*1000);
localStorage.setItem('playerName', playerName);

function startWebSocket() {
  const url = `ws://${location.host}`;
  console.log(`connecting to ${url}`);
  connection = new WebSocket(url);

  connection.onopen = () => {
    toServer('room', { playerName, roomID });
  };

  connection.onerror = (error) => {
    console.log(`WebSocket error: ${error}`);
    setTimeout(startWebSocket, lastTimeout *= 2);
  };

  connection.onclose = () => {
    console.log(`WebSocket closed`);
    setTimeout(startWebSocket, lastTimeout *= 2);
  };

  connection.onmessage = (e) => {
    const { func, args } = JSON.parse(e.data);
    fromServer(func, args);
  };
}
startWebSocket();

function addWidget(widget) {
  widgets.set(widget.id, new BasicWidget(widget, document.querySelector('.surface')));
}

function domByTemplate(id) {
  const div = document.createElement('div');
  div.innerHTML = document.getElementById(id).innerHTML;
  return div;
}

function fillPlayerList(players, activePlayers) {
  for(const entry of document.querySelectorAll('#playerList > div'))
    entry.parentNode.removeChild(entry);
  for(const player in players) {
    const entry = domByTemplate('template-playerlist-entry');
    entry.querySelector('.teamColor').value = players[player];
    entry.querySelector('.playerName').value = player;
    entry.querySelector('.teamColor').addEventListener('change', function(e) {
      toServer('playerColor', { player, color: e.target.value });
    });
    entry.querySelector('.playerName').addEventListener('change', function(e) {
      toServer('rename', { oldName: player, newName: e.target.value });
    });
    if(player == playerName)
      entry.className = 'myPlayerEntry';
    if(activePlayers.indexOf(player) == -1)
      entry.className = 'inactivePlayerEntry';

    document.querySelector('#playerList').appendChild(entry);
  }
}

function fromServer(func, args) {
  if(func == 'add')
    addWidget(args);
  if(func == 'meta')
    fillPlayerList(args.meta.players, args.activePlayers);
  if(func == 'rename') {
    playerName = args;
    localStorage.setItem('playerName', playerName);
  }
  if(func == 'state') {
    for(const widget of document.querySelectorAll('.widget'))
      widget.parentNode.removeChild(widget);
    for(const widgetID in args)
      if(widgetID != '_meta')
        addWidget(args[widgetID]);
  }
  if(func == 'translate')
    widgets.get(args.id).setPositionFromServer(args.pos[0], args.pos[1]);
}

function toServer(func, args) {
  connection.send(JSON.stringify({ func, args }));
}

window.addEventListener('mousemove', function(event) {
  toServer('mouse', [ event.clientX, event.clientY ]);
});

const widgets = new Map();

function objectToWidget(o) {
  if(!o.id)
    o.id = Math.random().toString(36).substring(3, 7);
  toServer('add', o);
}

function setScale() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  document.documentElement.style.setProperty('--scale', w/h < 1600/1000 ? w/1600 : h/1000);
}

function on(selector, eventName, callback) {
  for(const d of document.querySelectorAll(selector))
    d.addEventListener(eventName, callback);
}

window.addEventListener('DOMContentLoaded', function() {
  on('.toolbarButton', 'click', function(e) {
    const overlay = e.target.dataset.overlay;
    if(overlay) {
      for(const d of document.querySelectorAll('.overlay'))
        if(d.id != overlay)
          d.style.display = 'none';
      const style = document.querySelector(`#${overlay}`).style;
      style.display = style.display === 'flex' ? 'none' : 'flex';
      document.querySelector('#roomArea').className = style.display === 'flex' ? 'hasOverlay' : '';
    }
  });

  on('#uploadButton', 'click', function() {
    const upload = document.createElement('input');
    upload.type = 'file';
    upload.addEventListener('change', function(e) {
      var req = new XMLHttpRequest();
      req.open('PUT', self.location.pathname, true);
      req.setRequestHeader('Content-Type', 'application/octet-stream');
      req.send(e.target.files[0]);
    });
    upload.dispatchEvent(new MouseEvent('click', {bubbles: true}));
  });

  on('#addWidget', 'click', function() {
    objectToWidget(JSON.parse(document.querySelector('#widgetText').value));
    document.querySelector('.toolbarButton').dispatchEvent(new MouseEvent('click', {bubbles: true}));
  });

  setScale();
});

window.onresize = function(event) {
  setScale();
}
