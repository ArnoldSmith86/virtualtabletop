import { asArray, onLoad, rand } from '../domhelpers.js';

let playerCursors = {};
let playerCursorsTimeout = {};
let playerName = localStorage.getItem('playerName') || 'Guest' + Math.floor(rand()*1000);
let playerColor = 'red';
let activePlayers = [];
let activeColors = [];
let mouseCoords = [];
let mySessionID = null;
localStorage.setItem('playerName', playerName);

export {
  playerName,
  playerColor,
  activePlayers,
  activeColors,
  mouseCoords
}

function getPlayerDetails() {
  return {
    playerName,
    playerColor,
    activePlayers,
    activeColors,
    mouseCoords
  };
}

function addPlayerCursor(playerName, playerColor) {
  playerCursors[playerName] = document.createElement('div');
  playerCursors[playerName].className = 'cursor';
  playerCursors[playerName].style = `--playerName:"${playerName}";--playerColor:${playerColor};`;
  playerCursors[playerName].style.transform = `translate(-50px, -50px)`;
  playerCursors[playerName].setAttribute("data-player",playerName);
  $('#playerCursors').appendChild(playerCursors[playerName]);
  playerCursorsTimeout[playerName] = setTimeout(()=>{}, 0);
}

function fillPlayerList(players, active, sessions) {
  activePlayers = [...new Set(active)];
  activeColors = activePlayers.map(playerName=>players[playerName]);
  removeFromDOM('#playersTable tbody > tr, #playerCursors > .cursor');

  if(players[playerName] !== undefined)
    playerColor = players[playerName];

  const sessionsByPlayer = {};
  for(const session of sessions || [])
    sessionsByPlayer[session.player] = (sessionsByPlayer[session.player] || []).concat(session);

  const rank = player=>player == playerName ? 0 : sessionsByPlayer[player] ? 1 : 2;
  const sortedPlayers = Object.keys(players).sort((a,b)=>rank(a)-rank(b) || a.localeCompare(b));

  for(const player of sortedPlayers) {
    const playerSessions = sessionsByPlayer[player] || [ null ];
    playerSessions.forEach(function(session, sessionIndex) {
      let row = null;
      if(sessionIndex == 0) {
        row = domByTemplate('template-playerlist-player', {}, 'tr');
        for(const cell of $a('td', row))
          cell.rowSpan = playerSessions.length;
        $('.teamColor', row).value = players[player];
        $('.playerName', row).value = player;
        $('.teamColor', row).addEventListener('change', function(e) {
          toServer('playerColor', { player, color: toHex(e.target.value) });
        });
        $('.playerName', row).addEventListener('change', function(e) {
          const newName = e.target.value.trim();
          if(newName && newName != player)
            toServer('rename', { oldName: player, newName, updateWidgets: true });
        });
        $('.playerName', row).addEventListener('keydown', function(e) {
          if(e.key == 'Enter')
            e.target.blur();
        });
        $('.renamePlayer', row).addEventListener('click', function() {
          $('.playerName', row).focus();
          $('.playerName', row).select();
        });
        if(player == playerName) {
          removeFromDOM($('.viewPlayer', row));
        } else {
          $('.viewPlayer', row).addEventListener('click', function() {
            toServer('rename', { oldName: playerName, newName: player, sessionID: mySessionID });
          });
        }
        const isReferencedByWidgets = [...widgets.values()].some(w=>w.state.player==player||w.state.owner==player||Array.isArray(w.state.owner)&&w.state.owner.indexOf(player)!=-1);
        if(session || isReferencedByWidgets) {
          removeFromDOM($('.removePlayer', row));
        } else {
          $('.removePlayer', row).addEventListener('click', function() {
            toServer('removeLocalPlayer', { player });
          });
        }
      } else {
        row = document.createElement('tr');
      }

      row.className = player == playerName ? 'myPlayerEntry' : session ? 'activePlayerEntry' : 'inactivePlayerEntry';
      if(session && session.sessionID == mySessionID)
        row.classList.add('mySessionEntry');

      const sessionCell = $('td', domByTemplate('template-playerlist-session', {}, 'tr'));
      if(session) {
        $('.sessionLabel', sessionCell).textContent = session.sessionID == mySessionID ? `Session ${sessionIndex+1} (you)` : `Session ${sessionIndex+1}`;
        $('.splitSession', sessionCell).addEventListener('click', function() {
          const newName = (prompt(`Enter a new player name for this session of ${player}:`) || '').trim();
          if(newName && newName != player)
            toServer('rename', { oldName: player, newName, sessionID: session.sessionID });
        });
      } else {
        $('.sessionLabel', sessionCell).textContent = 'not connected';
        removeFromDOM($('.splitSession', sessionCell));
      }
      row.appendChild(sessionCell);

      $('#playersTable tbody').appendChild(row);
    });

    if(player != playerName && activePlayers.indexOf(player) != -1)
      addPlayerCursor(player, players[player]);
  }
  updatePlayerCountDisplay();
}

function updatePlayerCountDisplay() {
  const playersButton = $('#playersButton');
  const playerCount = activePlayers.length;

  const tooltip = $('.tooltip', playersButton);
  if (tooltip) tooltip.textContent = `Players: ${playerCount}`;

  [playersButton, tooltip].forEach(element => element.classList.add('playerChange'));
  
  setTimeout(() => {
    [playersButton, tooltip].forEach(element => element.classList.remove('playerChange'));
  }, 1000);
}

onLoad(function() {
  let lastMetaArgs = null;
  onMessage('meta', function(args) {
    lastMetaArgs = args;
    fillPlayerList(args.meta.players, args.activePlayers, args.sessions);
  });
  onMessage('sessionID', function(args) {
    mySessionID = args;
    if(lastMetaArgs)
      fillPlayerList(lastMetaArgs.meta.players, lastMetaArgs.activePlayers, lastMetaArgs.sessions);
  });
  onMessage('mouse', function(args) {
    if(args.player != playerName && playerCursors[args.player]) {
      clearTimeout(playerCursorsTimeout[args.player]);
      playerCursors[args.player].classList.toggle('hidden', !!args.mouseState.hidden);
      if(args.mouseState.inactive) {
        playerCursors[args.player].classList.remove('pressed','active','foreign');
      } else {
        const x = args.mouseState.x*scale;
        const y = args.mouseState.y*scale;
        playerCursors[args.player].style.transform = `translate(${x}px, ${y}px)`;
        if(args.mouseState.pressed) {
          playerCursors[args.player].classList.add('pressed', 'active');
        } else {
          playerCursors[args.player].classList.add('active');
          playerCursors[args.player].classList.remove('pressed');
        }
        let foreign = false;
        if(args.mouseState.target !== null && widgets.has(args.mouseState.target)) {
          const owner = widgets.get(args.mouseState.target).get('owner');
          if(owner !== null)
            foreign = !asArray(owner).includes(playerName);
        }
        if(foreign)
          playerCursors[args.player].classList.add('foreign');
        else
          playerCursors[args.player].classList.remove('foreign');
        playerCursorsTimeout[args.player] = setTimeout(()=>{playerCursors[args.player].classList.remove('active')}, parseInt(getComputedStyle(playerCursors[args.player]).getPropertyValue('--cursorActiveDuration')))
      }
    }
  });
  onMessage('rename', function(args) {
    const oldName = playerName;
    playerName = args;
    localStorage.setItem('playerName', playerName);
    for(const [ id, widget ] of widgets)
      widget.updateOwner();
  });

  function addLocalPlayer() {
    const localPlayerName = $('#localPlayerName').value.trim();
    if(localPlayerName) {
      toServer('addLocalPlayer', { player: localPlayerName });
      $('#localPlayerName').value = '';
    }
  }
  $('#addLocalPlayerButton').addEventListener('click', addLocalPlayer);
  $('#localPlayerName').addEventListener('keydown', function(e) {
    if(e.key == 'Enter')
      addLocalPlayer();
  });

  // share URL when clicking button
  shareButton($('#playersShareButton'), _=>location.href);
});
