import { asArray, onLoad, rand, shareURL } from '../domhelpers.js';

let playerCursors = {};
let playerCursorsTimeout = {};
let playerName = localStorage.getItem('playerName') || 'Guest' + Math.floor(rand()*1000);
let playerColor = 'red';
let activePlayers = [];
let activeColors = [];
let mouseCoords = [];
let mySessionID = null;
let metaUpdateResolves = [];
let inviteStatusTimeout = null;
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

// resolves once a meta update arrives for which isApplied returns true so the UI can show that a
// sent request is being worked on; rejects after a timeout because the server silently ignores
// invalid requests and unrelated meta updates (joins, color changes) arrive at any time
function nextMetaUpdate(isApplied, timeout=3000) {
  return new Promise(function(resolve, reject) {
    const timer = setTimeout(function() {
      metaUpdateResolves = metaUpdateResolves.filter(r=>r != entry);
      reject(new Error('The server did not apply the change.'));
    }, timeout);
    const entry = function(args) {
      if(isApplied && !isApplied(args))
        return false;
      clearTimeout(timer);
      resolve();
      return true;
    };
    metaUpdateResolves.push(entry);
  });
}

// shows a spinner on the button while a returned promise is pending; the row usually
// gets replaced by the meta update before the button is restored
// the widget properties the server looks at before it lets a player be removed, and how to say
// in the tooltip of the disabled button what is still pointing at that player
const playerReferences = {
  owner: 'cards or other widgets in the game belong to them',
  player: 'they are seated in the game',
  artist: 'they are credited as an artist'
};

// a button that cannot do anything here stays visible and says why - removing it silently
// leaves people wondering why the same row of the table has fewer buttons than the others
function unavailableButton(button, reason) {
  button.classList.add('unavailable');
  button.setAttribute('aria-disabled', 'true');
  button.title = reason;
}

function serverActionButton(button, action) {
  button.addEventListener('click', async function() {
    if(button.disabled)
      return;
    const pending = action();
    if(!pending)
      return;
    const initialIcon = button.getAttribute('icon');
    button.disabled = true;
    button.setAttribute('icon', 'hourglass_empty');
    button.classList.add('working');
    try {
      await pending;
    } catch(e) {}
    button.disabled = false;
    button.setAttribute('icon', initialIcon);
    button.classList.remove('working');
  });
}

// the share button sits in the actions column of the invite row and has no room for a label,
// so sharing reports its result in the name cell of that row instead
function showInviteStatus(text, isError) {
  clearTimeout(inviteStatusTimeout);
  $('#playerInviteStatus').textContent = text;
  $('#playerInviteStatus').classList.toggle('error', !!isError);
  $('#invitePlayerRow').classList.toggle('showStatus', !!text);
  if(text)
    inviteStatusTimeout = setTimeout(_=>showInviteStatus(''), 5000);
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

  const widgetList = [...widgets.values()];
  const referencesTo = player=>Object.keys(playerReferences).filter(p=>widgetList.some(function(w) {
    return Array.isArray(w.state[p]) ? w.state[p].indexOf(player) != -1 : w.state[p] == player;
  }));

  for(const player of sortedPlayers) {
    const playerSessions = sessionsByPlayer[player] || [ null ];
    const hasMySession = playerSessions.some(s=>s && s.sessionID == mySessionID);
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
        $('.playerName', row).addEventListener('change', async function(e) {
          const newName = e.target.value.trim();
          if(newName && newName != player) {
            e.target.disabled = true;
            e.target.classList.add('working');
            toServer('rename', { oldName: player, newName, updateWidgets: true });
            try {
              await nextMetaUpdate(args=>args.meta.players[newName] !== undefined);
            } catch(err) {
              e.target.value = player;
            }
            e.target.disabled = false;
            e.target.classList.remove('working');
          }
        });
        $('.playerName', row).addEventListener('keydown', function(e) {
          if(e.key == 'Enter')
            e.target.blur();
        });
        $('.renamePlayer', row).addEventListener('click', function() {
          $('.playerName', row).focus();
          $('.playerName', row).select();
        });
        const references = referencesTo(player);
        // viewing a connected player who is part of the game would secretly reveal their hand (the server refuses it too)
        if(player == playerName) {
          removeFromDOM($('.viewPlayer', row));
        } else if(session && references.length) {
          unavailableButton($('.viewPlayer', row), `You cannot view the game as ${player} because they are connected and taking part in the game - it would reveal their hand to you`);
        } else {
          serverActionButton($('.viewPlayer', row), function() {
            toServer('rename', { oldName: playerName, newName: player, sessionID: mySessionID });
            return nextMetaUpdate(args=>(args.sessions || []).some(s=>s.sessionID == mySessionID && s.player == player));
          });
        }
        // a player the game still points at cannot be removed - the sessions column already says
        // why a connected one cannot, so only the widget references need spelling out
        if(session) {
          removeFromDOM($('.removePlayer', row));
        } else if(references.length) {
          const reasons = references.map(p=>playerReferences[p]);
          unavailableButton($('.removePlayer', row), `You cannot remove ${player} because ${reasons.join(' and ')}. Rename them to a player who stays, or free what belongs to them, and the button becomes available.`);
        } else {
          serverActionButton($('.removePlayer', row), function() {
            toServer('removeLocalPlayer', { player });
            return nextMetaUpdate(args=>args.meta.players[player] === undefined);
          });
        }
      } else {
        row = document.createElement('tr');
      }

      row.className = player == playerName ? 'myPlayerEntry' : session ? 'activePlayerEntry' : 'inactivePlayerEntry';
      if(session && session.sessionID == mySessionID)
        row.classList.add('mySessionEntry');
      // the cells merged across the player's session rows live in the first row
      if(sessionIndex == 0 && hasMySession)
        row.classList.add('mySessionPlayer');

      const sessionCell = $('td', domByTemplate('template-playerlist-session', {}, 'tr'));
      if(session) {
        // numbering the sessions only carries information for players that actually have more than one
        const label = playerSessions.length > 1 ? `Session ${sessionIndex+1}` : 'connected';
        $('.sessionLabel', sessionCell).textContent = session.sessionID == mySessionID ? `${label} (you)` : label;
      } else {
        $('.sessionLabel', sessionCell).textContent = 'not connected';
      }
      row.appendChild(sessionCell);

      $('#playersTable tbody').appendChild(row);
    });

    if(player != playerName && activePlayers.indexOf(player) != -1)
      addPlayerCursor(player, players[player]);
  }
  // with a second tab open as the same player, adding a player also moves this tab to it
  $('#addLocalPlayerButton').title = (sessionsByPlayer[playerName] || []).length > 1
    ? 'Add a player and switch this browser tab to them'
    : 'Add a player who shares this device';
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
  function refillPlayerList() {
    if(lastMetaArgs)
      fillPlayerList(lastMetaArgs.meta.players, lastMetaArgs.activePlayers, lastMetaArgs.sessions);
  }
  onMessage('meta', function(args) {
    lastMetaArgs = args;
    fillPlayerList(args.meta.players, args.activePlayers, args.sessions);
    metaUpdateResolves = metaUpdateResolves.filter(entry=>!entry(args));
  });
  onMessage('sessionID', function(args) {
    mySessionID = args;
    refillPlayerList();
  });
  // the buttons in the player list depend on widget references (seats, owners) which
  // change through state and delta messages without a meta update
  onMessage('state', refillPlayerList);
  onMessage('delta', function(delta) {
    for(const widgetID in delta.s)
      if(delta.s[widgetID] === null || [ 'owner', 'player', 'artist' ].some(p=>delta.s[widgetID][p] !== undefined))
        return refillPlayerList();
  });
  $('#playersButton').addEventListener('click', refillPlayerList);
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

  serverActionButton($('#addLocalPlayerButton'), function() {
    const input = $('#localPlayerName');
    input.setCustomValidity('');
    const localPlayerName = input.value.trim();
    // the server silently ignores empty and duplicate names, so complain right at the input instead
    if(!localPlayerName || (lastMetaArgs && lastMetaArgs.meta.players[localPlayerName] !== undefined)) {
      input.setCustomValidity(localPlayerName ? 'This player already exists.' : 'Please enter a player name.');
      input.reportValidity();
      return;
    }
    // a second tab connected as the same player is somebody who wants to be their own player, so
    // the new player takes this session over right away instead of waiting for a View click
    if((lastMetaArgs && lastMetaArgs.sessions || []).filter(s=>s.player == playerName).length > 1) {
      // renaming a single session creates the player if it does not exist yet
      toServer('rename', { oldName: playerName, newName: localPlayerName, sessionID: mySessionID });
      return nextMetaUpdate(args=>(args.sessions || []).some(s=>s.sessionID == mySessionID && s.player == localPlayerName)).then(_=>input.value = '');
    }
    toServer('addLocalPlayer', { player: localPlayerName });
    return nextMetaUpdate(args=>args.meta.players[localPlayerName] !== undefined).then(_=>input.value = '');
  });
  $('#localPlayerName').addEventListener('input', e=>e.target.setCustomValidity(''));
  $('#localPlayerName').addEventListener('keydown', function(e) {
    if(e.key == 'Enter')
      $('#addLocalPlayerButton').click();
  });

  // the room URL is plain text - clicking it would just reload the room, so sharing it is the button's job
  serverActionButton($('#playersShareButton'), async function() {
    try {
      showInviteStatus(await shareURL(location.href) == 'clipboard' ? 'Room URL copied to clipboard.' : 'Room URL shared.');
    } catch(e) {
      showInviteStatus(e.message, true);
    }
  });
});
