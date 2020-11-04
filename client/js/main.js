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
  const addDiv = $('#addState');
  addDiv.parentElement.removeChild(addDiv);
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

    $('.play', entry).addEventListener('click', function(e) {
      toServer('loadState', state.id);
    });

    $('#statesList').appendChild(entry);
  }
  $('#statesList').appendChild(addDiv);
}

function addState(type, src) {
  if(type == 'url' && (!src || !src.match(/^http/)))
    return;
  toServer('addState', { type, src, meta: {
    name:    $('#addState [placeholder=Name]').value,
    image:   $('#addState [placeholder=Image]').value,
    rules:   $('#addState [placeholder="Rules link"]').value,
    bgg:     $('#addState [placeholder="BordGameGeek link"]').value,
    year:    $('#addState [placeholder=Year]').value,
    mode:    $('#addState [placeholder=Mode]').value,
    players: $('#addState [placeholder=Players]').value,
    time:    $('#addState [placeholder=Time]').value
  }});
}

function fromServer(func, args) {
  if(func == 'add')
    addWidget(args);
  if(func == 'meta') {
    fillPlayerList(args.meta.players, args.activePlayers);
    fillStatesList(args.meta.states, args.activePlayers);
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

function selectFile(getContents) {
  return new Promise((resolve, reject) => {
    const upload = document.createElement('input');
    upload.type = 'file';
    upload.addEventListener('change', function(e) {
      if(!getContents)
        resolve(e.target.files[0]);

      const reader = new FileReader();
      reader.addEventListener('load', e=>resolve(e.target.result));
      reader.readAsDataURL(e.target.files[0]);
    });
    upload.dispatchEvent(new MouseEvent('click', {bubbles: true}));
  });
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
    selectFile().then(function(file) {
      var req = new XMLHttpRequest();
      req.open('PUT', self.location.pathname, true);
      req.setRequestHeader('Content-Type', 'application/octet-stream');
      req.send(file);
    });
  });

  on('#addWidget', 'click', function() {
    objectToWidget(JSON.parse(document.querySelector('#widgetText').value));
    document.querySelector('.toolbarButton').dispatchEvent(new MouseEvent('click', {bubbles: true}));
  });

  on('#addState .create', 'click', _=>addState('state'));
  on('#addState .upload', 'click', _=>selectFile(true).then(f=>addState('file', f)));
  on('#addState .link',   'click', _=>addState('url', prompt('Enter shared URL:')));

  setScale();
});

window.onresize = function(event) {
  setScale();
}
