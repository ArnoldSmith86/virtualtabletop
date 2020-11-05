let playerName = localStorage.getItem('playerName') || 'Guest' + Math.floor(Math.random()*1000);
localStorage.setItem('playerName', playerName);

function fillPlayerList(players, activePlayers) {
  for(const entry of $a('#playerList > div'))
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

    $('#playerList').appendChild(entry);
  }
}
