function parseGameURL() {
  const gameURLmatch = location.href.match(/\/(game|tutorial)\/(?:([0-9a-z]{8})\/)?([a-z-]+)$/);
  if(gameURLmatch) {
    if(gameURLmatch[2]) {
      return {
        type: 'user',
        id: gameURLmatch[2]
      };
    } else {
      return {
        type: 'public',
        category: gameURLmatch[1],
        id: `PL:${gameURLmatch[1]}:${gameURLmatch[3]}`
      };
    }
  }
}

function checkForGameURL() {
  const gameDetails = parseGameURL();
  if(gameDetails) {
    fetch(`api/shareDetails/${gameDetails.id}`).then(async function(r) {
      const state = await r.json();

      applyValuesToDOM($('#linkDetailsOverlay'), state);
      $('#welcomeJoinRoom').value = state.emptyRoomID;

      if(state.name) {
        $('#welcomePlayerName').value = playerName;
        $('#welcomeGameName').innerText = state.name;
        emojis2images($('#welcomeGameName'));
        $('#welcomeGameType').innerText = gameDetails.category || 'game';
        $('#welcomeGameTypeHint').innerText = gameDetails.category == 'tutorial' ? 'check it out' : 'start playing it';
        $('#welcomeUserGenerated').style.display = gameDetails.type == 'public' ? 'none' : 'block';
        toggleClass($('#linkDetailsOverlay .star'),               'hidden', gameDetails.type == 'user' || !state.stars);
        toggleClass($('#linkDetailsOverlay .mainStateImage > i'), 'hidden', gameDetails.type == 'public');

        let tabSuffix = config.customTab || config.serverName || 'VirtualTabletop.io';
        document.title = `${state.name} - ${tabSuffix}`;

        showOverlay('linkDetailsOverlay');
      } else {
        checkForGameURL_showError('Game not found!');
      }
    });
  } else if(location.href.includes('/game/') || location.href.includes('/tutorial/')) {
    checkForGameURL_showError('Invalid game name!');
  }
}

function checkForGameURL_showError(text) {
  $('#loadingRoomIndicator').innerText = text;
  div($('#topSurface'), '', `
    <button icon=close>Create an empty room</button>
  `);
  $('#topSurface button').onclick = _=>location.href = config.externalURL;
}

async function playButtonClick(updateProgress) {
  const share = parseGameURL();

  updateProgress('Joining room...');
  if(!$('#welcomeJoinRoom').value.match(/^[A-Za-z0-9_-]+$/))
    throw new Error('Invalid room name');
  lastOverlay = 'linkDetailsOverlay';
  await joinRoom($('#welcomeJoinRoom').value);
  updateProgress('Adding game...');
  toServer('rename', { oldName: playerName, newName: $('#welcomePlayerName').value });
  const stateID = await addSharedGame(share.id);
  $('#statesButton').click();
  $(`#statesList [data-id="${stateID}"]`).click();

  if(share.category == 'tutorial') {
    $('#filterByType').value = 'Tutorials';
    updateLibraryFilter();
  }
}

async function joinRoom(newRoomID) {
  let joined = false;
  return new Promise(function(resolve, reject) {
    roomID = newRoomID;
    onMessage('meta', _=>{
      if(joined) return;
      joined = true;
      history.pushState("", document.title, roomID);
      resolve();
    });
    startWebSocket();
  });
}

async function addSharedGame(shareID) {
  const result = await fetch(`api/addShareToRoom/${roomID}/${shareID}`);
  const stateID = await result.text();

  // wait for the state to be added to the library if it's not already there
  if(!$(`#statesList [data-id="${stateID}"]`)) {
    await new Promise(function(resolve, reject) {
      onMessage('meta', args=>{
        if(args.meta.states[stateID])
          resolve();
      });
    });
  }

  return stateID;
}

onLoad(function() {
  progressButton($('#welcomePlayButton'), playButtonClick);

  $('#closeLinkDetails').onclick = _=>location.href = config.externalURL;

  // press play button when pressing enter
  for(const button of $a('#welcomeJoinRoom, #welcomePlayerName')) {
    button.onkeypress = e=>{
      if(e.keyCode == 13) {
        $('#welcomePlayButton').click();
        e.preventDefault();
      }
    };
  }

  window.onpopstate = _=>location.reload();
});
