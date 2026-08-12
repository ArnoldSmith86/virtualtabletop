import { $, div } from "./domhelpers";
import { emojiToFilename } from "./symbols";

// The icon list (i/fonts/symbols.json) holds one entry per emoji, but the noto-emoji artwork also
// contains the skin tone forms of about 330 of them - roughly 1900 files no picker ever showed.
// Adding them to the grid would make People & Body six times as long, so instead an emoji that has
// them is marked with a corner triangle and hovering it (long-press on touch) opens a flyout with
// its complete matrix: a row of five tones, or a 5x5 grid when two people can be toned separately.

const emojiSkinTones = [
  { modifier: '\u{1f3fb}', label: 'Light' },
  { modifier: '\u{1f3fc}', label: 'Med-light' },
  { modifier: '\u{1f3fd}', label: 'Medium' },
  { modifier: '\u{1f3fe}', label: 'Med-dark' },
  { modifier: '\u{1f3ff}', label: 'Dark' }
];

// Unicode's Emoji_Modifier_Base: the characters a skin tone modifier may follow. A match only makes
// a form a candidate - whether it exists is decided by the file list, because plenty of sequences
// containing one of these (the family emoji, for example) have no toned artwork at all.
const emojiModifierBase = /[\u{261d}\u{26f9}\u{270a}-\u{270d}\u{1f385}\u{1f3c2}-\u{1f3c4}\u{1f3c7}\u{1f3ca}-\u{1f3cc}\u{1f442}\u{1f443}\u{1f446}-\u{1f450}\u{1f466}-\u{1f478}\u{1f47c}\u{1f481}-\u{1f483}\u{1f485}-\u{1f487}\u{1f48f}\u{1f491}\u{1f4aa}\u{1f574}\u{1f575}\u{1f57a}\u{1f590}\u{1f595}\u{1f596}\u{1f645}-\u{1f647}\u{1f64b}-\u{1f64f}\u{1f6a3}\u{1f6b4}-\u{1f6b6}\u{1f6c0}\u{1f6cc}\u{1f90c}\u{1f90f}\u{1f918}-\u{1f91f}\u{1f926}\u{1f930}-\u{1f939}\u{1f93c}-\u{1f93e}\u{1f977}\u{1f9b5}\u{1f9b6}\u{1f9b8}\u{1f9b9}\u{1f9bb}\u{1f9cd}-\u{1f9cf}\u{1f9d1}-\u{1f9dd}\u{1fac3}-\u{1fac5}\u{1faf0}-\u{1faf8}]/u;

// A two-person emoji written as a single character encodes two different skin tones as a completely
// different sequence: both hands of the handshake are toned as U+1F91D plus one modifier, but as
// soon as they differ it becomes U+1FAF1+tone ZWJ U+1FAF2+tone. Inserting modifiers into the base
// sequence cannot produce those forms, so the six emoji that work this way spell their mixed form
// out here, with $1 and $2 standing for the two tone modifiers.
const emojiMixedToneForms = {
  '\u{1f91d}': '\u{1faf1}$1\u200d\u{1faf2}$2',                                        // handshake
  '\u{1f46b}': '\u{1f469}$1\u200d\u{1f91d}\u200d\u{1f468}$2',                         // woman and man holding hands
  '\u{1f46c}': '\u{1f468}$1\u200d\u{1f91d}\u200d\u{1f468}$2',                         // men holding hands
  '\u{1f46d}': '\u{1f469}$1\u200d\u{1f91d}\u200d\u{1f469}$2',                         // women holding hands
  '\u{1f48f}': '\u{1f9d1}$1\u200d\u2764\ufe0f\u200d\u{1f48b}\u200d\u{1f9d1}$2',       // kiss
  '\u{1f491}': '\u{1f9d1}$1\u200d\u2764\ufe0f\u200d\u{1f9d1}$2'                       // couple with heart
};

// The modifier takes the place of a variation selector behind the character it tones (the sequence
// has emoji presentation with it anyway), which is why U+261D U+FE0F becomes U+261D U+1F3FB.
function emojiWithSkinTones(characters, positions, tones) {
  let result = '';
  for(let i = 0; i < characters.length; ++i) {
    const tone = tones[positions.indexOf(i)];
    result += characters[i];
    if(tone !== undefined) {
      result += tone;
      if(characters[i+1] == '\ufe0f')
        ++i;
    }
  }
  return result;
}

function emojiVariantGrid(base, selected, cells, twoDimensional) {
  return { base, selected, cells, twoDimensional, toneLabels: emojiSkinTones.map(tone => tone.label) };
}

// An emoji that already carries a tone - one a game is using, or one just picked - offers the same
// set as the untoned form it was made from, so that a tone can be changed as well as chosen. The
// mixed forms are not made by adding modifiers, so they are looked up in the table above instead.
function emojiWithoutSkinTones(emoji) {
  const untoned = emoji.replace(/[\u{1f3fb}-\u{1f3ff}]/gu, '');
  for(const [ base, template ] of Object.entries(emojiMixedToneForms))
    if(untoned == template.replace(/\$[12]/g, ''))
      return base;
  return untoned;
}

// The handshake and the five couple emoji: the diagonal of their matrix is the single-modifier form,
// only the mixed cells use the long sequence - so the tone row computed for them is reused here.
function emojiMixedToneMatrix(emoji, selected, sameToneForms, exists) {
  const template = emojiMixedToneForms[emoji.replace(/\ufe0f/g, '')];
  if(!template)
    return null;
  const cells = emojiSkinTones.map((row, rowIndex) => emojiSkinTones.map((column, columnIndex) =>
    rowIndex == columnIndex ? sameToneForms[rowIndex] : template.replace('$1', row.modifier).replace('$2', column.modifier)
  ));
  return cells.every(row => row.every(exists)) ? emojiVariantGrid(emoji, selected, cells, true) : null;
}

// The complete set of skin tone forms of an emoji, or null if it has none. `available` is the set of
// emoji file names (as built by emojiToFilename) the server reports for the noto-emoji directory:
// a form is only offered once its artwork is actually there.
export function emojiSkinToneVariants(emoji, available) {
  if(typeof emoji != 'string' || !emojiModifierBase.test(emoji))
    return null;

  const selected = emoji;
  emoji = emojiWithoutSkinTones(emoji);
  const characters = [ ...emoji ];
  const positions = characters.map((character, index) => emojiModifierBase.test(character) ? index : -1).filter(index => index != -1);
  const exists = variant => available.has(emojiToFilename(variant));

  // two people who can be toned separately (people holding hands, the couples, ...): a partial
  // matrix would leave holes in the grid, so all 25 combinations have to exist for a pair to count
  for(let first = 0; first < positions.length; ++first) {
    for(let second = first+1; second < positions.length; ++second) {
      const cells = emojiSkinTones.map(row => emojiSkinTones.map(column =>
        emojiWithSkinTones(characters, [ positions[first], positions[second] ], [ row.modifier, column.modifier ])
      ));
      if(cells.every(row => row.every(exists)))
        return emojiVariantGrid(emoji, selected, cells, true);
    }
  }

  for(const position of positions) {
    const row = emojiSkinTones.map(tone => emojiWithSkinTones(characters, [ position ], [ tone.modifier ]));
    if(row.every(exists))
      return emojiMixedToneMatrix(emoji, selected, row, exists) || emojiVariantGrid(emoji, selected, [ row ], false);
  }

  return null;
}

let emojiVariantFiles = null;
let emojiVariantFilesPromise = null;

// Which forms exist is a property of the asset directory, so the server reads it from there
// (/api/emojiVariants) instead of the client carrying a second copy of the list that could go stale.
export function loadEmojiVariants() {
  if(!emojiVariantFilesPromise) {
    emojiVariantFilesPromise = (async _=>{
      emojiVariantFiles = new Set(await (await fetch('api/emojiVariants')).json());
      return emojiVariantFiles;
    })();
    emojiVariantFilesPromise.catch(_=>emojiVariantFilesPromise = null); // a failed fetch may be retried
  }
  return emojiVariantFilesPromise;
}

// Every icon of the picker asks for this, so the answers are kept: emoji without a modifier base
// (the vast majority) are rejected by a single regex, the rest cost up to 75 lookups.
const emojiVariantCache = new Map();
export function emojiVariants(emoji) {
  if(!emojiVariantFiles)
    return null;
  if(!emojiVariantCache.has(emoji))
    emojiVariantCache.set(emoji, emojiSkinToneVariants(emoji, emojiVariantFiles));
  return emojiVariantCache.get(emoji);
}

// The one flyout that can be open, as { anchor, close, scheduleClose, cancelClose }: hovering
// another marked icon replaces it, and everything that dismisses it goes through here.
let activeEmojiVariantFlyout = null;

export function closeEmojiVariantFlyout() {
  if(activeEmojiVariantFlyout)
    activeEmojiVariantFlyout.close();
}

// the open flyout if it belongs to this icon - what an icon may cancel, delay or leave alone
function emojiVariantFlyoutOf(element) {
  return activeEmojiVariantFlyout && activeEmojiVariantFlyout.anchor == element ? activeEmojiVariantFlyout : null;
}

// Escape closes the flyout and nothing else, but the picker behind it listens for the same key in
// two places: the editor's popup on keydown (InlinePopup.onKeyDown, a capture listener on document,
// registered before the flyout exists) and the fullscreen overlay on keyup (window.onkeyup in
// main.js). An open flyout takes the key away from both - its own keydown listener sits on window,
// whose capture phase runs ahead of every listener on document, and the keyup that follows is
// swallowed here the way the popups swallow theirs (popupHandledEscape in editor/controls/popup.js).
let emojiVariantHandledEscape = false;
window.addEventListener('keyup', function(e) {
  if(e.key == 'Escape' && emojiVariantHandledEscape) {
    emojiVariantHandledEscape = false;
    e.stopPropagation();
  }
}, true);

function emojiVariantCell(target, className, emoji, label, onPick, selected) {
  const cell = div(target, `${className}${emoji == selected ? ' emojiVariantSelected' : ''}`, `<img src="i/noto-emoji/emoji_u${emojiToFilename(emoji)}.svg">`);
  if(label)
    div(cell, 'emojiVariantLabel', html(label));
  cell.title = label ? `${emoji} (${label})` : emoji;
  cell.onclick = function(e) {
    e.stopPropagation();
    closeEmojiVariantFlyout();
    onPick(emoji);
  };
  return cell;
}

function openEmojiVariantFlyout(element, variants, onPick, name) {
  closeEmojiVariantFlyout();

  // A fixed box outside the icon it belongs to, which is in a grid that scrolls and, in the editor,
  // in a 340px column - both of them clip. It goes into #editor whenever the icon does, because
  // that is how edit mode tells its own controls from the room: a mousedown anywhere else starts a
  // selection rectangle, and letting go of it would clear the selection the picker is editing.
  const dom = div(element.closest('#editor') || $('body'), 'emojiVariantFlyout');
  // a callback because the icon list is loaded asynchronously, so the name of an icon can arrive
  // after its chip - and because an already toned icon is only listed under its untoned form
  const label = typeof name == 'function' ? name(variants.base) : name;
  div(dom, 'emojiVariantTitle', `Skin tone${label ? ` — <b>${html(label)}</b>` : ''}`);

  const selected = variants.selected;
  if(variants.twoDimensional) {
    const matrix = div(dom, 'emojiVariantMatrix');
    emojiVariantCell(matrix, 'emojiVariantCell emojiVariantBase', variants.base, 'Default', onPick, selected);
    for(const toneLabel of variants.toneLabels)
      div(matrix, 'emojiVariantHeader', html(toneLabel));
    variants.cells.forEach((row, rowIndex) => {
      div(matrix, 'emojiVariantHeader emojiVariantRowHeader', html(variants.toneLabels[rowIndex]));
      for(const variant of row)
        emojiVariantCell(matrix, 'emojiVariantCell', variant, null, onPick, selected);
    });
  } else {
    const row = div(dom, 'emojiVariantRow');
    emojiVariantCell(row, 'emojiVariantCell emojiVariantBase', variants.base, 'Default', onPick, selected);
    variants.cells[0].forEach((variant, index) => emojiVariantCell(row, 'emojiVariantCell', variant, variants.toneLabels[index], onPick, selected));
  }

  const anchor = element.getBoundingClientRect();
  const box = dom.getBoundingClientRect();
  const above = anchor.bottom + box.height + 8 > window.innerHeight && anchor.top > box.height + 8;
  dom.style.left = `${Math.max(4, Math.min(anchor.left, window.innerWidth - box.width - 4))}px`;
  dom.style.top  = `${above ? anchor.top - box.height - 4 : anchor.bottom + 4}px`;

  let closeTimer = null;
  const close = function() {
    clearTimeout(closeTimer);
    document.removeEventListener('mousedown', onOutsideClick);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', close, true);
    dom.remove();
    if(activeEmojiVariantFlyout && activeEmojiVariantFlyout.close == close)
      activeEmojiVariantFlyout = null;
  };
  const onOutsideClick = e=>{
    if(!dom.contains(e.target) && e.target != element)
      close();
  };
  const onKeyDown = e=>{
    if(e.key == 'Escape') {
      e.stopPropagation();
      emojiVariantHandledEscape = true;
      close();
    }
  };
  const cancelClose = _=>clearTimeout(closeTimer);
  const scheduleClose = _=>{
    clearTimeout(closeTimer);
    closeTimer = setTimeout(close, 300);
  };
  dom.onmouseenter = cancelClose;
  dom.onmouseleave = scheduleClose;
  document.addEventListener('mousedown', onOutsideClick);
  // on window, because a capture listener there runs before the ones the picker has on document
  window.addEventListener('keydown', onKeyDown, true);
  // the picker grid and the sidebar scroll, which would leave the flyout hanging next to nothing
  window.addEventListener('scroll', close, true);
  activeEmojiVariantFlyout = { anchor: element, close, scheduleClose, cancelClose };
}

// Marks an icon that has skin tone forms and opens its flyout on hover (long-press on touch).
// The handlers are assigned as properties, so decorating the same element again replaces them
// instead of stacking another flyout on it - the symbol picker hands its grid to a new caller
// every time it is opened.
export function addEmojiVariantFlyout(element, emoji, onPick, name) {
  element.onmouseenter = element.onmouseleave = element.ontouchstart = null;
  element.ontouchend = element.ontouchmove = element.ontouchcancel = null;
  loadEmojiVariants().then(_=>{
    const variants = emojiVariants(emoji);
    if(!variants)
      return;
    element.classList.add('hasEmojiVariants');

    let openTimer = null;
    let swallowTimer = null;
    const open = _=>{
      if(!emojiVariantFlyoutOf(element))                       // still open from before: the
        openEmojiVariantFlyout(element, variants, onPick, name); // pointer only left it briefly
    };

    // The long press still ends in a click on the icon itself, which would pick the untoned form
    // and close the picker right on top of the flyout that just opened - so that one click is
    // swallowed. Only that one: a press that ends somewhere else (the finger slid off, the touch
    // was cancelled, the grid scrolled away under it) must not eat an unrelated click later on,
    // which is why the listener is a named one that is dropped again either way.
    const disarmClickSwallow = _=>{
      clearTimeout(swallowTimer);
      document.removeEventListener('click', swallowClick, true);
    };
    const swallowClick = e=>{
      if(element.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
      disarmClickSwallow();
    };

    element.onmouseenter = _=>{
      const flyout = emojiVariantFlyoutOf(element);
      if(flyout)
        flyout.cancelClose();
      openTimer = setTimeout(open, 250);
    };
    // leaving the icon closes its flyout, but not right away: the pointer has to cross the gap
    // between the two to reach it, so it gets the same grace the flyout itself gives
    element.onmouseleave = _=>{
      clearTimeout(openTimer);
      const flyout = emojiVariantFlyoutOf(element);
      if(flyout)
        flyout.scheduleClose();
    };
    element.ontouchstart = _=>openTimer = setTimeout(_=>{
      open();
      document.addEventListener('click', swallowClick, true);
      swallowTimer = setTimeout(disarmClickSwallow, 1000); // no click came: the press ended elsewhere
    }, 500);
    element.ontouchend = element.ontouchmove = element.ontouchcancel = _=>clearTimeout(openTimer);
  }).catch(_=>null);
}
