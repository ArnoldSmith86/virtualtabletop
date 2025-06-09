let currentGameSettings = {};

export function legacyMode(name, value) {
  if(!currentGameSettings.legacyModes)
    currentGameSettings.legacyModes = {};

  if(value !== undefined) {
    currentGameSettings.legacyModes[name] = value;
    toServer('setGameSettings', currentGameSettings);
  }
  return currentGameSettings.legacyModes[name] || false;
}

export function getEnabledLegacyModes() {
  return Object.entries(currentGameSettings.legacyModes || {})
    .filter(([_, enabled]) => enabled)
    .map(([name]) => name);
}

onLoad(function() {
  onMessage('state', args=>{
    currentGameSettings = args._meta.gameSettings || {};
    console.log('state currentGameSettings', currentGameSettings);
  });
  onMessage('meta', args=>{
    currentGameSettings = args.meta.gameSettings || {};
    console.log('meta currentGameSettings', currentGameSettings);
  });
});
