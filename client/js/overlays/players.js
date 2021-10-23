import { asArray, onLoad } from '../domhelpers.js';

let playerCursors = {};
let playerCursorsTimeout = {};
let playerName = localStorage.getItem('playerName') || 'Guest' + Math.floor(Math.random()*1000);
let playerColor = 'red';
let activePlayers = [];
localStorage.setItem('playerName', playerName);

export {
  playerName,
  playerColor,
  activePlayers
}

function addPlayerCursor(playerName, playerColor) {
  playerCursors[playerName] = document.createElement('div');
  playerCursors[playerName].className = 'cursor';
  playerCursors[playerName].style.backgroundColor = playerColor;
  playerCursors[playerName].style.transform = `translate(-50px, -50px)`;
  playerCursors[playerName].setAttribute("player",playerName);
  $('#roomArea').appendChild(playerCursors[playerName]);
  playerCursorsTimeout[playerName] = setTimeout(()=>{}, 0);
}

function fillPlayerList(players, active) {
  activePlayers = [...new Set(active)];
  removeFromDOM('#playerList > div, #roomArea > .cursor');

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
}

onLoad(function() {
  onMessage('meta', args=>fillPlayerList(args.meta.players, args.activePlayers));
  onMessage('mouse', function(args) {
    if(args.player != playerName) {
      clearTimeout(playerCursorsTimeout[args.player]);
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
      playerCursorsTimeout[args.player] = setTimeout(()=>{playerCursors[args.player].classList.remove('active')}, 100 )
    }
  });
  onMessage('rename', function(args) {
    const oldName = playerName;
    playerName = args;
    localStorage.setItem('playerName', playerName);
    for(const [ id, widget ] of widgets)
      widget.updateOwner();
  });
});
