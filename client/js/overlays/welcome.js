function parseGameURL() {
  const gameURLmatch = location.href.match(/\/game\/(?:([0-9a-z]{8})\/)?([a-z-]+)$/);
  if(gameURLmatch) {
    return {
      type: 'user',
      id: gameURLmatch[1]
    };
  }
}

function checkForGameURL() {
  const gameDetails = parseGameURL();
  if(gameDetails) {
    fetch(`api/shareDetails/${gameDetails.id}`).then(async function(r) {
      const state = await r.json();
      applyValuesToDOM($('#linkDetailsOverlay'), state);
      $('#welcomePlayerName').value = playerName;
      toggleClass($('#linkDetailsOverlay .star'),               'hidden', gameDetails.type == 'user');
      toggleClass($('#linkDetailsOverlay .mainStateImage > i'), 'hidden', gameDetails.type == 'public');
      showOverlay('linkDetailsOverlay');
    });
  }
}

async function playButtonClick(updateProgress) {
  const shareID = parseGameURL().id;

  updateProgress('Joining room...');
  if(!$('#welcomeJoinRoom').value.match(/^[A-Za-z0-9_-]+$/))
    throw new Error('Invalid room name');
  await joinRoom($('#welcomeJoinRoom').value);
  updateProgress('Adding game...');
  localStorage.setItem('playerName', playerName = $('#welcomePlayerName').value);
  const stateID = await addSharedGame(shareID);
  $('#statesButton').click();
  $(`#statesList [data-id="${stateID}"]`).click();
}

async function joinRoom(newRoomID) {
  return new Promise(function(resolve, reject) {
    roomID = newRoomID;
    onMessage('meta', _=>{
      history.pushState("", document.title, roomID);
      resolve();
    });
    toServer('room', { playerName, roomID });
  });
}

async function addSharedGame(shareID) {
  const result = await fetch(`api/addShareToRoom/${roomID}/${shareID}`);
  return await result.text();
}

onLoad(function() {
  progressButton($('#welcomePlayButton'), playButtonClick);
});
