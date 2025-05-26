let activeLegacyModes = {};

function legacyMode(name) {
  return activeLegacyModes[name] || false;
}

onLoad(function() {
  onMessage('state', args=>{
    activeLegacyModes = (args._meta.gameSettings || {}).legacyModes || {};
    console.log('activeLegacyModes', activeLegacyModes);
  });
});
