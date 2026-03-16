import { asArray, onLoad, rand } from '../domhelpers.js';
import { setPlayerEvent, setMyName, setActivePlayersList } from './status.js';

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
  for (const x of arr) c[x] = (c[x] || 0) + 1;
  return c;
}

function fillPlayerList(players, active) {
  activePlayers = active || [];
  activeColors = activePlayers.map(n => players[n] || '#888');
  setActivePlayersList(activePlayers);
  removeFromDOM('#playerList > div, #playerCursors > .cursor');

  for (const player in players) {
    const entry = domByTemplate('template-playerlist-entry');
    $('.teamColor', entry).value = players[player];
    $('.playerName', entry).value = player;
    $('.teamColor', entry).addEventListener('change', function(e) {
      toServer('playerColor', { player, color: toHex(e.target.value) });
    });
    $('.playerName', entry).addEventListener('change', function(e) {
      toServer('rename', { oldName: player, newName: e.target.value });
    });
    if (player == playerName) {
      entry.className = 'myPlayerEntry';
      playerColor = players[player];
    } else {
      entry.className = 'activePlayerEntry';
    }
    if (activePlayers.indexOf(player) === -1)
      entry.className = 'inactivePlayerEntry';

    $('#playerList').appendChild(entry);

    if (player != playerName && activePlayers.indexOf(player) !== -1)
      addPlayerCursor(player, players[player]);
  }
  if (activePlayers.length < 2) {
    document.getElementById("template-playerlist-entry").insertAdjacentHTML("afterend", "<div class='nothingtoshow'>There are no other players at this table.</div>");
  }
  setMyName(playerName);

  if (prevActivePlayers.length > 0) {
    const prevCount = countBy(prevActivePlayers);
    const currCount = countBy(activePlayers);
    const parts = [];
    const names = new Set([...Object.keys(prevCount), ...Object.keys(currCount)]);
    const singleLeft = [];
    const singleJoined = [];
    const suffix = (n, count) => (count > 1 ? ` (${count} clients)` : '');
    for (const n of names) {
      const prev = prevCount[n] || 0;
      const curr = currCount[n] || 0;
      const delta = curr - prev;
      if (delta === -1) singleLeft.push(n);
      else if (delta === 1) singleJoined.push(n);
      else if (delta > 1) parts.push(`${n} (${delta} more) joined${suffix(n, curr)}`);
      else if (delta < -1) parts.push(`${n} (${-delta}) left${suffix(n, prev)}`);
      else if (delta > 0) parts.push((delta === 1 ? `${n} joined` : `${n} (${delta}) joined`) + suffix(n, curr));
      else if (delta < 0) parts.push((delta === -1 ? `${n} left` : `${n} (${-delta}) left`) + suffix(n, prev));
    }
    if (singleLeft.length === 1 && singleJoined.length === 1) {
      const leftName = singleLeft[0];
      const joinedName = singleJoined[0];
      parts.unshift(`${leftName} renamed to ${joinedName}${suffix(joinedName, currCount[joinedName] || 0)}`);
    } else {
      singleLeft.forEach(n => parts.push(`${n} left${suffix(n, prevCount[n] || 0)}`));
      singleJoined.forEach(n => parts.push(`${n} joined${suffix(n, currCount[n] || 0)}`));
    }
    if (parts.length)
      setPlayerEvent(parts.join('; '));
  }
  prevActivePlayers = [...activePlayers];

  const playersButton = $('#playersButton');
  const tooltip = $('.tooltip', playersButton);
  if (tooltip) tooltip.textContent = `Players: ${activePlayers.length}`;
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
    setPlayerEvent(`You renamed to ${playerName}`);
    localStorage.setItem('playerName', playerName);
    for(const [ id, widget ] of widgets)
      widget.updateOwner();
  });

  // share URL when clicking button
  shareButton($('#playersShareButton'), _=>location.href);
});
