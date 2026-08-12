import { $, div } from "./domhelpers";
import { emojiToFilename } from "./symbols";

// The icon list (i/fonts/symbols.json) holds one entry per emoji, but the noto-emoji artwork also
// contains the skin tone forms of about 330 of them - roughly 1900 files no picker ever showed.
// Adding them to the grid would make People & Body six times as long, so instead an emoji that has
// them is marked with a corner triangle and hovering it (long-press on touch) opens a flyout with
// its complete matrix: a row of five tones, or a 5x5 grid when two people can be toned separately.

// The short form is what the columns of the 5x5 matrix are headed with: five spelled-out names
// above five 44px cells run into one another, and the row headers name them anyway.
const emojiSkinTones = [
  { modifier: '\u{1f3fb}', label: 'Light',     short: 'L'  },
  { modifier: '\u{1f3fc}', label: 'Med-light', short: 'ML' },
  { modifier: '\u{1f3fd}', label: 'Medium',    short: 'M'  },
  { modifier: '\u{1f3fe}', label: 'Med-dark',  short: 'MD' },
  { modifier: '\u{1f3ff}', label: 'Dark',      short: 'D'  }
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
  return {
    base, selected, cells, twoDimensional,
    toneLabels: emojiSkinTones.map(tone => tone.label),
    toneShortLabels: emojiSkinTones.map(tone => tone.short)
  };
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
function emojiVariants(emoji) {
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

// What a cell reports goes through here rather than through a closure per cell: the flyouts are
// built once and reused, while the caller that a pick belongs to changes with every picker.
let emojiVariantPick = _=>null;

// A button rather than a div: the cells are clickable, so they may as well be reachable and be
// announced as what they are. `description` says which tone a cell stands for - a matrix cell
// combines two of them, and its emoji alone ("🤝🏻") tells a reader nothing.
function emojiVariantCell(target, className, emoji, label, description) {
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = className;
  cell.innerHTML = `<img src="i/noto-emoji/emoji_u${emojiToFilename(emoji)}.svg">`;
  target.appendChild(cell);
  if(label)
    div(cell, 'emojiVariantLabel', html(label));
  cell.title = description;
  cell.setAttribute('aria-label', description);
  cell.dataset.emoji = emoji;
  cell.onclick = function(e) {
    e.stopPropagation();
    const pick = emojiVariantPick;
    closeEmojiVariantFlyout();
    pick(emoji);
  };
  return cell;
}

function buildEmojiVariantFlyout(variants) {
  const dom = div(null, 'emojiVariantFlyout');
  const title = div(dom, 'emojiVariantTitle');

  if(variants.twoDimensional) {
    const matrix = div(dom, 'emojiVariantMatrix');
    emojiVariantCell(matrix, 'emojiVariantCell emojiVariantBase', variants.base, 'None', 'No skin tone');
    for(const shortLabel of variants.toneShortLabels)
      div(matrix, 'emojiVariantHeader', html(shortLabel));
    variants.cells.forEach((row, rowIndex) => {
      div(matrix, 'emojiVariantHeader emojiVariantRowHeader', html(variants.toneLabels[rowIndex]));
      row.forEach((variant, columnIndex) => emojiVariantCell(matrix, 'emojiVariantCell', variant, null,
        `${variants.toneLabels[rowIndex]} + ${variants.toneLabels[columnIndex]} skin tone`));
    });
  } else {
    const row = div(dom, 'emojiVariantRow');
    emojiVariantCell(row, 'emojiVariantCell emojiVariantBase', variants.base, 'No tone', 'No skin tone');
    variants.cells[0].forEach((variant, index) => emojiVariantCell(row, 'emojiVariantCell', variant,
      variants.toneLabels[index], `${variants.toneLabels[index]} skin tone`));
  }

  return { dom, title, cells: [ ...dom.querySelectorAll('.emojiVariantCell') ] };
}

// Hovering along a row of people emoji opens one flyout after the other, and building six to
// twenty-six <img> cells every time is what made the picker crawl on slower machines (#3118). An
// emoji's flyout is therefore built once and kept: reopening it only moves it back into the
// document, which costs nothing and reuses the images the browser already has.
const emojiVariantFlyouts = new Map();

function openEmojiVariantFlyout(element, variants, onPick, label) {
  closeEmojiVariantFlyout();

  if(!emojiVariantFlyouts.has(variants.base))
    emojiVariantFlyouts.set(variants.base, buildEmojiVariantFlyout(variants));
  const { dom, title, cells } = emojiVariantFlyouts.get(variants.base);

  // the label arrives with the icon list, which loads asynchronously, so it is only known now - and
  // the form in use differs between the icons that share a flyout (an already toned one marks its own)
  title.innerHTML = `Skin tone${label ? ` — <b>${html(label)}</b>` : ''}`;
  for(const cell of cells)
    cell.classList.toggle('emojiVariantSelected', cell.dataset.emoji == variants.selected);
  emojiVariantPick = onPick;

  // A fixed box outside the icon it belongs to, which is in a grid that scrolls and, in the editor,
  // in a 340px column - both of them clip. It goes into #editor whenever the icon does, because
  // that is how edit mode tells its own controls from the room: a mousedown anywhere else starts a
  // selection rectangle, and letting go of it would clear the selection the picker is editing.
  (element.closest('#editor') || $('body')).appendChild(dom);

  // Beside the icon whenever there is room, because a box dropped below it covers the very rows of
  // the grid that are being scanned - and in the sidebar the search field just typed into. Both
  // edges are clamped into the viewport: a 5x5 matrix is 250px tall and neither fits above nor
  // below an anchor in the middle of a phone in landscape, and the rows hanging off the bottom
  // edge could not be picked at all (the box scrolls once it is capped, see fonts.css).
  const anchor = element.getBoundingClientRect();
  const box = dom.getBoundingClientRect();
  const gap = 4;
  const clamp = (value, size, available) => Math.max(gap, Math.min(value, available - size - gap));

  let left = anchor.left;
  let top = anchor.bottom + gap;
  if(anchor.right + gap + box.width + gap <= window.innerWidth) {
    left = anchor.right + gap;
    top = anchor.top + anchor.height/2 - box.height/2;
  } else if(anchor.left - gap - box.width - gap >= 0) {
    left = anchor.left - gap - box.width;
    top = anchor.top + anchor.height/2 - box.height/2;
  } else if(anchor.bottom + box.height + gap > window.innerHeight && anchor.top > box.height + gap) {
    top = anchor.top - box.height - gap;
  }
  dom.style.left = `${clamp(left, box.width, window.innerWidth)}px`;
  dom.style.top  = `${clamp(top, box.height, window.innerHeight)}px`;

  let closeTimer = null;
  const close = function() {
    clearTimeout(closeTimer);
    document.removeEventListener('mousedown', onOutsideClick);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', onScroll, true);
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
  // The picker grid and the sidebar scroll, which would leave the flyout hanging next to nothing -
  // but the reflex after a long press on touch is a small drag, and losing the flyout to that would
  // make it unusable there, so a few pixels do not count as scrolling away.
  const scrolledFrom = new Map();
  const onScroll = e=>{
    const scroller = e.target == document ? document.scrollingElement : e.target;
    const position = (scroller.scrollTop || 0) + (scroller.scrollLeft || 0);
    if(!scrolledFrom.has(scroller))
      scrolledFrom.set(scroller, position);
    if(Math.abs(position - scrolledFrom.get(scroller)) > 8)
      close();
  };
  const cancelClose = _=>clearTimeout(closeTimer);
  const scheduleClose = _=>{
    clearTimeout(closeTimer);
    closeTimer = setTimeout(close, closeDelay);
  };
  dom.onmouseenter = cancelClose;
  dom.onmouseleave = scheduleClose;
  document.addEventListener('mousedown', onOutsideClick);
  // on window, because a capture listener there runs before the ones the picker has on document
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('scroll', onScroll, true);
  activeEmojiVariantFlyout = { anchor: element, close, scheduleClose, cancelClose };
}

// Long enough that running the pointer along a row of icons on the way somewhere else does not
// open a flyout behind it - only resting on one does.
const hoverDelay = 450;
const touchDelay = 500;
// the pointer has to cross the gap between the icon and its flyout, so leaving either one gives
// the other a moment to be reached
const closeDelay = 300;
// what a marked icon adds to its own tooltip - the same wording as the picker's help text
const emojiVariantHint = 'Blue corner: hover or press and hold to choose a skin tone.';

// Marks the icons of a container that have skin tone forms and opens their flyout on hover
// (long-press on touch). One set of handlers on the container, not six per icon: the symbol
// picker's grid holds ~1600 emoji and hands itself to a new caller every time it is opened.
// The handlers are assigned as properties, so enabling the same container again replaces them
// instead of stacking another flyout on it.
//   selector - the elements that may carry an emoji, emoji(element) - the one it shows,
//   onPick(element, variant) - what a picked form means, label(element, base) - the icon's name
//   (from the untoned form, which is the only one the icon list knows a name for)
export function enableEmojiVariantFlyouts(container, { selector, emoji, onPick, label }) {
  container.onmousemove = container.onmouseleave = container.ontouchstart = null;
  container.ontouchend = container.ontouchmove = container.ontouchcancel = null;

  loadEmojiVariants().then(_=>{
    for(const element of container.querySelectorAll(selector))
      if(!element.classList.contains('hasEmojiVariants') && emojiVariants(emoji(element))) {
        element.classList.add('hasEmojiVariants');
        // the corner triangle is the only sign that the icon has more to offer, and on touch there
        // is no hover to stumble over it with - so the icon says what it means
        element.title = `${element.title ? element.title + '\n' : ''}${emojiVariantHint}`;
      }

    let hovered = null;
    let openTimer = null;
    let swallowTimer = null;
    let swallowFor = null;

    // a chip holds the glyph it shows, so the marked icon is what the pointer is over, not the
    // element the event happens to have started on
    const markedIcon = target => target && target.closest ? target.closest('.hasEmojiVariants') : null;

    const open = element=>{
      const variants = element.isConnected && emojiVariants(emoji(element));
      if(variants && !emojiVariantFlyoutOf(element))            // still open from before: the
        openEmojiVariantFlyout(element, variants, variant=>onPick(element, variant), label(element, variants.base));
    };                                                          // pointer only left it briefly
    const leave = _=>{
      clearTimeout(openTimer);
      const flyout = hovered && emojiVariantFlyoutOf(hovered);
      if(flyout)
        flyout.scheduleClose();
      hovered = null;
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
      if(swallowFor && swallowFor.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
      disarmClickSwallow();
    };

    // What the pointer is on is taken from its own movement rather than from mouseover/mouseout,
    // because the icons of the picker move: hovering one lifts it by 3px (fonts.css), so a pointer
    // resting near its edge is left and entered again several times a second without moving at
    // all. Reading that as hovering another icon every time is what turned the picker into a
    // slideshow - a mousemove only arrives when the pointer really goes somewhere.
    container.onmousemove = e=>{
      const element = markedIcon(e.target);
      if(element == hovered)                                   // still on the same icon
        return;
      leave();
      hovered = element;
      if(!element)
        return;
      const flyout = emojiVariantFlyoutOf(element);
      if(flyout)
        flyout.cancelClose();
      openTimer = setTimeout(_=>open(element), hoverDelay);
    };
    container.onmouseleave = leave;
    container.ontouchstart = e=>{
      const element = markedIcon(e.target);
      clearTimeout(openTimer);
      if(element)
        openTimer = setTimeout(_=>{
          open(element);
          swallowFor = element;
          document.addEventListener('click', swallowClick, true);
          swallowTimer = setTimeout(disarmClickSwallow, 1000); // no click came: the press ended elsewhere
        }, touchDelay);
    };
    container.ontouchend = container.ontouchmove = container.ontouchcancel = _=>clearTimeout(openTimer);
  }).catch(_=>null);
}
