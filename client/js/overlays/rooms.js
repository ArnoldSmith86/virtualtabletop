// join passwords are kept in memory only, never in localStorage/sessionStorage: they survive an
// in-place room switch and a websocket reconnect, which is what they are needed for, but not a
// reload - which then simply asks for the password again
const roomPasswords = new Map();

let roomsCollectionID = null;
let isRoomAdmin = false;
let currentRoomLocked = false;
let roomVisitRegistered = false;
let pendingSwitchFrom = null;
let lastAutomaticRoomsRefresh = 0;

function getCollectionID() {
  if(!roomsCollectionID) {
    let id = localStorage.getItem('roomCollectionID');
    if(!id || !String(id).match(/^[A-Za-z0-9_-]{6,64}$/)) {
      // this is the admin credential for claimed rooms, so it needs a cryptographically secure source
      // (getRandomValues instead of randomUUID because the latter is unavailable in insecure contexts)
      id = [...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('roomCollectionID', id);
    }
    roomsCollectionID = id;
  }
  return roomsCollectionID;
}

function getRoomPassword(id) {
  return roomPasswords.get(id);
}

function registerRoomVisit() {
  roomVisitRegistered = true;
  fetch(`api/roomcollection/${getCollectionID()}/add/${roomID}`, { method: 'PUT' });
}

function applyRoomLockState() {
  const locked = currentRoomLocked && !isRoomAdmin;
  toggleClass(document.body, 'roomLocked', locked);
  if(locked && ($('#statesButton.active') || $('#editButton.active')))
    $('#activeGameButton').click();
}

async function roomAction(id, action, args) {
  const result = await fetch(`api/room/${id}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ collection: getCollectionID() }, args || {}))
  });
  if(!result.ok)
    alert(await result.text());
  await refreshRoomsList();
}

async function copyRoom(sourceID, mode) {
  let autoLink = false;
  if(mode == 'link') {
    autoLink = await confirmOverlay('Link future games', 'All games currently in the game shelf of the source room will be linked into the new room. Should games that get added to the source room later on be linked into the new room automatically as well?', 'Also future games', 'Only current games', 'all_inclusive', 'link');
    showOverlay('roomsOverlay');
    if(autoLink === null)
      return;
  }
  const result = await fetch('api/copyRoom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: sourceID, mode, autoLink, collection: getCollectionID(), password: getRoomPassword(sourceID) })
  });
  if(!result.ok) {
    alert(await result.text());
    return;
  }
  const newRoomID = await result.text();
  await fetch(`api/roomcollection/${getCollectionID()}/add/${newRoomID}`, { method: 'PUT' });
  await refreshRoomsList();
}

function switchRoom(newRoomID, pushHistory=true) {
  if(newRoomID == roomID) {
    $('#activeGameButton').click();
    return;
  }
  pendingSwitchFrom = roomID;
  roomVisitRegistered = false;
  isRoomAdmin = false;
  if(pushHistory)
    history.pushState('', '', location.pathname.replace(/[^\/]*$/, newRoomID));
  setRoomID(newRoomID);
  $('#activeGameButton').click();
  toServer('room', { playerName, roomID: newRoomID, collection: getCollectionID(), password: getRoomPassword(newRoomID) });
}

function createRoomTile(room) {
  const tile = domByTemplate('template-roomslist-entry');
  tile.className = 'roomTile';
  if(!room.image)
    tile.classList.add('noImage');
  if(room.id == roomID)
    tile.classList.add('currentRoom');

  $('h3', tile).textContent = room.name;
  $('h4', tile).textContent = room.gameName || 'No game loaded';
  if(room.image)
    $('img', tile).src = mapAssetURLs(room.image);
  toggleClass($('.lockedIcon', tile), 'hidden', !room.locked);
  toggleClass($('.passwordIcon', tile), 'hidden', !room.hasPassword);
  toggleClass($('.adminIcon', tile), 'hidden', !room.isAdmin);

  for(const player of Array.isArray(room.players) ? room.players : []) {
    const chip = document.createElement('span');
    chip.textContent = player.name;
    if(player.color)
      chip.style.backgroundColor = player.color;
    $('.roomPlayers', tile).appendChild(chip);
  }

  const menu = $('.roomMenu', tile);
  const addMenuButton = function(icon, text, className, callback) {
    const button = document.createElement('button');
    button.setAttribute('icon', icon);
    button.textContent = text;
    if(className)
      button.className = className;
    button.onclick = function(e) {
      menu.classList.add('hidden');
      e.stopPropagation();
      callback();
    };
    menu.appendChild(button);
  };

  if(!room.claimed && room.id == roomID) // the server only allows claiming rooms you are currently in
    addMenuButton('verified_user', 'Claim room', null, async function() {
      if(await confirmOverlay('Claim room', `This ties the room "${room.name}" to your collection ID and makes you its admin: you can lock it, protect it with a password, rename it and delete it. Anyone who knows your collection ID has the same powers.`, 'Claim', 'Cancel', 'verified_user', 'undo')) {
        showOverlay('roomsOverlay');
        await roomAction(room.id, 'claim');
      } else {
        showOverlay('roomsOverlay');
      }
    });
  if(room.isAdmin) {
    addMenuButton('edit', 'Rename room', null, function() {
      const name = prompt('Enter a new name for this room (leave empty to show its ID again):', room.name == room.id ? '' : room.name);
      if(name !== null)
        roomAction(room.id, 'setName', { name });
    });
    addMenuButton(room.locked ? 'lock_open' : 'lock', room.locked ? 'Unlock room' : 'Lock room', null, function() {
      roomAction(room.id, 'setLocked', { locked: !room.locked });
    });
    addMenuButton('key', room.hasPassword ? 'Change password' : 'Set password', null, function() {
      const password = prompt('Enter a join password for this room (leave empty to remove it):', '');
      if(password !== null)
        roomAction(room.id, 'setPassword', { password });
    });
    addMenuButton('remove_moderator', 'Release claim', null, function() {
      roomAction(room.id, 'unclaim');
    });
  }
  addMenuButton('content_copy', 'Copy room', null, function() {
    copyRoom(room.id, 'copy');
  });
  addMenuButton('link', 'Create linked room', null, function() {
    copyRoom(room.id, 'link');
  });
  if(room.isAdmin)
    addMenuButton('delete', 'Delete room', 'red', async function() {
      if(await confirmOverlay('Delete room', `Are you sure you want to delete the room "${room.name}"? This permanently removes all its games, saved games and its current table.`, 'Delete', 'Keep', 'delete', 'undo', 'red')) {
        showOverlay('roomsOverlay');
        await roomAction(room.id, 'delete');
      } else {
        showOverlay('roomsOverlay');
      }
    });
  addMenuButton('visibility_off', 'Remove from list', null, async function() {
    await fetch(`api/roomcollection/${getCollectionID()}/remove/${room.id}`, { method: 'PUT' });
    await refreshRoomsList();
  });

  $('.menuButton', tile).onclick = function(e) {
    const wasHidden = menu.classList.contains('hidden');
    for(const m of $a('#roomsList .roomMenu'))
      m.classList.add('hidden');
    toggleClass(menu, 'hidden', !wasHidden);
    e.stopPropagation();
  };

  if(room.id == roomID) {
    $('.switchButton', tile).textContent = 'You are here';
    $('.switchButton', tile).disabled = true;
  } else {
    $('.switchButton', tile).onclick = function() {
      switchRoom(room.id);
    };
  }

  return tile;
}

async function refreshRoomsList() {
  $('#collectionIDinput').value = getCollectionID();
  let rooms = null;
  try {
    const result = await fetch(`api/roomcollection/${getCollectionID()}`);
    if(result.ok)
      rooms = (await result.json()).rooms;
  } catch(e) {}
  removeFromDOM('#roomsList .roomTile');
  if(rooms === null) {
    $('#emptyRoomsList').textContent = 'Could not load your room collection. Please try again.';
    $('#emptyRoomsList').style.display = 'block';
    return;
  }
  rooms.sort((a, b)=>(b.id == roomID) - (a.id == roomID));
  for(const room of rooms)
    $('#roomsList').appendChild(createRoomTile(room));
  $('#emptyRoomsList').style.display = rooms.length ? 'none' : 'block';
  $('#emptyRoomsList').textContent = 'No rooms yet. Rooms you visit with this browser show up here automatically.';
}

onLoad(function() {
  onMessage('adminStatus', function(status) {
    isRoomAdmin = !!status;
    applyRoomLockState();
  });

  onMessage('meta', function(args) {
    currentRoomLocked = !!args.meta.locked;
    applyRoomLockState();
    if(!roomVisitRegistered)
      registerRoomVisit();
    // keep the tiles up to date while the overlay is visible (e.g. the loaded game changed),
    // but throttled because meta broadcasts can be frequent and each refresh queries the server
    if($('#roomsOverlay').style.display != 'none' && Date.now() - lastAutomaticRoomsRefresh > 5000) {
      lastAutomaticRoomsRefresh = Date.now();
      refreshRoomsList();
    }
  });

  onMessage('state', function() {
    pendingSwitchFrom = null;
    document.body.classList.remove('passwordPrompt');
    if($('#passwordOverlay').style.display != 'none') {
      showOverlay(null, true);
      $('#activeGameButton').click();
    }
  });

  onMessage('passwordRequired', function(wrongPassword) {
    $('#passwordOverlay .wrongPassword').style.display = wrongPassword ? 'block' : 'none';
    toggleClass($('#passwordOverlay button.cancel'), 'hidden', pendingSwitchFrom === null);
    document.body.classList.add('passwordPrompt');
    showOverlay('passwordOverlay', true);
    $('#roomPasswordInput').focus();
  });

  on('#passwordOverlay button.join', 'click', function() {
    const password = $('#roomPasswordInput').value;
    roomPasswords.set(roomID, password);
    toServer('room', { playerName, roomID, collection: getCollectionID(), password });
  });
  on('#roomPasswordInput', 'keyup', function(e) {
    if(e.key == 'Enter')
      $('#passwordOverlay button.join').click();
  });
  on('#passwordOverlay button.cancel', 'click', function() {
    const backTo = pendingSwitchFrom;
    pendingSwitchFrom = null;
    document.body.classList.remove('passwordPrompt');
    if(backTo) {
      history.pushState('', '', location.pathname.replace(/[^\/]*$/, backTo));
      setRoomID(backTo);
      showOverlay(null, true);
      showOverlay('roomsOverlay');
    }
  });

  // keep the browser back/forward buttons working after in-place room switches
  window.addEventListener('popstate', function() {
    const target = location.pathname.replace(/.*\//, '');
    if(target && target.match(/^[A-Za-z0-9_-]+$/) && target != roomID)
      switchRoom(target, false);
  });

  on('#roomsButton', 'click', function() {
    if(!isLoading)
      refreshRoomsList();
  });

  document.addEventListener('click', function() {
    for(const m of $a('#roomsList .roomMenu'))
      m.classList.add('hidden');
  });

  progressButton($('#copyCollectionID'), async function() {
    await navigator.clipboard.writeText(getCollectionID());
  });

  on('#applyCollectionID', 'click', function() {
    const id = $('#collectionIDinput').value.trim();
    if(!id.match(/^[A-Za-z0-9_-]{6,64}$/)) {
      alert('Collection IDs have to be 6-64 characters long and can only contain letters, numbers, "_" and "-".');
      return;
    }
    localStorage.setItem('roomCollectionID', id);
    roomsCollectionID = id;
    // rejoin so the server updates this player's collection for admin status and lock enforcement
    isRoomAdmin = false;
    toServer('room', { playerName, roomID, collection: getCollectionID(), password: getRoomPassword(roomID) });
    registerRoomVisit();
    refreshRoomsList();
  });
});
