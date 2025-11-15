import { asArray, onLoad, rand } from '../domhelpers.js';
import { toHex } from '../color.js';

let playerCursors = {};
let playerCursorsTimeout = {};
let playerName = localStorage.getItem('playerName') || 'Guest' + Math.floor(rand()*1000);
let playerColor = localStorage.getItem('playerColor') || 'red';
let activePlayers = [];
let activeColors = [];
let mouseCoords = [];
localStorage.setItem('playerName', playerName);
localStorage.setItem('playerColor', playerColor);

export {
  playerName,
  playerColor,
  activePlayers,
  activeColors,
  mouseCoords,
  getPlayerName,
  getPlayerColor
}

function getPlayerName() {
  return playerName;
}

function getPlayerColor() {
  return playerColor;
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

function fillPlayerList(players, active) {
  if (config.authenticateUsers) {
    document.querySelector('#playerList .me').style.display = 'none';    
    document.querySelector('#playerList .otherPlayers.ui-line').style.display = 'none';
    if (document.querySelector('#playerList .myPlayerEntry')) {
      document.querySelector('#playerList .myPlayerEntry').style.display = 'none';
    }
  } else {
    document.querySelector('#meButton').style.display = 'none';
  }
  activePlayers = [...new Set(active)];
  activeColors = activePlayers.map(playerName=>players[playerName]);
  removeFromDOM('#playerList > div, #playerCursors > .cursor');

  for(const player in players) {
    const entry = domByTemplate('template-playerlist-entry');
    $('.teamColor', entry).value = toHex(players[player]);
    $('.playerName', entry).value = player;
    $('.teamColor', entry).addEventListener('change', function(e) {
      const newColor = toHex(e.target.value);
      toServer('playerColor', { player, color: newColor });
      if (player === playerName) {
        playerColor = newColor;
        localStorage.setItem('playerColor', playerColor);
        const userData = JSON.parse(localStorage.getItem('userData')) || {};
        userData.playerColor = newColor;
        localStorage.setItem('userData', JSON.stringify(userData));
        toServer('updateUserData', { username: player, userData: { playerColor: newColor } });
      }
    });
    $('.playerName', entry).addEventListener('change', function(e) {
      const newName = e.target.value;
      toServer('rename', { oldName: player, newName: newName });
      if (player === playerName) {
        const userData = JSON.parse(localStorage.getItem('userData')) || {};
        userData.playerName = newName;
        localStorage.setItem('userData', JSON.stringify(userData));
        toServer('updateUserData', { username: newName, userData: { playerName: newName } });
      }
    });
    if (config.authenticateUsers) {
      
    } else {
      if(player == playerName) {
        entry.className = 'myPlayerEntry';
        if (players[player]) {
          playerColor = players[player];
          localStorage.setItem('playerColor', playerColor);
        }
      } else {
        entry.className = 'activePlayerEntry';
      }
    }
    if(activePlayers.indexOf(player) == -1)
      entry.className = 'inactivePlayerEntry';

    $('#playerList').appendChild(entry);

    if(player != playerName && activePlayers.indexOf(player) != -1)
      addPlayerCursor(player, players[player]);
  }
  if((activePlayers.length < 2) && !config.authenticateUsers){
    document.getElementById("template-playerlist-entry").insertAdjacentHTML("afterend", "<div class='nothingtoshow'>There are no other players at this table.</div>");
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
  onMessage('meta', args=>fillPlayerList(args.meta.players, args.activePlayers));
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

  // share URL when clicking button
  shareButton($('#playersShareButton'), _=>location.href);
});
