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
    description: 'Runs whenever any property of this widget changes. The routine receives the variables property, oldValue and value. Use a property-specific event like fooChangeRoutine to only react to changes of the property foo.'
  },
  {
    property: 'enterRoutine',
    label: 'widget enters',
    description: 'Runs when another widget becomes a child of this widget. The routine receives the collection child and the variable oldParentID.'
  },
  {
    property: 'leaveRoutine',
    label: 'widget leaves',
    description: 'Runs when a child widget is removed from this widget. The routine receives the collection child. Note that it may run multiple times for a single move.'
  },
  {
    property: 'gameStartRoutine',
    label: 'game starts',
    description: 'Runs once when a player loads the game fresh from the game shelf or public library, but not when loading a saved game in progress.'
  },
  {
    property: 'globalUpdateRoutine',
    label: 'any widget changed',
    description: 'Runs when any property of any widget changes. The routine receives the variables widgetID, property, oldValue and value plus the collection widget. Use a property-specific event like fooGlobalUpdateRoutine to only react to changes of the property foo.'
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
      description: `Runs whenever the ${match[1]} property of this widget changes. The routine receives the variables oldValue and value.`
    };
  }
  if(match = property.match(/^(.+)GlobalUpdateRoutine$/)) {
    return {
      property,
      label: `${match[1]} changed anywhere`,
      description: `Runs whenever the ${match[1]} property of any widget changes. The routine receives the variables widgetID, oldValue and value plus the collection widget.`
    };
  }
  return {
    property,
    label: property.replace(/Routine$/, ''),
    description: 'Custom routine. It does not run on its own: call it from any routine using the CALL function with this name as the routine parameter.'
  };
}

// object properties that automate widgets without a routine, edited as JSON
const propertyAutomations = [
  {
    property: 'onEnter',
    label: 'set properties on enter',
    types: [ 'holder' ],
    description: 'Every property in this object is applied to a widget when it enters this holder. For example activeFace: 1 flips cards face up and rotation: 0 straightens them. You can also set custom properties here and react to them in your routines.'
  },
  {
    property: 'onLeave',
    label: 'set properties on leave',
    types: [ 'holder' ],
    description: 'Every property in this object is applied to a widget when it leaves this holder. For example activeFace: 0 flips cards face down and rotation: 0 straightens them. You can also set custom properties here and react to them in your routines.'
  },
  {
    property: 'resetProperties',
    label: 'reset properties',
    types: null,
    description: 'Every property in this object is applied to this widget by the RESET function - typically used by a reset button to restore the initial game state. Play applies them right now. Record copies the widget\'s current values (including defaults like x, y and rotation) into the object so RESET will restore this exact state.'
  }
];

class AddEventPopup extends Popup {
  constructor(source, existingProperties, callback, widgetType=null) {
    super(source);
    this.existingProperties = existingProperties;
    this.callback = callback;
    this.widgetType = widgetType;
  }

  onClick(e) {
  }

  show() {
    super.show();
    this.setTitle('Add Routine');

    let available = predefinedEvents.filter(e=>this.existingProperties.indexOf(e.property) == -1);
    // enter/leave events mostly matter for holders, so list them last elsewhere
    if(this.widgetType != 'holder') {
      const holderish = e=>[ 'enterRoutine', 'leaveRoutine' ].indexOf(e.property) != -1;
      available = [ ...available.filter(e=>!holderish(e)), ...available.filter(holderish) ];
    }
    if(available.length) {
      const [ , predefinedContent ] = this.addAccordionSection('Predefined Routines');
      for(const event of available) {
        const entry = div(predefinedContent, 'add-event-entry');
        button(entry, event.label, _=>{
          this.callback(event.property);
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
      if(this.existingProperties.indexOf(name) != -1)
        return;
      this.callback(name);
      this.hide();
    };
    nameInput.addEventListener('keydown', e=>{
      if(e.key == 'Enter')
        addCustom();
    });
    button(customContent, 'Add', addCustom);

    if(!available.length)
      $('.accordion-content', this.domElement).classList.add('open');
    this.moveIntoView();
  }
}

// opens the JSON editor module and scrolls it to the given widget property key
function openWidgetJsonAtProperty(property) {
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
    for(const key of $a('i.key', highlight)) {
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
    const widgetID = typeof widget.get == 'function' ? widget.get('id') : widget.state.id;
    this.expandedEvents = expandedEventsByWidget[widgetID] || (expandedEventsByWidget[widgetID] = {});
    this.routineEditors = {}; // kept across renders so folding and other UI state survive
    this.render();
  }

  eventProperties() {
    const properties = Object.keys(this.widget.state).filter(p=>p.match(/Routine$/) && Array.isArray(this.widget.state[p]));
    const predefinedOrder = predefinedEvents.map(e=>e.property);
    return properties.sort((a, b)=>{
      const indexA = predefinedOrder.indexOf(a);
      const indexB = predefinedOrder.indexOf(b);
      if(indexA != -1 && indexB != -1)
        return indexA - indexB;
      if(indexA != indexB)
        return indexA != -1 ? -1 : 1;
      return a < b ? -1 : 1;
    });
  }

  onPropertyChange() {
    // update existing editors in place (a no-op for echoes of our own edits)
    // and re-render the section so added/removed handlers appear
    for(const property in this.routineEditors) {
      if(Array.isArray(this.widget.state[property]))
        this.routineEditors[property].onPropertyChange(this.widget.state[property]);
      else
        delete this.routineEditors[property];
    }
    this.render();
  }

  render() {
    this.domElement.innerHTML = '';

    div(this.domElement, 'events-editor-group').textContent = 'Routines';

    for(const property of this.eventProperties()) {
      const event = describeEventProperty(property);
      const expanded = !!this.expandedEvents[property];

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

      const name = document.createElement('span');
      name.className = 'events-editor-property';
      name.textContent = property;
      headerDOM.append(name);

      infoButton(headerDOM, `<pre>${escapeHTML(event.description)}</pre>`);

      const jsonButton = document.createElement('span');
      jsonButton.className = 'material-symbols events-editor-json';
      jsonButton.textContent = 'data_object';
      jsonButton.title = 'Open this routine in the JSON editor';
      jsonButton.addEventListener('click', e=>{
        e.stopPropagation();
        openWidgetJsonAtProperty(property);
      });
      headerDOM.append(jsonButton);

      const removeButton = document.createElement('span');
      removeButton.className = 'material-symbols events-editor-remove';
      removeButton.textContent = 'delete';
      removeButton.title = 'Remove this routine';
      removeButton.addEventListener('click', e=>{
        e.stopPropagation();
        if(confirm(`Remove ${property} and all its operations?`)) {
          delete this.expandedEvents[property];
          delete this.routineEditors[property];
          this.onChange(property, undefined);
          this.render();
        }
      });
      headerDOM.append(removeButton);

      headerDOM.addEventListener('click', _=>{
        this.expandedEvents[property] = !expanded;
        this.render();
      });

      if(expanded) {
        const contentDOM = div(eventDOM, 'events-editor-event-content');
        contentDOM.addEventListener('click', e=>e.stopPropagation());
        if(!this.routineEditors[property]) {
          // clone in both directions: the editor mutates its own copy, and the widget must
          // never share references with it (deltas would alias widget state to the editor's
          // arrays and make later set() calls no-op because the state already "changed")
          this.routineEditors[property] = new RoutineEditor(this.widget, JSON.parse(JSON.stringify(this.widget.state[property])));
          this.routineEditors[property].registerChangeListener(v=>this.onChange(property, JSON.parse(JSON.stringify(v))));
        }
        contentDOM.append(this.routineEditors[property].domElement);
      }
    }

    if(!this.eventProperties().length) {
      const emptyHint = document.createElement('div');
      emptyHint.className = 'events-editor-empty';
      emptyHint.textContent = 'This widget has no routines yet.';
      this.domElement.append(emptyHint);
    }

    const addButton = button(this.domElement, 'Add Routine', _=>{
      const widgetType = typeof this.widget.get == 'function' ? this.widget.get('type') : this.widget.state.type;
      const popup = new AddEventPopup(addButton, this.eventProperties(), property=>{
        this.expandedEvents[property] = true;
        this.onChange(property, []);
        this.render();
      }, widgetType);
      popup.show();
    });
    addButton.className = 'events-editor-add';

    this.renderPropertyAutomations();
  }

  renderPropertyAutomations() {
    const widgetType = typeof this.widget.get == 'function' ? this.widget.get('type') : this.widget.state.type;
    const applicable = propertyAutomations.filter(automation=>!automation.types || automation.types.indexOf(widgetType) != -1);
    if(applicable.length)
      div(this.domElement, 'events-editor-group').textContent = 'Properties';
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

      infoButton(headerDOM, `<pre>${escapeHTML(automation.description)}</pre>`);

      if(isSet) {
        const removeButton = document.createElement('span');
        removeButton.className = 'material-symbols events-editor-remove';
        removeButton.textContent = 'delete';
        removeButton.title = `Remove ${property}`;
        removeButton.addEventListener('click', e=>{
          e.stopPropagation();
          if(confirm(`Remove ${property}?`)) {
            delete this.expandedEvents[property];
            this.onChange(property, undefined);
            this.render();
          }
        });
        headerDOM.append(removeButton);
      }

      headerDOM.addEventListener('click', _=>{
        this.expandedEvents[property] = !expanded;
        this.render();
      });

      if(expanded) {
        const contentDOM = div(eventDOM, 'events-editor-event-content');
        contentDOM.addEventListener('click', e=>e.stopPropagation());

        const textarea = document.createElement('textarea');
        textarea.className = 'events-editor-property-json';
        textarea.value = JSON.stringify(isSet ? this.widget.state[property] : {}, null, 2);
        textarea.addEventListener('change', _=>{
          try {
            const value = JSON.parse(textarea.value);
            textarea.classList.remove('inputError');
            this.onChange(property, value);
            this.render();
          } catch(e) {
            textarea.classList.add('inputError');
          }
        });
        contentDOM.append(textarea);

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

  // snapshot the widget so RESET can restore its current state: the explicitly
  // set properties plus the position-related ones even at their default values
  recordResetProperties() {
    const snapshot = {};
    if(typeof this.widget.get == 'function')
      for(const property of [ 'x', 'y', 'z', 'rotation', 'parent', 'owner', 'activeFace' ])
        if(typeof this.widget.get(property) != 'undefined')
          snapshot[property] = this.widget.get(property);
    for(const property in this.widget.state)
      if([ 'id', 'type', 'onEnter', 'onLeave', 'resetProperties' ].indexOf(property) == -1 && !property.match(/Routine$/))
        snapshot[property] = this.widget.state[property];
    return JSON.parse(JSON.stringify(snapshot));
  }
}
