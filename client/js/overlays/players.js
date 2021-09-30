import { onLoad } from '../domhelpers.js';

let playerCursors = {};
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
  $('#roomArea').appendChild(playerCursors[playerName]);
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
    $('.playerName', entry).addEventListener('change', async function(e) {
      toServer('rename', { oldName: player, newName: e.target.value });
      if(!widgetFilter(w=>asArray(w.get('owner')).indexOf(e.target.value)!=-1).length) {
        batchStart();
        for(const w of widgetFilter(w=>asArray(w.get('owner')).indexOf(player)!=-1)) {
          if(Array.isArray(w.get('owner')))
            await w.set('owner', w.get('owner').map(o=>o==player?e.target.value:o));
          else
            await w.set('owner', e.target.value);
        }
        batchEnd();
      }
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
      const x = args.coords[0]*scale;
      const y = args.coords[1]*scale;
      playerCursors[args.player].style.transform = `translate(${x}px, ${y}px)`;
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
