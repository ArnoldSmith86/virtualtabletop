let jeEnabled = false;
let jeZoomOut = false;
let jeWidget = null;
let jeStateBefore = null;
let jeStateNow = null;
let jeJSONerror = null;
let jeContext = null;
const jeState = {
  ctrl: false,
  shift: false,
  mouseX: 0,
  mouseY: 0,
  widget: null
};

const jeCommands = [
  {
    name: 'toggle boolean',
    context: '"(true|false)"',
    call: function() {
      jeInsert(jeContext.slice(1), jeContext[jeContext.length-2], jeContext[jeContext.length-1]=='"false"');
    }
  },
  {
    name: 'toggle zoom out',
    forceKey: 'Z',
    call: function() {
      console.log("yes");
      jeZoomOut = !jeZoomOut;
      if(jeZoomOut) {
        $('body').classList.add('jeZoomOut');
      } else {
        $('body').classList.remove('jeZoomOut');
      }
      setScale();
    }
  },
  {
    name: _=>`remove property ${jeContext && jeContext[jeContext.length-1]}`,
    forceKey: 'd',
    context: ' ↦ (?=[^"]+$)',
    call: function() {
      let pointer = jeStateNow;
      for(const key of jeContext.slice(1))
        if(typeof pointer[key] == 'object')
          pointer = pointer[key];
      delete pointer[jeContext[jeContext.length-1]];

      const oldStart = $('#jeText').selectionStart;
      const oldEnd   = $('#jeText').selectionEnd;
      $('#jeText').value = JSON.stringify(jeStateNow, null, '  ');
      $('#jeText').selectionStart = oldStart;
      $('#jeText').selectionEnd   = oldEnd;
    },
    show: function() {
      return jeStateNow && jeStateNow[jeContext && jeContext[jeContext.length-1]] !== undefined;
    }
  },
  {
    name: _=>jeJSONerror?'go to error':'apply changes',
    forceKey: ' ',
    call: function() {
      if(jeJSONerror) {
        const location = String(jeJSONerror).match(/line ([0-9]+) column ([0-9]+)/);
        if(location)
          $('#jeText').selectionStart = $('#jeText').selectionEnd = $('#jeText').value.split('\n').slice(0, location[1]-1).join('\n').length + +location[2];
      } else {
        $('#editWidgetJSON').dataset.previousState = jeStateBefore;
        $('#editWidgetJSON').value = $('#jeText').value;
        $('#updateWidgetJSON').click();
      }
    }
  }
];

function jeAddCommands() {
  jeAddWidgetPropertyCommands(new BasicWidget());
  jeAddWidgetPropertyCommands(new Button());
  jeAddWidgetPropertyCommands(new Card());
  jeAddWidgetPropertyCommands(new Deck());
  jeAddWidgetPropertyCommands(new Holder());
  jeAddWidgetPropertyCommands(new Label());
  jeAddWidgetPropertyCommands(new Pile());
  jeAddWidgetPropertyCommands(new Spinner());
}

function jeAddWidgetPropertyCommands(object) {
  for(const property in object.defaults)
    if(property != 'typeClasses')
      jeAddWidgetPropertyCommand(object.defaults, property);
  object.applyRemove();
}

function jeAddWidgetPropertyCommand(defaults, property) {
  jeCommands.push({
    name: property,
    context: `^${defaults.typeClasses.replace('widget ', '')}`,
    call: function() {
      jeInsert([], property, defaults[property]);
    },
    show: function() {
      return jeStateNow && jeStateNow[property] === undefined;
    }
  });
}

function jeClick(widget, e) {
  if(jeState.ctrl) {
    jeWidget = widget;
    $('#jeText').value = jeStateBefore = JSON.stringify(widget.state, null, '  ');
    $('#jeText').focus();
  } else if(widget.click) {
    widget.click();
  }
}

function jeGetContext() {
  if(!jeWidget)
    return [];

  const s = $('#jeText').selectionStart;
  const e = $('#jeText').selectionEnd;
  const v = $('#jeText').value;
  const t = jeWidget.p('type') || 'basic';

  const select = v.substr(s, e-s);
  const line = v.substr(0, s).split('\n').pop();

  let keys = [ t ];
  for(const line of v.substr(0, s).split('\n')) {
    const m = line.match(/^( +)(["{])([^"]*)/);
    if(m) {
      const depth = m[1].length/2;
      keys[depth] = m[2]=='{' ? (keys[depth] === undefined ? -1 : keys[depth]) + 1 : m[3];
      keys = keys.slice(0, depth+1);
    }
  }
  if(select)
    keys.push(`"${select}"`);

  try {
    jeStateNow = JSON.parse(v);
    jeJSONerror = null;
  } catch(e) {
    jeStateNow = null;
    jeJSONerror = e;
  }

  jeContext = keys;

  const context = keys.join(' ↦ ');
  const usedKeys = { c: 1, x: 1, v: 1, w: 1, n: 1, t: 1, q: 1, j: 1, z: 1 };
  let commandText = '';
  for(const command of jeCommands) {
    delete command.currentKey;
    if(context.match(new RegExp(command.context)) && (!command.show || command.show())) {
      const name = typeof command.name == 'function' ? command.name() : command.name;
      if(command.forceKey)
        command.currentKey = command.forceKey;
      for(const key of name.split(''))
        if(!command.currentKey && !usedKeys[key.toLowerCase()])
          command.currentKey = key.toLowerCase();
      for(const key of 'abcdefghijklmnopqrstuvwxyz1234567890'.split(''))
        if(!command.currentKey && !usedKeys[key])
          command.currentKey = key;
      usedKeys[command.currentKey] = true;
      commandText += `Ctrl-${command.currentKey}: ${name}\n`;
    }
  }
  if(jeJSONerror)
    commandText += `\n${String(jeJSONerror)}\n`;
  $('#jeCommands').textContent = commandText;

  return jeContext;
}

function jeInsert(context, key, value) {
  if(!jeJSONerror) {
    let pointer = jeStateNow;
    for(const key of context)
      if(typeof pointer[key] == 'object')
        pointer = pointer[key];
    pointer[key] = "###SELECT ME###";
    let jsonString = JSON.stringify(jeStateNow, null, '  ');
    const startIndex = jsonString.indexOf("\"###SELECT ME###\"");
    let length = jsonString.length-pointer[key].length-2;

    pointer[key] = value;
    jsonString = JSON.stringify(jeStateNow, null, '  ');

    $('#jeText').value = jsonString;
    $('#jeText').selectionStart = startIndex;
    $('#jeText').selectionEnd = startIndex+jsonString.length-length;
    $('#jeText').focus();
  }
}

window.addEventListener('mousemove', function(e) {
  jeState.mouseX = Math.floor((e.clientX - roomRectangle.left) / scale);
  jeState.mouseY = Math.floor((e.clientY - roomRectangle.top ) / scale);
});

window.addEventListener('mouseup', function(e) {
  if(e.target == $('#jeText'))
    jeGetContext();
});

window.addEventListener('keydown', function(e) {
  if(e.key == 'Control')
    jeState.ctrl = true;
  if(e.key == 'Shift')
    jeState.shift = true;

  if(jeState.ctrl) {
    if(e.key == 'j') {
      e.preventDefault();
      jeEnabled = !jeEnabled;
      if(jeEnabled) {
        $('body').classList.add('jsonEdit');
        jeAddCommands();
        $('#jeText').focus();
      } else {
        $('body').classList.remove('jsonEdit');
      }
      setScale();
    } else {
      for(const command of jeCommands) {
        if(command.currentKey == e.key) {
          e.preventDefault();
          command.call();
        }
      }
    }
  }
});

window.addEventListener('keyup', function(e) {
  if(e.key == 'Control')
    jeState.ctrl = false;
  if(e.key == 'Shift')
    jeState.shift = false;

  if(e.target == $('#jeText'))
    jeGetContext();
});
