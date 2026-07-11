import { asArray, onLoad, rand } from '../domhelpers.js';
import { setStatusMessage, setMyName, setActivePlayersList } from './status.js';

let playerCursors = {};
let playerCursorsTimeout = {};
let playerName = localStorage.getItem('playerName') || 'Guest' + Math.floor(rand()*1000);
let playerColor = 'red';
let activePlayers = [];
let activeColors = [];
let mouseCoords = [];
let prevActivePlayers = [];
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

function countBy(arr) {
  const c = {};
  for(const x of arr)
    c[x] = (c[x] || 0) + 1;
  return c;
}

// announces joins, leaves and renames by comparing the new active player list (one entry per client) to the previous one
function announcePlayerChanges(active) {
  if(!prevActivePlayers.length)
    return;
  const prevCount = countBy(prevActivePlayers);
  const currCount = countBy(active);
  const gone  = Object.keys(prevCount).filter(n=>!currCount[n]);
  const fresh = Object.keys(currCount).filter(n=>!prevCount[n]);

  const parts = [];
  if(gone.length == 1 && fresh.length == 1 && prevCount[gone[0]] == currCount[fresh[0]]) {
    // a self-rename is already announced by the 'rename' message handler
    if(fresh[0] != playerName)
      parts.push(`${gone[0]} renamed to ${fresh[0]}`);
  } else {
    for(const n of gone)
      parts.push(`${n} left`);
    for(const n of fresh)
      parts.push(`${n} joined`);
  }
  if(parts.length)
    setStatusMessage(parts.join('; '));
}

function fillPlayerList(players, active) {
  active = active || [];
  activePlayers = [...new Set(active)];
  activeColors = activePlayers.map(playerName=>players[playerName]);
  setActivePlayersList(activePlayers);
  removeFromDOM('#playerList > div, #playerCursors > .cursor');

  for(const player in players) {
    const entry = domByTemplate('template-playerlist-entry');
    $('.teamColor', entry).value = players[player];
    $('.playerName', entry).value = player;
    $('.teamColor', entry).addEventListener('change', function(e) {
      toServer('playerColor', { player, color: toHex(e.target.value) });
    });
    $('.playerName', entry).addEventListener('change', function(e) {
      toServer('rename', { oldName: player, newName: e.target.value });
    });
    if(player == playerName) {
      entry.className = 'myPlayerEntry';
      playerColor = players[player];
    } else {
      entry.className = 'activePlayerEntry';
    }
    if(activePlayers.indexOf(player) == -1)
      entry.className = 'inactivePlayerEntry';

    $('#playerList').appendChild(entry);

    if(player != playerName && activePlayers.indexOf(player) != -1)
      addPlayerCursor(player, players[player]);
  }
  if(activePlayers.length < 2){
    document.getElementById("template-playerlist-entry").insertAdjacentHTML("afterend", "<div class='nothingtoshow'>There are no other players at this table.</div>");
  }
  setMyName(playerName);
  announcePlayerChanges(active);
  prevActivePlayers = [...active];

  const tooltip = $('.tooltip', $('#playersButton'));
  if(tooltip)
    tooltip.textContent = `Players: ${activePlayers.length}`;
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
    setStatusMessage(`You renamed to ${playerName}`);
    localStorage.setItem('playerName', playerName);
    for(const [ id, widget ] of widgets)
      widget.updateOwner();
  });

  // share URL when clicking button
  shareButton($('#playersShareButton'), _=>location.href);
});
