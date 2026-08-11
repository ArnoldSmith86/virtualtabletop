import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// audio.js belongs to the room bundle, which server/minify.mjs concatenates - so
// it uses the helpers of the other files as globals instead of importing them.
// Evaluate its source with stubs for the ones the picker needs, the way the
// property input tests do for the editor files.
const dir = path.dirname(fileURLToPath(import.meta.url));
const audioSource = fs.readFileSync(path.join(dir, '../../client/js/audio.js'), 'utf8').replace(/^export /gm, '');

function loadAudioPicker() {
  document.body.innerHTML = `
    <button id="statesButton"></button>
    <input id="volume" value="30" />
    <div id="audioPickerOverlay">
      <button icon="close"></button>
      <input placeholder="Search" />
      <div id="audioList"></div>
    </div>
  `;

  const overlaysShown = [];
  const manifest = { 'Cards, Chips & Dice': { directory: 'casino', sounds: [ 'card-shuffle', 'dice-throw' ] } };
  const scope = new Function('$', '$a', 'showOverlay', 'toggleClass', 'regexEscape', 'mapAssetURLs', 'on', 'onMessage', 'fetch', 'detailsOverlay', `
    ${audioSource};
    return { pickAudio, cancelAudioPicker };
  `)(
    (selector, parent=document) => parent.querySelector(selector),
    (selector, parent=document) => [ ...parent.querySelectorAll(selector) ],
    id => {
      overlaysShown.push(id);
      document.getElementById('audioPickerOverlay').style.display = id == 'audioPickerOverlay' ? 'flex' : 'none';
    },
    (element, className, active) => element.classList.toggle(className, active),
    text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    url => url,
    () => {},
    () => {},
    async () => ({ json: async () => manifest }),
    null
  );

  return Object.assign(scope, {
    overlaysShown,
    entries: () => [ ...document.querySelectorAll('#audioList .audioEntry') ],
    overlayVisible: () => document.getElementById('audioPickerOverlay').style.display != 'none'
  });
}

describe('the sound picker overlay', () => {
  test('clicking a sound resolves with its path and closes the overlay', async () => {
    const picker = loadAudioPicker();
    const picked = picker.pickAudio();
    await new Promise(resolve => setTimeout(resolve, 0)); // the list is fetched
    expect(picker.overlayVisible()).toBe(true);
    expect(picker.entries().length).toBe(2);

    picker.entries()[1].click();
    expect(await picked).toBe('/i/audio/casino/dice-throw.mp3');
    expect(picker.overlayVisible()).toBe(false);
  });

  test('the close button resolves with nothing', async () => {
    const picker = loadAudioPicker();
    const picked = picker.pickAudio();
    await new Promise(resolve => setTimeout(resolve, 0));

    document.querySelector('#audioPickerOverlay [icon=close]').click();
    expect(await picked).toBeNull();
    expect(picker.overlayVisible()).toBe(false);
  });

  // the editor cancels an open picker when the widget being edited changes: the
  // overlay does not cover the sidebar (and a widget can also be selected
  // without clicking in the room), so a sound picked in it would be written to
  // a widget that is no longer on screen
  test('cancelling an open picker resolves with nothing and closes the overlay', async () => {
    const picker = loadAudioPicker();
    const picked = picker.pickAudio();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(picker.overlayVisible()).toBe(true);

    picker.cancelAudioPicker();
    expect(await picked).toBeNull();
    expect(picker.overlayVisible()).toBe(false);
  });

  test('cancelling with no picker open does nothing', async () => {
    const picker = loadAudioPicker();
    expect(_=>picker.cancelAudioPicker()).not.toThrow();

    // and a picker that already handed its sound over is not cancelled twice
    const picked = picker.pickAudio();
    await new Promise(resolve => setTimeout(resolve, 0));
    picker.entries()[0].click();
    expect(await picked).toBe('/i/audio/casino/card-shuffle.mp3');
    picker.overlaysShown.length = 0;
    picker.cancelAudioPicker();
    expect(picker.overlaysShown).toEqual([]);
  });
});
