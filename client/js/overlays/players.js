import { asArray, onLoad } from '../domhelpers.js';

let playerCursors = {};
let playerCursorsTimeout = {};
let playerName = localStorage.getItem('playerName') || 'Guest' + Math.floor(Math.random()*1000);
let playerColor = 'red';
let activePlayers = [];
let playerCursor;
localStorage.setItem('playerName', playerName);

export {
  playerName,
  playerColor,
  activePlayers,
  playerCursor
}

function addPlayerCursor(player, playerColor) {
  playerCursors[player] = document.createElement('div');
  playerCursors[player].className = 'cursor';
  playerCursors[player].style = `--playerName:''${playerName}'';--playerColor:${playerColor};`;
  playerCursors[player].style.transform = `translate(-50px, -50px)`;
  playerCursors[player].setAttribute("data-player",playerName);
  if(player == playerName) {
    playerCursors[player].classList.add('self');
    playerCursor = playerCursors[player];
    const enlarged = document.createElement('div');
    enlarged.id = "enlarged";
    enlarged.className = 'hidden';
    playerCursor.appendChild(enlarged);
  }
  $('#playerCursors').appendChild(playerCursors[player]);
  playerCursorsTimeout[player] = setTimeout(()=>{}, 0);
}

function fillPlayerList(players, active) {
  activePlayers = [...new Set(active)];
  removeFromDOM('#playerList > div, #playerCursors > .cursor');

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

    if(activePlayers.indexOf(player) != -1)
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
        playerCursorsTimeout[args.player] = setTimeout(()=>{playerCursors[args.player].classList.remove('active')}, 100 )
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
});
