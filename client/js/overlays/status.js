import { $, onLoad } from '../domhelpers.js';
import { onMessage } from '../connection.js';

const PLAYER_EVENT_DURATION_MS = 10000;
const OVERLAY_LABELS = {
  statesOverlay: 'Game Shelf',
  stateDetailsOverlay: 'Game Shelf',
  buttonInputOverlay: 'Input',
  playerOverlay: 'Players',
  aboutOverlay: 'About'
};
const TOOLBAR_ICONS = {
  playerEvent: '[users_settings]',
  edit: '[edit_mode]',
  statesOverlay: '[library]',
  stateDetailsOverlay: '[library]',
  buttonInputOverlay: '[play_arrow]',
  playerOverlay: '[users_settings]',
  aboutOverlay: '[vtt_logo]'
};

let connectionState = { pendingCount: 0, oldestAge: 0, state: '' };
let playerEvent = { message: '', expiresAt: 0 };
let playerOverlays = {}; // name -> { editMode, activeOverlay, activeStateName }
let myName = null;

export function setConnectionState(pendingCount, oldestAge, state) {
  connectionState = { pendingCount, oldestAge, state };
}

export function setPlayerEvent(message, durationMs = PLAYER_EVENT_DURATION_MS) {
  const now = Date.now();
  if (playerEvent.message && now < playerEvent.expiresAt) {
    playerEvent.message += '; ' + message;
    playerEvent.expiresAt = now + durationMs;
  } else {
    playerEvent = { message, expiresAt: now + durationMs };
  }
}

let activePlayersList = [];
export function setActivePlayersList(active) {
  activePlayersList = active || [];
}

export function setMyName(name) {
  myName = name;
}

export function setPlayerOverlay(playerName, editMode, activeOverlay, activeStateName) {
  if (!playerName || playerName === myName) return;
  playerOverlays[playerName] = {
    editMode: !!editMode,
    activeOverlay: activeOverlay || null,
    activeStateName: activeStateName || null
  };
}

function getEl() {
  return $('#statusOverlay');
}

function render() {
  const el = getEl();
  if (!el) return;
  const icon = el.querySelector('.statusIcon');
  const text = el.querySelector('.statusText');
  if (!icon || !text) return;

  const now = Date.now();

  if (playerEvent.message && now < playerEvent.expiresAt) {
    el.dataset.state = 'playerEvent';
    el.classList.add('visible');
    el.classList.remove('bad', 'reconnecting');
    icon.setAttribute('icon', TOOLBAR_ICONS.playerEvent);
    text.textContent = playerEvent.message;
    el.style.setProperty('--pulse-min', '0.6');
    el.style.setProperty('--pulse-max', '0.9');
    return;
  }

  if (connectionState.pendingCount && connectionState.state) {
    el.dataset.state = connectionState.state;
    if (connectionState.state === 'reconnecting') {
      el.classList.add('visible', 'bad', 'reconnecting');
      text.textContent = `reconnecting (${connectionState.pendingCount} deltas pending - ${Math.round(connectionState.oldestAge / 1000)}s without feedback)`;
      el.style.setProperty('--pulse-min', '0.8');
      el.style.setProperty('--pulse-max', '1');
    } else if (connectionState.state === 'bad') {
      el.classList.add('visible', 'bad');
      el.classList.remove('reconnecting');
      icon.setAttribute('icon', 'link_off');
      text.textContent = `bad connection (${connectionState.pendingCount} deltas pending)`;
      el.style.setProperty('--pulse-min', '0.6');
      el.style.setProperty('--pulse-max', '0.8');
    } else {
      el.classList.add('visible');
      el.classList.remove('bad', 'reconnecting');
      icon.setAttribute('icon', 'link_off');
      text.textContent = '';
      el.style.setProperty('--pulse-min', '0.4');
      el.style.setProperty('--pulse-max', '0.6');
    }
    return;
  }

  const inEdit = Object.entries(playerOverlays).filter(([, o]) => o.editMode).map(([n]) => n);
  if (inEdit.length) {
    el.dataset.state = 'edit';
    el.classList.add('visible');
    el.classList.remove('bad', 'reconnecting');
    icon.setAttribute('icon', TOOLBAR_ICONS.edit);
    const namePart = inEdit.length === 1 ? inEdit[0] : null;
    text.textContent = namePart ? `${namePart} is in Edit Mode` : `${inEdit.length} players in Edit Mode`;
    return;
  }

  const byOverlay = {};
  for (const [name, o] of Object.entries(playerOverlays)) {
    const id = o.activeOverlay;
    if (!id) continue;
    const label = OVERLAY_LABELS[id] || id;
    if (!byOverlay[label]) byOverlay[label] = [];
    byOverlay[label].push({ name, stateName: label === 'Game Shelf' ? (o.activeStateName || null) : null });
  }
  const order = ['Input', 'Game Shelf', 'Players', 'About'];
  const labelToOverlayId = { 'Input': 'buttonInputOverlay', 'Game Shelf': 'statesOverlay', 'Players': 'playerOverlay', 'About': 'aboutOverlay' };
  const joinNames = (entries, max = 3) => {
    const n = entries.map(e => typeof e === 'string' ? e : e.name);
    if (n.length <= max) return n.length === 1 ? n[0] : n.length === 2 ? `${n[0]} and ${n[1]}` : n.slice(0, -1).join(', ') + ', and ' + n[n.length - 1];
    return `${n.length} players`;
  };
  for (const label of order) {
    const entries = byOverlay[label];
    if (!entries || !entries.length) continue;
    el.dataset.state = 'overlay';
    el.classList.add('visible');
    el.classList.remove('bad', 'reconnecting');
    const overlayId = labelToOverlayId[label] || 'statesOverlay';
    icon.setAttribute('icon', TOOLBAR_ICONS[overlayId] || TOOLBAR_ICONS.statesOverlay);
    if (label === 'Game Shelf') {
      const withGame = entries.filter(e => e.stateName);
      const listOnly = entries.filter(e => !e.stateName);
      const parts = [];
      if (withGame.length) {
        const byState = {};
        for (const e of withGame) {
          const k = e.stateName || '';
          if (!byState[k]) byState[k] = [];
          byState[k].push(e.name);
        }
        const stateNames = [...new Set(withGame.map(e => e.stateName))];
        for (const stateName of stateNames) {
          const names = byState[stateName];
          const who = joinNames(names.map(n => ({ name: n })));
          parts.push(`${who} ${names.length === 1 ? 'is' : 'are'} looking at ${stateName} in Game Shelf`);
        }
      }
      if (listOnly.length) {
        const who = joinNames(listOnly);
        parts.push(`${who} ${listOnly.length === 1 ? 'has' : 'have'} Game Shelf open`);
      }
      text.textContent = parts.join('; ');
    } else {
      const who = joinNames(entries);
      text.textContent = entries.length === 1 ? `${who} has ${label} open` : `${who} have ${label} open`;
    }
    return;
  }

  el.classList.remove('visible', 'bad', 'reconnecting');
  el.dataset.state = '';
}

export function updateStatus() {
  render();
}

onLoad(function () {
  onMessage('mouse', function (args) {
    if (args.player && args.mouseState) {
      setPlayerOverlay(args.player, args.mouseState.editMode, args.mouseState.activeOverlay, args.mouseState.activeStateName);
    }
  });
  setInterval(render, 500);
});
