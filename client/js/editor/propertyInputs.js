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

// Walks the state of all widgets and calls callback(key, value) for every string value.
function forEachStringInGameState(callback) {
  function walk(obj) {
    for(const [ key, value ] of Object.entries(obj)) {
      if(typeof value == 'string')
        callback(key, value);
      else if(typeof value == 'object' && value !== null)
        walk(value);
    }
  }
  for(const widget of widgets.values())
    walk(widget.state);
}

function usedValuesInGame(callback) {
  const counts = {};
  forEachStringInGameState((key, value)=>{
    const match = callback(key, value);
    if(match)
      counts[match] = (counts[match] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b)=>b[1]-a[1]).map(e=>e[0]);
}

function usedGameColors() {
  return usedValuesInGame((key, value)=>value == 'transparent' || value.match(/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$|^(?:rgb|hsl)a?\(.*\)$/) ? value : null);
}

function usedGameIcons() {
  return usedValuesInGame((key, value)=>{
    // game-icons paths are unambiguous enough under any icon-ish key
    // (icon properties, deck suits, symbol lists, face template values)
    if(value.match(/^[a-z0-9-]+\/[a-z0-9-]+$/) && [ 'icon', 'suit', 'name', 'value' ].indexOf(key) != -1)
      return value;
    if(key != 'icon')
      return null;
    // all other formats getIconDetails accepts for the icon property
    if(value.match(/^[a-z][a-z0-9_]+(_NOFILL)?$/) || value.match(/^\[.*\]$|^\(.*\)$/) || value.match(/^\/assets\/|^https?:\/\//))
      return value;
    if(value && !value.match(/^[\x00-\x7F]*$/)) // non-ASCII: emoji icons
      return value;
    return null;
  });
}

function usedGameImages() {
  return usedValuesInGame((key, value)=>{
    const match = value.match(/^(?:\/(?:assets\/-?[0-9]+_[0-9]+|i\/[^\s"']+\.(?:svg|png|jpe?g|webp|gif))|https?:\/\/[^\s"']+)$/);
    return match ? value : null;
  });
}

// Renders a small preview for an icon property value (same formats as getIconDetails).
function renderIconChip(value, target) {
  const chip = div(target, 'propertyValueChip');
  chip.title = value;
  if(value.match(/^\/assets\/|^https?:\/\//)) {
    chip.innerHTML = `<img src="${html(mapAssetURLs(value))}">`;
  } else if(value.match(/\//)) {
    chip.innerHTML = `<img src="${html(`i/game-icons.net/${value}.svg`)}">`;
  } else if(value.match(/^\[/)) {
    div(chip, 'symbols', html(value));
  } else if(value.match(/^[a-z0-9].*_NOFILL$/)) {
    div(chip, 'material-symbols-nofill', html(value.replace(/_NOFILL$/, '')));
  } else if(value.match(/^[a-z0-9]/)) {
    div(chip, 'material-symbols', html(value));
  } else if(value.match(/^\(.*\)$/)) {
    div(chip, 'emoji-monochrome', html(toNotoMonochrome(value.replace(/^\((.*)\)$/, '$1'))));
  } else {
    div(chip, 'emojiColorChip', html(value)); // raw emoji: native color rendering
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
  chip.title = value;
  chip.style.setProperty('--chipColor', value);
  return chip;
}

// Flat searchable index over i/fonts/symbols.json, loaded on first use.
let iconSearchIndex = null;
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
            index.push({ value: symbol, keywords: `${symbol.split('/')[1]},${keywords.join()}`.toLowerCase(), image: true });
          } else {
            const hasNoFillVariant = symbol.match(/ \(FILL\+NOFILL\)$/);
            symbol = symbol.replace(/ \(FILL\+NOFILL\)$/, '');
            const allKeywords = `${symbol},${keywords.join()}`.toLowerCase();
            if(symbol.match(/^\[/) || symbol.match(/^[a-z0-9_]+$/)) {
              index.push({ value: symbol, keywords: allKeywords, image: false }); // VTT/material symbol font
              if(hasNoFillVariant)
                index.push({ value: `${symbol}_NOFILL`, keywords: allKeywords, image: false });
            } else {
              // emoji: offer both the color image and the monochrome font variant
              index.push({ value: symbol, keywords: allKeywords, image: true });
              if(!skipForNotoMonochrome(symbol))
                index.push({ value: `(${symbol})`, keywords: allKeywords, image: false });
            }
          }
        }
      }
      iconSearchIndex = index;
      return index;
    })();
    iconSearchIndexPromise.catch(_=>iconSearchIndexPromise = null); // allow retrying after a failed fetch
  }
  return iconSearchIndexPromise;
}

// Interleave font-style and image-style matches so both are represented in the
// top results even when one kind (usually game-icons) dominates the matches.
function searchIconIndex(query, limit=42) {
  const terms = query.toLowerCase().split(/\s+/).filter(t=>t);
  const fonts = [];
  const images = [];
  for(const entry of iconSearchIndex || []) {
    if(terms.every(term=>entry.keywords.includes(term)))
      (entry.image ? images : fonts).push(entry.value);
  }
  const results = [];
  for(let i=0; results.length < limit && (i < fonts.length || i < images.length); i++) {
    if(i < fonts.length)  results.push(fonts[i]);
    if(i < images.length) results.push(images[i]);
  }
  return results.slice(0, limit);
}

// Info button (design from the routine editor in PR #2439): a small "i" icon
// that opens a dismissable popup with an explanation. The popup closes with
// its close button, a click outside of it or Escape.
function infoButton(appendTo, infoHTML) {
  const dom = div(appendTo, 'info-button', `<span class=material-symbols>info</span>`);
  dom.addEventListener('click', e=>{
    e.stopPropagation();
    const popup = div($('#editor'), 'inline-popup', `<button class=popup-close icon=close title=Close></button><div class=content></div>`);
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
      document.removeEventListener('click', onOutsideClick);
      document.removeEventListener('keydown', onKeyDown, true);
      popup.remove();
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
    $('.popup-close', popup).onclick = close;
    document.addEventListener('keydown', onKeyDown, true);
    // defer so the click that opened the popup doesn't immediately close it
    setTimeout(_=>document.addEventListener('click', onOutsideClick), 0);
  });
  return dom;
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
    const value = this.widget.get(this.options.property);
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
        icon.className = 'material-symbols labelIcon';
        icon.textContent = this.options.labelIcon;
        label.appendChild(icon);
        label.title = this.labelText;
        label.classList.add('iconOnly');
      } else {
        label.textContent = this.labelText;
      }
      if(this.options.hint)
        infoButton(label, html(this.options.hint));
      this.dom.appendChild(label);
    } else if(this.options.hint) {
      infoButton(this.dom, html(this.options.hint));
    }
    this.renderControl(this.dom);
    for(const property of this.listenProperties())
      this.module.addPropertyListener(this.widget, property, _=>this.update(this.getValue()));
    return this.dom;
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
    return this.options.multiline ? 'textInput multiline' : 'textInput';
  }

  renderControl(target) {
    this.input = document.createElement(this.options.multiline ? 'textarea' : 'input');
    if(this.options.placeholder)
      this.input.placeholder = this.options.placeholder;
    this.input.oninput = _=>{
      const value = this.input.value;
      this.setValue(value === '' && this.options.nullIfEmpty ? null : value);
    };
    target.appendChild(this.input);
  }

  update(value) {
    if(document.activeElement !== this.input)
      this.input.value = value === null ? '' : value;
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
    const value = +rawValue;
    if(Number.isFinite(value)) {
      this.setValue(value);
      if(this.slider && document.activeElement !== this.slider)
        this.slider.value = value;
      if(document.activeElement !== this.input)
        this.input.value = value;
    }
  }

  update(value) {
    const numeric = typeof value == 'number' ? value : +value || 0;
    if(document.activeElement !== this.input)
      this.input.value = value === null ? '' : numeric;
    if(this.slider && document.activeElement !== this.slider)
      this.slider.value = numeric;
  }
}

// Accepts either a number (editable by text or slider) or a CSS-like string.
// The slider is disabled while a string value such as "50%" is in use.
class NumberOrTextInput extends PropertyInput {
  cssClass() {
    return 'numberInput numberOrTextInput';
  }

  renderControl(target) {
    this.input = document.createElement('input');
    this.input.type = 'text';
    if(this.options.placeholder !== undefined) this.input.placeholder = this.options.placeholder;
    this.input.oninput = _=>this.setValue(propertyInputNumberOrText(this.input.value, this.options.nullIfEmpty));
    target.appendChild(this.input);

    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.min = this.options.min !== undefined ? this.options.min : 0;
    this.slider.max = this.options.max !== undefined ? this.options.max : 100;
    this.slider.step = this.options.step !== undefined ? this.options.step : 1;
    this.slider.oninput = _=>this.setValue(+this.slider.value);
    target.appendChild(this.slider);
  }

  update(value) {
    const numeric = typeof value == 'number' && Number.isFinite(value);
    this.input.placeholder = this.options.placeholder || 'e.g. 8, 8px, 50%';
    if(document.activeElement !== this.input)
      this.input.value = value === null ? '' : value;
    this.slider.disabled = !numeric;
    if(numeric && document.activeElement !== this.slider)
      this.slider.value = value;
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
    this.input.id = `propertyCheckbox_${rand().toString(36).substring(3, 12)}`;
    this.input.onchange = _=>this.setValue(this.options.invert ? !this.input.checked : this.input.checked);
    target.appendChild(this.input);

    const box = document.createElement('label');
    box.className = 'switchbox';
    box.htmlFor = this.input.id;
    target.appendChild(box);
  }

  update(value) {
    const boolValue = value === null ? !!this.options.default : !!value;
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
    if(this.options.getEffective)
      return this.options.getEffective();
    if(this.options.getValue)
      return this.options.getValue();
    const value = this.widget.get(this.options.property);
    return value === undefined ? null : value;
  }

  previewValue() {
    const raw = this.getValue();
    return propertyInputValueSet(raw) ? raw : this.getEffectiveValue();
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
    this.previewButton.innerHTML = '';
    this.renderChip(this.previewButton, this.previewValue());
    this.previewButton.classList.toggle('usingDefault', this.dimDefault() && !propertyInputValueSet(this.getValue()));
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
        chip.classList.toggle('selected', chip.dataset.value == String(value));
    if(this.footerDOM)
      this.renderFooter(value);
  }

  renderSummary(target, value) {
    const isSet = propertyInputValueSet(value);
    this.renderChip(target, this.previewValue());
    this.renderSummaryControls(target, value);
    if(isSet)
      div(target, 'propertyPickerValueText', html(String(value)));
    else if(propertyInputValueSet(this.getEffectiveValue()))
      div(target, `propertyPickerValueText${this.dimDefault() ? ' usingDefault' : ''}`, this.dimDefault() ? `default: ${html(String(this.getEffectiveValue()))}` : html(String(this.getEffectiveValue())));
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
      chip.classList.toggle('selected', value == currentValue);
      chip.onclick = _=>this.setValue(value);
    }
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
        chip.classList.toggle('selected', chip.dataset.value == String(value));
    if(this.footerDOM)
      this.renderFooter(value);
  }

  renderPickerContent(target, value) {
    this.addChipList(target, 'Used in this game', usedGameColors(), value, renderColorChip);
    this.addChipList(target, 'Palette (checkerboard = transparent)', propertyInputPalette, value, renderColorChip);
  }
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
    return div(target, 'propertyValueChip propertyEmptyChip');
  }

  renderPickerContent(target, value) {
    this.addChipList(target, 'Used in this game', usedGameIcons(), value, renderIconChip);

    const searchSection = div(target, 'propertyPickerSection');
    const search = document.createElement('input');
    search.placeholder = 'Search icons...';
    searchSection.appendChild(search);
    const results = div(searchSection, 'propertyPickerChips');

    const showResults = values=>{
      results.innerHTML = '';
      for(const iconValue of values) {
        const chip = renderIconChip(iconValue, results);
        chip.dataset.value = iconValue;
        chip.classList.toggle('selected', iconValue == this.getValue());
        chip.onclick = _=>this.setValue(iconValue);
      }
      if(!values.length)
        div(results, 'propertyPickerEmpty', 'No results.');
    };

    const frequentlyUsed = [...new Set(usedGameIcons().concat(topUsedLibraryIcons))].slice(0, 42);
    showResults(frequentlyUsed);

    search.oninput = async _=>{
      await loadIconSearchIndex().catch(_=>null);
      showResults(search.value.trim() ? searchIconIndex(search.value.trim()) : frequentlyUsed);
    };
    loadIconSearchIndex().catch(_=>null);
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
    return div(target, 'propertyValueChip propertyEmptyChip');
  }

  renderPickerContent(target, value) {
    this.addChipList(target, 'Used in this game', usedGameImages(), value, renderImageChip);
    this.addChipList(target, 'Game pieces', builtinGamePieceImages, value, renderImageChip);

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
  let value = (style.getPropertyValue(key == 'background' ? 'background-color' : key) || '').trim();
  if(value == 'rgba(0, 0, 0, 0)')
    return 'transparent';
  return value || null;
}

function cssValueOptions(module, widget, key, cssProperty='css', cssClass='default', extraOptions={}) {
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
