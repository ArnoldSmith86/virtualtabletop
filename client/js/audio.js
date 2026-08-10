let muted = false;
let unmuteVol = 30;

let audioPickerLoad = null;
let audioPickerPreview = null;
let audioPickerFinish = null;

// Builds the list of bundled Kenney sound effects (see assets/audio/audio.json)
// once and wires up the search box. Mirrors loadSymbolPicker in symbols.js.
// The load is memoized in a promise so concurrent callers all wait for the same
// fetch+build instead of racing on a half-built list.
export async function loadAudioPicker() {
  if(!audioPickerLoad) {
    audioPickerLoad = (async function() {
      const audioPickerData = await (await fetch('i/audio/audio.json')).json();
      let list = '';
      for(const [ category, { directory, sounds } ] of Object.entries(audioPickerData)) {
        list += `<h2 data-category="${directory}">${category}</h2>`;
        for(const sound of sounds) {
          const url = `/i/audio/${directory}/${sound}.mp3`;
          // search on the pack directory and the sound name only, not the display
          // category, so e.g. "dice" matches dice sounds and not every card/chip.
          const keywords = `${directory} ${sound}`.toLowerCase().replace(/[-_/]+/g, ' ');
          list += `<div class="audioEntry" data-category="${directory}" data-url="${url}" data-keywords="${keywords}"><button icon="play_arrow" class="audioPreview"></button><span>${sound}</span></div>`;
        }
      }
      $('#audioList').innerHTML = list;

      $('#audioPickerOverlay input').onkeyup = function() {
        // the same separator flattening as the keywords above, so typing a name
        // the way it is shown ("dice-throw") searches the same words it indexed
        const text = regexEscape($('#audioPickerOverlay input').value.toLowerCase().replace(/[-_/]+/g, ' '));
        const visibleCategories = {};
        for(const entry of $a('#audioList .audioEntry')) {
          const match = !!entry.dataset.keywords.match(text);
          toggleClass(entry, 'hidden', !match);
          if(match)
            visibleCategories[entry.dataset.category] = true;
        }
        // keep the header of any category that still has visible sounds so results
        // stay grouped and labelled instead of collapsing into a flat list.
        for(const title of $a('#audioList h2'))
          toggleClass(title, 'hidden', !visibleCategories[title.dataset.category]);
      };
    })().catch(e => { audioPickerLoad = null; throw e; }); // allow retry on failure
  }
  await audioPickerLoad;
}

function stopAudioPickerPreview() {
  if(audioPickerPreview) {
    audioPickerPreview.audio.pause();
    audioPickerPreview.entry.classList.remove('playing');
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
    // one way out for every way of leaving the picker (a sound, the close
    // button, or the editor cancelling it), so none of them forgets to stop a
    // running preview or leaves the overlay up
    const finish = function(sound) {
      audioPickerFinish = null;
      stopAudioPickerPreview();
      if(closeOverlay)
        showOverlay(null);
      resolve(sound);
    };
    audioPickerFinish = finish;

    showOverlay('audioPickerOverlay');
    $('#audioPickerOverlay').scrollTop = 0;
    $('#audioPickerOverlay input').value = '';
    $('#audioPickerOverlay input').focus();
    $('#audioPickerOverlay input').onkeyup();

    $('#audioPickerOverlay [icon=close]').onclick = _=>finish(null);

    for(const entry of $a('#audioList .audioEntry')) {
      $('.audioPreview', entry).onclick = function(e) {
        e.stopPropagation();
        const wasThisEntry = audioPickerPreview && audioPickerPreview.entry == entry;
        stopAudioPickerPreview();
        if(wasThisEntry)
          return; // clicking the playing entry again stops it
        const audio = new Audio(mapAssetURLs(entry.dataset.url));
        audioPickerPreview = { audio, entry };
        entry.classList.add('playing');
        audio.onended = function() {
          entry.classList.remove('playing');
          if(audioPickerPreview && audioPickerPreview.entry == entry)
            audioPickerPreview = null;
        };
        audio.play().catch(()=>{});
      };
      entry.onclick = _=>finish(entry.dataset.url);
    }
  });
}

// Closes a sound picker that is still open and resolves it with nothing. The
// editor calls this when the widget being edited changes: whoever opened the
// picker edits that widget, so its result would be written to a widget that is
// no longer on screen.
export function cancelAudioPicker() {
  if(audioPickerFinish)
    audioPickerFinish(null);
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
