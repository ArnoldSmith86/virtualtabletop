// Shared two-way syncing inputs for the properties sidebar module.
//
// Every input reads its value from the widget, writes changes through
// module.inputValueUpdated (so they go through the normal delta batching) and
// updates itself through module.addPropertyListener when a delta arrives from
// another player or another part of the editor.

// Most used icons in the public library (regenerate with a grep over library/**/*.json).
const topUsedLibraryIcons = [
  'delapouite/plain-circle', 'lorc/fluffy-trefoil', 'skoll/diamonds', 'skoll/hearts',
  'skoll/spades', 'skoll/clubs', 'quoting/card-play', 'lorc/poker-hand',
  'delapouite/round-star', 'delapouite/banging-gavel', 'delapouite/plain-arrow', 'delapouite/eye-of-horus',
  'lorc/harry-potter-skull', 'delapouite/trash-can', 'willdabeast/gold-bar', 'delapouite/forest',
  'lorc/fire-bomb', 'lorc/drop', 'delapouite/amphora', 'delapouite/rolled-cloth',
  'lorc/snowflake-2', 'delapouite/plain-square', 'delapouite/card-joker', 'delapouite/flower-emblem',
  'delapouite/shaking-hands', 'lorc/tied-scroll', 'delapouite/elephant', 'lorc/swirl-ring',
  'lorc/acorn', 'delapouite/rolling-dices', 'delapouite/sea-turtle', 'delapouite/chicken',
  'lorc/squid', 'delapouite/dolphin', 'lorc/linden-leaf', 'delapouite/wooden-chair',
  'lorc/parrot-head', 'lorc/swan', 'delapouite/anubis', 'delapouite/dice-six-faces-six',
  'sbed/cancel', 'lorc/crowned-heart', 'lorc/cat', 'skoll/mounted-knight',
  'skoll/chess-king', 'delapouite/present', 'lorc/gold-scarab', 'lorc/wheat'
];

// Built-in game piece images shipped in assets/game-pieces, suggested in the
// image picker the same way top icons are suggested in the icon picker.
const builtinGamePieceImages = [
  '2D/Checkers-2D', '2D/Crowned-Checkers-2D', '2D/Hex-Flat', '2D/Hex-Point',
  '2D/Meeple-2D', '2D/Pig-2D', '2D/Poker-2D', '2D/Puck-2D',
  '3D/Building-3D', '3D/Checkers-3D', '3D/Crowned-Checkers-3D', '3D/Cube-3D',
  '3D/House-3D', '3D/Marble-3D', '3D/Meeple-3D', '3D/Pawn-3D',
  '3D/Pig-3D', '3D/Pin-3D', '3D/Poker-3D', '3D/Puck-3D', '3D/Road-3D'
].map(name=>`/i/game-pieces/${name}.svg`);

const propertyInputPalette = [
  'transparent',
  '#000000', '#444444', '#888888', '#cccccc', '#ffffff',
  '#e6194b', '#f58231', '#ffe119', '#bfef45', '#3cb44b',
  '#42d4f4', '#4363d8', '#911eb4', '#f032e6', '#9a6324', '#800000'
];

function propertyInputValueSet(value) {
  return value !== undefined && value !== null && value !== '';
}

// Unique ids for the DOM elements the editor generates. Deliberately not
// rand(): that advances the seeded random the game state depends on, so
// rendering an input would change the next dice roll.
let editorDomIDCounter = 0;
function editorDomID(prefix) {
  return `${prefix}_${++editorDomIDCounter}`;
}

function numericInputValue(rawValue, min, max) {
  if(rawValue === '' || rawValue === null || rawValue === undefined)
    return null;

  const value = Number(rawValue);
  if(!Number.isFinite(value))
    return null;

  if(typeof min === 'number')
    return Math.max(min, typeof max === 'number' ? Math.min(max, value) : value);
  if(typeof max === 'number')
    return Math.min(max, value);
  return value;
}

// Sentinel returned by a MultiWidget's get()/state when the selected widgets
// disagree on a property. Inputs show a muted "multiple values" state but can
// still set every widget to one common value.
const MULTI_DIFFERENT = { multiDiffers: true };

function propertyInputIsMulti(value) {
  return value === MULTI_DIFFERENT;
}

function replaceExclusiveProperties(source, properties, property, value) {
  const result = typeof source == 'object' && source !== null ? JSON.parse(JSON.stringify(source)) : {};
  for(const key of properties)
    delete result[key];
  result[property] = value;
  return result;
}

// Facade over several widgets so the same PropertyInput classes can edit a
// whole selection at once.
class MultiWidget {
  constructor(widgets) {
    this.widgets = widgets;
    this.isMulti = true;
    this.id = widgets.map(w=>w.id).join(',');
  }

  get(property) {
    const values = this.widgets.map(w=>w.get(property));
    return values.every(v=>JSON.stringify(v) === JSON.stringify(values[0])) ? values[0] : MULTI_DIFFERENT;
  }

  set(property, value) {
    for(const widget of this.widgets)
      widget.set(property, value);
  }

  get state() {
    // union of properties present on any selected widget - a property set on
    // only some of the selection (e.g. one widget has an icon, the other
    // doesn't) must still resolve to MULTI_DIFFERENT rather than silently
    // disappearing, or pickers would show the plain "not set" state instead
    // of the "multiple values" chip
    const keys = [ ...new Set(this.widgets.flatMap(w=>Object.keys(w.state))) ];
    const merged = {};
    for(const key of keys) {
      const values = this.widgets.map(w=>w.state[key]);
      merged[key] = values.every(v=>JSON.stringify(v) === JSON.stringify(values[0])) ? values[0] : MULTI_DIFFERENT;
    }
    return merged;
  }

  // defaults/domElement are read by cssValueOptions/propertyOrCssOptions and
  // typeSectionProperties() - the first selected widget stands in for the
  // whole selection (their type-defined defaults/rendering are identical
  // since renderForMulti only curates same-type sections)
  get defaults() {
    return this.widgets[0].defaults;
  }

  get domElement() {
    return this.widgets[0].domElement;
  }
}

// Walks the state of all widgets and calls callback(key, value, path, object)
// for every string value.
function forEachStringInGameState(callback) {
  function walk(obj, path = []) {
    for(const [ key, value ] of Object.entries(obj)) {
      if(typeof value == 'string')
        callback(key, value, path.concat(key), obj);
      else if(typeof value == 'object' && value !== null)
        walk(value, path.concat(key));
    }
  }
  for(const widget of widgets.values())
    walk(widget.state);
}

function usedValuesInGame(callback) {
  const counts = {};
  forEachStringInGameState((key, value, path, object)=>{
    const match = callback(key, value, path, object);
    if(match)
      counts[match] = (counts[match] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b)=>b[1]-a[1]).map(e=>e[0]);
}

function usedGameColors() {
  return usedValuesInGame((key, value)=>value == 'transparent' || value.match(/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$|^(?:rgb|hsl)a?\(.*\)$/) ? value : null);
}

function usedGameIconValue(key, value, path = [], object = {}) {
  // game-icons paths need context: generic `name` and `value` fields occur
  // throughout routines, so only accept them when they are part of an icon
  // value (an icon object or an icon face-template object).
  if(value.match(/^[a-z0-9-]+\/[a-z0-9-]+$/)) {
    if(key == 'icon' || key == 'suit')
      return value;
    if((key == 'name' && path.slice(0, -1).indexOf('icon') != -1) ||
      ((key == 'name' || key == 'value') && object.type == 'icon'))
      return value;
    return null;
  }
  if(key != 'icon')
    return null;
  // all other formats getIconDetails accepts for the icon property
  if(value.match(/^[a-z][a-z0-9_]+(_NOFILL)?$/) || value.match(/^\[.*\]$|^\(.*\)$/) || value.match(/^\/assets\/|^https?:\/\//))
    return value;
  if(value && !value.match(/^[\x00-\x7F]*$/)) // non-ASCII: emoji icons
    return value;
  return null;
}

function usedGameIcons() {
  return usedValuesInGame(usedGameIconValue);
}

function usedGameImages() {
  return usedValuesInGame((key, value)=>{
    const match = value.match(/^(?:\/(?:assets\/-?[0-9]+_[0-9]+|i\/[^\s"']+\.(?:svg|png|jpe?g|webp|gif))|https?:\/\/[^\s"']+)$/);
    return match ? value : null;
  });
}

const iconPickerTypes = [
  { type: 'game-icons',       label: 'Game Icons',  title: 'Include icons from Game-icons.net' },
  { type: 'material-symbols', label: 'Material',    title: 'Include Google\'s Material Symbols' },
  { type: 'emoji-color',      label: 'Color Emoji', title: 'Include color emoji' },
  { type: 'emoji-monochrome', label: 'Mono Emoji',  title: 'Include monochrome emoji' },
  { type: 'vtt-symbols',      label: 'VTT built-in', title: 'Include VTT symbols' }
];

function iconValueType(value) {
  if(typeof value != 'string')
    return null;
  if(value.match(/^[a-z0-9-]+\/[a-z0-9-]+$/))
    return 'game-icons';
  if(value.match(/^\[/))
    return 'vtt-symbols';
  if(value.match(/^[a-z0-9][a-z0-9_]*(_NOFILL)?$/))
    return 'material-symbols';
  if(value.match(/^\(.*\)$/))
    return 'emoji-monochrome';
  if(value && !value.match(/^[\x00-\x7F]*$/))
    return 'emoji-color';
  return null;
}

function iconTypeEnabled(value, enabledTypes) {
  const type = iconValueType(value);
  return !type || enabledTypes.has(type);
}

// The full symbol picker is an overlay of its own, so opening it from a picker that sits inside another overlay
// (e.g. the deck editor's "Add New Deck" dialog) hides that one. Bring that overlay - the one the given element
// lives in - back afterwards, instead of leaving the user without the dialog they were working in.
async function pickSymbolKeepingOverlay(element, type='all') {
  const hostOverlay = element.closest('.overlay');
  if(!hostOverlay)
    return await pickSymbol(type);

  // The deck editor parks the symbol picker inside its card view (see DeckEditor.open), which is not where a
  // dialog floating above the editor wants it: show it where the dialog is and put it back afterwards.
  const picker = $('#symbolPickerOverlay');
  const pickerParent = picker.parentNode;
  hostOverlay.parentNode.appendChild(picker);
  // Where it lands has no box or stacking rule of its own, so it would end up behind the deck editor: the
  // class gives it the editor's box and floats it above (see deckeditor.css) while it is parked here.
  picker.classList.add('symbolPickerAboveEditor');

  // Whatever happens, the user must get their dialog back: the picker's symbol list is fetched, so it can also
  // fail to open. Keep that failure here - unhandled it would reach the global error handler, which replaces
  // the dialog with the client error overlay.
  let symbol = null;
  let error = null;
  try {
    symbol = await pickSymbol(type, true, false);
  } catch(e) {
    error = e;
  }

  picker.classList.remove('symbolPickerAboveEditor');
  pickerParent.appendChild(picker);
  // showOverlay toggles, so it would hide the dialog that is still up when the picker never opened at all:
  // only bring the dialog back when the picker actually took its place.
  if(hostOverlay.style.display == 'none')
    showOverlay(hostOverlay.id);
  if(error) {
    console.error(error);
    alert('The symbol picker could not be loaded. Please try again.');
  }
  return symbol;
}

// "save_NOFILL" is how the outlined variant of a Material Symbol is stored, but as the tooltip of a chip it
// is developer vocabulary that does not explain why the same-looking glyph is offered twice.
function iconChipTitle(value) {
  return /^[a-z0-9].*_NOFILL$/.test(value) ? `${value.replace(/_NOFILL$/, '')} (outlined)` : value;
}

// Renders a small preview for an icon property value (same formats as getIconDetails).
function renderIconChip(value, target) {
  const chip = div(target, 'propertyValueChip');
  // an icon can also be a symbol object { name, scale, ... } or an array of
  // them (see generateSymbolsDiv); preview the first symbol's name, which uses
  // the same string formats below, instead of crashing on .match
  let icon = value;
  let first = null;
  if(value && typeof value == 'object') {
    chip.title = JSON.stringify(value);
    first = Array.isArray(value) ? null : value; // combos have no single glyph to color/scale
    icon = Array.isArray(value) ? value[0] : value;
    icon = icon && typeof icon == 'object' ? icon.name : icon;
  } else {
    chip.title = iconChipTitle(value);
  }
  if(typeof icon != 'string')
    return chip; // nothing renderable (e.g. an empty or malformed icon object)
  // the object form's color/scale (see iconWithOption) apply to a single
  // chosen glyph - not previewing them made a red icon's preview look black,
  // as if the color picker had no effect (auto-review 2/4, finding "Icon
  // preview contradicts the chosen color"). Applied to font-based glyphs
  // (the common case); game-icons.net image glyphs are recolored via an
  // async SVG fetch elsewhere (see getSVG/symbols.js) and are left as-is
  // here to keep this preview cheap and synchronous.
  const iconColor = iconOption(first, 'color');
  const iconScale = iconOption(first, 'scale');
  let glyph = null;
  if(icon.match(/^\/assets\/|^https?:\/\//)) {
    chip.innerHTML = `<img src="${html(mapAssetURLs(icon))}">`;
  } else if(icon.match(/\//)) {
    chip.innerHTML = `<img src="${html(`i/game-icons.net/${icon}.svg`)}">`;
  } else if(icon.match(/^\[/)) {
    glyph = div(chip, 'symbols', html(icon));
  } else if(icon.match(/^[a-z0-9].*_NOFILL$/)) {
    glyph = div(chip, 'material-symbols-nofill', html(icon.replace(/_NOFILL$/, '')));
  } else if(icon.match(/^[a-z0-9]/)) {
    glyph = div(chip, 'material-symbols', html(icon));
  } else if(icon.match(/^\(.*\)$/)) {
    glyph = div(chip, 'emoji-monochrome', html(toNotoMonochrome(icon.replace(/^\((.*)\)$/, '$1'))));
  } else {
    div(chip, 'emojiColorChip', html(icon)); // raw emoji: native color rendering
  }
  if(glyph) {
    if(iconColor)
      glyph.style.color = iconColor;
    if(iconScale)
      glyph.style.transform = `scale(${numericInputValue(String(iconScale), 0.1, 5) || 1})`;
  }
  return chip;
}

function renderImageChip(value, target) {
  const chip = div(target, 'propertyValueChip');
  chip.title = value;
  chip.innerHTML = `<img src="${html(mapAssetURLs(value))}">`;
  return chip;
}

function renderColorChip(value, target) {
  const chip = div(target, 'propertyValueChip propertyColorChip');
  chip.style.setProperty('--chipColor', value);
  return chip;
}

// Icon search matching. Both icon pickers search and rank the same way: client/js/symbols.js
// defines the rule and its helpers (iconSearchEntry, iconSearchScores) and main.js exports them
// into this bundle, so the symbol picker of the JSON editor and the picker below cannot drift
// apart - they used to answer "dragon" with two different top rows.

// Sorting is stable, so entries of the same score stay in symbols.json order and related icon
// families stay together.
function iconSearchMatches(query, entryFilter) {
  const entries = (iconSearchIndex || []).filter(entryFilter);
  const scores = iconSearchScores(entries, query);
  return entries.map((entry, i) => ({ entry, score: scores[i] })).filter(match => match.score)
    .sort((a, b) => b.score - a.score).map(match => match.entry);
}

// Flat searchable index over i/fonts/symbols.json, loaded on first use.
let iconSearchIndex = null;
let iconSearchIndexByValue = new Map(); // for the tooltip of a result chip
let iconSearchIndexPromise = null;
function loadIconSearchIndex() {
  if(!iconSearchIndexPromise) {
    iconSearchIndexPromise = (async _=>{
      const index = [];
      const data = await (await fetch('i/fonts/symbols.json')).json();
      for(const [ category, symbols ] of Object.entries(data)) {
        if(category.match(/Emoji - Flags/))
          continue;
        for(let [ symbol, keywords ] of Object.entries(symbols)) {
          if(symbol.includes('/')) {
            keywords = keywords.slice(1); // first entry is the spritesheet index
            // as in the symbol picker: the file name is searched word by word
            const name = symbol.split('/')[1];
            index.push({ value: symbol, ...iconSearchEntry(name, keywords), image: true, type: 'game-icons' });
          } else {
            const hasNoFillVariant = symbol.match(/ \(FILL\+NOFILL\)$/);
            symbol = symbol.replace(/ \(FILL\+NOFILL\)$/, '');
            const searchEntry = iconSearchEntry(symbol, keywords);
            if(symbol.match(/^\[/) || symbol.match(/^[a-z0-9_]+$/)) {
              index.push({ value: symbol, ...searchEntry, image: false, type: symbol.match(/^\[/) ? 'vtt-symbols' : 'material-symbols' });
              if(hasNoFillVariant)
                index.push({ value: `${symbol}_NOFILL`, ...searchEntry, image: false, type: 'material-symbols' });
            } else {
              // emoji: offer both the color image and the monochrome font variant
              index.push({ value: symbol, ...searchEntry, image: true, type: 'emoji-color' });
              if(!skipForNotoMonochrome(symbol))
                index.push({ value: `(${symbol})`, ...searchEntry, image: false, type: 'emoji-monochrome' });
            }
          }
        }
      }
      iconSearchIndex = index;
      iconSearchIndexByValue = new Map(index.map(entry => [ entry.value, entry ]));
      return index;
    })();
    iconSearchIndexPromise.catch(_=>iconSearchIndexPromise = null); // allow retrying after a failed fetch
  }
  return iconSearchIndexPromise;
}

// How many icons the icon picker shows at once - both for a search and for the suggestions it
// opens with. The skin tone forms put behind a searched emoji count towards it as well, so a
// result that has them stays as long as one that has not.
const iconPickerResultLimit = 100;

// Both pickers only show the first `limit` results - "hand" matches almost twice as many - so
// they also get the total to say so instead of truncating the list silently.
function searchIconIndex(query, limit=100, enabledTypes=null) {
  const matches = iconSearchMatches(query, entry => !enabledTypes || enabledTypes.has(entry.type));
  return { total: matches.length, values: matches.slice(0, limit).map(entry => entry.value) };
}

// The name an icon is listed under ("thumbs up"): the first of its keywords, which is what the
// symbol picker shows as well (entry.text is the symbol, the symbol spelled out, then the
// keywords - see iconSearchEntry). Empty until the index is loaded - it is only used as a label.
function iconDisplayName(value) {
  const listed = iconSearchIndexByValue.get(String(value));
  return listed ? (listed.text.split(',')[2] || '').replace(/_/g, ' ') : '';
}

function imageURLFromSymbol(symbol) {
  if(symbol.includes('/'))
    return `/i/game-icons.net/${symbol}.svg`;
  const filename = [...symbol].map(char => char.codePointAt(0).toString(16).padStart(4, '0')).join('_').replace(/_fe0f/g, '');
  return `/i/noto-emoji/emoji_u${filename}.svg`;
}

function searchImageIndex(query, limit=100) {
  const matches = iconSearchMatches(query, entry => entry.image);
  return { total: matches.length, values: matches.slice(0, limit).map(entry => imageURLFromSymbol(entry.value)) };
}

let activePropertyInfoPopup = null;

// An info tip hangs off a sidebar control that is thrown away whenever the
// editor re-renders for another widget, so closeEditorPopups() takes it along
// with the popups of controls/popup.js. Its own outside-click handler only
// helps when there is a click - a deleted widget, an undo or a new state
// arriving change the selection without one.
function closePropertyInfoPopup() {
  if(activePropertyInfoPopup)
    activePropertyInfoPopup();
}

// Info button (design inspired by the routine editor in PR #2439): a small
// "i" icon that opens a dismissable popup with an explanation. The popup
// opens on hover or click. Hovered popups close when leaving the icon; clicked
// popups stay open until an outside click or Escape.
// Named propertyInfoButton (not infoButton) because controls/popup.js
// declares its own top-level infoButton(); both files land in the editor
// bundle whenever this PR and the routine editor are merged together (e.g.
// on the beta branch), and duplicate top-level declarations in the bundled
// module throw "Identifier has already been declared".
function propertyInfoButton(appendTo, infoHTML) {
  const dom = div(appendTo, 'info-button', `<span class=material-symbols>info</span>`);
  let closePopup = null;
  let pinned = false;
  const open = stick=>{
    if(closePopup) {
      pinned = pinned || stick;
      return;
    }
    if(activePropertyInfoPopup)
      activePropertyInfoPopup();
    const popup = div($('#editor'), 'inline-popup', '<div class=content></div>');
    let outsideClickTimer = null;
    $('.content', popup).innerHTML = infoHTML;

    const sourceRect = dom.getBoundingClientRect();
    popup.style.left = `${sourceRect.left}px`;
    popup.style.top  = `${sourceRect.bottom}px`;
    const rect = popup.getBoundingClientRect();
    if(rect.right > window.innerWidth - 10)
      popup.style.left = `${Math.max(10, window.innerWidth - rect.width - 10)}px`;
    if(rect.bottom > window.innerHeight - 10)
      popup.style.top = `${Math.max(10, window.innerHeight - rect.height - 10)}px`;

    const close = _=>{
      clearTimeout(outsideClickTimer);
      document.removeEventListener('click', onOutsideClick);
      document.removeEventListener('keydown', onKeyDown, true);
      popup.remove();
      closePopup = null;
      if(activePropertyInfoPopup == close)
        activePropertyInfoPopup = null;
    };
    const onOutsideClick = e=>{
      if(!popup.contains(e.target))
        close();
    };
    // capture phase so Escape only closes the popup instead of also deselecting in the editor
    const onKeyDown = e=>{
      if(e.key == 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    pinned = stick;
    closePopup = close;
    activePropertyInfoPopup = close;
    document.addEventListener('keydown', onKeyDown, true);
    // defer so the click that opened the popup doesn't immediately close it
    outsideClickTimer = setTimeout(_=>{
      if(closePopup == close)
        document.addEventListener('click', onOutsideClick);
    }, 0);
  };
  dom.addEventListener('mouseenter', _=>open(false));
  dom.addEventListener('mouseleave', _=>{
    if(!pinned && closePopup)
      closePopup();
  });
  dom.addEventListener('click', e=>{
    e.stopPropagation();
    open(true);
  });
  return dom;
}

// Free text field with a datalist of suggestions plus an add button - so the
// field has a picker but still accepts a name the editor never heard of.
// onAdd returning false keeps the typed text (the name was rejected).
function suggestionAddRow(target, className, options) {
  const row = div(target, className);

  const input = document.createElement('input');
  input.placeholder = options.placeholder;
  row.appendChild(input);

  if(options.suggestions.length) {
    const listID = editorDomID('suggestions');
    const datalist = document.createElement('datalist');
    datalist.id = listID;
    for(const suggestion of options.suggestions) {
      const option = document.createElement('option');
      option.value = suggestion;
      datalist.appendChild(option);
    }
    row.appendChild(datalist);
    input.setAttribute('list', listID);

    // A datalist accepts custom property names as well as its suggestions.
    // Most add rows get a separate, explicit button because the native
    // affordance is easy to miss; the generic-property input keeps only the
    // native arrow because it is already visible inside that compact field.
    if(!options.nativeSuggestionButtonOnly) {
      const suggestions = document.createElement('button');
      suggestions.setAttribute('icon', 'arrow_drop_down');
      suggestions.className = 'suggestionListButton';
      suggestions.title = 'Show suggestions';
      suggestions.onclick = _=>{
        input.focus();
        if(typeof input.showPicker == 'function')
          input.showPicker();
      };
      row.appendChild(suggestions);
    }
  }

  const submit = _=>{
    const value = input.value.trim();
    if(value && options.onAdd(value) !== false)
      input.value = '';
  };
  input.onkeydown = event=>{
    if(event.key == 'Enter')
      submit();
  };

  const add = document.createElement('button');
  add.setAttribute('icon', 'add');
  add.title = options.title;
  add.onclick = submit;
  row.appendChild(add);

  return row;
}

function propertyInputNumberOrText(rawValue, nullIfEmpty=false) {
  const value = String(rawValue).trim();
  if(value === '' && nullIfEmpty)
    return null;
  return value.match(/^-?(?:\d+(?:\.\d+)?|\.\d+)$/) ? +value : value;
}

class PropertyInput {
  // options: property OR getValue/setValue+listenTo, plus subclass specific options
  constructor(module, widget, labelText, options={}) {
    this.module = module;
    this.widget = widget;
    this.labelText = labelText;
    this.options = options;
  }

  getValue() {
    if(this.options.getValue)
      return this.options.getValue();
    // widgetOwnValue, not get(): setValue writes the widget's own property, and
    // a basic widget resolves get() through its shown face - so reading get()
    // would show a face's value in an input that overwrites the widget's
    const value = widgetOwnValue(this.widget, this.options.property);
    return value === undefined ? null : value;
  }

  setValue(value) {
    if(this.options.setValue)
      this.options.setValue(value);
    else
      this.module.inputValueUpdated(this.widget, this.options.property, value);
  }

  listenProperties() {
    return this.options.listenTo || [ this.options.property ];
  }

  render(target) {
    this.dom = div(target, `propertyInput ${this.cssClass()}`);
    if(this.labelText) {
      const label = document.createElement('label');
      if(this.options.labelIcon) {
        // common color roles are shown as their material symbol instead of text
        const icon = document.createElement('span');
        icon.className = `${this.options.labelIconNoFill ? 'material-symbols-nofill' : 'material-symbols'} labelIcon`;
        icon.textContent = this.options.labelIcon;
        label.appendChild(icon);
        label.dataset.label = this.labelText;
        label.classList.add('iconOnly');
      } else {
        // no title: the label column wraps instead of truncating, so a native
        // tooltip would only repeat what is already on screen - and cover the
        // popup of the (i) button sitting inside the same label
        label.textContent = this.labelText;
      }
      if(this.options.hint) {
        propertyInfoButton(label, html(this.options.hint));
        // colorFlexRow collapses non-icon labels to their text width - this
        // marks the ones that still need the reserved hint-icon space
        label.classList.add('hasHint');
      }
      this.dom.appendChild(label);
    } else if(this.options.hint) {
      propertyInfoButton(this.dom, html(this.options.hint));
    }
    this.renderControl(this.dom);
    // options.validate: a problem with what was typed belongs under the input
    // it was typed into, not only in the validation table of another module
    if(this.options.validate)
      this.problemDOM = div(this.dom, 'propertyInputProblem');
    for(const property of this.listenProperties())
      this.module.addPropertyListener(this.widget, property, _=>this.applyUpdate(this.getValue()));
    return this.dom;
  }

  applyUpdate(value) {
    this.update(value);
    if(this.problemDOM) {
      const problem = value === null || propertyInputIsMulti(value) ? null : this.options.validate(value);
      this.problemDOM.textContent = problem || '';
      this.dom.classList.toggle('hasProblem', !!problem);
    }
  }

  cssClass() {
    return '';
  }

  renderControl(target) {
  }

  update(value) {
  }
}

class TextInput extends PropertyInput {
  cssClass() {
    return `${this.options.multiline ? 'textInput multiline' : 'textInput'}${this.options.compact ? ' compactInput' : ''}`;
  }

  renderControl(target) {
    this.input = document.createElement(this.options.multiline ? 'textarea' : 'input');
    if(this.options.placeholder)
      this.input.placeholder = this.options.placeholder;
    // a field holding a list is unreadable at the two rows a textarea defaults
    // to, so its height can be asked for in lines
    if(this.options.multiline && this.options.rows)
      this.input.rows = this.options.rows;
    this.input.oninput = _=>{
      const value = this.input.value;
      this.setValue(value === '' && this.options.nullIfEmpty ? null : value);
    };
    target.appendChild(this.input);
  }

  update(value) {
    const multi = propertyInputIsMulti(value);
    this.dom.classList.toggle('multiDiffers', multi);
    this.input.placeholder = multi ? '— multiple —' : (this.options.placeholder || '');
    if(document.activeElement !== this.input)
      this.input.value = (value === null || multi) ? '' : value;
  }
}

class NumberInput extends PropertyInput {
  cssClass() {
    return 'numberInput';
  }

  renderControl(target) {
    this.input = document.createElement('input');
    this.input.type = 'number';
    this.input.step = this.options.step !== undefined ? this.options.step : 'any';
    if(this.options.min !== undefined) this.input.min = this.options.min;
    if(this.options.max !== undefined) this.input.max = this.options.max;
    if(this.options.placeholder !== undefined) this.input.placeholder = this.options.placeholder;
    this.input.oninput = _=>this.applyInput(this.input.value);
    target.appendChild(this.input);

    if(this.options.slider) {
      this.slider = document.createElement('input');
      this.slider.type = 'range';
      this.slider.min = this.options.min !== undefined ? this.options.min : 0;
      this.slider.max = this.options.max !== undefined ? this.options.max : 100;
      this.slider.step = this.options.step !== undefined ? this.options.step : 1;
      this.slider.oninput = _=>this.applyInput(this.slider.value);
      target.appendChild(this.slider);
    }

    if(this.options.unit) {
      const unit = document.createElement('span');
      unit.className = 'propertyInputUnit';
      unit.textContent = this.options.unit;
      target.appendChild(unit);
    }
  }

  applyInput(rawValue) {
    if(rawValue === '' && this.options.nullIfEmpty) {
      this.setValue(null);
      return;
    }
    const value = numericInputValue(rawValue, this.options.min, this.options.max);
    if(value === null)
      return;

    this.setValue(value);
    if(this.slider && document.activeElement !== this.slider)
      this.slider.value = value;
    if(document.activeElement !== this.input || String(rawValue) !== String(value))
      this.input.value = value;
  }

  update(value) {
    const multi = propertyInputIsMulti(value);
    this.dom.classList.toggle('multiDiffers', multi);
    this.input.placeholder = multi ? '— multiple —' : (this.options.placeholder !== undefined ? this.options.placeholder : '');
    const numeric = typeof value == 'number' ? value : +value || 0;
    if(document.activeElement !== this.input)
      this.input.value = (value === null || multi) ? '' : numeric;
    if(this.slider && document.activeElement !== this.slider) {
      // when unset, rest the slider at the numeric placeholder (the shown
      // default) instead of dropping it to its minimum
      const placeholder = this.options.placeholder !== undefined && this.options.placeholder !== '' ? +this.options.placeholder : NaN;
      this.slider.value = (value === null || multi) && Number.isFinite(placeholder) ? placeholder : numeric;
    }
  }
}

// Accepts either a number or a CSS-like string such as "50%".
class NumberOrTextInput extends PropertyInput {
  cssClass() {
    return `numberInput numberOrTextInput${this.options.compact ? ' compactInput' : ''}`;
  }

  renderControl(target) {
    this.input = document.createElement('input');
    this.input.type = 'text';
    if(this.options.placeholder !== undefined) this.input.placeholder = this.options.placeholder;
    this.input.oninput = _=>this.setValue(propertyInputNumberOrText(this.input.value, this.options.nullIfEmpty));
    // a text input has no arrow key stepping, which is the part of a number
    // input that still applies while the value happens to be a plain number
    this.input.onkeydown = e=>{
      if(e.key != 'ArrowUp' && e.key != 'ArrowDown')
        return;
      const value = propertyInputNumberOrText(this.input.value, false);
      if(typeof value != 'number')
        return;
      e.preventDefault();
      const stepped = +(value + (e.key == 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)).toFixed(6);
      this.input.value = stepped;
      this.setValue(stepped);
    };
    target.appendChild(this.input);
  }

  update(value) {
    const multi = propertyInputIsMulti(value);
    this.dom.classList.toggle('multiDiffers', multi);
    // the compact width this input is normally used at (~70px) truncates the
    // old "e.g. 8, 8px, 50%" placeholder down to "e.g. 8," - reading like a
    // typo rather than a hint
    this.input.placeholder = multi ? '— multiple —' : (this.options.placeholder || '8px');
    // a plain number fits the compact width these inputs are laid out at,
    // anything else usually does not - so the layout can tell the two apart,
    // and what does not fit is at least readable as a tooltip
    const text = (value === null || multi) ? '' : String(value);
    this.dom.classList.toggle('nonNumericValue', text !== '' && typeof value != 'number');
    this.input.title = typeof value == 'number' ? '' : text;
    if(document.activeElement !== this.input)
      this.input.value = (value === null || multi) ? '' : value;
  }
}

// Rendered as an on/off switch, reusing the global .switchbox styling.
class CheckboxInput extends PropertyInput {
  cssClass() {
    return 'checkboxInput switchInput';
  }

  renderControl(target) {
    this.input = document.createElement('input');
    this.input.type = 'checkbox';
    this.input.className = 'switchbox';
    this.input.id = editorDomID('propertyCheckbox');
    this.input.onchange = _=>this.setValue(this.options.invert ? !this.input.checked : this.input.checked);
    target.appendChild(this.input);

    const box = document.createElement('label');
    box.className = 'switchbox';
    box.htmlFor = this.input.id;
    target.appendChild(box);
  }

  update(value) {
    const multi = propertyInputIsMulti(value);
    this.dom.classList.toggle('multiDiffers', multi);
    this.input.indeterminate = multi;
    const boolValue = (value === null || multi) ? !!this.options.default : !!value;
    this.input.checked = this.options.invert ? !boolValue : boolValue;
  }
}

class SelectInput extends PropertyInput {
  // options.choices: [ { value, text } ]
  cssClass() {
    return 'selectInput';
  }

  renderControl(target) {
    this.select = document.createElement('select');
    for(const choice of this.options.choices) {
      const option = document.createElement('option');
      option.value = JSON.stringify(choice.value);
      option.textContent = choice.text;
      this.select.appendChild(option);
    }
    this.select.onchange = _=>this.setValue(JSON.parse(this.select.value));
    target.appendChild(this.select);
  }

  update(value) {
    const multi = propertyInputIsMulti(value);
    this.dom.classList.toggle('multiDiffers', multi);
    if(multi) {
      if(!this.customOption) {
        this.customOption = document.createElement('option');
        this.select.appendChild(this.customOption);
      }
      this.customOption.value = 'multi';
      this.customOption.disabled = true;
      this.customOption.textContent = '— multiple —';
      this.select.value = 'multi';
      return;
    }
    const jsonValue = JSON.stringify(value);
    if(this.options.choices.some(choice=>JSON.stringify(choice.value) == jsonValue)) {
      if(this.customOption) {
        this.customOption.remove();
        this.customOption = null;
      }
    } else {
      // keep values the dropdown does not know as an extra option
      if(!this.customOption) {
        this.customOption = document.createElement('option');
        this.select.appendChild(this.customOption);
      }
      this.customOption.value = jsonValue;
      this.customOption.disabled = false;
      this.customOption.textContent = `custom: ${jsonValue}`;
    }
    this.select.value = jsonValue;
  }
}

// Base class for color/icon/image inputs: shows the current value as a
// preview and expands an inline picker section (no popup) when clicked.
class PickerInput extends PropertyInput {
  cssClass() {
    return 'pickerInput';
  }

  // whether an extra arrow button toggles the picker next to the preview
  expandArrow() {
    return true;
  }

  renderControl(target) {
    this.previewButton = document.createElement('button');
    this.previewButton.className = 'propertyPreviewButton';
    this.previewButton.title = 'Click to edit';
    this.previewButton.onclick = _=>this.togglePicker();
    target.appendChild(this.previewButton);

    if(this.expandArrow()) {
      this.expandButton = document.createElement('button');
      this.expandButton.className = 'propertyExpandButton';
      this.expandButton.setAttribute('icon', 'expand_more');
      this.expandButton.onclick = _=>this.togglePicker();
      target.appendChild(this.expandButton);
    }

    // the picker can render somewhere else (e.g. below a row of side by side
    // inputs) so opening it does not push the neighboring inputs around;
    // pickers sharing a pickerGroup close each other when one opens
    const group = this.options.pickerGroup;
    this.pickerDOM = div((group && group.target) || this.options.pickerTarget || target, 'propertyPicker');
    this.pickerDOM.style.display = 'none';
  }

  togglePicker() {
    if(this.pickerOpen())
      this.closePicker();
    else
      this.openPicker();
  }

  openPicker() {
    const group = this.options.pickerGroup;
    if(group) {
      if(group.current && group.current !== this)
        group.current.closePicker();
      group.current = this;
    }
    this.pickerDOM.style.display = '';
    if(this.expandButton)
      this.expandButton.classList.add('open');
    this.previewButton.classList.add('open');
    this.updatePicker(this.getValue());
    const search = this.pickerDOM.querySelector('input[placeholder^="Search "]');
    if(search)
      search.focus();
  }

  closePicker() {
    const group = this.options.pickerGroup;
    if(group && group.current === this)
      group.current = null;
    this.pickerDOM.style.display = 'none';
    if(this.expandButton)
      this.expandButton.classList.remove('open');
    this.previewButton.classList.remove('open');
  }

  pickerOpen() {
    return this.pickerDOM && this.pickerDOM.style.display != 'none';
  }

  // Pickers distinguish the raw (explicitly set) value from the effective one
  // (which falls back to the widget's applying default) so an unset picker can
  // preview the default that is actually in effect.
  getValue() {
    if(this.options.getValue)
      return this.options.getValue();
    const raw = this.widget.state[this.options.property];
    return raw === undefined ? null : raw;
  }

  getEffectiveValue() {
    const value = this.options.getEffective ? this.options.getEffective()
      : this.options.getValue ? this.options.getValue()
      : this.widget.get(this.options.property);
    if(propertyInputIsMulti(value))
      return null;
    return value === undefined ? null : value;
  }

  previewValue() {
    const raw = this.getValue();
    if(propertyInputIsMulti(raw))
      return null;
    return propertyInputValueSet(raw) ? raw : this.getEffectiveValue();
  }

  isMultiValue() {
    return propertyInputIsMulti(this.getValue());
  }

  update(value) {
    this.updatePreview();
    if(this.pickerOpen())
      this.refreshPicker(this.getValue());
  }

  // whether an unset value should be previewed dimmed. Colors override this to
  // false so a default color looks identical to a manually set one.
  dimDefault() {
    return true;
  }

  updatePreview() {
    const rawValue = this.getValue();
    const multi = propertyInputIsMulti(rawValue);
    this.dom.classList.toggle('multiDiffers', multi);
    this.previewButton.innerHTML = '';
    if(multi) {
      div(this.previewButton, 'propertyValueChip propertyMultiChip');
      this.previewButton.classList.remove('usingDefault', 'emptyValue');
      this.previewButton.title = 'The selected widgets have different values - picking one applies it to all of them';
      this.previewButton.setAttribute('aria-label', 'Edit value');
      return;
    }
    const previewValue = this.previewValue();
    this.renderChip(this.previewButton, previewValue);
    const isEmpty = !propertyInputValueSet(previewValue);
    const emptyLabel = this.emptyLabel();
    this.previewButton.classList.toggle('usingDefault', this.dimDefault() && !propertyInputValueSet(rawValue));
    this.previewButton.classList.toggle('emptyValue', isEmpty);
    const title = this.previewTitle(isEmpty, emptyLabel);
    if(title)
      this.previewButton.title = title;
    else
      this.previewButton.removeAttribute('title');
    this.previewButton.setAttribute('aria-label', isEmpty && emptyLabel ? emptyLabel : 'Edit value');
  }

  previewTitle(isEmpty, emptyLabel) {
    return isEmpty && emptyLabel ? emptyLabel : 'Click to edit';
  }

  emptyLabel() {
    return this.options.emptyLabel || null;
  }

  renderEmptyChip(target) {
    const chip = div(target, 'propertyValueChip propertyEmptyChip');
    const label = this.emptyLabel();
    if(label) {
      chip.classList.add('propertyEmptyChipLabel');
      chip.textContent = label;
    }
    return chip;
  }

  updatePicker(value) {
    this.pickerDOM.innerHTML = '';
    this.summaryDOM = div(this.pickerDOM, 'propertyPickerSummary');
    this.renderSummary(this.summaryDOM, value);
    this.renderPickerContent(this.pickerDOM, value);
    this.footerDOM = div(this.pickerDOM, 'propertyPickerFooter');
    this.renderFooter(value);
  }

  // the remove-value button sits at the bottom right of the picker
  renderFooter(value) {
    this.footerDOM.innerHTML = '';
    if(this.options.clearable !== false && propertyInputValueSet(value)) {
      const clear = document.createElement('button');
      clear.setAttribute('icon', 'delete');
      clear.textContent = 'Remove value';
      clear.onclick = _=>this.setValue(null);
      this.footerDOM.appendChild(clear);
    }
  }

  // Called when the value changes while the picker is open. Only updates the
  // summary and the chip selection marks instead of rebuilding everything so
  // the search input and the native color picker are not interrupted.
  refreshPicker(value) {
    const active = document.activeElement;
    const activeInSummaryInput = this.summaryDOM && this.summaryDOM.contains(active) && active.matches('input, textarea');
    if(this.summaryDOM && !activeInSummaryInput) {
      this.summaryDOM.innerHTML = '';
      this.renderSummary(this.summaryDOM, value);
    }
    for(const chip of $a('.propertyValueChip', this.pickerDOM))
      if(chip.dataset.value !== undefined)
        chip.classList.toggle('selected', chip.dataset.value == this.chipMatchValue(value));
    if(this.footerDOM)
      this.renderFooter(value);
  }

  renderSummary(target, value) {
    if(propertyInputIsMulti(value)) {
      div(target, 'propertyValueChip propertyMultiChip');
      this.renderSummaryControls(target, null);
      div(target, 'propertyPickerValueText', '<i>multiple values — pick one to apply to all</i>');
      const close = document.createElement('button');
      close.setAttribute('icon', 'close');
      close.title = 'Close';
      close.onclick = _=>this.closePicker();
      target.appendChild(close);
      return;
    }
    const isSet = propertyInputValueSet(value);
    this.renderChip(target, this.previewValue());
    this.renderSummaryControls(target, value);
    if(isSet)
      div(target, 'propertyPickerValueText', html(this.summaryValueText(value)));
    else if(propertyInputValueSet(this.getEffectiveValue()))
      div(target, `propertyPickerValueText${this.dimDefault() ? ' usingDefault' : ''}`, this.dimDefault() ? `default: ${html(this.summaryValueText(this.getEffectiveValue()))}` : html(this.summaryValueText(this.getEffectiveValue())));
    else
      div(target, 'propertyPickerValueText', '<i>not set</i>');
    const close = document.createElement('button');
    close.setAttribute('icon', 'close');
    close.title = 'Close';
    close.onclick = _=>this.closePicker();
    target.appendChild(close);
  }

  renderSummaryControls(target, value) {
  }

  // most pickers hold plain string/number values - override for values (like
  // an icon's object form) that need a human-readable summary instead of
  // stringifying the raw value
  summaryValueText(value) {
    return String(value);
  }

  // comparable string used to decide which chip shows as selected - override
  // when the picker value isn't itself the chip key (e.g. an icon's
  // {name, color, scale} object form, matched by name)
  chipMatchValue(value) {
    return String(value);
  }

  // value to store when a chip is clicked - override to merge the selection
  // into the current value instead of replacing it outright (e.g. keep an
  // icon's color/scale when swapping which glyph is shown)
  valueForChip(chipValue) {
    return chipValue;
  }

  renderChip(target, value) {
  }

  renderPickerContent(target, value) {
  }

  addChipList(target, title, values, currentValue, renderer) {
    if(!values.length)
      return;
    const section = div(target, 'propertyPickerSection');
    div(section, 'propertyPickerSectionTitle', html(title));
    const list = div(section, 'propertyPickerChips');
    for(const value of values) {
      const chip = renderer(value, list);
      chip.dataset.value = value;
      chip.classList.toggle('selected', String(value) == this.chipMatchValue(currentValue));
      chip.onclick = _=>this.setValue(this.valueForChip(value));
      this.decorateChip(chip, value);
    }
    this.decorateChipList(list);
  }

  // a chip that can offer more than the one value it shows (see IconInput)
  decorateChip(chip, value) {
  }

  // and the list they sit in, once all of them are there
  decorateChipList(list) {
  }
}

class ColorInput extends PickerInput {
  cssClass() {
    return 'pickerInput colorInput';
  }

  expandArrow() {
    return false;
  }

  dimDefault() {
    return false;
  }

  previewTitle() {
    return null;
  }

  renderChip(target, value) {
    return renderColorChip(propertyInputValueSet(value) ? value : 'transparent', target);
  }

  renderSummaryControls(target, value) {
    const shown = propertyInputValueSet(value) ? value : this.getEffectiveValue();
    const hexValue = toHex(propertyInputValueSet(shown) ? shown : (this.options.default || '#000000'));

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.title = 'Open the color dialog';
    colorPicker.value = hexValue;
    // some browsers (Firefox on some platforms) only fire "change" when the
    // native dialog closes, so listen to both events
    colorPicker.onchange = colorPicker.oninput = _=>{
      this.setValue(colorPicker.value);
      if(hexInput && document.activeElement !== hexInput)
        hexInput.value = colorPicker.value;
    };
    target.appendChild(colorPicker);

    // let the value be typed in as a hex string too
    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'colorHexInput';
    hexInput.placeholder = '#rrggbb or transparent';
    hexInput.value = propertyInputValueSet(value) ? value : '';
    hexInput.oninput = _=>{
      const v = hexInput.value.trim();
      if(v == 'transparent' || v.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)) {
        hexInput.classList.remove('inputError');
        this.setValue(v);
        colorPicker.value = toHex(v);
      } else if(v === '') {
        hexInput.classList.remove('inputError');
        this.setValue(null);
      } else {
        hexInput.classList.add('inputError');
      }
    };
    target.appendChild(hexInput);
  }

  // Updates the summary in place: rebuilding it (like the base class does)
  // would detach the native color input while its dialog is open, so later
  // picks in the still-open dialog would be lost.
  refreshPicker(value) {
    if(propertyInputIsMulti(value)) {
      if(this.summaryDOM) {
        this.summaryDOM.innerHTML = '';
        this.renderSummary(this.summaryDOM, value);
      }
      return;
    }
    if(this.summaryDOM) {
      const shown = propertyInputValueSet(value) ? value : this.getEffectiveValue();
      const chip = this.summaryDOM.querySelector('.propertyValueChip');
      if(chip) {
        const newChip = renderColorChip(propertyInputValueSet(shown) ? shown : 'transparent', this.summaryDOM);
        this.summaryDOM.insertBefore(newChip, chip);
        chip.remove();
      }
      const valueText = this.summaryDOM.querySelector('.propertyPickerValueText');
      if(valueText)
        valueText.textContent = propertyInputValueSet(value) ? String(value) : (propertyInputValueSet(shown) ? String(shown) : 'not set');
      const colorPicker = this.summaryDOM.querySelector('input[type=color]');
      if(colorPicker && document.activeElement !== colorPicker && propertyInputValueSet(shown) && String(shown).match(/^#/))
        colorPicker.value = toHex(shown);
      const hexInput = this.summaryDOM.querySelector('.colorHexInput');
      if(hexInput && document.activeElement !== hexInput)
        hexInput.value = propertyInputValueSet(value) ? value : '';
    }
    for(const chip of $a('.propertyValueChip', this.pickerDOM))
      if(chip.dataset.value !== undefined)
        chip.classList.toggle('selected', chip.dataset.value == this.chipMatchValue(value));
    if(this.footerDOM)
      this.renderFooter(value);
  }

  renderPickerContent(target, value) {
    this.addChipList(target, 'Used in this game', usedGameColors(), value, renderColorChip);
    this.addChipList(target, 'Palette (checkerboard = transparent)', propertyInputPalette, value, renderColorChip);
  }
}

// An icon property value can be a plain string (icon name) or a symbol object
// like { name, scale, color, ... } (see generateSymbolsDiv in symbols.js) -
// these helpers read/write that object form without disturbing a plain string
// value unless a basic option is actually used.
function iconObjectValue(value) {
  return value && typeof value == 'object' && !Array.isArray(value) ? value : null;
}

function iconName(value) {
  const object = iconObjectValue(value);
  return object ? object.name : value;
}

function iconOption(value, key) {
  const object = iconObjectValue(value);
  return object ? object[key] : undefined;
}

function iconWithOption(value, key, optionValue) {
  const object = Object.assign({}, iconObjectValue(value), { name: iconName(value) });
  if(optionValue === null || optionValue === undefined || optionValue === '')
    delete object[key];
  else
    object[key] = optionValue;
  // collapse back to a plain string once no basic option is set, so simple
  // icons round-trip exactly like before this feature existed
  const keys = Object.keys(object).filter(k => k != 'name');
  return keys.length ? object : (object.name || null);
}

// color/scale attach to a single chosen glyph - a multi-icon combo (array) or
// an unset icon has nothing to attach them to (and doing so anyway would
// create a bogus { name: null, ... } icon value)
function iconSupportsBasicOptions(value) {
  return !Array.isArray(value) && !!iconName(value);
}

// clicking a chip merges the new name into the current value - but a
// multi-selection sentinel (differing icons) must count as "unset", or the
// internal { multiDiffers: true } marker would be saved into every widget
function iconValueForChip(currentValue, chipValue) {
  return iconWithOption(propertyInputIsMulti(currentValue) ? null : currentValue, 'name', chipValue);
}

class IconInput extends PickerInput {
  cssClass() {
    return 'pickerInput iconInput';
  }

  expandArrow() {
    return false;
  }

  renderChip(target, value) {
    if(propertyInputValueSet(value))
      return renderIconChip(value, target);
    return this.renderEmptyChip(target);
  }

  // an icon value can be the object form ({name, color, scale, ...}) or an
  // array of icons (combos) - show the name(s) instead of "[object Object]"
  summaryValueText(value) {
    if(Array.isArray(value))
      return value.map(v => iconName(v) || '').join(', ');
    return iconName(value) || '';
  }

  // match/select chips by icon name so the object form (with color/scale set)
  // still highlights the right chip, and clicking a chip merges the new name
  // into the current value instead of discarding its color/scale
  chipMatchValue(value) {
    return Array.isArray(value) ? '' : (iconName(value) || '');
  }

  valueForChip(chipValue) {
    return iconValueForChip(this.getValue(), chipValue);
  }

  // the icon list has one entry per emoji, but most of the people ones also have skin tone forms:
  // mark those chips and let their flyout pick one (client/js/emojivariants.js)
  decorateChip(chip, value) {
    const icon = iconName(value);
    if(iconValueType(icon) == 'emoji-color')
      chip.dataset.emojiVariant = icon;
  }

  decorateChipList(list) {
    enableEmojiVariantFlyouts(list, {
      selector: '[data-emoji-variant]',
      emoji: chip=>chip.dataset.emojiVariant,
      onPick: (chip, variant)=>this.setValue(this.valueForChip(variant)),
      label: (chip, base)=>iconDisplayName(base)
    });
  }

  emptyLabel() {
    return this.options.emptyLabel || 'Choose icon';
  }

  // Inline options (color, scale) for the icon actually selected - stored on
  // the icon value itself (as its object form) rather than as separate widget
  // properties, since the underlying icon rendering already supports that
  // form (see generateSymbolsDiv). Rendered persistently in the Content
  // section (properties.js) rather than inside the transient picker popout,
  // so they stay visible after picking an icon instead of disappearing once
  // the popout closes or the widget is reselected.
  // pickerGroup is shared with the icon/image pickers above (rendered at the
  // full width of the Content row) rather than a group of its own confined to
  // this narrow inline-options column, so its popout is not squeezed into a
  // narrow band - https://github.com/ArnoldSmith86/virtualtabletop/pull/3049
  renderIconOptionControls(target, value, pickerGroup) {
    const row = div(target, 'iconBasicOptionsRow colorFlexRow');

    // same chip + hex-field control as the Colors subsection of Appearance -
    // clearing the hex field already resets to the widget's default color, so
    // no separate reset button is needed here either
    const defaultColor = typeof this.widget.getDefaultIconColor == 'function' ? this.widget.getDefaultIconColor() : null;
    new ColorInput(this.module, this.widget, 'Color', {
      getValue: _=>iconOption(this.getValue(), 'color'),
      setValue: v=>this.setValue(iconWithOption(this.getValue(), 'color', v)),
      listenTo: [ this.options.property ],
      default: defaultColor || '#000000',
      pickerGroup: pickerGroup || { target: div(target, 'contentMediaPickers'), current: null }
    }).render(row);

    const scaleWrap = div(row, 'iconBasicOption');
    const scaleLabel = document.createElement('label');
    scaleLabel.textContent = 'Scale';
    scaleWrap.appendChild(scaleLabel);
    // this scale is the per-symbol scale from generateSymbolsDiv (symbols.js),
    // which always defaults to 1 - it's independent of the widget-level
    // getDefaultIconScale() (applied separately as the whole symbol wrapper's
    // transform), so that isn't the right fallback to show here.
    const scaleValue = iconOption(value, 'scale');
    const scaleIsSet = scaleValue !== undefined && scaleValue !== null;
    const scaleInput = document.createElement('input');
    scaleInput.type = 'number';
    scaleInput.step = '0.05';
    scaleInput.min = '0.1';
    scaleInput.max = '5';
    // always show a real number (never leave it empty) so stepping with the
    // up/down arrows starts from the displayed value (1 by default) instead
    // of from the browser's own zero-based default, which used to clamp the
    // very first step up to the min (0.1) rather than 1.05
    scaleInput.title = scaleIsSet ? 'Icon scale' : 'Icon scale (using default 1)';
    scaleInput.value = scaleIsSet ? scaleValue : 1;
    scaleWrap.classList.toggle('usingDefault', !scaleIsSet);
    scaleInput.oninput = _=>{
      // the focus guard in the properties module skips the re-render while
      // focus stays in this block, so keep the default-indicator in sync here
      scaleWrap.classList.remove('usingDefault');
      scaleInput.title = 'Icon scale';
      this.setValue(iconWithOption(this.getValue(), 'scale', numericInputValue(scaleInput.value, 0.1, 5)));
    };
    scaleInput.onchange = _=>{
      const clamped = numericInputValue(scaleInput.value, 0.1, 5);
      scaleInput.value = clamped === null ? 1 : clamped;
    };
    scaleWrap.appendChild(scaleInput);
  }

  renderPickerContent(target, value) {
    this.addChipList(target, 'Used in this game', usedGameIcons(), value, renderIconChip);

    const searchSection = div(target, 'propertyPickerSection');
    const search = document.createElement('input');
    // the same placeholder as the symbol picker of the JSON editor: both search the tags that say
    // what an icon shows, which nothing told the user about while they named three file names
    search.placeholder = iconSearchPlaceholder;
    searchSection.appendChild(search);
    const enabledTypes = new Set(iconPickerTypes.map(({ type }) => type));

    // one chip of the result list: a searched icon, or - behind it - one of its skin tone forms,
    // which is a result of the list like any other and is picked the same way
    const resultChip = (iconValue, target, description)=>{
      const chip = renderIconChip(iconValue, target);
      chip.dataset.value = iconValue;
      if(description) {
        chip.title = `${iconValue} (${description})`;
      } else {
        // the tooltip was the bare "delapouite/first-aid-kit": add what the icon is tagged with,
        // which is the only place the words the search understands are visible (same in the
        // symbol picker of the JSON editor, see client/js/symbols.js)
        const searchEntry = iconSearchIndexByValue.get(String(iconValue));
        if(searchEntry)
          chip.title = `${chip.title}\n${iconSearchTagText(searchEntry)}`;
      }
      chip.classList.toggle('selected', String(iconValue) == this.chipMatchValue(this.getValue()));
      chip.onclick = _=>this.setValue(this.valueForChip(iconValue));
      return chip;
    };

    const showResults = (values, total=values.length)=>{
      results.innerHTML = '';
      resultCount.textContent = total > values.length ? `${total} icons match, showing the first ${values.length}` : '';
      for(const iconValue of values)
        this.decorateChip(resultChip(iconValue, results), iconValue);
      this.decorateChipList(results);
      // A search that has already narrowed the picker down to a handful of icons should not make
      // each of them be hovered again to find out what it offers, so the toned forms go into the
      // list itself, right behind the icon they belong to (the same as the "Pick icon" overlay
      // does, see symbols.js). They count towards the number of icons the search shows, so the
      // list never gets longer than it may be - and a search that is cut off at that number has
      // more to show anyway, which is not a result worth expanding.
      expandEmojiVariants(results, search.value.trim() ? $a('[data-emoji-variant]', results) : [], {
        emoji: chip=>chip.dataset.emojiVariant,
        create: (chip, variant, description)=>resultChip(variant, null, description),
        budget: iconPickerResultLimit - values.length
      });
      if(!values.length)
        div(results, 'propertyPickerEmpty', `No results. ${iconSearchNoResultsHint}`);
    };

    const frequentlyUsed = _=>[...new Set(usedGameIcons().concat(topUsedLibraryIcons))]
      .filter(icon => iconTypeEnabled(icon, enabledTypes))
      .slice(0, iconPickerResultLimit);
    const updateResults = async _=>{
      const query = search.value.trim();
      if(query && !iconSearchIndex) {
        // the index is a half-megabyte fetch: say so instead of leaving the frequently-used icons up, which
        // look like the (wrong) answer to what was just typed
        results.innerHTML = '';
        div(results, 'propertyPickerEmpty', 'Loading icons…');
        resultCount.textContent = '';
        await loadIconSearchIndex().catch(_=>null);
        if(search.value.trim() != query)
          return; // the user kept typing while it loaded - that keystroke's own update is in charge now
        if(!iconSearchIndex) {
          // the fetch failed - "No results." would blame the query for it
          results.innerHTML = '';
          div(results, 'propertyPickerEmpty', 'Could not load the icon list.');
          return;
        }
      }
      if(!query)
        return showResults(frequentlyUsed());
      const { total, values } = searchIconIndex(query, iconPickerResultLimit, enabledTypes);
      showResults(values, total);
    };

    const typeToggles = div(searchSection, 'iconPickerFilterChips');
    div(typeToggles, 'iconPickerFilterTitle', 'Libraries:');
    for(const iconType of iconPickerTypes) {
      const toggle = document.createElement('label');
      toggle.className = 'iconPickerFilterChip';
      toggle.title = iconType.title;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.title = iconType.title;
      checkbox.onchange = _=>{
        if(checkbox.checked)
          enabledTypes.add(iconType.type);
        else
          enabledTypes.delete(iconType.type);
        updateResults();
      };
      toggle.appendChild(checkbox);
      toggle.append(iconType.label);
      typeToggles.appendChild(toggle);
    }

    const resultCount = div(searchSection, 'propertyPickerCount');
    const results = div(searchSection, 'propertyPickerChips');
    showResults(frequentlyUsed());

    const showAll = document.createElement('button');
    showAll.setAttribute('icon', 'apps');
    showAll.textContent = 'Show all';
    showAll.onclick = async _=>{
      const symbol = await pickSymbolKeepingOverlay(showAll);
      if(symbol)
        this.setValue(this.valueForChip(symbol.symbol));
    };
    searchSection.appendChild(showAll);

    search.oninput = updateResults;
    loadIconSearchIndex().catch(_=>null);
    // which emoji have toned forms comes from a list of its own, fetched next to the icon index -
    // a search that ran before it arrived puts them in as soon as it does
    loadEmojiVariants().then(_=>{
      if(search.value.trim())
        updateResults();
    }, _=>null);
  }
}

class ImageInput extends PickerInput {
  cssClass() {
    return 'pickerInput imageInput';
  }

  expandArrow() {
    return false;
  }

  renderChip(target, value) {
    if(propertyInputValueSet(value))
      return renderImageChip(value, target);
    return this.renderEmptyChip(target);
  }

  emptyLabel() {
    return this.options.emptyLabel || 'Choose image';
  }

  renderPickerContent(target, value) {
    this.addChipList(target, 'Used in this game', usedGameImages(), value, renderImageChip);
    this.addChipList(target, 'Game pieces', builtinGamePieceImages, value, renderImageChip);

    const searchSection = div(target, 'propertyPickerSection');
    const search = document.createElement('input');
    search.placeholder = 'Search images by name or by what they show...';
    searchSection.appendChild(search);
    const resultCount = div(searchSection, 'propertyPickerCount');
    const results = div(searchSection, 'propertyPickerChips');

    const showResults = (values, total=values.length)=>{
      results.innerHTML = '';
      resultCount.textContent = total > values.length ? `${total} images match, showing the first ${values.length}` : '';
      for(const imageValue of values) {
        const chip = renderImageChip(imageValue, results);
        chip.dataset.value = imageValue;
        chip.classList.toggle('selected', imageValue == this.getValue());
        chip.onclick = _=>this.setValue(imageValue);
      }
      if(!values.length)
        div(results, 'propertyPickerEmpty', `No results. ${iconSearchNoResultsHint}`);
    };

    // default (empty-search) results: a sample of commonly used library images instead of repeating the
    // "Used in this game"/"Game pieces" sections already shown above
    const frequentlyUsed = topUsedLibraryIcons.map(imageURLFromSymbol);
    showResults(frequentlyUsed);

    const showAll = document.createElement('button');
    showAll.setAttribute('icon', 'apps');
    showAll.textContent = 'Show all';
    showAll.onclick = async _=>{
      const symbol = await pickSymbolKeepingOverlay(showAll, 'images');
      if(symbol)
        this.setValue(symbol.url);
    };
    searchSection.appendChild(showAll);

    search.oninput = async _=>{
      const query = search.value.trim();
      if(query && !iconSearchIndex) {
        results.innerHTML = '';
        div(results, 'propertyPickerEmpty', 'Loading icons…');
        resultCount.textContent = '';
        await loadIconSearchIndex().catch(_=>null);
        if(search.value.trim() != query)
          return; // the user kept typing while it loaded - that keystroke's own update is in charge now
        if(!iconSearchIndex) {
          results.innerHTML = '';
          div(results, 'propertyPickerEmpty', 'Could not load the icon list.');
          return;
        }
      }
      if(!query)
        return showResults(frequentlyUsed);
      const { total, values } = searchImageIndex(query);
      showResults(values, total);
    };
    loadIconSearchIndex().catch(_=>null);

    const section = div(target, 'propertyPickerSection');
    const upload = document.createElement('button');
    upload.setAttribute('icon', 'upload');
    upload.textContent = 'Upload image...';
    upload.onclick = async _=>{
      const asset = await uploadAsset();
      if(asset)
        this.setValue(asset);
    };
    section.appendChild(upload);

    const urlInput = document.createElement('input');
    urlInput.placeholder = 'or enter an image URL / path';
    urlInput.value = propertyInputValueSet(value) ? value : '';
    urlInput.onchange = _=>this.setValue(urlInput.value || null);
    section.appendChild(urlInput);
  }
}

// The file name of a sound path without its directories and extension: that is
// what the sound picker lists and the only part of "/i/audio/casino/dice-throw-1.mp3"
// that says anything, so it is what the chip and the summary show.
function soundName(value) {
  return String(value).replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');
}

// One sound looks exactly like the next, so the chip names the file instead of
// only showing a speaker - that is what the collapsed row has to identify it by.
function renderSoundChip(value, target) {
  const chip = div(target, 'propertyValueChip propertySoundChip');
  chip.title = value;
  div(chip, 'material-symbols', 'volume_up');
  div(chip, 'propertySoundName', html(soundName(value)));
  return chip;
}

// One preview plays at a time, so starting another one (or clicking the button
// of the running one again) stops it. Mirrors the sound picker's own preview.
let soundPreview = null;
function stopSoundPreview() {
  if(!soundPreview)
    return;
  soundPreview.audio.pause();
  soundPreview.button.setAttribute('icon', 'play_arrow');
  soundPreview = null;
}

function toggleSoundPreview(value, button) {
  const wasThisButton = soundPreview && soundPreview.button == button;
  stopSoundPreview();
  if(wasThisButton)
    return;
  const audio = new Audio(mapAssetURLs(value));
  soundPreview = { audio, button };
  button.setAttribute('icon', 'stop');
  audio.onended = _=>{
    if(soundPreview && soundPreview.button == button)
      stopSoundPreview();
  };
  audio.play().catch(_=>{});
}

// A sound is a plain asset path, so unlike an image there is nothing to preview
// visually: the chip is a speaker, the summary names the file and offers to play
// it, and the picker is only about getting a path in - from the bundled sound
// library (see audio.js), from an upload, or typed.
class SoundInput extends PickerInput {
  cssClass() {
    return 'pickerInput soundInput';
  }

  expandArrow() {
    return false;
  }

  renderChip(target, value) {
    if(propertyInputValueSet(value))
      return renderSoundChip(value, target);
    return this.renderEmptyChip(target);
  }

  emptyLabel() {
    return this.options.emptyLabel || 'Choose sound';
  }

  // the play button lives in the picker, so closing it would leave a preview
  // running with nothing left to stop it
  closePicker() {
    stopSoundPreview();
    super.closePicker();
  }

  renderSummaryControls(target, value) {
    const shown = propertyInputValueSet(value) ? value : this.getEffectiveValue();
    if(!propertyInputValueSet(shown))
      return;
    const play = document.createElement('button');
    play.setAttribute('icon', 'play_arrow');
    play.title = 'Play the sound';
    play.onclick = _=>toggleSoundPreview(shown, play);
    target.appendChild(play);
  }

  renderPickerContent(target, value) {
    const section = div(target, 'propertyPickerSection');

    const browse = document.createElement('button');
    browse.setAttribute('icon', 'library_music');
    browse.textContent = 'Sound library...';
    browse.onclick = async _=>{
      // the library is an overlay of its own and the running preview would keep
      // playing underneath it
      stopSoundPreview();
      const sound = await pickAudio();
      if(sound)
        this.setValue(sound);
    };
    section.appendChild(browse);

    const upload = document.createElement('button');
    upload.setAttribute('icon', 'upload');
    upload.textContent = 'Upload sound...';
    upload.onclick = async _=>{
      const asset = await uploadAsset();
      if(asset)
        this.setValue(asset);
    };
    section.appendChild(upload);

    const urlInput = document.createElement('input');
    urlInput.placeholder = 'or enter an audio URL / path';
    urlInput.value = propertyInputValueSet(value) ? value : '';
    urlInput.onchange = _=>this.setValue(urlInput.value || null);
    section.appendChild(urlInput);
  }
}

// options for inputs that edit a single declaration inside a css-like
// property (through the parse/merge helpers in properties.js) so ColorInput
// and NumberInput can edit e.g. the "color" declaration of the css property
// Resolves a css color expression (e.g. "var(--wcMain)") to the actual color
// it renders as, by measuring it on a throwaway element in the widget's
// context so var() chains and inherited custom properties are fully applied.
function resolveCssColorExpression(host, expression) {
  const probe = document.createElement('span');
  probe.style.color = expression;
  if(!probe.style.color) // the browser rejected the expression
    return null;
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  (host || document.body).appendChild(probe);
  let resolved = (getComputedStyle(probe).color || '').trim();
  probe.remove();
  if(resolved == 'rgba(0, 0, 0, 0)')
    return 'transparent';
  return resolved || null;
}

// Reads the value a css declaration/custom-property currently resolves to on
// a rendered element, so a picker whose value is not explicitly set can still
// preview the widget's actual default (e.g. a timer's default text color)
// instead of showing "not set".
function computedCssValue(element, key) {
  if(!element)
    return null;
  // custom properties are only substituted when actually used, so resolve
  // them through a probe rather than reading the (possibly var()) declaration
  if(key.startsWith('--'))
    return resolveCssColorExpression(element, `var(${key})`);
  const style = getComputedStyle(element);
  // shorthands don't resolve to a single value: read a representative longhand
  const readKey = key == 'background' ? 'background-color' : (key == 'border-color' ? 'border-top-color' : key);
  let value = (style.getPropertyValue(readKey) || '').trim();
  if(value == 'rgba(0, 0, 0, 0)')
    return 'transparent';
  return value || null;
}

function cssValueOptions(module, widget, key, cssProperty='css', cssClass='default', extraOptions={}) {
  // a css string/object is per-widget, so a multi-selection reads/writes
  // through each selected widget's own options instead of merging blobs
  // (which would clobber unrelated declarations on the other widgets)
  if(widget.isMulti) {
    const perWidget = widget.widgets.map(w=>cssValueOptions(module, w, key, cssProperty, cssClass, extraOptions));
    return Object.assign({
      getValue: _=>{
        const values = perWidget.map(o=>o.getValue());
        return values.every(v=>JSON.stringify(v) === JSON.stringify(values[0])) ? values[0] : MULTI_DIFFERENT;
      },
      getEffective: _=>{
        const values = perWidget.map(o=>o.getEffective());
        return values.every(v=>JSON.stringify(v) === JSON.stringify(values[0])) ? values[0] : MULTI_DIFFERENT;
      },
      setValue: v=>{
        batchStart();
        try {
          for(const o of perWidget)
            o.setValue(v);
        } finally {
          batchEnd();
        }
      },
      listenTo: [ cssProperty ]
    }, extraOptions);
  }

  let warned = false;
  // element the declaration actually renders on, used to preview the effective
  // default when nothing is explicitly set
  const effectiveElement = _=>{
    if(extraOptions.effectiveSelector && widget.domElement)
      return widget.domElement.querySelector(extraOptions.effectiveSelector);
    return widget.domElement;
  };
  return Object.assign({
    getValue: _=>parsePropertyFromCSS(widget.get(cssProperty), key, null, cssClass),
    getEffective: _=>{
      const raw = parsePropertyFromCSS(widget.get(cssProperty), key, null, cssClass);
      if(propertyInputValueSet(raw))
        return raw;
      return computedCssValue(effectiveElement(), key);
    },
    setValue: v=>{
      const css = widget.get(cssProperty);
      // mergePropertyFromCSS refuses strings it cannot parse without losing
      // data - tell the user instead of silently doing nothing
      if(typeof css == 'string' && css.trim() && !cssStringRoundTrips(css)) {
        if(!warned) {
          warned = true;
          alert(`The ${cssProperty} property of this widget contains text this input cannot safely modify. Please edit it in the CSS section instead.`);
        }
        return;
      }
      module.inputValueUpdated(widget, cssProperty, mergePropertyFromCSS(css, key, v, cssClass));
      if(widget.applyDeltaToDOM)
        widget.applyDeltaToDOM({ [cssProperty]: widget.get(cssProperty) });
    },
    listenTo: [ cssProperty ]
  }, extraOptions);
}

// Dual-mode options for color properties that map to a css custom property
// (like the button's backgroundColor -> --wcMain): edit the widget property
// when it is explicitly set, otherwise read/write the equivalent declaration
// inside the css property.
function propertyOrCssOptions(module, widget, property, cssKey, extraOptions={}) {
  const propertySet = _=>widget.state[property] !== undefined && widget.state[property] !== null;
  const cssOptions = cssValueOptions(module, widget, cssKey);
  return Object.assign({
    getValue: _=>propertySet() ? widget.state[property] : cssOptions.getValue(),
    getEffective: _=>{
      if(propertySet())
        return widget.get(property);
      const cssValue = cssOptions.getValue();
      if(propertyInputValueSet(cssValue))
        return cssValue;
      const defaultValue = widget.get(property);
      if(propertyInputValueSet(defaultValue))
        return defaultValue;
      // nothing explicit: preview the color the custom property renders as
      // (e.g. a fresh button's --wcMain / --wcMainOH resolved through :root)
      return computedCssValue(widget.domElement, cssKey);
    },
    setValue: v=>{
      if(propertySet())
        module.inputValueUpdated(widget, property, v);
      else
        cssOptions.setValue(v);
    },
    listenTo: [ property, 'css' ]
  }, extraOptions);
}
