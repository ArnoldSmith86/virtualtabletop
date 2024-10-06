import { asArray } from '../domhelpers.js';

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

export async function loadAudioBuffer(audioSource) {
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

export async function addAudio(widget){
  if(widget.get('audio') && audioContext) {
    let source = audioContext.createBufferSource();
    const { source: audioSource, maxVolume, length, player } = JSON.parse(widget.get('audio'));
    const pName = asArray(player);
    
    if (pName.includes(null) || pName.includes(playerName)) {
      if (!audioBufferObj[audioSource]) {
        await loadAudioBuffer(audioSource);
      }
      
      let gainNode = audioContext.createGain();
      
      gainNode.gain.value = Math.min(maxVolume * (((10 ** (document.getElementById('volume').value / 96.025)) / 10) - 0.1), 1); // converts slider to log scale with zero = no volume
      source.connect(gainNode); // Connect the source to the gain node
      gainNode.connect(audioContext.destination); // Connect the gain node to the audioContext's destination
      source.buffer = audioBufferObj[audioSource];
      
      if(source) {
        source.start();
      }
      
      if (!isNaN(length) && length > 0) {
        source.stop(audioContext.currentTime + length/1000); // Stop the audio after length in milliseconds
      }
    }
  }
  setInterval(function(){widget.set('audio', null);}, 100);
}
