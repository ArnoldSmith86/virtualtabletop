import { asArray, domByTemplate, onLoad, rand, removeFromDOM } from '../domhelpers.js';

let playerCursors = {};
let playerCursorsTimeout = {};
let playerName = localStorage.getItem('playerName') || 'Guest' + Math.floor(rand()*1000);
let playerColor = 'red';
let activePlayers = [];
let activeColors = [];
let mouseCoords = [];
localStorage.setItem('playerName', playerName);

export {
  playerName,
  playerColor,
  activePlayers,
  activeColors,
  mouseCoords
}

let chatPlayerColors = {};
let unreadChatMessages = 0;
let chatOpen = false;
let chatState = {};
try {
  chatState = JSON.parse(localStorage.getItem('chatPanelState')) || {};
} catch(e) {}

function saveChatState() {
  localStorage.setItem('chatPanelState', JSON.stringify(chatState));
}

let chatSettings = { theme: 'light', sound: 'none', fontSize: 'm', autoScrollBottomOnly: true };
try {
  Object.assign(chatSettings, JSON.parse(localStorage.getItem('chatSettings')) || {});
} catch(e) {}

function saveChatSettings() {
  localStorage.setItem('chatSettings', JSON.stringify(chatSettings));
}

function applyChatSettings() {
  const panel = $('#chatPanel');
  panel.dataset.theme = chatSettings.theme;
  panel.dataset.fontSize = chatSettings.fontSize;
}

let chatAudioContext;
function chatDing() {
  try {
    if(!chatAudioContext)
      chatAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = chatAudioContext;
    if(ctx.state == 'suspended')
      ctx.resume();
    const now = ctx.currentTime;
    for(const [ freq, at ] of [ [ 880, 0 ], [ 1320, 0.12 ] ]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.15, now + at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.2);
    }
  } catch(e) {}
}

function updateChatBadge() {
  const button = $('#chatButton');
  const tooltip = $('.tooltip', button);
  if(unreadChatMessages) {
    const badge = unreadChatMessages > 99 ? '99+' : String(unreadChatMessages);
    button.dataset.unreadChat = badge;
    if(tooltip) tooltip.dataset.unreadChat = badge;
  } else {
    delete button.dataset.unreadChat;
    if(tooltip) delete tooltip.dataset.unreadChat;
  }
}

function applyChatGeometry() {
  const panel = $('#chatPanel');
  if(chatState.width) panel.style.width = chatState.width;
  if(chatState.height) panel.style.height = chatState.height;
  if(chatState.left && chatState.top) {
    panel.style.left = chatState.left;
    panel.style.top = chatState.top;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }
}

function openChat() {
  chatOpen = true;
  chatState.open = true;
  $('#chatPanel').classList.remove('hidden');
  unreadChatMessages = 0;
  updateChatBadge();
  setTimeout(_=>$('#chatMessages').scrollTop = $('#chatMessages').scrollHeight, 0);
  saveChatState();
}

function closeChat() {
  chatOpen = false;
  chatState.open = false;
  $('#chatPanel').classList.add('hidden');
  saveChatState();
}

function toggleChatPanel() {
  if(chatOpen)
    closeChat();
  else
    openChat();
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

function fillPlayerList(players, active) {
  activePlayers = [...new Set(active)];
  activeColors = activePlayers.map(playerName=>players[playerName]);
  removeFromDOM('#playerList > div, #playerCursors > .cursor');

  for(const player in players) {
    const entry = domByTemplate('template-playerlist-entry');
    $('.teamColor', entry).value = players[player];
    $('.playerName', entry).value = player;
    $('.teamColor', entry).addEventListener('change', function(e) {
      toServer('playerColor', { player, color: toHex(e.target.value) });
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
  onMessage('meta', args=>{
    chatPlayerColors = args.meta.players;
    fillPlayerList(args.meta.players, args.activePlayers);
  });
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

  // share URL when clicking button
  shareButton($('#playersShareButton'), _=>location.href);

  applyChatGeometry();
  if(chatState.open)
    openChat();

  applyChatSettings();
  $('#chatThemeSelect').value = chatSettings.theme;
  $('#chatSoundSelect').value = chatSettings.sound;
  $('#chatFontSelect').value = chatSettings.fontSize;
  $('#chatAutoScrollToggle').checked = chatSettings.autoScrollBottomOnly !== false;

  $('#chatSettingsButton').addEventListener('click', function() {
    $('#chatSettings').classList.toggle('hidden');
  });
  $('#chatThemeSelect').addEventListener('change', function() {
    chatSettings.theme = this.value;
    applyChatSettings();
    saveChatSettings();
  });
  $('#chatSoundSelect').addEventListener('change', function() {
    chatSettings.sound = this.value;
    saveChatSettings();
    if(this.value == 'ding')
      chatDing(); // preview + primes the audio context on this user gesture
  });
  $('#chatFontSelect').addEventListener('change', function() {
    chatSettings.fontSize = this.value;
    applyChatSettings();
    saveChatSettings();
  });
  $('#chatAutoScrollToggle').addEventListener('change', function() {
    chatSettings.autoScrollBottomOnly = this.checked;
    saveChatSettings();
  });

  // drags/resizes the chat panel while blocking the room's own mouse/touch handling (panning, widget
  // dragging) which would otherwise also react to the same pointer events bubbling up to the window
  function trackDrag(e, onMove, onEnd) {
    e.preventDefault();
    e.stopPropagation();
    const isTouch = e.type == 'touchstart';
    const start = isTouch ? e.touches[0] : e;
    const startX = start.clientX, startY = start.clientY;
    function move(e2) {
      e2.preventDefault();
      const point = isTouch ? e2.touches[0] : e2;
      onMove(point.clientX - startX, point.clientY - startY);
    }
    function end(e2) {
      document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', move);
      document.removeEventListener(isTouch ? 'touchend' : 'mouseup', end);
      onEnd();
    }
    document.addEventListener(isTouch ? 'touchmove' : 'mousemove', move, { passive: false });
    document.addEventListener(isTouch ? 'touchend' : 'mouseup', end);
  }

  function startHeaderDrag(e) {
    if(e.target.closest('button'))
      return;
    const panel = $('#chatPanel');
    const rect = panel.getBoundingClientRect();
    panel.classList.add('dragging');
    trackDrag(e, function(dx, dy) {
      const left = Math.max(0, Math.min(window.innerWidth - rect.width, rect.left + dx));
      const top = Math.max(0, Math.min(window.innerHeight - rect.height, rect.top + dy));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }, function() {
      panel.classList.remove('dragging');
      chatState.left = panel.style.left;
      chatState.top = panel.style.top;
      saveChatState();
    });
  }

  function startResize(e, resizeWidth, resizeHeight) {
    const panel = $('#chatPanel');
    const rect = panel.getBoundingClientRect();
    trackDrag(e, function(dx, dy) {
      if(resizeWidth)
        panel.style.width = `${Math.min(window.innerWidth - rect.left, rect.width + dx)}px`;
      if(resizeHeight)
        panel.style.height = `${Math.min(window.innerHeight - rect.top, rect.height + dy)}px`;
    }, function() {
      chatState.width = panel.style.width;
      chatState.height = panel.style.height;
      saveChatState();
    });
  }

  for(const eventName of [ 'mousedown', 'touchstart' ]) {
    $('#chatHeader').addEventListener(eventName, startHeaderDrag);
    $('.chatResize-e').addEventListener(eventName, e=>startResize(e, true, false));
    $('.chatResize-s').addEventListener(eventName, e=>startResize(e, false, true));
    $('.chatResize-se').addEventListener(eventName, e=>startResize(e, true, true));
  }

  $('#chatCloseButton').addEventListener('click', closeChat);

  function addChatMessage(entry) {
    const message = domByTemplate('template-chat-message', {}, 'div');
    message.className = 'chatMessage';
    message.dataset.player = entry.player;
    $('.chatTime', message).textContent = new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('.chatPlayer', message).textContent = entry.player;
    if(chatPlayerColors[entry.player] !== undefined)
      $('.chatPlayer', message).style.color = chatPlayerColors[entry.player];
    $('.chatText', message).textContent = entry.message;
    const log = $('#chatMessages');
    // don't steal the scroll position while the user is reading older messages
    const wasAtBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 5;
    log.appendChild(message);
    // cap the log so it doesn't grow unbounded over a long session; there is no server-side
    // history, so this is purely a client-side memory bound, not a sync guarantee
    while(log.children.length > 200)
      removeFromDOM(log.firstElementChild);
    // "auto-scroll only when at bottom" (default on) keeps the position while reading older
    // messages; turning it off always jumps to the newest message
    if(wasAtBottom || chatSettings.autoScrollBottomOnly === false)
      log.scrollTop = log.scrollHeight;
    if(entry.player != playerName && !chatOpen) {
      ++unreadChatMessages;
      updateChatBadge();
      if(chatSettings.sound == 'ding')
        chatDing();
    }
  }

  onMessage('chat', addChatMessage);

  function sendChatMessage() {
    const message = $('#chatInput').value.trim();
    if(!message)
      return;
    toServer('chat', { message });
    $('#chatInput').value = '';
  }
  $('#chatSendButton').addEventListener('click', sendChatMessage);
  $('#chatInput').addEventListener('keydown', function(e) {
    if(e.key == 'Enter' && !e.isComposing)
      sendChatMessage();
  });
});
