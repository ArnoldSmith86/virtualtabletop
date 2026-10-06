const predefinedEvents = [
  {
    property: 'clickRoutine',
    label: 'click',
    description: 'Runs when a player clicks the widget (while its clickable property is true). It can also be triggered by the CLICK function and by pressing the key in the hotkey property.'
  },
  {
    property: 'doubleClickRoutine',
    label: 'double-click',
    description: 'Runs when a player clicks the widget twice within 350 milliseconds. If this is defined, a click routine on the same widget waits 350 milliseconds for a possible second click.'
  },
  {
    property: 'changeRoutine',
    label: 'property changed',
    description: 'Runs whenever any property of this widget changes. The routine can use value - what the property is now - as well as oldValue and property. To react to one property only, name the routine after it, like fooChangeRoutine for the property foo.'
  },
  {
    property: 'enterRoutine',
    label: 'widget enters',
    description: 'Runs when another widget is dropped into this widget. The routine starts with the widget that entered picked, and can use oldParentID - the widget it came from.'
  },
  {
    property: 'leaveRoutine',
    label: 'widget leaves',
    description: 'Runs when a widget is taken out of this widget. The routine starts with the widget that left picked. It can run more than once for a single move.'
  },
  {
    property: 'gameStartRoutine',
    label: 'game starts',
    description: 'Runs once when a player loads the game fresh from the game shelf or public library, but not when loading a saved game in progress.'
  },
  {
    property: 'globalUpdateRoutine',
    label: 'any widget changed',
    description: 'Runs when any property of any widget in the room changes. The routine starts with the changed widget picked and can use value - what the property is now - as well as oldValue, property and widgetID. To react to one property only, name the routine after it, like fooGlobalUpdateRoutine for the property foo.'
  }
];

function describeEventProperty(property) {
  for(const event of predefinedEvents)
    if(event.property == property)
      return event;

  let match;
  if(match = property.match(/^(.+)ChangeRoutine$/)) {
    return {
      property,
      label: `${match[1]} changed`,
      description: `Runs whenever the ${match[1]} property of this widget changes. The routine can use value - what ${match[1]} is now - and oldValue, what it was before.`
    };
  }
  if(match = property.match(/^(.+)GlobalUpdateRoutine$/)) {
    return {
      property,
      label: `${match[1]} changed anywhere`,
      description: `Runs whenever the ${match[1]} property of any widget in the room changes. The routine starts with that widget picked and can use value - what ${match[1]} is now - as well as oldValue and widgetID.`
    };
  }
  return {
    property,
    label: property.replace(/Routine$/, ''),
    description: 'Runs only when another routine runs it by this name - the "Run the routine" operation. Nothing else triggers it.'
  };
}

// A deck is two things in one place: the widget on the table, which nobody
// clicks, and the cards it hands out, whose properties come from cardDefaults
// (see Card.getDefaultValue). So a routine written on a deck runs on the deck
// widget or on every one of its cards depending on which of the two it is in,
// and both are listed - a game can have the same routine in both places.
const routineTargets = {
  cardDefaults: {
    badge: 'every card',
    choice: 'on every card of this deck',
    note: 'Every card of this deck runs this routine: cardDefaults is what a card takes the properties it does not have itself from. A card type that sets the same routine overrides it.',
    describe: property=>`cardDefaults ↦ ${property}`
  },
  widget: {
    badge: 'the deck itself',
    choice: 'on the deck widget itself',
    note: 'Only the deck widget runs this routine. The cards it hands out do not - players click the cards, not the deck.',
    describe: property=>property
  }
};

function widgetTypeOf(widget) {
  return typeof widget.get == 'function' ? widget.get('type') : widget.state.type;
}

// where the routines of a widget live: its own properties, plus - for a deck -
// the card defaults it hands to its cards. cardDefaults comes first because a
// routine written on a deck is nearly always meant for its cards.
function routineTargetsOf(widget) {
  return widgetTypeOf(widget) == 'deck' ? [ 'cardDefaults', 'widget' ] : [ 'widget' ];
}

function cardDefaultsOf(widget) {
  const value = widget.state.cardDefaults;
  return value && typeof value == 'object' && !Array.isArray(value) ? value : {};
}

function routinePropertiesIn(source) {
  return Object.keys(source).filter(p=>p.match(/Routine$/) && Array.isArray(source[p]));
}

// the routines a deck gives its cards - the Automations section lists them, so
// the properties module counts them as automations too
function cardDefaultRoutines(widget) {
  return widgetTypeOf(widget) == 'deck' ? routinePropertiesIn(cardDefaultsOf(widget)) : [];
}

// what a routine card is filed under - which is the property name everywhere
// except for the card defaults of a deck, where two cards can share it
function routineEntryKey(property, target) {
  return target == 'cardDefaults' ? `cardDefaults.${property}` : property;
}

// object properties that automate widgets without a routine: a set of
// "property: value" pairs applied at a given moment. onEnter / onLeave belong to
// the widget types that take other widgets in - a holder and a line, which makes
// what is dropped on it one of its stops.
const propertyAutomations = [
  {
    property: 'onEnter',
    label: 'set properties on enter',
    types: [ 'holder', 'line' ],
    keyHint: 'property to set on the widget',
    subtitle: type=>type == 'line' ? 'Applied to any widget dropped onto this line.' : 'Applied to any widget dropped into this holder.',
    description: type=>`Every property in this object is applied to a widget when it ${type == 'line' ? 'is dropped onto this line and becomes one of its stops' : 'enters this holder'}. For example activeFace: 1 flips cards face up and rotation: 0 straightens them. You can also set custom properties here and react to them in your routines.`
  },
  {
    property: 'onLeave',
    label: 'set properties on leave',
    types: [ 'holder', 'line' ],
    keyHint: 'property to set on the widget',
    subtitle: type=>type == 'line' ? 'Applied to any widget dragged off this line.' : 'Applied to any widget taken out of this holder.',
    description: type=>`Every property in this object is applied to a widget when it ${type == 'line' ? 'is dragged off this line and stops being one of its stops' : 'leaves this holder'}. For example activeFace: 0 flips cards face down and rotation: 0 straightens them. You can also set custom properties here and react to them in your routines.`
  },
  {
    property: 'resetProperties',
    label: 'reset properties',
    types: null,
    keyHint: 'property to restore',
    subtitle: _=>'Applied to this widget when the game is reset.',
    description: _=>'Every property in this object is applied to this widget by the RESET function - typically used by a reset button to restore the initial game state. Play applies them right now. Record copies the widget\'s current values (including defaults like x, y and rotation) into the object so RESET will restore this exact state.'
  }
];

// A value typed into a property set: JSON where that is what was typed (numbers,
// booleans, null, arrays, objects) and a plain string otherwise. The two go both
// ways, so a row cannot retype what it shows: a string that would read as JSON
// ("0", "true") is shown in quotes and typed back with them, which is also the
// way to store the text 0 rather than the number.
function parsePropertySetValue(text) {
  try {
    return JSON.parse(text);
  } catch(e) {
    return text;
  }
}

function propertySetValueText(value) {
  if(typeof value != 'string')
    return JSON.stringify(value);
  try {
    JSON.parse(value);
    return JSON.stringify(value);
  } catch(e) {
    return value;
  }
}

// The property names proposed for a new entry, from the same tables the routine
// editor proposes for its property parameters: onEnter / onLeave set properties
// on the widget that entered, so this widget's own ones lead nowhere there -
// resetProperties restores exactly those.
function propertySetSuggestions(widget, property, alreadySet) {
  const groups = proposedPropertyGroups(widget, property == 'resetProperties');
  return groups.flatMap(group=>group.names).filter(name=>alreadySet.indexOf(name) == -1);
}

let addEventPopupCounter = 0;

class AddEventPopup extends Popup {
  // existingProperties is one list of routine names per place a routine can go
  // ({ cardDefaults: [...], widget: [...] }); a plain array is the widget's own,
  // which is all there is for everything but a deck
  constructor(source, existingProperties, callback, widgetType=null) {
    super(source);
    this.existingProperties = Array.isArray(existingProperties) ? { widget: existingProperties } : existingProperties;
    this.callback = callback;
    this.widgetType = widgetType;
    this.targets = Object.keys(this.existingProperties);
    this.target = this.targets[0];
    this.id = ++addEventPopupCounter;
  }

  onClick(e) {
  }

  show() {
    super.show();
    this.setTitle('Add routine');
    if(this.targets.length > 1)
      this.renderTargetChoice();
    this.renderRoutineChoice();
    this.moveIntoView();
  }

  // Which of the two places a deck keeps routines in this one goes to. The
  // notice is what the choice is about: written on the deck it stays on the
  // deck, and the cards only act on what cardDefaults gives them.
  renderTargetChoice() {
    const chooser = div(this.domElement, 'add-event-target');
    div(chooser, 'add-event-description').textContent = 'A deck hands its properties to the cards it makes through cardDefaults. For the cards to act on a routine, it has to be in cardDefaults - a routine on the deck itself only ever runs on the deck widget.';
    for(const target of this.targets) {
      const row = div(chooser, 'add-event-target-option');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `addEventTarget_${this.id}`;
      input.id = `addEventTarget_${this.id}_${target}`;
      input.checked = target == this.target;
      input.addEventListener('change', _=>{
        if(!input.checked)
          return;
        this.target = target;
        this.renderRoutineChoice();
        this.moveIntoView();
      });
      row.append(input);
      const label = document.createElement('label');
      label.htmlFor = input.id;
      label.textContent = routineTargets[target].choice;
      label.title = routineTargets[target].note;
      row.append(label);
    }
  }

  // the routines still available in the chosen place: a deck that already has a
  // clickRoutine on itself can still get one for its cards
  renderRoutineChoice() {
    for(const section of $a('.accordion-section', this.domElement))
      section.remove();
    const existing = this.existingProperties[this.target];

    let available = predefinedEvents.filter(e=>existing.indexOf(e.property) == -1);
    // enter/leave events mostly matter for the widgets that take others in (a
    // holder and a line), so list them last elsewhere
    if([ 'holder', 'line' ].indexOf(this.widgetType) == -1) {
      const holderish = e=>[ 'enterRoutine', 'leaveRoutine' ].indexOf(e.property) != -1;
      available = [ ...available.filter(e=>!holderish(e)), ...available.filter(holderish) ];
    }
    if(available.length) {
      const [ , predefinedContent ] = this.addAccordionSection('Predefined Routines');
      for(const event of available) {
        const entry = div(predefinedContent, 'add-event-entry');
        button(entry, event.label, _=>{
          this.callback(event.property, this.target);
          this.hide();
        });
        div(entry, 'add-event-description').textContent = event.description;
      }
    }

    const [ , customContent ] = this.addAccordionSection('Custom Routine');
    div(customContent, 'add-event-description').textContent = 'Custom routines are run from other routines using the CALL function. You can also use names like fooChangeRoutine or fooGlobalUpdateRoutine to react to changes of the property foo.';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'dealCardsRoutine';
    customContent.append(nameInput);
    const addCustom = _=>{
      let name = nameInput.value.replace(/[^a-zA-Z0-9_]/g, '');
      if(!name)
        return;
      if(!name.match(/Routine$/))
        name += 'Routine';
      if(existing.indexOf(name) != -1)
        return;
      this.callback(name, this.target);
      this.hide();
    };
    nameInput.addEventListener('keydown', e=>{
      if(e.key == 'Enter')
        addCustom();
    });
    button(customContent, 'Add', addCustom);

    if(!available.length)
      $('.accordion-content', this.domElement).classList.add('open');
  }
}

// opens the JSON editor module and scrolls it to the given widget property key.
// parent is the key the property is nested in (cardDefaults), so that a deck
// with a clickRoutine of its own and one for its cards scrolls to the right one
function openWidgetJsonAtProperty(property, parent=null) {
  const jsonModuleButton = $('#editorSidebar button[icon=data_object]');
  if(jsonModuleButton)
    jsonModuleButton.click();
  if(!property)
    return;
  // defer so the JSON editor has rendered and colorized its keys
  setTimeout(_=>{
    const highlight = $('#jeTextHighlight');
    if(!highlight)
      return;
    let insideParent = !parent;
    for(const key of $a('i.key', highlight)) {
      if(!insideParent) {
        insideParent = key.textContent == parent;
        continue;
      }
      if(key.textContent == property) {
        key.scrollIntoView({ block: 'center' });
        break;
      }
    }
  }, 120);
}

// which automation cards were open, kept per widget id so re-selecting a widget
// reopens the same ones (like the JSON editor remembering the cursor position)
const expandedEventsByWidget = {};

class EventsEditor {
  constructor(widget, onChange) {
    this.widget = widget;
    this.onChange = onChange; // called with (property, newValueOrUndefined)
    this.domElement = document.createElement('div');
    this.domElement.classList.add('events-editor');
    this.widgetID = typeof widget.get == 'function' ? widget.get('id') : widget.state.id;
    this.expandedEvents = expandedEventsByWidget[this.widgetID] || (expandedEventsByWidget[this.widgetID] = {});
    this.routineEditors = {}; // kept across renders so folding and other UI state survive
    this.render();
  }

  routineSource(target) {
    return target == 'cardDefaults' ? cardDefaultsOf(this.widget) : this.widget.state;
  }

  // one entry per routine and the place it is in. The same name in both places
  // of a deck is two routines with nothing to do with each other, so they are
  // both listed, next to each other.
  routineEntries() {
    const entries = [];
    for(const target of routineTargetsOf(this.widget))
      for(const property of routinePropertiesIn(this.routineSource(target)))
        entries.push({ property, target, key: routineEntryKey(property, target) });
    const predefinedOrder = predefinedEvents.map(e=>e.property);
    const rank = entry=>{
      const index = predefinedOrder.indexOf(entry.property);
      return index == -1 ? predefinedOrder.length : index;
    };
    return entries.sort((a, b)=>{
      if(rank(a) != rank(b))
        return rank(a) - rank(b);
      if(a.property != b.property)
        return a.property < b.property ? -1 : 1;
      return a.target == 'cardDefaults' ? -1 : 1;
    });
  }

  // where a routine card writes back to: a routine of the widget is a property
  // of its own, one of the card defaults an entry of the cardDefaults object
  setRoutine(entry, value) {
    if(entry.target != 'cardDefaults')
      return this.onChange(entry.property, value);
    const next = Object.assign({}, cardDefaultsOf(this.widget));
    if(value === undefined)
      delete next[entry.property];
    else
      next[entry.property] = value;
    this.onChange('cardDefaults', Object.keys(next).length ? next : undefined);
  }

  // What the assistant answered, written onto the widget. Recorded before
  // anything renders, because rendering is what marks the operations it changed
  // and writes the note above them - here and on every re-render after it.
  applyAiRoutine(entry, routine, result) {
    const before = this.routineSource(entry.target)[entry.property];
    delete this.routineEditors[entry.key]; // it keeps its own copy of the old one
    this.expandedEvents[entry.key] = true; // land on the result rather than a closed card
    aiApplyResult(this.widget.get('id'), entry.key, before, routine, result, entry.property,
      _=>this.setRoutine(entry, routine));
    this.render();
    // the routine can be further down the panel than the answer is tall, and the
    // popup has just closed - without this nothing on screen has changed
    aiScrollToResult(this.domElement.querySelector('.ai-routine-note'));
  }

  onPropertyChange() {
    // update existing editors in place (a no-op for echoes of our own edits)
    // and re-render the section so added/removed handlers appear
    const current = {};
    for(const entry of this.routineEntries())
      current[entry.key] = this.routineSource(entry.target)[entry.property];
    for(const key in this.routineEditors) {
      if(Array.isArray(current[key]))
        this.routineEditors[key].onPropertyChange(current[key]);
      else
        delete this.routineEditors[key];
    }
    this.render();
  }

  render() {
    this.domElement.innerHTML = '';

    div(this.domElement, 'events-editor-group').textContent = 'Routines';

    const entries = this.routineEntries();
    const targets = routineTargetsOf(this.widget);
    // the same routine in both places of a deck: each card says so, because on
    // its own neither would explain why the routine appears twice
    const inBothPlaces = entries.filter(entry=>entries.filter(other=>other.property == entry.property).length > 1).map(entry=>entry.property);

    for(const entry of entries) {
      const { property, target, key } = entry;
      const event = describeEventProperty(property);
      const expanded = !!this.expandedEvents[key];

      const eventDOM = div(this.domElement, 'events-editor-event');
      const headerDOM = div(eventDOM, 'events-editor-event-header');

      const toggle = document.createElement('span');
      toggle.className = 'material-symbols events-editor-toggle';
      toggle.textContent = expanded ? 'expand_more' : 'chevron_right';
      headerDOM.append(toggle);

      const label = document.createElement('span');
      label.className = 'events-editor-label';
      label.textContent = event.label;
      headerDOM.append(label);

      // which of the two things a deck is runs this routine - the one thing the
      // name of the routine cannot say
      if(targets.length > 1) {
        const where = div(headerDOM, 'events-editor-where');
        where.textContent = routineTargets[target].badge;
        where.title = routineTargets[target].note;
      }

      const name = document.createElement('span');
      name.className = 'events-editor-property';
      name.textContent = routineTargets[target].describe(property);
      headerDOM.append(name);

      infoButton(headerDOM, `<pre>${escapeHTML(event.description)}</pre>`);

      // the sentences below lean on their colors, so the key to them is where a
      // routine starts rather than only in a CSS comment
      const legend = infoButton(headerDOM, routineColorLegendHTML, null, null, 'the colors of a routine');
      legend.classList.add('events-editor-legend');
      $('.material-symbols', legend).textContent = 'palette';

      const jsonButton = document.createElement('span');
      jsonButton.className = 'material-symbols events-editor-json';
      jsonButton.textContent = 'data_object';
      jsonButton.title = 'Open this routine in the JSON editor';
      jsonButton.addEventListener('click', e=>{
        e.stopPropagation();
        openWidgetJsonAtProperty(property, target == 'cardDefaults' ? 'cardDefaults' : null);
      });
      headerDOM.append(jsonButton);

      aiRoutineButton(headerDOM, this.widget, entry, _=>this.routineSource(target)[property], (routine, result)=>this.applyAiRoutine(entry, routine, result));

      const removeButton = document.createElement('span');
      removeButton.className = 'material-symbols events-editor-remove';
      removeButton.textContent = 'delete';
      removeButton.title = 'Remove this routine';
      removeButton.addEventListener('click', e=>{
        e.stopPropagation();
        if(confirm(`Remove ${routineTargets[target].describe(property)} and all its operations?`)) {
          delete this.expandedEvents[key];
          delete this.routineEditors[key];
          this.setRoutine(entry, undefined);
          this.render();
        }
      });
      headerDOM.append(removeButton);

      focusable(headerDOM, _=>{
        this.expandedEvents[key] = !expanded;
        this.render();
      });
      headerDOM.setAttribute('aria-expanded', String(expanded));

      if(expanded) {
        const contentDOM = div(eventDOM, 'events-editor-event-content');
        contentDOM.addEventListener('click', e=>e.stopPropagation());
        // what runs this routine, for the widget that is two of them
        if(targets.length > 1) {
          const alsoIn = target == 'cardDefaults' ? 'on the deck itself' : 'in cardDefaults';
          div(contentDOM, 'events-editor-subtitle').textContent = routineTargets[target].note
            + (inBothPlaces.indexOf(property) == -1 ? '' : ` This deck also has a ${property} ${alsoIn} - the two are separate routines, each with its own operations.`);
        }
        if(!this.routineEditors[key]) {
          // clone in both directions: the editor mutates its own copy, and the widget must
          // never share references with it (deltas would alias widget state to the editor's
          // arrays and make later set() calls no-op because the state already "changed")
          this.routineEditors[key] = new RoutineEditor(this.widget, JSON.parse(JSON.stringify(this.routineSource(target)[property])), [], [], { routineKey: key });
          this.routineEditors[key].registerChangeListener(v=>this.setRoutine(entry, JSON.parse(JSON.stringify(v))));
        }
        contentDOM.append(this.routineEditors[key].domElement);
        aiShowResultNote(contentDOM, this.routineEditors[key]);
      }
    }

    if(!entries.length) {
      const emptyHint = document.createElement('div');
      emptyHint.className = 'events-editor-empty';
      emptyHint.textContent = 'This widget has no routines yet.';
      this.domElement.append(emptyHint);
    }

    const addButton = button(this.domElement, 'add routine', _=>{
      const existing = {};
      for(const target of targets)
        existing[target] = routinePropertiesIn(this.routineSource(target));
      const popup = new AddEventPopup(addButton, existing, (property, target)=>{
        const key = routineEntryKey(property, target);
        this.expandedEvents[key] = true;
        this.setRoutine({ property, target, key }, []);
        this.render();
      }, widgetTypeOf(this.widget));
      popup.show();
    });
    addButton.className = 'events-editor-add';

    aiAddRoutineButton(this.domElement, source=>{
      const existing = {};
      for(const target of targets)
        existing[target] = routinePropertiesIn(this.routineSource(target));
      // which routine to write is picked with the same popup "add routine" uses.
      // The routine itself is only made once there is something to put in it:
      // giving up on the assistant, or an answer that never comes, would
      // otherwise leave an empty routine behind on the widget.
      const popup = new AddEventPopup(source, existing, (property, target)=>{
        const entry = { property, target, key: routineEntryKey(property, target) };
        new AiRoutinePopup(source, this.widget, entry, _=>this.routineSource(target)[property],
          (routine, result)=>this.applyAiRoutine(entry, routine, result)).show();
      }, widgetTypeOf(this.widget));
      popup.show();
    });

    this.renderPropertyAutomations();
  }

  renderPropertyAutomations() {
    const widgetType = widgetTypeOf(this.widget);
    const applicable = propertyAutomations.filter(automation=>!automation.types || automation.types.indexOf(widgetType) != -1);
    // "Properties" in the property editor reads as "the other properties" - what
    // these are is a set of properties applied at a given moment
    if(applicable.length)
      div(this.domElement, 'events-editor-group').textContent = 'Property sets';
    for(const automation of applicable) {
      const property = automation.property;
      const expanded = !!this.expandedEvents[property];
      const isSet = typeof this.widget.state[property] != 'undefined';

      const eventDOM = div(this.domElement, 'events-editor-event');
      const headerDOM = div(eventDOM, 'events-editor-event-header');

      const toggle = document.createElement('span');
      toggle.className = 'material-symbols events-editor-toggle';
      toggle.textContent = expanded ? 'expand_more' : 'chevron_right';
      headerDOM.append(toggle);

      const label = document.createElement('span');
      label.className = 'events-editor-label';
      label.textContent = automation.label;
      headerDOM.append(label);

      const name = document.createElement('span');
      name.className = 'events-editor-property';
      name.textContent = property;
      headerDOM.append(name);

      infoButton(headerDOM, `<pre>${escapeHTML(automation.description(widgetType))}</pre>`);

      const jsonButton = document.createElement('span');
      jsonButton.className = 'material-symbols events-editor-json';
      jsonButton.textContent = 'data_object';
      jsonButton.title = 'Open this property in the JSON editor';
      jsonButton.addEventListener('click', e=>{
        e.stopPropagation();
        openWidgetJsonAtProperty(property);
      });
      headerDOM.append(jsonButton);

      // a property set the widget does not have yet has nothing to remove, and
      // it says so instead of leaving a gap where every other card has an icon
      const removeButton = document.createElement('span');
      removeButton.className = `material-symbols events-editor-remove${isSet ? '' : ' events-editor-disabled'}`;
      removeButton.textContent = 'delete';
      removeButton.title = isSet ? `Remove ${property}` : `${property} is not set on this widget, so there is nothing to remove`;
      if(isSet)
        removeButton.addEventListener('click', e=>{
          e.stopPropagation();
          if(confirm(`Remove ${property}?`)) {
            delete this.expandedEvents[property];
            this.onChange(property, undefined);
            this.render();
          }
        });
      else
        removeButton.addEventListener('click', e=>e.stopPropagation());
      headerDOM.append(removeButton);

      focusable(headerDOM, _=>{
        this.expandedEvents[property] = !expanded;
        this.render();
      });
      headerDOM.setAttribute('aria-expanded', String(expanded));

      if(expanded) {
        const contentDOM = div(eventDOM, 'events-editor-event-content');
        contentDOM.addEventListener('click', e=>e.stopPropagation());

        // "on enter" says when, not to what: a holder takes widgets in, a line
        // makes them one of its stops, and either way the set applies to them
        div(contentDOM, 'events-editor-subtitle').textContent = automation.subtitle(widgetType);

        this.renderPropertySet(contentDOM, automation);

        if(property == 'resetProperties') {
          const buttonsDOM = div(contentDOM, 'events-editor-property-buttons');
          const applyButton = button(buttonsDOM, 'Apply values now', _=>{
            const value = this.widget.state[property];
            for(const key in value)
              this.onChange(key, value[key]);
          });
          applyButton.title = 'Apply these properties to the widget now';
          applyButton.insertAdjacentHTML('afterbegin', '<span class=material-symbols>play_arrow</span>');
          const recordButton = button(buttonsDOM, 'Record current state', _=>{
            this.onChange(property, this.recordResetProperties());
            this.render();
          });
          recordButton.title = 'Copy the widget\'s current properties into resetProperties';
          recordButton.insertAdjacentHTML('afterbegin', '<span class=material-symbols>save</span>');
        }
      }
    }
  }

  // The entries of a property set, one "property: value" row each, plus a row
  // that adds one - typing raw JSON is what the JSON editor is for. The name of
  // an entry is fixed once it is added (renaming it is removing and adding it),
  // so it is a label and only the value is an input.
  renderPropertySet(contentDOM, automation) {
    const property = automation.property;
    const list = div(contentDOM, 'events-editor-property-set');

    const currentSet = _=>{
      const value = this.widget.state[property];
      return value && typeof value == 'object' && !Array.isArray(value) ? value : {};
    };
    // an empty set is no set: removing the last entry removes the property, the
    // same as the card's delete button does
    const save = next=>this.onChange(property, Object.keys(next).length ? next : undefined);

    for(const key of Object.keys(currentSet())) {
      const rowDOM = div(list, 'events-editor-property-row');

      const keyDOM = div(rowDOM, 'events-editor-property-key');
      keyDOM.textContent = key;
      keyDOM.title = key;

      const valueInput = document.createElement('input');
      valueInput.type = 'text';
      valueInput.className = 'events-editor-property-value';
      valueInput.value = propertySetValueText(currentSet()[key]);
      valueInput.placeholder = 'value';
      valueInput.title = 'The value this property is set to. Anything that is valid JSON (a number, true, null, an object) is stored as such, everything else as text - put quotes around it to store it as text anyway.';
      // no re-render on an edit: it would take the focus out of the input
      valueInput.addEventListener('change', _=>{
        save(Object.assign({}, currentSet(), { [key]: parsePropertySetValue(valueInput.value) }));
      });
      rowDOM.append(valueInput);

      const removeButton = document.createElement('span');
      removeButton.className = 'material-symbols events-editor-remove';
      removeButton.textContent = 'delete';
      removeButton.title = `Remove ${key}`;
      removeButton.addEventListener('click', _=>{
        const next = Object.assign({}, currentSet());
        delete next[key];
        save(next);
        this.render();
      });
      rowDOM.append(removeButton);
    }

    // what a typed value is stored as is a trap ("false" the text or false the
    // value?), and the rule is one line - so it is on the page rather than in
    // the title of an input nobody hovers
    div(contentDOM, 'events-editor-property-hint').textContent = 'true, 12, null and [ 1, 2 ] are stored as values; anything else as text. "12" in quotes is the text 12.';

    const addRow = div(list, 'events-editor-property-row events-editor-property-add');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'events-editor-property-name';
    nameInput.placeholder = automation.keyHint;

    const suggestions = propertySetSuggestions(this.widget, property, Object.keys(currentSet()));
    if(suggestions.length) {
      const datalist = document.createElement('datalist');
      datalist.id = `propertySet_${property}_${this.widgetID}`;
      for(const name of suggestions) {
        const option = document.createElement('option');
        option.value = name;
        datalist.append(option);
      }
      addRow.append(datalist);
      nameInput.setAttribute('list', datalist.id);
    }
    addRow.append(nameInput);

    // the value belongs on the same line as the name it belongs to: a row that
    // only takes a name adds a half-finished entry and then asks for the rest
    // one line above, which is the complaint VAR's pair rows were fixed for
    const addValueInput = document.createElement('input');
    addValueInput.type = 'text';
    addValueInput.className = 'events-editor-property-value';
    addValueInput.placeholder = 'value';
    addRow.append(addValueInput);

    const addEntry = _=>{
      const key = nameInput.value.trim();
      if(!key || typeof currentSet()[key] != 'undefined')
        return;
      save(Object.assign({}, currentSet(), { [key]: parsePropertySetValue(addValueInput.value) }));
      this.render();
    };
    for(const input of [ nameInput, addValueInput ])
      input.addEventListener('keydown', e=>{
        if(e.key == 'Enter')
          addEntry();
      });
    const addEntryButton = button(addRow, 'add', addEntry);
    addEntryButton.className = 'events-editor-property-add-button';
    // a button that does nothing until a name is typed says so instead of
    // swallowing the click
    const updateAddEntryButton = _=>{
      const key = nameInput.value.trim();
      addEntryButton.disabled = !key || typeof currentSet()[key] != 'undefined';
      addEntryButton.title = !key ? 'Type the name of the property to set first' : (addEntryButton.disabled ? `${key} is already in this set` : `Add ${key} to this set`);
    };
    nameInput.addEventListener('input', updateAddEntryButton);
    updateAddEntryButton();
  }

  // snapshot the widget so RESET can restore its current state: the explicitly
  // set properties plus the position-related ones even at their default values -
  // but only where the widget has the property at all. get() answers null for
  // one it has never heard of (a holder has no activeFace) exactly the way it
  // answers for an empty one, and RESET would go on to set that null.
  recordResetProperties() {
    const snapshot = {};
    if(typeof this.widget.get == 'function')
      for(const property of [ 'x', 'y', 'z', 'rotation', 'parent', 'owner', 'activeFace' ])
        if(typeof this.widget.state[property] != 'undefined' || typeof this.widget.getDefaultValue == 'function' && this.widget.getDefaultValue(property) !== undefined)
          snapshot[property] = this.widget.get(property);
    for(const property in this.widget.state)
      if([ 'id', 'type', 'onEnter', 'onLeave', 'resetProperties' ].indexOf(property) == -1 && !property.match(/Routine$/))
        snapshot[property] = this.widget.state[property];
    return JSON.parse(JSON.stringify(snapshot));
  }
}
