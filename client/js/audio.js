import { asArray, mapAssetURLs } from './domhelpers.js';

export let audioContext;
const events = ['mousedown', 'keydown', 'touchstart'];
let audioBufferObj = {}
let sources = {};

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
      // Decode the audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      // Store the decoded audio in audioBufferObj
      audioBufferObj[audioSource] = audioBuffer;
    } catch (error) {
      console.error(error);
    }
  }
}

async function addAudio(audioSource, maxVolume, length) {
  console.log('audioSource', audioSource, 'maxVolume', maxVolume, 'length', length)//fix
  if(audioContext) {
    let thisSource = audioContext.createBufferSource();
    if (!audioBufferObj[audioSource]) {
      await loadAudioBuffer(mapAssetURLs(audioSource));
    }

    let gainNode = audioContext.createGain();
    gainNode.gain.value = Math.min(maxVolume * (((10 ** (document.getElementById('volume').value / 96.025)) / 10) - 0.1), 1); // converts slider to log scale with zero = no volume
    thisSource.connect(gainNode); // Connect the source to the gain node
    gainNode.connect(audioContext.destination); // Connect the gain node to the audioContext's destination

    thisSource.buffer = audioBufferObj[mapAssetURLs(audioSource)];

    if(thisSource) {
      thisSource.start();
    }
      
    if (!isNaN(length) && length > 0) {
      thisSource.stop(audioContext.currentTime + length/1000); // Stop the audio after length in milliseconds
    }
  }
}

onMessage('audio', function(args) {
  console.log('audioArgs', args); //fix
  const { audioSource, maxVolume, length } = JSON.parse(args);
  try {
    addAudio(audioSource, maxVolume, length);
  }
  catch(err) {
    console.log(err.message);
  }
});
