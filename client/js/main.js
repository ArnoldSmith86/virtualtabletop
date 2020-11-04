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

function $(selector, parent) {
  return $a(selector, parent)[0];
}

function $a(selector, parent) {
  return (parent || document).querySelectorAll(selector);
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
    $('.teamColor', entry).value = players[player];
    $('.playerName', entry).value = player;
    $('.teamColor', entry).addEventListener('change', function(e) {
      toServer('playerColor', { player, color: e.target.value });
    });
    $('.playerName', entry).addEventListener('change', function(e) {
      toServer('rename', { oldName: player, newName: e.target.value });
    });
    if(player == playerName)
      entry.className = 'myPlayerEntry';
    if(activePlayers.indexOf(player) == -1)
      entry.className = 'inactivePlayerEntry';

    document.querySelector('#playerList').appendChild(entry);
  }
}

function fillStatesList(states, activePlayers) {
  for(const entry of document.querySelectorAll('#statesList > div'))
    entry.parentNode.removeChild(entry);
  for(const state of states) {
    const entry = domByTemplate('template-stateslist-entry');
    entry.className = 'roomState';
    $('img', entry).src = state.image;
    $('.bgg', entry).textContent = `${state.name} (${state.year})`;
    $('.bgg', entry).href = state.bgg;
    $('.rules', entry).href = state.rules;
    $('.players', entry).textContent = `${state.players} (${state.mode})`;
    $('.time', entry).textContent = state.time;
    document.querySelector('#statesList').appendChild(entry);
  }
}

function fromServer(func, args) {
  if(func == 'add')
    addWidget(args);
  if(func == 'meta') {
    fillPlayerList(args.meta.players, args.activePlayers);
    fillStatesList([
      {
        name: 'Connect Four',
        image: 'https://cf.geekdo-images.com/imagepage/img/_7cz6Ggzoh82kUPgTFrIJTT9Bnc=/fit-in/900x600/filters:no_upscale():strip_icc()/pic3075900.jpg',
        rules: 'https://howdoyouplayit.com/connect-4-board-game-rules-play/',
        bgg: 'https://boardgamegeek.com/boardgame/2719/connect-four',
        year: 1974,
        mode: 'vs',
        players: '2',
        time: 10
      },
      {
        name: 'Nine Men\'s Morris',
        image: 'https://cf.geekdo-images.com/imagepage/img/Py--bgvqEmBVFrvhqBNM_Gz5ASA=/fit-in/900x600/filters:no_upscale():strip_icc()/pic438639.jpg',
        rules: 'https://www.thesprucecrafts.com/nine-mens-morris-board-game-rules-412542',
        bgg: 'https://boardgamegeek.com/boardgame/3886/nine-mens-morris',
        year: -1400,
        mode: 'vs',
        players: '2',
        time: 20
      }
    ], args.activePlayers);
  }
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
