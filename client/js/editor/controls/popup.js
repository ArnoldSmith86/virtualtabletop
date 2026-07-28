const openPopups = []; // stack of open popups so close controls only affect the top-most one

// the editor reacts to Escape on keyup (closing the active sidebar module with a
// synthetic click that would also dismiss every open popup), so when a popup
// handled the Escape keydown, swallow the matching keyup before it gets there
let popupHandledEscape = false;
document.addEventListener('keyup', e=>{
  if(e.key == 'Escape' && popupHandledEscape) {
    popupHandledEscape = false;
    e.stopPropagation();
  }
}, true);

class Popup {
  constructor(source) {
    this.source = source;
    this.domElement = document.createElement('div');
    this.domElement.classList.add('inline-popup');
    this.changeListeners = [];
    this.cancelListeners = [];
    this.boundOnClick = this.onClick.bind(this);
    this.boundOnOutsideClick = this.onOutsideClick.bind(this);
    this.boundOnKeyDown = this.onKeyDown.bind(this);
  }

  addAccordionSection(title, contentHTML='') {
    const isFirst = !$('.accordion-section', this.domElement);
    const section = div(this.domElement, 'accordion-section', `
      <h3>${title}</h3>
      <div class=accordion-content>${contentHTML}</div>
    `);
    $('h3', section).addEventListener('click', e=>{
      e.stopPropagation();
      for(const toClose of $a('.accordion-content', this.domElement))
        toClose.classList.remove('open');
      $('.accordion-content', section).classList.add('open');
      this.moveIntoView();
    });
    if(isFirst)
      $('.accordion-content', section).classList.add('open');
    return [ $('h3', section), $('.accordion-content', section) ];
  }

  addCloseButton() {
    if($('.popup-close', this.domElement))
      return;
    const close = document.createElement('span');
    close.className = 'material-symbols popup-close';
    close.textContent = 'close';
    close.title = 'Close';
    close.addEventListener('click', e=>{
      e.stopPropagation();
      this.hide();
    });
    // first child so the sticky float stays in the top right corner while scrolling
    this.domElement.prepend(close);
  }

  hide() {
    if(openPopups.indexOf(this) != -1)
      openPopups.splice(openPopups.indexOf(this), 1);
    if(this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    document.removeEventListener('click', this.boundOnOutsideClick);
    document.removeEventListener('keydown', this.boundOnKeyDown, true);
    this.domElement.remove();
    for(const listener of this.cancelListeners)
      listener();
    this.cancelListeners = [];
  }

  // a popup that lets the user click widgets in the room must not cover the play
  // area - the widgets it wants to select are in there
  avoidsPlayArea() {
    return false;
  }

  // the part of the screen the popup may use: everything except the module
  // button strip on the right edge, minus the play area for widget pickers
  placementLimits() {
    const sidebar = $('#editorSidebar');
    const limits = { left: 0, top: 0, right: window.innerWidth - (sidebar ? sidebar.offsetWidth : 0), bottom: window.innerHeight };
    const roomArea = this.avoidsPlayArea() && $('#roomArea');
    if(!roomArea)
      return limits;
    // the play area sits along one edge (below the modules on a portrait phone,
    // left of them on a wide screen), so use the biggest strip it leaves over
    const room = roomArea.getBoundingClientRect();
    const strips = [
      Object.assign({}, limits, { bottom: Math.min(limits.bottom, room.top) }),
      Object.assign({}, limits, { top: Math.max(limits.top, room.bottom) }),
      Object.assign({}, limits, { right: Math.min(limits.right, room.left) }),
      Object.assign({}, limits, { left: Math.max(limits.left, room.right) })
    ].filter(s=>s.right-s.left >= 240 && s.bottom-s.top >= 160);
    strips.sort((a, b)=>(b.right-b.left)*(b.bottom-b.top) - (a.right-a.left)*(a.bottom-a.top));
    return strips[0] || limits; // no strip is usable: covering the room beats being unusable
  }

  moveIntoView() {
    const limits = this.placementLimits();
    // shrink into the available strip instead of hanging out of it
    this.domElement.style.maxWidth = `${Math.min(window.innerWidth/2, limits.right-limits.left-20)}px`;
    this.domElement.style.maxHeight = `${Math.min(window.innerHeight-20, limits.bottom-limits.top-20)}px`;
    const rect = this.domElement.getBoundingClientRect();
    const fit = (position, size, from, to)=>Math.min(Math.max(position, from+10), Math.max(from+10, to-10-size));
    this.domElement.style.left = `${fit(rect.left, rect.width, limits.left, limits.right)}px`;
    this.domElement.style.top = `${fit(rect.top, rect.height, limits.top, limits.bottom)}px`;
  }

  notifyChangeListeners(value) {
    for(const listener of this.changeListeners) {
      listener(value);
    }
  }

  onClick(e) {
    // clicks inside the popup never close it; that is what the close button,
    // the Escape key and clicks outside all popups are for
    e.stopPropagation();
  }

  onKeyDown(e) {
    // only the top-most popup reacts so nested info popups close one at a time
    if(e.key == 'Escape' && openPopups[openPopups.length-1] === this) {
      e.stopPropagation();
      popupHandledEscape = true;
      this.hide();
    }
  }

  onOutsideClick(e) {
    // clicking widgets in the room is part of the interaction while a custom selection is active
    if(customSelectionCallback)
      return;
    // clicks inside any popup (e.g. a nested info popup) never dismiss other popups
    if(e.target.closest && e.target.closest('.inline-popup'))
      return;
    if(!this.domElement.contains(e.target))
      this.hide();
  }

  registerCancelListener(listener) {
    this.cancelListeners.push(listener);
  }

  registerChangeListener(listener) {
    this.changeListeners.push(listener);
  }

  reset() {
    // also drop document listeners from a previous show() so a bubbling click
    // that re-opens this popup cannot immediately close it again
    document.removeEventListener('click', this.boundOnOutsideClick);
    document.removeEventListener('keydown', this.boundOnKeyDown, true);
    this.domElement.innerHTML = '';
    this.changeListeners = [];
    this.cancelListeners = [];
  }

  setSource(source) {
    this.source = source;
  }

  setTitle(title) {
    if(!$('h1', this.domElement)) {
      const h1 = document.createElement('h1');
      const close = $('.popup-close', this.domElement);
      if(close) // keep the close button first so it stays sticky in the corner
        close.after(h1);
      else
        this.domElement.prepend(h1);
    }
    $('h1', this.domElement).textContent = title;
  }

  show() {
    const sourceRect = this.source.getBoundingClientRect();
    $('#editor').append(this.domElement);
    this.domElement.style.left = `${sourceRect.left}px`;
    this.domElement.style.top = `${sourceRect.bottom}px`;
    this.moveIntoView();
    this.addCloseButton();
    if(openPopups.indexOf(this) == -1)
      openPopups.push(this);
    this.domElement.addEventListener('click', this.boundOnClick);
    // capture phase so Escape only closes the popup instead of also deselecting in the editor
    document.addEventListener('keydown', this.boundOnKeyDown, true);
    // defer so the click that opened the popup doesn't immediately close it
    setTimeout(_=>document.addEventListener('click', this.boundOnOutsideClick), 0);
    // move back into view when the content grows after opening, e.g. when
    // picking widgets in the room adds rows to the popup near the bottom edge.
    // Only childList is observed: watching style/class would feed moveIntoView's
    // own style writes back into the observer (and picker inputs toggle classes
    // constantly), so it stays limited to actual content changes.
    if(typeof MutationObserver != 'undefined' && !this.mutationObserver) {
      this.mutationObserver = new MutationObserver(_=>this.moveIntoView());
      this.mutationObserver.observe(this.domElement, { childList: true, subtree: true });
    }
  }
}

class InfoPopup extends Popup {
  constructor(source, infoHTML, tutorialName=null, videoFilename=null) {
    super(source);
    this.infoHTML = infoHTML;
    this.tutorialName = tutorialName;
    this.videoFilename = videoFilename;
  }

  show() {
    super.show();
    if(!this.tutorialName && !this.videoFilename)
      div(this.domElement, 'content', this.infoHTML);
    else
      this.addAccordionSection('Info', this.infoHTML);
    if(this.tutorialName) // FIXME: using the same roomID more than once doesn't work yet if the tutorial is already in there (also in production?)
      this.addAccordionSection('Tutorial', `<a href="tutorial/${this.tutorialName}/ROOM:${roomID}-tutorials">${this.tutorialName}</a>`);
    if(this.videoFilename)
      this.addAccordionSection('Video', `<video src="i/videos/${this.videoFilename}" controls></video>`);
    this.moveIntoView();
  }
}

let openRoutinePopup = null; // only one parameter popup is open at a time

const predefinedVariableDescriptions = {
  playerName: 'name of the player who started the routine',
  playerColor: 'color of the player who started the routine',
  seatID: 'seat id of the player who started the routine (null without a seat)',
  seatIndex: 'seat index of the player who started the routine (null without a seat)',
  thisID: 'id of the widget that contains the routine',
  mouseCoords: '[x, y] cursor position of the player who started the routine',
  activePlayers: 'array of the names of all active players',
  activeColors: 'array of the colors of all active players',
  activeSeats: 'array of the ids of all occupied seats'
};

const predefinedCollectionDescriptions = {
  playerSeats: 'all seats occupied by the player who started the routine',
  activeSeats: 'all seats with an active player',
  thisButton: 'the widget that contains the routine (not necessarily a button)'
};

const routineWidgetPickerKey = 'routineWidgets';

let propertySuggestionListCounter = 0;

// the identifier syntax ${PROPERTY name OF widget} accepts (see widget.js):
// everything outside [A-Za-z0-9 _-] has to be escaped, and a leading $ makes the
// engine read the name from a variable, so it is kept as it is
const propertyIdentifier = '(?:[a-zA-Z0-9 _-]|\\\\u[0-9a-fA-F]{4})+';

function escapePropertyIdentifier(name) {
  const dollar = String(name).charAt(0) == '$' ? '$' : '';
  return dollar + String(name).slice(dollar.length).split('').map(c=>{
    if(c.match(/^[A-Za-z0-9 _-]$/))
      return c;
    return `\\u${('000' + c.charCodeAt(0).toString(16)).slice(-4)}`;
  }).join('').replace(/^PROPERTY /, 'PROPERTY\\u0020').replace(/ OF /g, '\\u0020OF ');
}

function unescapePropertyIdentifier(name) {
  return String(name).replace(/\\u([0-9a-fA-F]{4})/g, (_, code)=>String.fromCharCode(parseInt(code, 16)));
}

function propertyReference(property, widgetID) {
  const of = widgetID ? ` OF ${escapePropertyIdentifier(widgetID)}` : '';
  return `\$\{PROPERTY ${escapePropertyIdentifier(property)}${of}\}`;
}

// { property, widget } of a value that is nothing but a property reference, so
// the property builder can start from the value the parameter already has
function parsePropertyReference(value) {
  if(typeof value != 'string')
    return null;
  // the name is matched lazily, exactly like the engine does, so the first " OF "
  // ends it - which is why escapePropertyIdentifier escapes one inside a name
  const match = value.match(new RegExp(`^\\$\\{PROPERTY (\\$?${propertyIdentifier}?)(?: OF (\\$?${propertyIdentifier}))?\\}$`));
  if(!match)
    return null;
  return { property: unescapePropertyIdentifier(match[1]), widget: match[2] ? unescapePropertyIdentifier(match[2]) : '' };
}

class RoutinePopup extends Popup {
  constructor(source) {
    super(source);
  }

  hide() {
    if(openRoutinePopup === this)
      openRoutinePopup = null;
    // a popup that offers the widget picker starts in-room picks, so end them
    // when it goes away; other popups (e.g. info popups) must not interfere
    if(isWidgetPickerActive(null, routineWidgetPickerKey))
      stopWidgetPicker();
    super.hide();
  }

  // the property builder's widget picker needs the room visible while it is open
  avoidsPlayArea() {
    return this.propertyPickerShown || this.needsRoomForPicker();
  }

  needsRoomForPicker() {
    return false;
  }

  offersUseDefault() {
    return true;
  }

  // every popup shows the raw value as editable text; the ones whose own input
  // already is the whole value (JSON, the operation itself) do not need it twice
  offersValueInput() {
    return true;
  }

  valueInputHint() {
    return null;
  }

  onClick(e) {
  }

  onOutsideClick(e) {
    // clicking widgets in the room is how the widget picker works
    if(isWidgetPickerActive(null, routineWidgetPickerKey))
      return;
    super.onOutsideClick(e);
  }

  setNewCollectionValue(value) {
    this.setNewValue(value);
  }

  setNewValue(value) {
    this.notifyChangeListeners({ [this.parameterNames[0]]: value });
  }

  // the value the chip stands for: the parameter that is set (a chip can offer
  // alternatives like {holder,collection}), otherwise the first one
  currentValue() {
    if(!this.operation || typeof this.operation != 'object')
      return undefined;
    const set = this.parameterNames.filter(p=>typeof this.operation[p] != 'undefined');
    return this.operation[set.length ? set[0] : this.parameterNames[0]];
  }

  valueAsText(value) {
    if(value === undefined)
      return '';
    return typeof value == 'string' ? value : JSON.stringify(value);
  }

  // a raw text edit means JSON where that is what was typed (numbers, booleans,
  // arrays, objects) and a plain string otherwise - a bare word, and anything
  // else that is not valid JSON, is almost always meant as text
  parseValueText(text) {
    try {
      const value = JSON.parse(text);
      return typeof value == 'string' ? text : value;
    } catch(e) {
      return text;
    }
  }

  // what the text input does with an edit; the pickers collect it instead of
  // applying it right away
  applyValueInput(value) {
    this.setNewValue(value);
  }

  syncValueInput(value) {
    if(this.valueInput && document.activeElement !== this.valueInput)
      this.valueInput.value = this.valueAsText(value);
  }

  // the current value as editable text next to the button that drops it again -
  // the two things a parameter popup is opened for, above everything else
  renderValueRow() {
    this.valueInput = null;
    const row = document.createElement('div');
    row.className = 'popup-value-row';

    if(this.offersValueInput()) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'popup-value-input';
      input.value = this.valueAsText(this.currentValue());
      input.placeholder = this.valueInputHint() || 'value';
      input.title = 'The value of this parameter - edit it directly or use one of the sections below';
      input.addEventListener('change', _=>this.applyValueInput(this.parseValueText(input.value)));
      row.append(input);
      this.valueInput = input;
    }

    // an explicitly set parameter (other than the operation type itself) can be
    // reset to its default, which for IF.condition also restores the operand chips
    if(this.offersUseDefault() && this.parameterNames[0] != 'func' && this.operation && typeof this.operation == 'object' && this.parameterNames.some(p=>typeof this.operation[p] != 'undefined')) {
      const clear = button(row, 'use default', _=>{
        const values = {};
        for(const parameter of this.parameterNames)
          values[parameter] = undefined;
        this.notifyChangeListeners(values);
      });
      clear.className = 'popup-use-default';
      clear.title = 'Remove the explicit value and go back to the default';
    }

    if(row.firstChild)
      $('h1', this.domElement).after(row);
  }

  // "Property <name> of <widget>" instead of a plain list of properties: both
  // parts are editable, the name field suggests the properties the chosen widget
  // currently has (the way the CSS editor suggests selectors) and the widget
  // field gets the picker the rest of the editor uses
  renderPropertyBuilder(content) {
    const parsed = parsePropertyReference(this.currentValue()) || { property: '', widget: '' };
    // the shared picker's CSS is scoped to .editorModule
    const host = div(content, 'editorModule');
    const row = div(host, 'popup-property-row');

    div(row, 'popup-property-label').textContent = 'Property';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'popup-property-name';
    nameInput.placeholder = 'name';
    nameInput.value = parsed.property;
    const listID = `routinePropertySuggestions${++propertySuggestionListCounter}`;
    nameInput.setAttribute('list', listID);
    const datalist = document.createElement('datalist');
    datalist.id = listID;
    row.append(nameInput, datalist);

    div(row, 'popup-property-label').textContent = 'of';
    const widgetInput = document.createElement('input');
    widgetInput.type = 'text';
    widgetInput.className = 'popup-property-widget';
    widgetInput.placeholder = 'this widget'; // an empty target means the widget the routine is on
    widgetInput.value = parsed.widget;
    row.append(widgetInput);

    // the suggestions are the properties of the widget the value is read from
    const suggestionsFor = _=>{
      const targetID = widgetInput.value.trim();
      const target = targetID && typeof widgets != 'undefined' && widgets.get(targetID);
      return Object.keys(((target || this.widget || {}).state) || {}).sort();
    };
    const updateSuggestions = _=>{
      datalist.innerHTML = '';
      for(const property of suggestionsFor()) {
        const option = document.createElement('option');
        option.value = property;
        datalist.append(option);
      }
    };
    updateSuggestions();
    widgetInput.addEventListener('input', updateSuggestions);

    const controls = renderWidgetSelectPopout(host, this.widget, {
      title: 'Read the property from',
      pickerKey: routineWidgetPickerKey,
      allowSelf: true, // a routine regularly reads a property of its own widget
      getSelectedIDs: _=>widgetInput.value.trim() ? [ widgetInput.value.trim() ] : [],
      apply: widgetID=>{
        widgetInput.value = widgetID;
        updateSuggestions();
      },
      onClear: _=>{
        widgetInput.value = '';
        updateSuggestions();
      },
      clearLabel: 'This widget'
    });
    controls.expandButton.title = 'Pick the widget to read the property from';
    widgetInput.after(controls.expandButton); // the popout stays below the row
    const expand = controls.expandButton.onclick;
    controls.expandButton.onclick = e=>{
      expand(e);
      // picking in the room only works while the popup does not cover it
      this.propertyPickerShown = controls.popout.style.display != 'none';
      this.moveIntoView();
    };

    const apply = _=>{
      const property = nameInput.value.trim();
      nameInput.classList.toggle('inputError', !property);
      if(property)
        this.setNewValue(propertyReference(property, widgetInput.value.trim()));
    };
    for(const input of [ nameInput, widgetInput ])
      input.addEventListener('keydown', e=>{
        if(e.key == 'Enter')
          apply();
      });
    button(host, 'use property', apply);
  }

  setOperationDetails(operation, parameterNames, widget, variables, collections) {
    this.operation = operation;
    this.parameterNames = parameterNames;
    this.widget = widget;
    this.variables = variables;
    this.collections = collections;
  }

  show(showVariables=true, showCollections=true) {
    this.propertyPickerShown = false;
    if(openRoutinePopup && openRoutinePopup !== this)
      openRoutinePopup.hide();
    openRoutinePopup = this;
    super.show();
    this.setTitle(this.operation && this.operation.func ? this.operation.func : 'var');
    commonInfoButton($('h1', this.domElement), this.operation && this.operation.func);
    $('h1', this.domElement).append(` - ${this.parameterNames.length > 1 ? 'parameters' : 'parameter'} ${this.parameterNames.join(' / ')}`);

    this.renderValueRow();

    if(showVariables) {
      const [ variablesTitle, variablesContent ] = this.addAccordionSection('Variables');
      infoButton(variablesTitle, `
        Variables can be used to store values that are used in the operation.
        You can use [VAR], [var] or [COUNT] to put values into variables, then use [var] or [VAR] to do calculations.
        Then you can use the variable here.
      `);
      for(const variable of [ ...this.variables ].sort())
        button(variablesContent, variable, _=>this.setNewValue(`\$\{${variable}\}`));

      const [ predefinedVariablesTitle, predefinedVariablesContent ] = this.addAccordionSection('Predefined Variables');
      infoButton(predefinedVariablesTitle, 'Each routine begins with a number of predefined variables that describe the player who started it and the room.');
      for(const variable in predefinedVariableDescriptions) {
        const entry = div(predefinedVariablesContent, 'popup-entry');
        button(entry, variable, _=>this.setNewValue(`\$\{${variable}\}`));
        div(entry, 'popup-entry-description').textContent = predefinedVariableDescriptions[variable];
      }

      const [ widgetPropertiesTitle, widgetPropertiesContent ] = this.addAccordionSection('Widget Properties');
      infoButton(widgetPropertiesTitle, `
        Wherever you use a value in an operation, you can use a widget property of any widget instead.
        For example, you might want to put a score property on a card widget, then use that score in an operation.
        Leave the widget empty to read the property from the widget this routine belongs to, or pick another one.
      `);
      this.renderPropertyBuilder(widgetPropertiesContent);
    }

    if(showCollections) {
      const [ collectionsTitle, collectionsContent ] = this.addAccordionSection('Collections');
      infoButton(collectionsTitle, `
        <pre>
        A collection is, as its name implies, a collection of widgets. Collections can be created in two different ways.

        A [SELECT](SELECT statement) will create a collection and name it according to the collection parameter. If no collection parameter is provided, it will be named DEFAULT.

        You can also list widget ids directly, like [ "widget1", "widget2" ] - such in-place collections used elsewhere in the routine are offered here as well.
        </pre>
      `);
      const sortedCollections = [...this.collections].sort((a, b)=>JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);
      for(const collection of sortedCollections) {
        const label = typeof collection == 'string' ? collection : `[ ${collection.join(', ')} ]`;
        button(collectionsContent, label, _=>this.setNewCollectionValue(typeof collection == 'string' ? collection : [ ...collection ]));
      }

      const [ predefinedCollectionsTitle, predefinedCollectionsContent ] = this.addAccordionSection('Predefined Collections');
      infoButton(predefinedCollectionsTitle, 'Each routine begins with a number of predefined collections.');
      for(const collection in predefinedCollectionDescriptions) {
        const entry = div(predefinedCollectionsContent, 'popup-entry');
        button(entry, collection, _=>this.setNewCollectionValue(collection));
        div(entry, 'popup-entry-description').textContent = predefinedCollectionDescriptions[collection];
      }
    }

    this.moveIntoView();
  }
}

class RoutineOperationPopup extends RoutinePopup {
  constructor() {
    super();
  }

  offersValueInput() {
    return false; // this popup picks an operation, not a value
  }

  setNewValue(newOperation) {
    if(typeof newOperation == 'string') {
      this.notifyChangeListeners(newOperation);
    } else {
      // keep nothing of the old operation except the new func
      const newValue = {};
      for(const key in this.operation)
        newValue[key] = undefined;
      Object.assign(newValue, newOperation);
      this.notifyChangeListeners(newValue);
    }
  }

  show() {
    super.show(false, false);
    // the generic "<func> - parameter func" title is jargon in the first popup a new user sees
    const h1 = $('h1', this.domElement);
    h1.textContent = this.operation && this.operation.func ? `${this.operation.func} - change operation` : 'Add operation';
    if(this.operation && this.operation.func)
      commonInfoButton(h1, this.operation.func);
    const [ , commonContent ] = this.addAccordionSection('Common Actions');
    for(const { example, newOperation } of simpleRoutineOperationExamples) {
      button(commonContent, example, _=>this.setNewValue(newOperation));
      commonContent.append(document.createElement('br'));
    }
    const [ , allContent ] = this.addAccordionSection('All Operations');
    for(const { example, newOperation } of routineOperationExamples()) {
      button(allContent, example, _=>this.setNewValue(newOperation));
      allContent.append(document.createElement('br'));
    }
    this.moveIntoView();
  }
}

class RoutineStringPopup extends RoutinePopup {
  constructor() {
    super();
  }

  currentValue() {
    if(typeof this.operation == 'string') { // var statements and comments are strings
      const match = this.operation.match(/^var (\S+) = (.*)$/);
      const stringParts = { variable: match && match[1], expression: match && match[2], statement: this.operation, comment: this.operation.replace(/^\/\/\s?/, '') };
      const part = stringParts[this.parameterNames[0]];
      return part == null ? undefined : part;
    }
    return super.currentValue();
  }

  parseValueText(text) {
    return text; // a text parameter takes what was typed, quotes and all
  }

  show() {
    super.show(true, false);
    if(this.valueInput)
      this.valueInput.focus();
  }
}

class RoutineNumberPopup extends RoutinePopup {
  constructor(options={}) {
    super();
    this.options = options;
  }

  needsRoomForPicker() {
    return !!this.options.widgetType; // only then it offers the room picker
  }

  // some number parameters also take strings, e.g. a property name or a seat id
  valueInputHint() {
    return this.options.textHint;
  }

  setNewValue(value) {
    // for parameter alternatives like {fillTo,count} the last one is the normal
    // parameter and the ones before it override it in the engine, so clear those
    const values = {};
    for(const parameter of this.parameterNames)
      values[parameter] = undefined;
    values[this.parameterNames[this.parameterNames.length-1]] = value;
    this.notifyChangeListeners(values);
  }

  show() {
    const [ valueTitle, valueContent ] = this.addAccordionSection('Value');
    infoButton(valueTitle, 'Use fixed values that will always behave the same way.');

    if(this.options.specialValues)
      for(const value of this.options.specialValues)
        button(valueContent, value, _=>this.setNewValue(value));
    // starts at 0 because that is a meaningful value for most number parameters
    // (move/flip/rotate none, x/y/angle 0); "use default" is what clears a value
    for(let i=0; i<=10; i++)
      button(valueContent, i, _=>this.setNewValue(i));

    // a few number parameters name a widget instead (TURN turn takes a seat id),
    // so offer the picker for those as well
    if(this.options.widgetType) {
      const [ widgetTitle, widgetContent ] = this.addAccordionSection('Widgets');
      infoButton(widgetTitle, 'Use the id of a widget instead of a number: search it by id or pick it in the room.');
      // the properties module's picker CSS is scoped to .editorModule
      const host = div(widgetContent, 'editorModule');
      renderWidgetSelectPopout(host, this.widget, {
        pickerKey: routineWidgetPickerKey,
        inline: true,
        allowSelf: true,
        typeFilter: this.options.widgetType,
        getSelectedIDs: _=>typeof this.currentValue() == 'string' ? [ this.currentValue() ] : [],
        apply: widgetID=>this.setNewValue(widgetID)
      });
    }

    super.show(true, false);
  }
}

class RoutineEnumPopup extends RoutinePopup {
  constructor(options={}) {
    super();
    this.options = options;
  }

  show() {
    const [ valueTitle, valueContent ] = this.addAccordionSection('Value');
    infoButton(valueTitle, 'Use fixed values that will always behave the same way.');
    for(const option of this.options.values)
      button(valueContent, option, _=>this.setNewValue(option));
    super.show(true, false);
  }
}

class RoutineWidgetIDPopup extends RoutinePopup {
  constructor(options={}) {
    super();
    this.options = options;
    this.workingIDs = [];
  }

  needsRoomForPicker() {
    return true;
  }

  show(showCollections=false) {
    // the picker is the primary input here, so it comes first and open
    const [ title, content ] = this.addAccordionSection('Widgets');
    infoButton(title, `
      Search widgets by their id, filter them by type or pick them in the room, then apply the selection.
      The type filter also applies to picking in the room: with the type set to holder, a click on a card selects the holder it lies on.
    `);
    // seed the picker with the widgets the parameter already holds so applying
    // it without changes keeps the current value instead of clearing it
    const currentValue = this.operation && typeof this.operation == 'object' ? this.operation[this.parameterNames[0]] : null;
    const currentIDs = Array.isArray(currentValue) ? currentValue : (typeof currentValue == 'string' ? [ currentValue ] : []);
    // a collection name looks like a widget id but is none, so only keep ids
    // that exist - applying the picker must not turn a collection into widgets
    this.workingIDs = currentIDs.filter(id=>typeof id == 'string' && widgets.has(id));

    // the properties module's picker CSS is scoped to .editorModule, so render
    // into a matching wrapper to inherit its sizing
    const host = div(content, 'editorModule');
    renderWidgetSelectPopout(host, this.widget, {
      pickerKey: routineWidgetPickerKey,
      inline: true,
      multiple: true,
      allowSelf: true, // a routine regularly acts on the widget it belongs to
      resolveCovering: true, // holders are usually covered by their cards
      typeFilter: this.options.widgetType, // preset from the parameter, changeable in the picker
      getSelectedIDs: _=>this.workingIDs,
      apply: widgetIDs=>this.workingIDs = widgetIDs,
      onClear: _=>this.workingIDs = [],
      clearLabel: 'Select none'
    });
    button(content, 'Use these widgets', _=>this.setNewValue([ ...this.workingIDs ]));
    // a widget parameter takes a widget id, which a variable or widget property
    // can provide as well - e.g. ${PROPERTY parent} for the holder a button sits on
    super.show(true, showCollections);
  }
}

class RoutineHoldersOrCollectionSourcePopup extends RoutineWidgetIDPopup {
  constructor(options={}) {
    super(options);
  }

  setNewCollectionValue(value) {
    // a collection (whether a name or an in-place array of widget ids) belongs to the
    // second parameter if there is one; the first (holder-like) parameter is cleared
    // because the engine prefers it over the collection
    const holderParameter = this.parameterNames[0];
    const collectionParameter = this.parameterNames[1];
    if(collectionParameter === undefined)
      this.notifyChangeListeners({ [holderParameter]: value });
    else
      this.notifyChangeListeners({ [holderParameter]: undefined, [collectionParameter]: value });
  }

  setNewValue(value) {
    // widget ids arrive as an array and belong to the first (holder-like) parameter;
    // a variable or widget property resolves to a widget id, so it goes there too;
    // collection names are strings and belong to the second parameter if there is one
    if(Array.isArray(value) || typeof value == 'string' && value.match(/\$\{[^}]+\}/)) {
      const holderParameter = this.parameterNames[0];
      const collectionParameter = this.parameterNames[1];
      // clear the sibling collection (mirror of setNewCollectionValue) so a leftover
      // value can't re-surface as the source if the holder is later cleared
      if(collectionParameter === undefined)
        this.notifyChangeListeners({ [holderParameter]: value });
      else
        this.notifyChangeListeners({ [holderParameter]: value, [collectionParameter]: undefined });
    } else {
      this.setNewCollectionValue(value);
    }
  }

  show() {
    super.show(true);
  }
}

class RoutineJSONPopup extends RoutinePopup {
  constructor() {
    super();
  }

  getCurrentValue() {
    return this.operation[this.parameterNames[0]];
  }

  offersValueInput() {
    return false; // the textarea below already holds the whole value
  }

  show() {
    // the current value is the most likely thing to edit, so it comes first and open
    const [ valueTitle, valueContent ] = this.addAccordionSection('Value');
    infoButton(valueTitle, 'Enter a JSON value (object, array, string, number, boolean or null). A bare word is quoted automatically as a string.');
    const textarea = document.createElement('textarea');
    const currentValue = this.getCurrentValue();
    textarea.value = JSON.stringify(typeof currentValue != 'undefined' ? currentValue : null, null, '  ');
    textarea.addEventListener('change', _=>{
      try {
        const newValue = JSON.parse(textarea.value);
        textarea.classList.remove('inputError');
        this.setNewValue(newValue);
      } catch(e) {
        // a bare word (e.g. a sortBy property name) is almost always meant as a
        // string, so quote it automatically instead of rejecting the input
        if(textarea.value.trim().match(/^[A-Za-z_][\w.-]*$/)) {
          textarea.classList.remove('inputError');
          this.setNewValue(textarea.value.trim());
        } else {
          textarea.classList.add('inputError');
        }
      }
    });
    valueContent.append(textarea);
    super.show(true, false);
    textarea.focus();
  }
}

class RoutineFullOperationJSONPopup extends RoutineJSONPopup {
  constructor() {
    super();
  }

  offersUseDefault() {
    return false; // this popup edits the entire operation, there is no default
  }

  getCurrentValue() {
    return this.operation;
  }

  setNewValue(value) {
    // this popup edits the entire operation instead of a single parameter
    this.notifyChangeListeners(value);
  }
}

// Reuses #3035's ColorInput/IconInput (the same pickers the properties sidebar
// uses) for color/icon parameters. The picker edits a local working value and
// the parameter is only written when the popup closes, so the native color
// dialog's live drag and the routine re-render don't fight each other.
class RoutinePickerPopup extends RoutinePopup {
  constructor() {
    super();
    this.workingValue = undefined;
    this.workingChanged = false;
  }

  inputClass() {
    return null;
  }

  valueHint() {
    return 'Use a fixed value that will always behave the same way.';
  }

  // the picker only writes the parameter when the popup closes, so a raw text
  // edit feeds the same working value instead of applying on its own
  applyValueInput(value) {
    this.workingValue = value;
    this.workingChanged = true;
    if(this.pickerInput && this.pickerInput.update)
      this.pickerInput.update(value);
  }

  hide() {
    // apply the picked value on close (before super.hide()'s cancel listener, so
    // its resolve(undefined) is ignored once we have resolved with the value).
    // notifyChangeListeners triggers newRoutineValues to call hide() again, so
    // guard against re-entering the notify.
    if(this.workingChanged && !this.applied) {
      this.applied = true;
      this.notifyChangeListeners({ [this.parameterNames[0]]: this.workingValue });
    }
    super.hide();
  }

  show() {
    const [ valueTitle, valueContent ] = this.addAccordionSection('Value');
    infoButton(valueTitle, this.valueHint());
    this.pickerInput = null;
    this.workingValue = this.operation && typeof this.operation == 'object' ? this.operation[this.parameterNames[0]] : null;

    const InputClass = this.inputClass();
    if(typeof InputClass == 'function') {
      // a minimal stand-in for the properties module: the picker syncs through
      // getValue/setValue instead of the widget, so the listener is a no-op
      const module = { addPropertyListener() {}, inputValueUpdated() {} };
      const input = new InputClass(module, this.widget, '', {
        getValue: ()=>this.workingValue === undefined ? null : this.workingValue,
        getEffective: ()=>this.workingValue === undefined ? null : this.workingValue,
        setValue: v=>{
          this.workingValue = v;
          this.workingChanged = true;
          input.update(v);
          this.syncValueInput(v);
        },
        clearable: false
      });
      this.pickerInput = input;
      // the properties module's picker CSS is scoped to .editorModule, so render
      // into a matching wrapper to inherit the chip/picker sizing
      const host = div(valueContent, 'editorModule');
      input.render(host);
      if(input.openPicker)
        input.openPicker();
    }
    // without the properties module (e.g. jest) the value text input above is
    // the whole editor for the parameter

    super.show(true, false);
  }
}

class RoutineColorPopup extends RoutinePickerPopup {
  inputClass() {
    return typeof ColorInput != 'undefined' ? ColorInput : null;
  }

  valueHint() {
    return 'Pick a color, or type a hex value or "transparent".';
  }
}

class RoutineIconPopup extends RoutinePickerPopup {
  inputClass() {
    return typeof IconInput != 'undefined' ? IconInput : null;
  }

  valueHint() {
    return 'Pick an icon from the ones used in this game or search the icon library.';
  }
}

class RoutineForeachSourcePopup extends RoutinePopup {
  constructor() {
    super();
  }

  setNewCollectionValue(value) {
    this.notifyChangeListeners({ 'in': undefined, range: undefined, collection: value });
  }

  setNewValue(value) {
    // variables and manual input iterate over their content via "in"
    this.notifyChangeListeners({ 'in': value, range: undefined, collection: undefined });
  }

  show() {
    const [ rangeTitle, rangeContent ] = this.addAccordionSection('Range');
    infoButton(rangeTitle, 'Iterate over a range of numbers. The loopRoutine receives each number as the variable value.');
    const inputs = {};
    for(const name of [ 'start', 'end', 'step' ]) {
      const label = document.createElement('label');
      label.textContent = name;
      const input = document.createElement('input');
      input.type = 'number';
      inputs[name] = input;
      label.append(input);
      rangeContent.append(label);
    }
    inputs.start.value = 1;
    inputs.end.value = 10;
    inputs.step.value = 1;
    button(rangeContent, 'use range', _=>{
      this.notifyChangeListeners({ 'in': undefined, range: [ +inputs.start.value || 0, +inputs.end.value || 0, +inputs.step.value || 1 ], collection: undefined });
    });

    const [ inTitle, inContent ] = this.addAccordionSection('Object / Array');
    infoButton(inTitle, 'Iterate over the entries of an object, array or string. The loopRoutine receives key and value for each entry.');
    const textarea = document.createElement('textarea');
    textarea.placeholder = '[ "first", "second" ]';
    textarea.addEventListener('change', _=>{
      try {
        const value = JSON.parse(textarea.value);
        textarea.classList.remove('inputError');
        this.setNewValue(value);
      } catch(e) {
        textarea.classList.add('inputError');
      }
    });
    inContent.append(textarea);

    super.show(true, true);
  }
}

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, c=>({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function button(appendTo, text, onClick) {
  const button = document.createElement('button');
  button.textContent = text;
  button.addEventListener('click', onClick);
  appendTo.append(button);
  return button;
}

async function newRoutineValues(popup) {
  return new Promise(resolve=>{
    popup.reset();
    popup.show();
    popup.registerChangeListener(value=>{
      resolve(value); // before hide() so the cancel listener's resolve(undefined) is ignored
      popup.hide();
    });
    popup.registerCancelListener(_=>resolve(undefined));
  });
}

// strip the code indentation the template literals carry so <pre> blocks align left
function dedentInfoText(text) {
  const lines = text.split('\n');
  const indents = lines.filter(l=>l.trim()).map(l=>l.match(/^ */)[0].length);
  const strip = indents.length ? Math.min(...indents) : 0;
  return lines.map(l=>l.slice(strip)).join('\n');
}

function infoButton(appendTo, infoHTML, tutorialName=null, videoFilename=null) {
  const dom = div(appendTo, 'info-button', `<span class=material-symbols>info</span>`);
  if(tutorialName)
    dom.innerHTML += `<span class=material-symbols>school</span>`;
  if(videoFilename)
    dom.innerHTML += `<span class=material-symbols>movie</span>`;
  infoHTML = dedentInfoText(infoHTML);
  // topic names are restricted so literal brackets like [ "widget1", "widget2" ] stay untouched
  infoHTML = infoHTML.replace(/\[([A-Za-z.]+)\](?:\(([^)]+)\))?/g, (_, topicName, topicInfo)=>`<span class=highlight data-topic="${topicName}">${topicInfo != null ? topicInfo : topicName}</span>`);
  dom.addEventListener('click', e=>{
    e.stopPropagation();
    const popup = new InfoPopup(dom, infoHTML, tutorialName, videoFilename);
    popup.show();
    for(const highlight of $a('.highlight', popup.domElement))
      commonInfoButton(highlight, highlight.dataset.topic);
    popup.moveIntoView();
  });
  return dom;
}

function commonInfoButton(appendTo, topicName) {
  if(topicName == 'COUNT') {
    return infoButton(appendTo, `
      <pre>
      This function determines the size of a collection and stores the result in a variable.

      Parameters:

      collection: collection - specifies the collection of widgets to counts (defaults to DEFAULT collection).
      holder: holder id (or an array) - specifies the holder that contains the widgets to count (optional). When counting a holder, only child widgets that match the holder's dropTarget property are included. Note that the widgets specified here need not be holders.
      owner: playerName - filters the widgets in the collection or holder to only count widgets owned by the specified player. The default value, null, results in no filtering by owner.
      variable: variable name - specifies the variable to store the result in (defaults to variable "COUNT").
      </pre>
    `, 'functions-count');
  }
  if(topicName == 'MOVE') {
    return infoButton(appendTo, `
      <pre>
      This function moves widgets into a target [holder]. If the target of the move is an occupied seat, then the move will instead direct the widgets to the hand associated with the seat. In this case, if the hand is set to childPerOwner, the owner will be set to the player in the seat.

      Parameters:

      [MOVE.from](from): widgetID (or an array) - specifies the widget(s) that contains the widgets to move. In the typical case, this would be a holder, but could be any widget with child widgets. If from is not specified, then the "DEFAULT" collection will be moved.
      collection: collection - specifies the collection that is to be moved (defaults to "DEFAULT"). When using a collection, omit the from parameter.
      to: widgetID (or an array) - specifies the widget(s) that widgets should be moved into. In the typical case, this would be a holder or seats, but could be any widget.
      count: number - limits the amount of moved widgets (defaults to 1). Can be 0 to move none, "all" to move every selected widget, a positive number to move that many of the selected widgets, or a negative number to leave that many of the selected widgets not moved.
      fillTo: number - fills the target holders/seats up to this number (defaults to null). If specified, then count is ignored.
      face: number - optionally sets the face of the moved widgets to the given value (see FLIP). If omitted, the widgets will be left as they are.
      Note that both count and fillTo will move an entire group to one of the to widgets. If there are enough widgets remaining in the from source, then it will move to the next destination. The order that the function picks targets for moving to is not well understood, so if there are less widgets in the from source than are required, game designers may want to account for that in the JSON in some other way.

      If the dropTarget property (when moving to a holder) does not match the widgets being moved, the widgets will become children of the holder, but will keep the original x,y coordinates. In other words, they will not follow the stackOffset rules for aligning child widgets.
      </pre>
    `, 'functions-move');
  }
  if(topicName == 'MOVE.from') {
    return infoButton(appendTo, `
      <pre>
      The from parameter specifies the widget(s) that contains the widgets to move. In the typical case, this would be a holder, but could be any widget with child widgets. If from is not specified, then the "DEFAULT" collection will be moved.
      </pre>
    `);
  }
  if(topicName == 'holder') {
    return infoButton(appendTo, `
      <pre>
      A holder is a widget that contains other widgets.
      </pre>
    `);
  }
  if(topicName == 'FOREACH') {
    return infoButton(appendTo, `
      <pre>
      This function iterates over a collection, object, array, string, or range of values. The loopRoutine parameter specifies the actions to take on each iteration.

      If "in" is given, it is treated as an object, array, or string, and loopRoutine receives a key and a value for each entry.
      If "range" is given (format [start, end, step]), loopRoutine is called once per value in the range, receiving it as value.
      If "collection" is given (and "in"/"range" are not), loopRoutine is called once per widget, receiving widgetID and a DEFAULT collection containing that one widget.
      If none of these are given, the DEFAULT collection is used.

      Values supplied to loopRoutine (key, value, widgetID, DEFAULT) are local to that routine; changes to other, previously-defined variables persist after the loop.

      Parameters:

      in: object/array/string - iterate over its keys/indices and values.
      range: [start, end, step] - iterate over a numeric range.
      collection: collection - the collection to iterate over if "in"/"range" are not given (defaults to DEFAULT collection).
      loopRoutine: routine - the operations to run on every iteration.
      </pre>
    `, 'functions-foreach');
  }
  if(topicName == 'IF') {
    return infoButton(appendTo, `
      <pre>
      This function checks a condition and branches into thenRoutine or elseRoutine before continuing with the rest of the current routine. Any variables/collections of the main routine are available in the then/else routines.

      Parameters:

      condition: number or string - a value evaluated as true or false. Alternatively, specify operand1/relation/operand2 to compute a condition.
      relation: &lt; / &lt;= / == / != / &gt;= / &gt; - the comparator for operand1 and operand2 (defaults to ==).
      operand1 / operand2: number or string - the values being compared (operand2 defaults to null).
      thenRoutine / elseRoutine: routine - executed depending on the result of the condition.

      undefined, null, 0, "" and false are "falsey"; everything else (including [] and the strings "null"/"false"/"0") is "truthy".
      </pre>
    `, 'functions-if');
  }
  if(topicName == 'SELECT') {
    return infoButton(appendTo, `
      <pre>
      This function identifies widgets matching the given source/type/property/relation/value/max criteria, then uses "mode" to combine that set of widgets into the collection named by "collection" (sorted by sortBy, if given). Selecting piles adds their content to the collection instead of the pile widget itself.

      Parameters:

      source: all or collection - the input to select from (defaults to all).
      type: widget type - limits the selection to widgets of this type (defaults to all).
      property / relation / value: the criteria a widget must match (relation defaults to ==; value defaults to null). Note that == is a strict comparison, unlike a similar JavaScript expression.
      max: number - limits how many matching widgets are used (defaults to 999999, effectively unlimited).
      collection: collection - the collection to create/change (defaults to DEFAULT collection). Must be a named collection.
      mode: set/add/remove/intersect - how the matched widgets affect collection (defaults to set).
      sortBy: property name, key object, or array of keys - sorts the collection after widgets are added.
      random: true/false - if max is smaller than the number of matches, pick randomly among them rather than taking the first ones (defaults to false).
      </pre>
    `, 'functions-select');
  }
  if(topicName == 'AUDIO') {
    return infoButton(appendTo, `
      <pre>
      This function causes a sound to play. A url for the audio file is required. Audio will not play on any device until the user interacts with the webpage.

      Parameters:

      source: url - the url of the audio file. It can play a clip from another website, or an asset uploaded through the JSON editor (defaults to "").
      maxVolume: number - the maximum volume, from 0 to 1. The actual volume played is the product of this and the player's own volume slider (defaults to 1).
      length: milliseconds - length the clip should play; null plays the full duration (defaults to null).
      player: playerName (or an array) - limits which player(s) hear the sound; null means every player hears it (defaults to null).
      count: number or "loop" - how many times the clip plays. "loop" plays forever, 0 means it won't play (defaults to 1). Ignored if length is set.
      silence: true/false - when true, stops all sound currently playing in the room (defaults to false).
      </pre>
    `, 'functions-audio');
  }
  if(topicName == 'CALL') {
    return infoButton(appendTo, `
      <pre>
      This function executes a custom routine defined in the same or another widget. It is most useful for "bundling" a sequence of operations you want to reuse.

      All collections and variables that exist when the call is made are inherited by the sub-routine, which also receives the collection "caller" (the widget that used CALL). Additional variables can be set via "arguments".

      Each CALL returns a variable and a collection. The variable named "result" inside the called routine becomes the variable named by "variable" (defaults to "result") in the caller; the collection named "result" inside the called routine always becomes the collection named "result" in the caller.

      Parameters:

      routine: routine name - the routine to execute (must end in "Routine").
      widget: widget id - the widget containing the routine (defaults to the current widget).
      variable: variable name - stores the value returned from the called routine (defaults to "result").
      return: true/false - if false, no further statements in the calling routine are executed after the CALL (defaults to true).
      arguments: JSON object - properties of this object are passed as variables to the called routine (optional).
      </pre>
    `, 'functions-call');
  }
  if(topicName == 'CANVAS') {
    return infoButton(appendTo, `
      <pre>
      This function simplifies control of canvas widgets. The mode parameter determines which automation is executed.

      Parameters:

      collection: collection - the collection of canvases to change (defaults to DEFAULT collection).
      mode: set/inc/dec/change/reset/setPixel - which automation to apply. set/inc/dec change the activeColor index into colorMap using value. change replaces the colorMap entry at index value with color. reset sets every pixel back to the first color of colorMap. setPixel sets the pixel at (x, y) to the colorMap index given by value.
      value: number - index into colorMap (defaults to 1).
      color: string - the new color used by mode "change" (defaults to VTT blue).
      x and y: number - the pixel coordinates used by mode "setPixel" (defaults to 0).
      </pre>
    `, 'functions-canvas');
  }
  if(topicName == 'CLICK') {
    return infoButton(appendTo, `
      <pre>
      This function clicks widgets as if they were clicked by a player. When a collection is used with a count greater than one, each widget in the collection is clicked once before repeating.

      Parameters:

      collection: collection - the collection of widgets to click (defaults to DEFAULT collection).
      count: number - how many times the click is triggered (defaults to 1).
      mode: respect/ignoreClickable/ignoreClickRoutine/ignoreAll - controls how the clickable property and any clickRoutine are honored (defaults to respect). respect performs the normal click behavior; ignoreClickable ignores the clickable property; ignoreClickRoutine ignores any clickRoutine and performs the default widget action instead; ignoreAll combines both.
      </pre>
    `, 'functions-click');
  }
  if(topicName == 'CLONE' || topicName == 'DELETE') {
    return infoButton(appendTo, `
      <pre>
      CLONE creates copies of every widget in a collection, replicating all properties of the original except id. Each clone also gets a clonedFrom property set to the id of the original. Children of the source widgets are not cloned unless recursive is used.

      DELETE removes every widget in a collection. It does not delete any children of the removed widgets; they become children of the tabletop instead.

      CLONE parameters:

      source: collection - the input collection to clone (defaults to DEFAULT).
      count: number - how many copies of each original to create (defaults to 1).
      xOffset / yOffset: number - offset applied to each clone relative to the original (defaults to 0).
      properties: object - properties to set on each cloned widget.
      recursive: true/false - if true, all descendants of the source are cloned too (defaults to false).
      collection: collection name - receives the widgets created by this operation (defaults to DEFAULT). Must be a named collection.

      DELETE parameters:

      collection: collection - the collection containing the widgets to delete (defaults to DEFAULT).
      </pre>
    `, 'functions-clone-and-delete');
  }
  if(topicName == 'DELAY') {
    return infoButton(appendTo, `
      <pre>
      This function pauses routine execution for a specified duration.

      Parameters:

      milliseconds: number - the length of the delay (defaults to 0).
      </pre>
    `, 'functions-delay');
  }
  if(topicName == 'FLIP') {
    return infoButton(appendTo, `
      <pre>
      This function flips widgets to the given face (for a "normal" card, 0 is the back and 1 is the front). If face is omitted, widgets flip to their "next" face as determined by faceCycle. If the holder is a seat, only widgets belonging to that seat are flipped.

      Parameters:

      holder: holderID (or an array) - the holder containing the widgets to flip (optional).
      collection: collection - the collection of widgets to flip (defaults to DEFAULT collection).
      count: number - limits how many widgets are flipped (defaults to "all"). 0 flips none, "all" flips every selected widget, a positive number flips that many, a negative number leaves that many unflipped.
      face: number - the target face. When omitted, flips to the next/random face per faceCycle.
      faceCycle: forward/backward/random - temporarily overrides the widget's faceCycle property for this operation.
      </pre>
    `, 'functions-flip');
  }
  if(topicName == 'GET') {
    return infoButton(appendTo, `
      <pre>
      This function reads a property (default id) of a single widget in a collection, or determines an aggregated value across multiple widgets, and stores the result in a variable.

      Parameters:

      collection: collection - the collection of widgets to read from (defaults to DEFAULT collection).
      property: property name (or an array, to read a nested sub-property) - the property to read.
      variable: variable name - stores the result (defaults to the name of property).
      aggregation: first/last/sum/average/median/min/max/array - how to combine values across multiple widgets (defaults to "first").
      skipMissing: true/false - skip widgets where the property has no value at all.
      </pre>
    `, 'functions-get');
  }
  if(topicName == 'INPUT') {
    return infoButton(appendTo, `
      <pre>
      This function shows an overlay with input controls to ask the player for input; on confirmation, the routine continues with the results stored in the given variables. Cancelling stops only the routine INPUT is directly inside (the main routine, or the branch of an IF/CALL/FOREACH it is nested in).

      Parameters:

      fields: array of field definitions - what to display, in order (checkbox, choose, color, number, palette, select, slider, string, subtitle, switch, text, and title types are supported, each with their own parameters - see the wiki for the full list).
      header: text - text displayed above everything else (mostly kept for backwards compatibility).
      css: css - modifies the css of field areas other than the header/title/subtitle.
      cancelButtonIcon / cancelButtonText: icon/text shown on the cancel button (defaults to no icon, "Cancel"). Set both explicitly to null to hide the cancel button entirely.
      confirmButtonIcon / confirmButtonText: icon/text shown on the confirm button (defaults to no icon, "Go").
      </pre>
    `, 'functions-input');
  }
  if(topicName == 'LABEL') {
    return infoButton(appendTo, `
      <pre>
      This function changes the text of widgets.

      Parameters:

      label: labelID (or an array) - the widget(s) to change (optional).
      collection: collection - the collection of widgets to change if label is not given (defaults to DEFAULT collection).
      mode: set/inc/dec/append - how the value is applied (defaults to set). inc/dec always treat the current value as a number.
      value: string or number - the value to apply (defaults to 0).
      </pre>
    `, 'functions-label');
  }
  if(topicName == 'MOVEXY') {
    return infoButton(appendTo, `
      <pre>
      This function moves widgets to a specific position on the surface, outside any holder. Widgets currently in a pile or holder are moved out first.

      Parameters:

      from: holderID (or an array) - the holder containing the widgets to move.
      count: number - limits how many widgets are moved (defaults to 1). 0 moves none, "all" moves every selected widget, a positive number moves that many, a negative number leaves that many unmoved.
      face: number - optionally sets the face of the moved widgets (see FLIP). If omitted, widgets keep their current face.
      x / y: number - the target position on the surface (defaults to 0).
      resetOwner: true/false - resets the owner property to null (defaults to true).
      snapToGrid: true/false - aligns x/y to the widget's grid, if any (defaults to true).

      The moved widgets can form piles as if a player moved them, but will never be placed into a holder - use MOVE for that.
      </pre>
    `, 'functions-movexy');
  }
  if(topicName == 'RECALL') {
    return infoButton(appendTo, `
      <pre>
      This function moves cards back into the holder they are associated with via deck. All cards belonging to that deck are moved. Do not use on holders that have no deck. Cards are recalled in DOM order (or by distance, see byDistance).

      Parameters:

      holder: holderID (or an array) - the holder(s) that cards should be recalled to.
      excludeCollection: collection - cards in this collection are not recalled (defaults to null).
      inHolder: true/false - whether cards already in some holder are recalled too (defaults to true).
      owned: true/false - whether cards owned by a player are recalled too (defaults to true).
      byDistance: true/false - recall in order of proximity to the holder instead of DOM order (defaults to false).
      </pre>
    `, 'functions-recall');
  }
  if(topicName == 'RESET') {
    return infoButton(appendTo, `
      <pre>
      This function looks at the given property on every widget; if that property is an object, each of its key/value pairs is applied to the widget. It is primarily intended to restore widgets to a previously saved state.

      Parameters:

      property: property name - the property on each widget that holds the values to restore (defaults to "resetProperties").
      </pre>
    `, 'functions-reset');
  }
  if(topicName == 'ROTATE') {
    return infoButton(appendTo, `
      <pre>
      This function changes the rotation of widgets. If the holder is a seat, only widgets belonging to that seat are rotated.

      Parameters:

      holder: holderID (or an array) - the holder containing the widgets to rotate (optional).
      collection: collection - the collection of widgets to change (defaults to DEFAULT collection).
      angle: number - degrees to rotate by; positive is clockwise (defaults to 90).
      count: number - limits how many widgets are rotated (defaults to 1). 0 rotates none, "all" rotates every selected widget, a positive number rotates that many, a negative number leaves that many unrotated.
      mode: set/add - whether the rotation is set to, or changed by, angle (defaults to add).
      </pre>
    `, 'functions-rotate');
  }
  if(topicName == 'SCORE') {
    return infoButton(appendTo, `
      <pre>
      This function modifies a property (score by default) in one or more seats. Use SCORE when a scoreboard uses rounds; use SET on the score property when it uses totals only. Usually you don't need SCORE at all if players use the scoreboard's built-in scoring overlay.

      Parameters:

      mode: set/inc/dec - how the value is applied (defaults to set).
      property: property name - which property holds the score arrays (defaults to "score").
      seats: seat id (or array), or null - which seats are affected; null means every seat (defaults to null).
      round: integer or null - the 1-based round to change; null appends a new round to each affected seat (defaults to null).
      value: number or null - the amount to apply; null means 1 for inc/dec or 0 for set (defaults to null).

      SCORE cannot be used to modify team scores directly - modify player scores instead and let the scoreboard compute team totals.
      </pre>
    `, 'functions-score');
  }
  if(topicName == 'SET') {
    return infoButton(appendTo, `
      <pre>
      This function changes a property of the given widgets.

      Parameters:

      collection: collection - the collection of widgets to change (defaults to DEFAULT collection).
      property: property name - the property to change (defaults to "parent").
      relation: = or an operation (+, -, *, /, ...) - whether value is set outright or computed against the current value.
      value: any type - the value to apply (defaults to null).
      </pre>
    `, 'functions-set');
  }
  if(topicName == 'SHUFFLE') {
    return infoButton(appendTo, `
      <pre>
      This function randomizes the stacking order (z position) of widgets. If the holder is a seat, only that seat's hand is shuffled.

      Parameters:

      holder: holderID or seatID (or an array) - the holder containing the widgets to shuffle (optional).
      collection: collection - the collection of widgets to shuffle (defaults to DEFAULT collection).
      mode: true random/overhand/reverse/riffle/seeded - the shuffling technique (defaults to "true random").
      modeValue: number - meaning depends on mode: number of overhand or riffle shuffles, or the seed for seeded (defaults to 1).
      </pre>
    `, 'functions-shuffle');
  }
  if(topicName == 'SORT') {
    return infoButton(appendTo, `
      <pre>
      This function rearranges the stacking order (z position) of widgets according to the given sort key. Widgets with null values sort to the bottom; widgets with equal keys keep their relative order. If the holder is a seat, only that seat's widgets are sorted.

      Parameters:

      holder: holderID (or an array) - the holder containing the widgets to sort (optional).
      collection: collection - the collection of widgets to sort if holder is not given (defaults to DEFAULT collection).
      key: property name, key object ({key, order, reverse}), or an array of either - what to sort by; an array is applied left to right until values differ.
      reverse: true/false - reverses the order after sorting by key (defaults to false).
      rearrange: true/false - if false, only the order within the collection changes, without moving widgets in the room (only applies to collections, defaults to true).

      Sorting compares values as strings unless they're numbers; pad numeric strings with zeros, or use {"numeric": true} in options, to sort them numerically.
      </pre>
    `, 'functions-sort');
  }
  if(topicName == 'SWAPHANDS') {
    return infoButton(appendTo, `
      <pre>
      This function swaps cards between the hands of the seats in a collection, avoiding the need to MOVE the cards manually. With more than two seats, it becomes a rotation, with each seat passing its hand to the next.

      Parameters:

      interval: integer - how many positions each hand is passed around the table (defaults to 1).
      direction: forward/backward/random - how the "next" seat is chosen (defaults to forward). forward/backward step through seats in index order; random pairs seats randomly.
      source: all or collection - the seats involved in the swap (defaults to all).
      </pre>
    `, 'functions-swaphands');
  }
  if(topicName == 'TIMER') {
    return infoButton(appendTo, `
      <pre>
      This function simplifies control of timer widgets. The mode parameter determines which automation is executed.

      Parameters:

      timer: timerID - the timer to modify. The operation is ignored if this isn't the id of a timer.
      collection: collection - the collection of timers to use if timer is not given (defaults to DEFAULT collection). Non-timer widgets in the collection are ignored.
      mode: set/inc/dec/pause/start/toggle/reset - which automation to apply (defaults to "toggle"). set/inc/dec change milliseconds; pause/start/toggle change paused; reset sets milliseconds back to the timer's start value and pauses it.
      value: number or string - the value (in milliseconds) used by set/inc/dec; a string is treated as the name of a property on the timer to read the value from (defaults to 0).
      seconds: number - like value, but expressed in seconds and multiplied by 1000 (defaults to 0).
      </pre>
    `, 'timer');
  }
  if(topicName == 'TURN') {
    return infoButton(appendTo, `
      <pre>
      This function changes whose turn it is among a set of seats.

      Parameters:

      turn: integer, seat id, "first", or "last" - which seat becomes active, interpreted according to turnCycle.
      turnCycle: forward/backward/random/position/seat - how the next player is chosen. forward/backward sort the active seats by index and move that many turn positions from the current seat; random picks a random active seat (turn is ignored); position uses turn "first"/"last" to pick the active seat with the smallest/largest index; seat uses turn as the id of the seat whose turn it becomes.
      source: all or collection - which seats are considered (defaults to all). Seats with skipTurn set to true are never chosen.
      collection: collection name - receives the seat whose turn it now is (defaults to "TURN"). Must be a named collection.
      </pre>
    `, 'seats');
  }
  if(topicName == 'UPLOAD') {
    return infoButton(appendTo, `
      <pre>
      This function lets a player upload a file (image, sound, or JSON) for use in the game.

      Parameters:

      fileTypes: array of file extensions - filters which file types the player may choose (defaults to a standard set of image/audio/JSON extensions).
      variable: variable name - stores the uploaded file's path, e.g. "/assets/1234_5678" (defaults to "uploadedFileName").
      </pre>
    `, 'upload');
  }
  if(topicName == 'VAR') {
    return infoButton(appendTo, `
      <pre>
      This function sets multiple variables directly and simultaneously. Unlike a "var x = ..." statement, it lets you set arrays, object literals, or strings containing arbitrary characters without worrying about escape sequences.

      Parameters:

      variables: object - the variables to set, as key/value pairs.
      </pre>
    `, 'var');
  }
}
