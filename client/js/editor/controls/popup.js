class Popup {
  constructor(source) {
    this.source = source;
    this.domElement = document.createElement('div');
    this.domElement.classList.add('inline-popup');
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

  hide() {
    this.domElement.remove();
  }

  moveIntoView() {
    const rect = this.domElement.getBoundingClientRect();
    if(rect.right > window.innerWidth - 10)
      this.domElement.style.left = `${window.innerWidth - rect.width - 10}px`;
    if(rect.bottom > window.innerHeight - 10)
      this.domElement.style.top = `${window.innerHeight - rect.height - 10}px`;
  }

  notifyChangeListeners(value) {
    for(const listener of this.changeListeners) {
      listener(value);
    }
  }

  onClick(e) {
    e.stopPropagation();
    this.hide();
  }

  setTitle(title) {
    if(!$('h1', this.domElement))
      this.domElement.prepend(document.createElement('h1'));
    $('h1', this.domElement).textContent = title;
  }

  show() {
    const sourceRect = this.source.getBoundingClientRect();
    $('#editor').append(this.domElement);
    this.domElement.style.left = `${sourceRect.left}px`;
    this.domElement.style.top = `${sourceRect.bottom}px`;
    this.moveIntoView();
    this.domElement.addEventListener('click', this.onClick.bind(this));
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

class RoutinePopup extends Popup {
  constructor(source, operationName, parameterNames, widget, variables, collections) {
    super(source);
    this.operationName = operationName;
    this.parameterNames = parameterNames;
    this.widget = widget;
    this.variables = variables;
    this.collections = collections;
    this.changeListeners = [];
  }

  onClick(e) {
  }

  registerChangeListener(listener) {
    this.changeListeners.push(listener);
  }

  show(showVariables=true, showCollections=true) {
    super.show();
    this.setTitle(this.operationName);
    commonInfoButton($('h1', this.domElement), this.operationName);
    $('h1', this.domElement).append(this.parameterNames);
    //commonInfoButton($('h1', this.domElement), parameterName);
    //infoButton($('h1', this.domElement), 'Parameters are the values that are passed to the operation.', 'parameters', 'tutorial-parameters');

    if(showVariables) {
      const [ variablesTitle, variablesContent ] = this.addAccordionSection('Variables');
      infoButton(variablesTitle, `
        Variables can be used to store values that are used in the operation.
        You can use [VAR], [var] or [COUNT] to put values into variables, then use [var] or [VAR] to do calculations.
        Then you can use the variable here.
      `);
      for(const variable of this.variables.sort())
        button(variablesContent, variable, _=>this.setNewValue(`\$\{${variable}\}`));

      const [ predefinedVariablesTitle, predefinedVariablesContent ] = this.addAccordionSection('Predefined Variables');
      infoButton(predefinedVariablesTitle, `
        <pre>
        Each routine begins with a number of predefined variables:
      
        activeColors - array of colors of active players in the room
        activePlayers - array of active players' names in the room
        activeSeats - array of the id of every seat in the room with a seated player
        mouseCoords - [x,y] array of mouse/cursor coordinates of player clicking the widget
        playerColor - color of player clicking the widget
        playerName - name of the player clicking the widget
        seatID - id of the first seat the active player is in. Set to null if the player is not in a seat
        seatIndex - index number of the seatID. Set to null if the player is not in a seat
        thisID - id of the widget that contains the routine
        </pre>
      `);
      
      for(const variable of ['activeColors', 'activePlayers', 'activeSeats', 'mouseCoords', 'playerColor', 'playerName', 'seatID', 'seatIndex', 'thisID'])
        button(predefinedVariablesContent, variable, _=>this.setNewValue(`\$\{${variable}\}`));

      const [ widgetPropertiesTitle, widgetPropertiesContent ] = this.addAccordionSection('Widget Properties');
      infoButton(widgetPropertiesTitle, `
        Wherever you use a value in an operation, you can use a widget property of any widget instead.
        For example, you might want to put a score property on a card widget, then use that score in an operation.
      `);
      for(const property of Object.keys(this.widget.state).sort())
        button(widgetPropertiesContent, property, _=>this.setNewValue(`\$\{PROPERTY ${property}\}`));
    }

    if(showCollections) {
      const [ collectionsTitle, collectionsContent ] = this.addAccordionSection('Collections');
      infoButton(collectionsTitle, `
        <pre>
        A collection is, as its name implies, a collection of widgets. Collections can be created in two different ways.

        A [SELECT statement](SELECT) will create a collection and name it according to the collection parameter. If no collection parameter is provided, it will be named DEFAULT.
        </pre>
      `);
      for(const collection of this.collections.sort())
        button(collectionsContent, collection, _=>this.setNewValue(`\$\{${collection}\}`));
    }

    this.moveIntoView();
  }
}

class RoutineNumberPopup extends RoutinePopup {
  constructor(source, operationName, parameterNames, widget, variables, collections, options) {
    super(source, operationName, parameterNames, widget, variables, collections);
    this.options = options;
  }

  setNewValue(value) {
    this.notifyChangeListeners(value);
  }

  show() {
    const [ valueTitle, valueContent ] = this.addAccordionSection('Value');
    infoButton(valueTitle, 'Use fixed values that will always behave the same way.');

    if(this.options.specialValues)
      for(const value of this.options.specialValues)
        button(valueContent, value, _=>this.setNewValue(value));
    for(let i=1; i<=10; i++)
      button(valueContent, i, _=>this.setNewValue(i));

    const count = document.createElement('input');
    count.type = 'number';
    count.addEventListener('change', _=>this.setNewValue(+count.value));
    valueContent.append(count);

    super.show(true, false);
  }
}

class RoutineWidgetIDPopup extends RoutinePopup {
  constructor(source, operationName, parameterNames, widget, variables, collections, options) {
    super(source, operationName, parameterNames, widget, variables, collections);
    this.options = options;
  }

  show() {
    super.show(false, false);
    const [ title, content ] = this.addAccordionSection('Holders')
    this.holderSelection = new WidgetSelection([], widgets=>{
      this.notifyChangeListeners(widgets.map(w=>w.id));
      this.moveIntoView();
    });
    this.holderSelection.render();
    content.appendChild(this.holderSelection.domElement);
  }
}

function button(appendTo, text, onClick) {
  const button = document.createElement('button');
  button.textContent = text;
  button.addEventListener('click', onClick);
  appendTo.append(button);
  return button;
}

async function newRoutineValue(popup) {
  return new Promise(resolve=>{
    popup.show();
    popup.registerChangeListener(value=>{
      popup.hide();
      resolve(value);
    });
  });
}

function infoButton(appendTo, infoHTML, tutorialName=null, videoFilename=null) {
  const dom = div(appendTo, 'info-button', `<span class=material-symbols>info</span>`);
  if(tutorialName)
    dom.innerHTML += `<span class=material-symbols>school</span>`;
  if(videoFilename)
    dom.innerHTML += `<span class=material-symbols>movie</span>`;
  dom.style.cursor = 'pointer';
  dom.style.color = 'gray';
  dom.style.display = 'inline-block';
  infoHTML = infoHTML.replace(/\[([^\]]+)\](?:\(([^)]+)\))?/g, (_, topicName, topicInfo)=>`<span class=highlight data-topic=${topicName}>${topicInfo ?? topicName}</span>`);
  dom.addEventListener('click', e=>{
    e.stopPropagation();
    const popup = new InfoPopup(dom, infoHTML, tutorialName, videoFilename);
    popup.show();
    for(const highlight of $a('.highlight', popup.domElement))
      commonInfoButton(highlight, highlight.dataset.topic);
    popup.moveIntoView();
  });
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
}
