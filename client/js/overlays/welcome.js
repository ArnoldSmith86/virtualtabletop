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
        id: `PL:${gameURLmatch[3]}`
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
      $('#welcomePlayerName').value = playerName;
      $('#welcomeGameName').innerText = state.name;
      $('#welcomeUserGenerated').style.display = gameDetails.type == 'public' ? 'none' : 'block';
      toggleClass($('#linkDetailsOverlay .star'),               'hidden', gameDetails.type == 'user');
      toggleClass($('#linkDetailsOverlay .mainStateImage > i'), 'hidden', gameDetails.type == 'public');

      let tabSuffix = config.customTab || config.serverName || 'VirtualTabletop.io';
      document.title = `${state.name} - ${tabSuffix}`;

      showOverlay('linkDetailsOverlay');
    });
  }
}

async function playButtonClick(updateProgress) {
  const share = parseGameURL();

  updateProgress('Joining room...');
  if(!$('#welcomeJoinRoom').value.match(/^[A-Za-z0-9_-]+$/))
    throw new Error('Invalid room name');
  lastOverlay = 'linkDetailsOverlay';
  await joinRoom($('#welcomeJoinRoom').value);
  updateProgress('Adding game...');
  localStorage.setItem('playerName', playerName = $('#welcomePlayerName').value);
  const stateID = await addSharedGame(share.id);
  $('#statesButton').click();
  $(`#statesList [data-id="${stateID}"]`).click();

  if(share.category == 'tutorial') {
    $('#filterByType').value = 'Tutorials';
    updateLibraryFilter();
  }
}

async function joinRoom(newRoomID) {
  return new Promise(function(resolve, reject) {
    roomID = newRoomID;
    onMessage('meta', _=>{
      history.pushState("", document.title, roomID);
      resolve();
    });
    startWebSocket();
  });
}

async function addSharedGame(shareID) {
  const result = await fetch(`api/addShareToRoom/${roomID}/${shareID}`);
  return await result.text();
}

onLoad(function() {
  progressButton($('#welcomePlayButton'), playButtonClick);

  // share URL when clicking button
  shareButton($('.addToRoomBox button[icon=share]'), _=>config.externalURL + '/' + $('#welcomeJoinRoom').value);
});
