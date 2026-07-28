import { onMessage, toServer } from './connection.js';
import { onLoad } from './domhelpers.js';
import { ALL_LEGACY_MODES, LEGACY_MODES } from './legacymoderegistry.js';

let currentGameSettings = {};

export function legacyMode(name, value) {
  if(!LEGACY_MODES[name])
    console.error(`Unknown legacy mode '${name}' - add it to LEGACY_MODES in legacymoderegistry.js.`);

  if(!currentGameSettings.legacyModes)
    currentGameSettings.legacyModes = {};

  if(value !== undefined) {
    currentGameSettings.legacyModes[name] = value;
    toServer('setGameSettings', currentGameSettings);
  }
  return currentGameSettings.legacyModes[name];
}

export function getEnabledLegacyModes() {
  return ALL_LEGACY_MODES.filter(name => (currentGameSettings.legacyModes || {})[name]);
}

export function getCurrentGameSettings() {
  return currentGameSettings;
}

onLoad(function() {
  onMessage('state', args=>{
    currentGameSettings = args._meta.gameSettings || {};
  });
  onMessage('meta', args=>{
    currentGameSettings = args.meta.gameSettings || {};
  });
});
