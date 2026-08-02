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
    const previousBoardSize = `${viewportConfig.targetWidth}x${viewportConfig.targetHeight}`;
    // the aspect ratio can be changed while people are playing, so re-layout
    setViewportSize(currentGameSettings.aspectRatio);
    setScale();
    // no widget changed, but pile handles are placed relative to the board edges
    if(previousBoardSize != `${viewportConfig.targetWidth}x${viewportConfig.targetHeight}`)
      for(const w of widgets.values())
        if(w.updateHandlePlacement)
          w.updateHandlePlacement();
  });
});
