let muted = false;
let unmuteVol = 30;

let audioPickerData = null;
let audioPickerPreview = null;

// Builds the list of bundled Kenney sound effects (see assets/audio/audio.json)
// once and wires up the search box. Mirrors loadSymbolPicker in symbols.js.
export async function loadAudioPicker() {
  if(audioPickerData === null) {
    audioPickerData = 'loading';
    audioPickerData = await (await fetch('i/audio/audio.json')).json();
    let list = '';
    for(const [ category, { directory, sounds } ] of Object.entries(audioPickerData)) {
      list += `<h2>${category}</h2>`;
      for(const sound of sounds) {
        const url = `/i/audio/${directory}/${sound}.ogg`;
        const keywords = `${category} ${directory} ${sound}`.toLowerCase().replace(/[-_/]+/g, ' ');
        list += `<div class="audioEntry" data-url="${url}" data-keywords="${keywords}"><button icon="play_arrow" class="audioPreview"></button><span>${sound}</span></div>`;
      }
    }
    $('#audioList').innerHTML = list;

    $('#audioPickerOverlay input').onkeyup = function() {
      const text = regexEscape($('#audioPickerOverlay input').value.toLowerCase());
      for(const entry of $a('#audioList .audioEntry'))
        toggleClass(entry, 'hidden', !entry.dataset.keywords.match(text));
      for(const title of $a('#audioList h2'))
        toggleClass(title, 'hidden', text);
    };
  }
}

function stopAudioPickerPreview() {
  if(audioPickerPreview) {
    audioPickerPreview.pause();
    audioPickerPreview = null;
  }
}

// Opens the sound picker and resolves with the selected /i/audio/… path (or null
// when cancelled). Used by the JSON editor for AUDIO source and clickSound.
export async function pickAudio(closeOverlay=true) {
  if($('#statesButton').dataset.overlay == 'audioPickerOverlay')
    $('#statesButton').dataset.overlay = detailsOverlay;

  await loadAudioPicker();
  return new Promise(resolve => {
    showOverlay('audioPickerOverlay');
    $('#audioPickerOverlay').scrollTop = 0;
    $('#audioPickerOverlay input').value = '';
    $('#audioPickerOverlay input').focus();
    $('#audioPickerOverlay input').onkeyup();

    $('#audioPickerOverlay [icon=close]').onclick = function() {
      stopAudioPickerPreview();
      if(closeOverlay)
        showOverlay(null);
      resolve(null);
    };

    for(const entry of $a('#audioList .audioEntry')) {
      $('.audioPreview', entry).onclick = function(e) {
        e.stopPropagation();
        stopAudioPickerPreview();
        audioPickerPreview = new Audio(mapAssetURLs(entry.dataset.url));
        audioPickerPreview.play().catch(()=>{});
      };
      entry.onclick = function() {
        stopAudioPickerPreview();
        if(closeOverlay)
          showOverlay(null);
        resolve(entry.dataset.url);
      };
    }
  });
}

export let audioContext;
const events = ['mousedown', 'keydown', 'touchstart'];
let audioBufferObj = {}
let audioSettings = {};

events.forEach(event => {
  document.addEventListener(event, initializeAudioContext, { once: true });
});
// Initialize AudioContext after user event
function initializeAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
}

async function loadAudioBuffer(audioSource) {
  if (!audioBufferObj[audioSource]) {
    try {
      const response = await fetch(audioSource);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio source: ${audioSource}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      audioBufferObj[audioSource] = audioBuffer;
    } catch (error) {
      console.error(error);
    }
  }
}

async function addAudio(audioSource, maxVolume, length, count) {
  audioSource = mapAssetURLs(audioSource);
  if (audioContext) {
    if (!audioBufferObj[audioSource]) {
      await loadAudioBuffer(audioSource);
    }

    let gainNode = audioContext.createGain();
    gainNode.gain.value = Math.min(maxVolume * (((10 ** ($('#volume').value / 96.025)) / 10) - 0.1), 1); // converts slider to log scale with zero = no volume

    const playSource = (startTime) => {
      let thisSource = audioContext.createBufferSource();
      thisSource.connect(gainNode);
      gainNode.connect(audioContext.destination);
      audioSettings[audioSource] = { gainNode, maxVolume };
      thisSource.buffer = audioBufferObj[audioSource];
      thisSource.start(startTime);
      return thisSource;
    };

    if (!isNaN(length) && length > 0) {
      let thisSource = playSource(audioContext.currentTime);
      thisSource.stop(audioContext.currentTime + length / 1000);
    } else if (count === "loop") {
      let thisSource = playSource(audioContext.currentTime);
      thisSource.loop = true;
    } else if (Number.isInteger(count) && count > 0) {
      for (let i = 0; i < count; i++) {
        playSource(audioContext.currentTime + i * audioBufferObj[audioSource].duration);
      }
    }
  }
}


onMessage('audio', async function(args) {
  const { audioSource, maxVolume, length, silence, count } = args;

  if (silence) {
    try {
      if (audioContext) {
        audioContext.close();
        audioContext = new AudioContext();
      }
    } catch (err) {
      console.error(`Error resetting audio context: ${err.message}`);
    }
    return;
  }

  try {
    await addAudio(audioSource, maxVolume, length, count);
  }
  catch(err) {
    console.log(err.message);
  }
});

on('#muteButton', 'click', function() {
  if(muted) {
    $('#volume').value = unmuteVol;
    $('#muteButton').classList.remove('muted');

    // Update gain node using stored maxVolume
    Object.keys(audioSettings).forEach(function(audioSource) {
      const { gainNode, maxVolume } = audioSettings[audioSource];
      gainNode.gain.value = Math.min(
        maxVolume * (((10 ** (unmuteVol / 96.025)) / 10) - 0.1), 
        1
      );
    });
  } else {
    unmuteVol = $('#volume').value;
    $('#volume').value = 0;

    Object.keys(audioSettings).forEach(function(audioSource) {
      audioSettings[audioSource].gainNode.gain.value = 0;
    });

    $('#muteButton').classList.add('muted');
  }
  muted = !muted;
});

if($('#volume')) {
  on('#volume', 'input', function(){ // allows volume to be adjusted in real time
    if(muted) {
      $('#muteButton').classList.remove('muted');
      muted = !muted;
    }
    Object.keys(audioSettings).forEach(function(audioSource) {
      const { gainNode, maxVolume } = audioSettings[audioSource];
      gainNode.gain.value = Math.min(
        maxVolume * (((10 ** ($('#volume').value / 96.025)) / 10) - 0.1), 
        1
      );
    });
  });
}
