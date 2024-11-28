let muted = false;
let unmuteVol = 30;

export let audioContext;
const events = ['mousedown', 'keydown', 'touchstart'];
let audioBufferObj = {}
let audioSettings = {};

events.forEach(event => {
  document.addEventListener(event, initializeAudioContext, { once: true });
});
// Initialize AudioContext after user event
function initializeAudioContext() {
  if (!audioContext || audioContext.state === 'closed') {
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

async function addAudio(audioSource, maxVolume, length, count = 1) {
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
