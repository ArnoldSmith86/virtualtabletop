import { onLoad } from './domhelpers.js';

let currentGameSettings = {};

export function legacyMode(name, value) {
  if(!currentGameSettings.legacyModes)
    currentGameSettings.legacyModes = {};

  if(value !== undefined) {
    currentGameSettings.legacyModes[name] = value;
    toServer('setGameSettings', currentGameSettings);
  }
  return currentGameSettings.legacyModes[name];
}

export function getEnabledLegacyModes() {
  return Object.entries(currentGameSettings.legacyModes || {})
    .filter(([_, enabled]) => enabled)
    .map(([name]) => name);
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
