let jeEnabled = null;
let jeZoomOut = false;
let jeWidget = null;
let jeStateBefore = null;
let jeStateBeforeRaw = null;
let jeStateNow = null;
let jeJSONerror = null;
let jeCommandError = null;
let jeContext = null;
let jeSecondaryWidget = null;
let jeDeltaIsOurs = false;
const jeWidgetLayers = {};
const jeState = {
  ctrl: false,
  shift: false,
  mouseX: 0,
  mouseY: 0,
  widget: null
};

const jeOrder = [ 'type', 'id#', 'parent', 'deck', 'cardType', 'owner#', 'x*', 'y*', 'width*', 'height*', 'scale', 'rotation#', 'layer', 'z', 'inheritChildZ#', 'movable*', 'movableInEdit*#' ];

const jeCommands = [
  {
    name: 'toggle boolean',
    context: '"(true|false)"',
    call: function() {
      jeInsert(jeContext.slice(1), jeContext[jeContext.length-2], jeContext[jeContext.length-1]=='"false"');
    }
  },
  {
    name: 'open widget by ID',
    context: '"([^"]+)"',
    call: function() {
      const m = jeContext.join('').match(/"([^"]+)"/);
      jeClick(widgets.get(m[1]), true);
    },
    show: function() {
      const m = jeContext.join('').match(/"([^"]+)"/);
      return widgets.has(m[1]);
    }
  },
  {
    name: 'upload a different asset',
    context: '"(/assets/[0-9_-]+)"',
    call: function() {
      uploadAsset().then(a=>jePasteText(a));
    }
  },
  {
    name: 'card type template',
    context: '^deck ↦ cardTypes',
    call: function() {
      const cardType = {};
      const cssVariables = {};
      for(const face of jeStateNow.faceTemplates) {
        for(const object of face.objects) {
          if(object.valueType == 'dynamic')
            cardType[object.value] = '';
          ((object.css || '').match(/--[a-zA-Z]+/g) || []).forEach(m=>cssVariables[`${m}: black`]=true);
        }
      }
      const css = Object.keys(cssVariables).join('; ');
      if(css)
        cardType.css = css;
      jeStateNow.cardTypes['###SELECT ME###'] = cardType;
      jeSetAndSelect(Math.random().toString(36).substring(3, 7));
    }
  },
  {
    name: 'add card',
    context: '^deck ↦ cardTypes ↦ .*? ↦',
    call: function() {
      const card = { deck:jeStateNow.id, type:'card', cardType:jeContext[2] };
      addWidgetLocal(card);
      if(jeStateNow.parent)
        widgets.get(card.id).moveToHolder(widgets.get(jeStateNow.parent));
    }
  },
  {
    name: 'remove card',
    context: '^deck ↦ cardTypes ↦ .*? ↦',
    show: _=>jeStateNow&&widgetFilter(w=>w.p('deck')==jeStateNow.id&&w.p('cardType')==jeContext[2]).length,
    call: function() {
      const card = widgetFilter(w=>w.p('deck')==jeStateNow.id&&w.p('cardType')==jeContext[2])[0];
      removeWidgetLocal(card.p('id'));
    }
  },
  {
    name: 'face template',
    context: '^deck ↦ faceTemplates',
    call: function() {
      jeStateNow.faceTemplates.push({
        objects: '###SELECT ME###'
      });
      jeSetAndSelect([]);
    }
  },
  {
    name: 'image template',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects',
    call: function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects.push({
        type: 'image',
        x: 0,
        y: 0,
        color: 'transparent',
        valueType: 'dynamic',
        value: '###SELECT ME###',
        width: jeStateNow.cardDefaults && jeStateNow.cardDefaults.width  || 103,
        height: jeStateNow.cardDefaults && jeStateNow.cardDefaults.height || 160
      });
      jeSetAndSelect('image');
    }
  },
  {
    name: 'text template',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects',
    call: function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects.push({
        type: 'text',
        x: 0,
        y: 0,
        fontSize: 20,
        valueType: 'dynamic',
        value: '###SELECT ME###',
        textAlign: 'center',
        width: jeStateNow.cardDefaults && jeStateNow.cardDefaults.width  || 103
      });
      jeSetAndSelect('text');
    }
  },
  {
    name: 'css',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    show: _=>!jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].css,
    call: function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].css = '###SELECT ME###';
      jeSetAndSelect('');
    }
  },
  {
    name: 'rotation',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    show: _=>!jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].rotation,
    call: function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].rotation = '###SELECT ME###';
      jeSetAndSelect(0);
    }
  },
  {
    name: _=>jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].valueType == 'dynamic' ? 'static' : 'dynamic',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    call: function() {
      const o = jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]];
      const d = o.valueType == 'dynamic';
      const v = o.value;
      o.valueType = d ? 'static' : 'dynamic';
      o.value = '###SELECT ME###';
      jeSetAndSelect(v);
    }
  },
  {
    name: 'toggle zoom out',
    forceKey: 'Z',
    call: function() {
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
    name: _=>jeWidget === null ? 'call' : 'macro',
    forceKey: 'M',
    call: function() {
      if(jeWidget) {
        jeWidget = null;
        jeContext = [ 'macro' ];
        $('#jeText').textContent = 'if(w.deck)\n  w.gotit = true;';
        jeColorize();
      } else {
        jeJSONerror = null;
        try {
          const macro = new Function(`"use strict";return (function(w, v) {${$('#jeText').textContent}})`)();
          const variableState = {};
          for(const [ id, w ] of widgets) {
            const s = JSON.stringify(w.state);
            const newState = JSON.parse(s);
            macro(newState, variableState);
            batchStart();
            if(s != JSON.stringify(newState)) {
              for(const key in w.state)
                if(newState[key] === undefined)
                  newState[key] = null;
              sendPropertyUpdate(id, newState);
            }
            batchEnd();
          }
        } catch(e) {
          jeJSONerror = e;
        }
      }
      jeShowCommands();
    }
  },
  {
    name: 'show this widget below',
    forceKey: 'S',
    call: function() {
      jeSecondaryWidget = jeWidget && JSON.stringify(jeWidget.state, null, '  ');
      jeShowCommands();
    }
  },
  {
    name: 'tree',
    forceKey: 'T',
    call: function() {
      jeDisplayTree();
    }
  },
  {
    name: _=>`remove property ${jeContext && jeContext[jeContext.length-1]}`,
    forceKey: 'D',
    context: ' ↦ (?=[^"]+$)',
    call: function() {
      let pointer = jeGetValue(jeContext.slice(0, -1));
      if(Array.isArray(pointer))
        pointer.splice(jeContext[jeContext.length-1], 1);
      else
        delete pointer[jeContext[jeContext.length-1]];

      const oldStart = getSelection().anchorOffset;
      const oldEnd   = getSelection().focusOffset;
      jeSet(JSON.stringify(jeStateNow, null, '  '));
      jeSelect(oldStart, oldEnd);
    },
    show: function() {
      return jeStateNow && jeGetValue(jeContext.slice(0, -1))[jeContext[jeContext.length-1]] !== undefined;
    }
  },
  {
    name: 'add new widget',
    forceKey: 'A',
    call: function() {
      const toAdd = {};
      addWidgetLocal(toAdd);
      jeClick(widgets.get(toAdd.id), true);
      jeStateNow.type = '###SELECT ME###';
      jeSetAndSelect(null);
    }
  },
  {
    name: 'remove widget',
    forceKey: 'R',
    call: function() {
      const id = jeStateNow.id;
      jeStateNow = null;
      jeWidget = null;
      removeWidgetLocal(id, true);
      jeDisplayTree();
    }
  },
  {
    name: 'edit mode',
    forceKey: 'F',
    call: function() {
      if(edit)
        $('body').classList.remove('edit');
      else
        $('body').classList.add('edit');
      edit = !edit;
    }
  },
  {
    name: 'open deck',
    forceKey: 'D',
    context: '^card',
    show: _=>jeStateNow&&widgets.has(jeStateNow.deck),
    call: function() {
      jeClick(widgets.get(jeStateNow.deck), true);
    }
  },
  {
    name: 'open parent',
    forceKey: 'ArrowUp',
    show: _=>jeStateNow&&widgets.has(jeStateNow.parent),
    call: function() {
      jeClick(widgets.get(jeStateNow.parent), true);
    }
  },
  {
    name: _=>jeJSONerror?'go to error':'apply changes',
    forceKey: ' ',
    show: _=>jeWidget,
    call: function() {
      if(jeJSONerror) {
        const location = String(jeJSONerror).match(/line ([0-9]+) column ([0-9]+)/);
        if(location) {
          const pos = $('#jeText').textContent.split('\n').slice(0, location[1]-1).join('\n').length + +location[2];
          jeSelect(pos, pos);
        }
      } else {
        jeApplyChanges();
      }
    }
  },
  {
    name: _=>`change ${jeContext && jeContext[4]} to applyVariables`,
    context: '^button.*\\) ↦ [a-zA-Z]+',
    call: function() {
      const operation = jeGetValue(jeContext.slice(1, 3));
      delete operation[jeContext[4]];
      if(!operation.applyVariables)
        operation.applyVariables = [];
      operation.applyVariables.push({ parameter: jeContext[4], variable: '###SELECT ME###' });
      jeSetAndSelect('');
    },
    show: function() {
      return jeContext && jeContext[4] != 'applyVariables';
    }
  }
];

function jeAddButtonOperationCommands(command, defaults) {
  jeCommands.push({
    name: command,
    context: `^button ↦ clickRoutine`,
    call: function() {
      if(jeContext.length == 2)
        jeStateNow.clickRoutine.push({func: command});
      else
        jeStateNow.clickRoutine.splice(jeContext[2]+1, 0, {func: '###SELECT ME###'});
      jeSetAndSelect(command);
    }
  });

  defaults.skip = false;
  for(const property in defaults) {
    jeCommands.push({
      name: property,
      context: `^button.* ↦ \\(${command}\\) ↦ `,
      call: function() {
        jeInsert(jeContext.slice(1, 3), property, defaults[property]);
      },
      show: function() {
        return jeStateNow && jeGetValue()[property] === undefined;
      }
    });
  }
}

function jeAddCommands() {
  jeAddWidgetPropertyCommands(new BasicWidget());
  jeAddWidgetPropertyCommands(new Button());
  jeAddWidgetPropertyCommands(new Card());
  jeAddWidgetPropertyCommands(new Deck());
  jeAddWidgetPropertyCommands(new Holder());
  jeAddWidgetPropertyCommands(new Label());
  jeAddWidgetPropertyCommands(new Pile());
  jeAddWidgetPropertyCommands(new Spinner());

  jeAddButtonOperationCommands('CLICK', { collection: 'DEFAULT', count: 1 });
  jeAddButtonOperationCommands('COMPUTE', { operation: '+', operand1: 1, operand2: 1, operand3: 1, variable: 'COMPUTE' });
  jeAddButtonOperationCommands('COUNT', { collection: 'DEFAULT', variable: 'COUNT' });
  jeAddButtonOperationCommands('FLIP', { count: 0, face: null });
  jeAddButtonOperationCommands('GET', { variable: 'id', collection: 'DEFAULT', property: 'id', aggregation: 'first' });
  // INPUT is missing
  jeAddButtonOperationCommands('LABEL', { value: 0, mode: 'set', label: null });
  jeAddButtonOperationCommands('MOVE', { count: 1, face: null, from: null, to: null });
  jeAddButtonOperationCommands('MOVEXY', { count: 1, face: null, from: null, x: 0, y: 0 });
  jeAddButtonOperationCommands('RANDOM', { min: 1, max: 10, variable: 'RANDOM' });
  jeAddButtonOperationCommands('RECALL', { owned: true, holder: null });
  jeAddButtonOperationCommands('ROTATE', { count: 1, angle: 90, mode: 'add', holder: null });
  jeAddButtonOperationCommands('SELECT', { type: 'all', property: 'parent', relation: '==', value: null, max: 999999, collection: 'DEFAULT', mode: 'add', source: 'all' });
  jeAddButtonOperationCommands('SET', { collection: 'DEFAULT', property: 'parent', relation: '=', value: null });
  jeAddButtonOperationCommands('SORT', { key: 'value', reverse: false, holder: null });
  jeAddButtonOperationCommands('SHUFFLE', { holder: null });

  jeAddCSScommands();

  jeAddFaceCommand('border', '', 1);
  jeAddFaceCommand('css', '', '');
  jeAddFaceCommand('radius', ' (rounded corners)', 1);

  jeAddEnumCommands('^[a-z]+ ↦ type', [ null, 'button', 'card', 'deck', 'holder', 'label', 'spinner' ]);
  jeAddEnumCommands('^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+ ↦ textAlign', [ 'left', 'center', 'right' ]);
  jeAddEnumCommands('^.*\\(GET\\) ↦ aggregation', [ 'first', 'sum' ]);
  jeAddEnumCommands('^.*\\(LABEL\\) ↦ mode', [ 'set', 'dec', 'inc' ]);
  jeAddEnumCommands('^.*\\(ROTATE\\) ↦ mode', [ 'set', 'add' ]);
  jeAddEnumCommands('^.*\\(SELECT\\) ↦ mode', [ 'set', 'add' ]);
  jeAddEnumCommands('^.*\\(SELECT\\) ↦ relation', [ '<', '<=', '==', '!=', '>', '>=', 'in' ]);
  jeAddEnumCommands('^.*\\(SELECT\\) ↦ type', [ 'all', null, 'button', 'card', 'deck', 'holder', 'label', 'spinner' ]);
  jeAddEnumCommands('^.*\\(SET\\) ↦ relation', [ '+', '-', '=' ]);
}

function jeAddCSScommands() {
  for(const css of [ 'border: 1px solid black', 'background: black', 'font-size: 30px', 'color: black' ]) {
    jeCommands.push({
      name: css,
      context: '^.* ↦ (css|[a-z]+CSS)',
      call: function() {
        jePasteText(css + '; ');
      },
      show: function() {
        return !jeJSONerror && !jeGetValue()[jeGetLastKey()].match(css.split(':')[0]);
      }
    });
  }
}

function jeAddEnumCommands(context, values) {
  for(const v of values) {
    jeCommands.push({
      name: String(v),
      context: context,
      call: function() {
        jeInsert(null, jeGetLastKey(), v);
      },
      show: function() {
        let pointer = jeGetValue();
        return pointer[jeGetValue()] !== v;
      }
    });
  }
}

function jeAddFaceCommand(key, description, value) {
  jeCommands.push({
    name: key+description,
    context: '^deck ↦ faceTemplates ↦ [0-9]+',
    show: _=>!jeStateNow.faceTemplates[+jeContext[2]][key],
    call: function() {
      jeStateNow.faceTemplates[+jeContext[2]][key] = '###SELECT ME###';
      jeSetAndSelect(value);
    }
  });
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

function jeApplyChanges() {
  const currentStateRaw = $('#jeText').textContent;
  const completeState = JSON.parse(jePostProcessText(currentStateRaw));
  const currentState = JSON.stringify(jePostProcessObject(completeState));
  if(currentStateRaw != jeStateBeforeRaw) {
    jeDeltaIsOurs = true;
    jeApplyExternalChanges(completeState);
    jeStateBeforeRaw = currentStateRaw;
    $('#editWidgetJSON').dataset.previousState = jeStateBefore;
    $('#editWidgetJSON').value = jeStateBefore = currentState;
    $('#updateWidgetJSON').click();
    jeDeltaIsOurs = false;
  }
}

function jeApplyDelta(delta) {
  if(!jeDeltaIsOurs && jeStateNow && jeStateNow.id && delta.s[jeStateNow.id] !== undefined)
    jeClick(widgets.get(jeStateNow.id), true);
  if(!jeDeltaIsOurs && jeStateNow && jeStateNow.deck && delta.s[jeStateNow.deck] !== undefined)
    jeClick(widgets.get(jeStateNow.id), true);
  if(!jeWidget)
    jeDisplayTree();
}

function jeApplyExternalChanges(state) {
  const before = JSON.parse(jeStateBefore);
  if(state.type == 'card' && state.deck === before.deck) {
    const cardDefaults = widgets.get(state.deck).p('cardDefaults');
    if(JSON.stringify(state['cardDefaults (in deck)']) != JSON.stringify(cardDefaults))
      widgets.get(state.deck).p('cardDefaults', state['cardDefaults (in deck)']);

    if(state.cardType === before.cardType) {
      const cardTypes = widgets.get(state.deck).p('cardTypes');
      const cardType = cardTypes[state.cardType];
      if(JSON.stringify(state['cardType (in deck)']) != JSON.stringify(cardType)) {
        cardTypes[state.cardType] = state['cardType (in deck)'];
        widgets.get(state.deck).p('cardTypes', { ...cardTypes });
      }
    }
  }
}

function jeClick(widget, force) {
  if(jeState.ctrl || force) {
    jeWidget = widget;
    jeStateNow = widget.state;
    jeSet(jeStateBefore = jePreProcessText(JSON.stringify(jePreProcessObject(widget.state), null, '  ')));
  } else if(widget.click) {
    widget.click();
  }
}

function jeColorize() {
  const langObj = [
    [ /^( +")(.*)( \(in .*)(":.*)$/, null, 'extern', 'extern', null ],
    [ /^( +")(.*)(": ")(.*)(",?)$/, null, 'key', null, 'string', null ],
    [ /^( +")(.*)(": )(-?[0-9.]+)(,?)$/, null, 'key', null, 'number', null ],
    [ /^( +")(.*)(": )(null|true|false)(,?)$/, null, 'key', null, 'null', null ],
    [ /^( +")(.*)(":.*)$/, null, 'key', null ],
    [ /^(Room)$/, 'extern' ],
    [ /^( +)(.*)( \()([a-z]+)( - )([0-9-]+)(,)([0-9-]+)(.*)$/, null, 'key', null, 'string', null, 'number', null, 'number', null ]
  ];
  let out = [];
  for(const line of $('#jeText').textContent.split('\n')) {
    let foundMatch = false;
    for(const l of langObj) {
      const match = line.match(l[0]);
      if(match) {
        if(match[1] == '  "' && l[2] == 'key' && (l[4] == "null" && match[4] == "null" || String(jeWidget.defaults[match[2]]) == match[4])) {
          out.push(`<i class=default>${line}</i>`);
          foundMatch = true;
          break;
        }

        const c = {...l};
        if(match[1] == '  "' && l[2] == 'key' && [ 'id', 'type' ].indexOf(match[2]) == -1 && jeWidget.defaults[match[2]] === undefined)
          c[2] = 'custom';

        for(let i=1; i<l.length; ++i)
          if(l[i])
            match[i] = `<i class=${c[i]}>${match[i]}</i>`;
        out.push(match.slice(1).join(''))
        foundMatch = true;
        break;
      }
    }
    if(!foundMatch)
      out.push(line);
  }
  $('#jeTextHighlight').innerHTML = out.join('\n');
}

function jeDisplayTree() {
  const allWidgets = Array.from(widgets.values());
  let result = 'CTRL-click a widget on the left to edit it.\n\nRoom\n';
  result += jeDisplayTreeAddWidgets(allWidgets, null, '  ');
  jeWidget = null;
  jeStateNow = null;
  jeSet(jeStateBefore = result);
  jeGetContext();
  jeShowCommands();
}

function jeDisplayTreeAddWidgets(allWidgets, parent, indent) {
  let result = '';
  for(const widget of allWidgets.filter(w=>w.p('parent')==parent)) {
    result += `${indent}${widget.p('id')} (${widget.p('type') || 'basic'} - ${Math.floor(widget.p('x'))},${Math.floor(widget.p('y'))})\n`;
    result += jeDisplayTreeAddWidgets(allWidgets, widget.p('id'), indent+'  ');
    delete allWidgets[allWidgets.indexOf(widget)];
  }
  return result;
}

function jeGetContext() {
  const s = getSelection().anchorOffset;
  const e = getSelection().focusOffset;
  const v = $('#jeText').textContent;
  const t = jeStateNow && jeStateNow.type || 'basic';

  const select = v.substr(s, e-s).replace(/\n/g, '\\n');
  const line = v.split('\n')[v.substr(0, s).split('\n').length-1];

  if(!jeWidget) {
    jeContext = [ 'Tree' ];
    const match = line.match(/^(  )+(.*?) \([a-z]+ - /);
    if(match)
      jeContext.push(`"${match[2]}"`);
    jeShowCommands();
    return jeContext;
  }

  try {
    jeStateNow = JSON.parse(v);

    if(!jeStateNow.id)
      jeJSONerror = 'No ID given.';
    else if(JSON.parse(jeStateBefore).id != jeStateNow.id && widgets.has(jeStateNow.id))
      jeJSONerror = `ID ${jeStateNow.id} is already in use.`;
    else if(jeStateNow.parent !== undefined && !widgets.has(jeStateNow.parent))
      jeJSONerror = `Parent ${jeStateNow.parent} does not exist.`;
    else if(jeStateNow.type == 'card' && (!jeStateNow.deck || !widgets.has(jeStateNow.deck)))
      jeJSONerror = `Deck ${jeStateNow.deck} does not exist.`;
    else if(jeStateNow.type == 'card' && (!jeStateNow.cardType || !widgets.get(jeStateNow.deck).p('cardTypes')[jeStateNow.cardType]))
      jeJSONerror = `Card type ${jeStateNow.cardType} does not exist in deck ${jeStateNow.deck}.`;
    else
      jeJSONerror = null;
  } catch(e) {
    jeStateNow = null;
    jeJSONerror = e;
  }

  let keys = [ t ];
  for(const line of v.substr(0, s).split('\n')) {
    const m = line.match(/^( +)(["{])([^"]*)/);
    if(m) {
      const depth = m[1].length/2;
      keys[depth] = m[2]=='{' ? (keys[depth] === undefined ? -1 : keys[depth]) + 1 : m[3];
      keys = keys.slice(0, depth+1);
    }
  }
  try {
    if(keys[1] == 'clickRoutine' && typeof keys[2] == 'number' && !jeJSONerror)
      keys.splice(3, 0, '(' + jeStateNow.clickRoutine[keys[2]].func + ')');
  } catch(e) {}

  if(select)
    keys.push(`"${select}"`);

  jeContext = keys;

  jeShowCommands();

  return jeContext;
}

function jeGetLastKey() {
  return jeContext[jeContext.length-1].match(/^"/) ? jeContext[jeContext.length-2] : jeContext[jeContext.length-1];
}

function jeGetValue(context, all) {
  let pointer = jeStateNow;
  for(const key of context || jeContext)
    if(all && typeof pointer[key] !== undefined || typeof pointer[key] == 'object' && pointer[key] !== null)
      pointer = pointer[key];
  return pointer
}

function jeInsert(context, key, value) {
  if(!jeJSONerror) {
    let pointer = jeGetValue(context);
    pointer[key] = '###SELECT ME###';
    jeSetAndSelect(value);
  }
}

function jePasteText(text) {
  const s = getSelection().anchorOffset;
  const e = getSelection().focusOffset;
  const v = $('#jeText').textContent;

  jeSet(v.substr(0, s) + text + v.substr(e));
  jeSelect(s, s + text.length);
}

function jePostProcessObject(o) {
  const copy = { ...o };
  for(const key in copy)
    if(copy[key] === jeWidget.defaults[key] || key.match(/in deck/))
      copy[key] = null;
  return copy;
}

function jePostProcessText(t) {
  return t;
}

function jePreProcessObject(o) {
  const copy = {};
  for(const key of jeOrder) {
    const match = key.match(/^(.*?)(\*)?(#)?$/);
    if(o[match[1]] !== undefined)
      copy[match[1]] = o[match[1]];
    else if(match[2] == '*')
      copy[match[1]] = jeWidget.defaults[match[1]];
    if(match[3] == '#')
      copy[`LINEBREAK${match[1]}`] = null;
  }

  for(const key of Object.keys(o).sort())
    if(copy[key] === undefined)
      copy[key] = o[key];

  try {
    if(copy.type == 'card') {
      copy['cardDefaults (in deck)'] = widgets.get(copy.deck).p('cardDefaults');
      copy['cardType (in deck)'] = widgets.get(copy.deck).p('cardTypes')[copy.cardType];
    }
  } catch(e) {}

  return copy;
}

function jePreProcessText(t) {
  return t.replace(/(\n +"LINEBREAK.*": null,)+/g, '\n').replace(/(,\n +"LINEBREAK.*": null)+/g, '');
}

function jeSelect(start, end) {
  const t = $('#jeText');
  const text = t.textContent;
  try {
    t.focus();

    const scroll = t.scrollTop;
    t.textContent = text.substring(0, end);
    const height = t.scrollHeight;
    t.scrollTop = 50000;
    t.textContent = text;

    if(t.scrollTop) {
      if(Math.abs(t.scrollTop + t.clientHeight/2 - scroll) < t.clientHeight*.25)
        t.scrollTop = scroll;
      else
        t.scrollTop += t.clientHeight/2;
    }

    const node = t.firstChild;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const selection = window.getSelection();
    selection.removeAllRanges();

    selection.addRange(range);
  } catch(e) {
    t.textContent = text;
  }
}

function jeSet(text) {
  try {
    $('#jeText').textContent = jePreProcessText(JSON.stringify(jePreProcessObject(JSON.parse(text)), null, '  '));
  } catch(e) {
    $('#jeText').textContent = text;
  }
  $('#jeText').focus();
  jeColorize();
}

function jeSetAndSelect(replaceBy) {
  let jsonString = jePreProcessText(JSON.stringify(jePreProcessObject(jeStateNow), null, '  '));
  const startIndex = jsonString.indexOf('"###SELECT ME###"');
  let length = jsonString.length-17;

  jsonString = jsonString.replace(/"###SELECT ME###"/, JSON.stringify(replaceBy));

  jeSet(jsonString);
  const quote = typeof replaceBy == 'string' ? 1 : 0;
  jeSelect(startIndex + quote, startIndex+jsonString.length-length - quote);
}

function jeShowCommands() {
  const activeCommands = {};

  const context = jeContext.join(' ↦ ');
  for(const command of jeCommands) {
    delete command.currentKey;
    const contextMatch = context.match(new RegExp(command.context));
    if(contextMatch && (!command.show || command.show())) {
      if(activeCommands[contextMatch[0]] === undefined)
        activeCommands[contextMatch[0]] = [];
      activeCommands[contextMatch[0]].push(command);
    }
  }

  const usedKeys = { c: 1, x: 1, v: 1, w: 1, n: 1, t: 1, q: 1, j: 1, z: 1 };
  let commandText = '';

  const sortByName = function(a, b) {
    const nameA = typeof a.name == 'function' ? a.name() : a.name;
    const nameB = typeof b.name == 'function' ? b.name() : b.name;
    return nameA.localeCompare(nameB);
  }

  for(const contextMatch of (Object.keys(activeCommands).sort((a,b)=>b.length-a.length))) {
    commandText += `\n  <b>${contextMatch}</b>\n`;
    for(const command of activeCommands[contextMatch].sort(sortByName)) {
      if(context.match(new RegExp(command.context)) && (!command.show || command.show())) {
        const name = typeof command.name == 'function' ? command.name() : command.name;
        if(command.forceKey && !usedKeys[command.forceKey])
          command.currentKey = command.forceKey;
        for(const key of name.split(''))
          if(key != ' ' && !command.currentKey && !usedKeys[key.toLowerCase()])
            command.currentKey = key.toLowerCase();
        for(const key of 'abcdefghijklmnopqrstuvwxyz1234567890'.split(''))
          if(!command.currentKey && !usedKeys[key])
            command.currentKey = key;
        usedKeys[command.currentKey] = true;
        commandText += `Ctrl-${command.currentKey}: ${name.replace(command.currentKey, '<b>' + command.currentKey + '</b>')}\n`;
      }
    }
  }
  commandText += `\n${context}\n`;
  if(jeJSONerror)
    commandText += `\n<i class=error>${String(jeJSONerror)}</i>\n`;
  if(jeCommandError)
    commandText += `\n<i class=error>Last command failed: ${String(jeCommandError)}</i>\n`;
  if(jeSecondaryWidget)
    commandText += `\n\n${jeSecondaryWidget}\n`;
  $('#jeCommands').innerHTML = commandText;
}

window.addEventListener('mousemove', function(e) {
  if(!jeEnabled)
    return;
  jeState.mouseX = Math.floor((e.clientX - roomRectangle.left) / scale);
  jeState.mouseY = Math.floor((e.clientY - roomRectangle.top ) / scale);

  const hoveredWidgets = [];
  for(const [ widgetID, widget ] of widgets)
    if(jeState.mouseX >= widget.absoluteCoord('x') && jeState.mouseX <= widget.absoluteCoord('x')+widget.p('width'))
      if(jeState.mouseY >= widget.absoluteCoord('y') && jeState.mouseY <= widget.absoluteCoord('y')+widget.p('height'))
        hoveredWidgets.push(widget);

  for(let i=1; i<=12; ++i) {
    if(hoveredWidgets[i-1]) {
      jeWidgetLayers[i] = hoveredWidgets[i-1];
      $(`#jeWidgetLayer${i}`).textContent = `F${i}:\nid: ${hoveredWidgets[i-1].p('id')}\ntype: ${hoveredWidgets[i-1].p('type') || 'basic'}`;
    } else {
      delete jeWidgetLayers[i];
      $(`#jeWidgetLayer${i}`).textContent = '';
    }
  }
});

window.addEventListener('mouseup', function(e) {
  if(!jeEnabled)
    return;
  if(e.target == $('#jeText'))
    jeGetContext();
});

window.addEventListener('keydown', function(e) {
  if(e.key == 'Control')
    jeState.ctrl = true;
  if(e.key == 'Shift')
    jeState.shift = true;

  if(e.key == 'Enter' && jeEnabled) {
    document.execCommand('insertHTML', false, '\n');
    e.preventDefault();
  }

  if(jeState.ctrl) {
    if(e.key == 'j') {
      e.preventDefault();
      if(jeEnabled === null) {
        jeAddCommands();
        jeDisplayTree();
        $('#jeText').addEventListener('input', jeColorize);
        $('#jeText').onscroll = e=>$('#jeTextHighlight').scrollTop = e.target.scrollTop;
        jeColorize();
      }
      jeEnabled = !jeEnabled;
      if(jeEnabled) {
        $('body').classList.add('jsonEdit');
      } else {
        $('body').classList.remove('jsonEdit');
      }
      setScale();
    } else {
      for(const command of jeCommands) {
        if(command.currentKey == e.key) {
          e.preventDefault();
          try {
            jeCommandError = null;
            command.call();
          } catch(e) {
            jeCommandError = e;
          }
        }
      }
    }
  }

  const functionKey = e.key.match(/F([0-9]+)/);
  if(functionKey && jeWidgetLayers[+functionKey[1]]) {
    e.preventDefault();
    if(jeState.ctrl) {
      let id = jeWidgetLayers[+functionKey[1]].p('id');
      if(jeContext[jeContext.length-1] == '"null"')
        id = `"${id}"`;
      jePasteText(id);
    } else {
      jeClick(jeWidgetLayers[+functionKey[1]], true);
    }
  }
});

window.addEventListener('keyup', function(e) {
  if(e.key == 'Control')
    jeState.ctrl = false;
  if(e.key == 'Shift')
    jeState.shift = false;

  if(e.target == $('#jeText')) {
    jeGetContext();
    if(jeWidget && !jeJSONerror)
      jeApplyChanges();
  }
});
