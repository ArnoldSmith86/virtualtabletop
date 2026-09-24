import { $, onLoad } from '../domhelpers.js';
import { onMessage, onConnectionClose, onServerRestart } from '../connection.js';

const STATUS_MESSAGE_DURATION_MS = 10000;
const STATUS_MESSAGE_MAX = 5;

let connectionState = { pendingCount: 0, state: '', msUntilReload: 0 };
let reconnecting = false;
let serverRestarted = false;
let statusMessages = []; // { message, icon, expiresAt } - each expires individually
let playerActivity = {}; // player name -> { editMode, activeOverlay }
let activePlayersList = [];
let myName = null;

export function setConnectionState(pendingCount, state, msUntilReload) {
  connectionState = { pendingCount, state, msUntilReload };
}

export function setStatusMessage(message, icon = '[users_settings]') {
  statusMessages.push({ message, icon, expiresAt: Date.now() + STATUS_MESSAGE_DURATION_MS });
}

export function setActivePlayersList(active) {
  activePlayersList = active || [];
  for(const name in playerActivity)
    if(activePlayersList.indexOf(name) == -1)
      delete playerActivity[name];
}

export function setMyName(name) {
  myName = name;
  // a self-entry can appear when a mouse broadcast under a new name races the meta update after a rename
  delete playerActivity[name];
}

function joinNames(names) {
  if(names.length > 3)
    return `${names.length} players`;
  return names.length == 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

function show(el, state, icon, text) {
  el.dataset.state = state;
  el.classList.add('visible');
  $('.statusIcon', el).setAttribute('icon', icon);
  $('.statusText', el).textContent = text;
}

function render() {
  const el = $('#statusOverlay');
  if(!el)
    return;

  // a detected restart puts up an overlay of its own that says the page is reloading, so there is
  // nothing left for the corner to add - and "reconnecting" would contradict it
  if(serverRestarted) {
    el.classList.remove('visible');
    el.dataset.state = '';
    return;
  }

  if(connectionState.state == 'reload')
    return show(el, 'reload', 'link_off', `No response from server. Reloading the page in ${Math.max(1, Math.ceil(connectionState.msUntilReload / 1000))} seconds.`);

  if(reconnecting)
    return show(el, 'reconnecting', 'link_off', 'Connection lost. Reconnecting...');

  if(connectionState.state == 'bad')
    return show(el, 'bad', 'link_off', 'No response from server.');
  if(connectionState.state == 'warn')
    return show(el, 'warn', 'link_off', '');

  statusMessages = statusMessages.filter(m=>Date.now() < m.expiresAt).slice(-STATUS_MESSAGE_MAX);
  if(statusMessages.length)
    return show(el, 'message', statusMessages[statusMessages.length - 1].icon, statusMessages.map(m=>m.message).join('; '));

  const inEdit = Object.keys(playerActivity).filter(n=>playerActivity[n].editMode);
  if(inEdit.length)
    return show(el, 'edit', '[edit_mode]', `${joinNames(inEdit)} ${inEdit.length == 1 ? 'is' : 'are'} in Edit Mode`);

  const inInput = Object.keys(playerActivity).filter(n=>playerActivity[n].activeOverlay == 'buttonInputOverlay');
  if(inInput.length)
    return show(el, 'input', '[play_arrow]', `${joinNames(inInput)} ${inInput.length == 1 ? 'has' : 'have'} an input window open`);

  el.classList.remove('visible');
  el.dataset.state = '';
}

export function updateStatus() {
  render();
}

onLoad(function() {
  onMessage('mouse', function(args) {
    if(args.player && args.player != myName && args.mouseState)
      playerActivity[args.player] = { editMode: !!args.mouseState.editMode, activeOverlay: args.mouseState.activeOverlay || null };
  });
  onMessage('state', function() {
    reconnecting = false;
    render();
  });
  onConnectionClose(function() {
    reconnecting = true;
    render();
  });
  onServerRestart(function() {
    serverRestarted = true;
    render();
  });
  setInterval(render, 500);
});
