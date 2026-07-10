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

const propertyInputPalette = [
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
  return usedValuesInGame((key, value)=>value.match(/^#[0-9a-fA-F]{3,8}$|^(?:rgb|hsl)a?\(.*\)$/) ? value : null);
}

function usedGameIcons() {
  return usedValuesInGame((key, value)=>{
    if(key != 'icon' && key != 'suit')
      return null;
    if(value.match(/^[a-z0-9-]+\/[a-z0-9-]+$/))
      return value;
    if(key == 'icon' && (value.match(/^[a-z][a-z0-9_]+(_NOFILL)?$/) || value.match(/^\[.*\]$|^\(.*\)$/)))
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
  } else {
    div(chip, 'emoji-monochrome', html(toNotoMonochrome(value.replace(/^\((.*)\)$/, '$1'))));
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
            index.push({ value: symbol, keywords: `${symbol.split('/')[1]},${keywords.join()}`.toLowerCase() });
          } else {
            const hasNoFillVariant = symbol.match(/ \(FILL\+NOFILL\)$/);
            symbol = symbol.replace(/ \(FILL\+NOFILL\)$/, '');
            const allKeywords = `${symbol},${keywords.join()}`.toLowerCase();
            if(symbol.match(/^\[/) || symbol.match(/^[a-z0-9_]+$/)) {
              index.push({ value: symbol, keywords: allKeywords });
              if(hasNoFillVariant)
                index.push({ value: `${symbol}_NOFILL`, keywords: allKeywords });
            } else if(!skipForNotoMonochrome(symbol)) {
              index.push({ value: `(${symbol})`, keywords: allKeywords }); // monochrome emoji notation
            }
          }
        }
      }
      iconSearchIndex = index;
      return index;
    })();
  }
  return iconSearchIndexPromise;
}

function searchIconIndex(query, limit=42) {
  const terms = query.toLowerCase().split(/\s+/).filter(t=>t);
  const results = [];
  for(const entry of iconSearchIndex || []) {
    if(terms.every(term=>entry.keywords.includes(term))) {
      results.push(entry.value);
      if(results.length >= limit)
        break;
    }
  }
  return results;
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
      label.textContent = this.labelText;
      this.dom.appendChild(label);
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

class CheckboxInput extends PropertyInput {
  cssClass() {
    return 'checkboxInput';
  }

  render(target) {
    const dom = super.render(target);
    // move the checkbox in front of the label
    if(this.labelText)
      dom.insertBefore(this.input, dom.firstChild);
    const label = $('label', dom);
    if(label) {
      label.htmlFor = this.input.id;
      label.onclick = null;
    }
    return dom;
  }

  renderControl(target) {
    this.input = document.createElement('input');
    this.input.type = 'checkbox';
    this.input.id = `propertyCheckbox_${rand().toString(36).substring(3, 12)}`;
    this.input.onchange = _=>this.setValue(this.options.invert ? !this.input.checked : this.input.checked);
    target.appendChild(this.input);
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

  renderControl(target) {
    this.previewButton = document.createElement('button');
    this.previewButton.className = 'propertyPreviewButton';
    this.previewButton.title = 'Click to edit';
    this.previewButton.onclick = _=>this.togglePicker();
    target.appendChild(this.previewButton);

    this.expandButton = document.createElement('button');
    this.expandButton.className = 'propertyExpandButton';
    this.expandButton.setAttribute('icon', 'expand_more');
    this.expandButton.onclick = _=>this.togglePicker();
    target.appendChild(this.expandButton);

    this.pickerDOM = div(target, 'propertyPicker');
    this.pickerDOM.style.display = 'none';
  }

  togglePicker() {
    const open = this.pickerDOM.style.display == 'none';
    this.pickerDOM.style.display = open ? '' : 'none';
    this.expandButton.classList.toggle('open', open);
    if(open)
      this.updatePicker(this.getValue());
  }

  pickerOpen() {
    return this.pickerDOM && this.pickerDOM.style.display != 'none';
  }

  update(value) {
    this.updatePreview(value);
    if(this.pickerOpen())
      this.refreshPicker(value);
  }

  updatePreview(value) {
  }

  updatePicker(value) {
    this.pickerDOM.innerHTML = '';
    this.summaryDOM = div(this.pickerDOM, 'propertyPickerSummary');
    this.renderSummary(this.summaryDOM, value);
    this.renderPickerContent(this.pickerDOM, value);
  }

  // Called when the value changes while the picker is open. Only updates the
  // summary and the chip selection marks instead of rebuilding everything so
  // the search input and the native color picker are not interrupted.
  refreshPicker(value) {
    if(this.summaryDOM && !this.summaryDOM.contains(document.activeElement)) {
      this.summaryDOM.innerHTML = '';
      this.renderSummary(this.summaryDOM, value);
    }
    for(const chip of $a('.propertyValueChip', this.pickerDOM))
      if(chip.dataset.value !== undefined)
        chip.classList.toggle('selected', chip.dataset.value == String(value));
  }

  renderSummary(target, value) {
    this.renderChip(target, value);
    this.renderSummaryControls(target, value);
    div(target, 'propertyPickerValueText', propertyInputValueSet(value) ? html(String(value)) : '<i>not set</i>');
    if(this.options.clearable !== false) {
      const clear = document.createElement('button');
      clear.setAttribute('icon', 'delete');
      clear.title = 'Remove value';
      clear.onclick = _=>this.setValue(null);
      target.appendChild(clear);
    }
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

  renderChip(target, value) {
    return renderColorChip(propertyInputValueSet(value) ? value : 'transparent', target);
  }

  updatePreview(value) {
    this.previewButton.innerHTML = '';
    this.renderChip(this.previewButton, value);
  }

  renderSummaryControls(target, value) {
    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.value = toHex(propertyInputValueSet(value) ? value : (this.options.default || '#000000'));
    colorPicker.oninput = _=>this.setValue(colorPicker.value);
    target.appendChild(colorPicker);
  }

  renderPickerContent(target, value) {
    this.addChipList(target, 'Used in this game', usedGameColors(), value, renderColorChip);
    this.addChipList(target, 'Palette', propertyInputPalette, value, renderColorChip);
  }
}

class IconInput extends PickerInput {
  cssClass() {
    return 'pickerInput iconInput';
  }

  renderChip(target, value) {
    if(propertyInputValueSet(value))
      return renderIconChip(value, target);
    return div(target, 'propertyValueChip propertyEmptyChip');
  }

  updatePreview(value) {
    this.previewButton.innerHTML = '';
    this.renderChip(this.previewButton, value);
  }

  renderPickerContent(target, value) {
    this.addChipList(target, 'Used in this game', usedGameIcons(), value, renderIconChip);

    const searchSection = div(target, 'propertyPickerSection');
    div(searchSection, 'propertyPickerSectionTitle', 'Find an icon');
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
      await loadIconSearchIndex();
      showResults(search.value.trim() ? searchIconIndex(search.value.trim()) : frequentlyUsed);
    };
    loadIconSearchIndex();
  }
}

class ImageInput extends PickerInput {
  cssClass() {
    return 'pickerInput imageInput';
  }

  renderChip(target, value) {
    if(propertyInputValueSet(value))
      return renderImageChip(value, target);
    return div(target, 'propertyValueChip propertyEmptyChip');
  }

  updatePreview(value) {
    this.previewButton.innerHTML = '';
    this.renderChip(this.previewButton, value);
  }

  renderPickerContent(target, value) {
    this.addChipList(target, 'Used in this game', usedGameImages(), value, renderImageChip);

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

// Helpers to edit single CSS declarations inside the "css" property while
// leaving everything else in it untouched. Supports both the string and the
// object form of the property (nested class objects use the "default" entry).
function cssObjectFromString(cssString) {
  const result = {};
  for(const declaration of cssString.split(';')) {
    const colon = declaration.indexOf(':');
    if(colon != -1)
      result[declaration.slice(0, colon).trim()] = declaration.slice(colon+1).trim();
  }
  return result;
}

// Values that contain ":" or ";" themselves (like data URIs) do not survive
// the simple declaration parsing above, so refuse to edit such strings.
function cssStringIsEditable(cssString) {
  const rebuilt = Object.entries(cssObjectFromString(cssString)).map(([ key, value ])=>`${key}:${value}`).join(';');
  const normalized = cssString.replace(/\s/g, '').replace(/;+/g, ';').replace(/^;|;$/g, '');
  return normalized == rebuilt.replace(/\s/g, '');
}

function widgetCssObject(widget, cssProperty='css') {
  const css = widget.get(cssProperty);
  if(typeof css == 'string')
    return cssStringIsEditable(css) ? cssObjectFromString(css) : {};
  if(typeof css == 'object' && css !== null) {
    if(Object.values(css).some(v=>typeof v == 'object' && v !== null))
      return typeof css.default == 'object' && css.default !== null ? css.default : {};
    return css;
  }
  return {};
}

function getWidgetCssValue(widget, key, cssProperty='css') {
  const value = widgetCssObject(widget, cssProperty)[key];
  return value === undefined ? null : value;
}

function setWidgetCssValue(module, widget, key, value, cssProperty='css') {
  const css = widget.get(cssProperty);
  if(typeof css == 'string' && css.trim() && !cssStringIsEditable(css))
    return; // do not touch css strings we cannot parse without losing data
  const isNested = typeof css == 'object' && css !== null && Object.values(css).some(v=>typeof v == 'object' && v !== null);
  const newCss = isNested ? Object.assign({}, css) : {};
  const target = Object.assign({}, widgetCssObject(widget, cssProperty));

  if(value === null || value === undefined || value === '')
    delete target[key];
  else
    target[key] = value;

  if(isNested) {
    newCss.default = target;
    module.inputValueUpdated(widget, cssProperty, newCss);
  } else {
    module.inputValueUpdated(widget, cssProperty, Object.keys(target).length ? target : null);
  }
}

// options for CSS-backed inputs so ColorInput/NumberInput/etc. can edit a
// single declaration in the css property
function cssValueOptions(module, widget, key, extraOptions={}) {
  return Object.assign({
    getValue: _=>getWidgetCssValue(widget, key),
    setValue: v=>setWidgetCssValue(module, widget, key, v),
    listenTo: [ 'css' ]
  }, extraOptions);
}

// like cssValueOptions but for numeric declarations with a px unit
function cssNumberOptions(module, widget, key, extraOptions={}) {
  return Object.assign({
    getValue: _=>{
      const value = getWidgetCssValue(widget, key);
      const match = String(value === null ? '' : value).match(/-?[0-9.]+/);
      return match ? +match[0] : null;
    },
    setValue: v=>setWidgetCssValue(module, widget, key, v === null || v === '' ? null : `${v}px`),
    listenTo: [ 'css' ]
  }, extraOptions);
}

class CssToggleButton extends PropertyInput {
  // options: icon, onValue (declaration value when active)
  cssClass() {
    return 'cssToggleInput';
  }

  renderControl(target) {
    this.button = document.createElement('button');
    this.button.setAttribute('icon', this.options.icon);
    if(this.options.tooltip)
      this.button.title = this.options.tooltip;
    this.button.onclick = _=>this.setValue(this.getValue() == this.options.onValue ? null : this.options.onValue);
    target.appendChild(this.button);
  }

  update(value) {
    this.button.classList.toggle('selected', value == this.options.onValue);
  }
}
