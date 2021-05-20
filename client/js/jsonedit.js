let jeEnabled = null;
let jeZoomOut = false;
let jeMode = null;
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
    id: 'je_toggleBoolean',
    name: 'toggle boolean',
    context: '.*"(true|false)"',
    call: async function() {
      jeInsert(jeContext.slice(1), jeContext[jeContext.length-2], jeContext[jeContext.length-1]=='"false"');
    }
  },
  {
    id: 'je_openWidgetById',
    name: 'open widget by ID',
    context: '.*"([^"]+)"',
    call: async function() {
      const m = jeContext.join('').match(/"([^"]+)"/);
      jeSelectWidget(widgets.get(m[1]));
    },
    show: function() {
      const m = jeContext.join('').match(/"([^"]+)"/);
      return widgets.has(m[1]);
    }
  },
  {
    id: 'je_uploadAsset',
    name: 'upload a different asset',
    context: '.*"(/assets/[0-9_-]+)"|^basic ↦ faces ↦ [0-9]+ ↦ image|^deck ↦ cardTypes ↦ .*? ↦ image',
    call: async function() {
      uploadAsset().then(a=> {
        if(a) {
          jeInsert(null, jeGetLastKey(), a);
          jeApplyChanges();
        }
      });
    }
  },
  {
    id: 'je_cardTypeTemplate',
    name: 'card type template',
    context: '^deck ↦ cardTypes',
    call: async function() {
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
      jeSetAndSelect(generateUniqueWidgetID());
    }
  },
  {
    id: 'je_addCard',
    name: 'add card',
    context: '^deck ↦ cardTypes ↦ .*? ↦',
    call: async function() {
      const card = { deck:jeStateNow.id, type:'card', cardType:jeContext[2] };
      addWidgetLocal(card);
      if(jeStateNow.parent)
        await widgets.get(card.id).moveToHolder(widgets.get(jeStateNow.parent));
    }
  },
  {
    id: 'je_removeCard',
    name: 'remove card',
    context: '^deck ↦ cardTypes ↦ .*? ↦',
    show: _=>widgetFilter(w=>w.get('deck')==jeStateNow.id&&w.get('cardType')==jeContext[2]).length,
    call: async function() {
      const card = widgetFilter(w=>w.get('deck')==jeStateNow.id&&w.get('cardType')==jeContext[2])[0];
      await removeWidgetLocal(card.get('id'));
    }
  },
  {
    id: 'je_faceTemplate',
    name: 'face template',
    context: '^deck ↦ faceTemplates',
    call: async function() {
      jeStateNow.faceTemplates.push({
        objects: '###SELECT ME###'
      });
      jeSetAndSelect([]);
    }
  },
  {
    id: 'je_imageTemplate',
    name: 'image template',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects',
    call: async function() {
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
    id: 'je_textTemplate',
    name: 'text template',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects',
    call: async function() {
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
    id: 'je_css',
    name: 'css',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    show: _=>!jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].css,
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].css = '###SELECT ME###';
      jeSetAndSelect('');
    }
  },
  {
    id: 'je_rotation',
    name: 'rotation',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    show: _=>!jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].rotation,
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].rotation = '###SELECT ME###';
      jeSetAndSelect(0);
    }
  },
  {
    id: 'je_toggleValueType',
    name: _=>jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].valueType == 'dynamic' ? 'static' : 'dynamic',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    call: async function() {
      const o = jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]];
      const d = o.valueType == 'dynamic';
      const v = o.value;
      o.valueType = d ? 'static' : 'dynamic';
      o.value = '###SELECT ME###';
      jeSetAndSelect(v);
    }
  },
  {
    id: 'je_toggleZoom',
    name: '🔍 toggle zoom out',
    forceKey: 'Z',
    call: async function() {
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
    id: 'je_copyState',
    name: '📋 copy state from another room/server',
    forceKey: 'C',
    call: async function() {
      const sourceURL = (prompt('Please enter the room URL:') || '').replace(/\/[^\/]+$/, a=>`/state${a}`);
      const targetURL = location.href.replace(/\/[^\/]+$/, a=>`/state${a}`);
      fetch(sourceURL).then(r=>r.text()).then(t=>{
        fetch(targetURL,{
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: t
        })
      });
    }
  },
  {
    id: 'je_callMacro',
    name: _=>jeMode == 'macro' ? '▶️ call' : '🎬 macro',
    forceKey: 'M',
    call: async function() {
      if(jeMode != 'macro') {
        jeWidget = null;
        jeMode = 'macro';
        $('#jeText').textContent = '// this code will be called for\n// every widget as variable w\n\n// variable v is a persistent object you\n// can use to store other information\n\nif(w.deck)\n  w.gotit = true;';
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
    id: 'je_showWidget',
    name: '👁 show this widget below',
    forceKey: 'S',
    call: async function() {
      if(jeWidget != undefined)
        jeSecondaryWidget = (jeWidget != undefined && jeSecondaryWidget == null || jeStateNow.id != JSON.parse(jeSecondaryWidget).id) ? jeWidget && JSON.stringify(jeWidget.state, null, '  ') : null;
      else
        jeSecondaryWidget = null;
      jeShowCommands();
    }
  },
  {
    id: 'je_tree',
    name: '🔝 tree',
    forceKey: 'T',
    call: async function() {
      jeDisplayTree();
    }
  },
  {
    id: 'je_removeProperty',
    name: _=>`remove property ${jeContext && jeContext[jeContext.length-1]}`,
    context: ' ↦ (?=[^"]+$)',
    call: async function() {
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
      return jeGetValue(jeContext.slice(0, -1))[jeContext[jeContext.length-1]] !== undefined;
    }
  },
  {
    id: 'je_addNewWidget',
    name: '➕ add new widget',
    forceKey: 'A',
    call: async function() {
      const toAdd = {};
      addWidgetLocal(toAdd);
      jeSelectWidget(widgets.get(toAdd.id));
      jeStateNow.type = '###SELECT ME###';
      jeSetAndSelect(null);
    }
  },
  {
    id: 'je_duplicateWidget',
    name: '✨ duplicate widget',
    forceKey: 'D',
    show: _=>jeStateNow,
    call: async function() {
      let currentWidget = JSON.parse(JSON.stringify(jeWidget.state))
      currentWidget.id = null;
      addWidgetLocal(currentWidget);
      jeSelectWidget(widgets.get(currentWidget.id));
      jeStateNow.id = '###SELECT ME###';
      jeSetAndSelect(currentWidget.id);
    }
  },
  {
    id: 'je_removeWidget',
    name: '❌ remove widget',
    forceKey: 'R',
    show: _=>jeStateNow,
    call: async function() {
      const id = jeStateNow.id;
      jeStateNow = null;
      jeWidget = null;
      await removeWidgetLocal(id, true);
      jeDisplayTree();
    }
  },
  {
    id: 'je_editMode',
    name: '📝 edit mode',
    forceKey: 'F',
    call: async function() {
      if(edit)
        $('body').classList.remove('edit');
      else
        $('body').classList.add('edit');
      edit = !edit;
    }
  },
  {
    id: 'je_openDeck',
    name: '🔽 open deck',
    forceKey: 'ArrowDown',
    context: '^card',
    show: _=>widgets.has(jeStateNow.deck),
    call: async function() {
      jeSelectWidget(widgets.get(jeStateNow.deck));
    }
  },
  {
    id: 'je_openParent',
    name: '🔼 open parent',
    forceKey: 'ArrowUp',
    show: _=>jeStateNow && widgets.has(jeStateNow.parent),
    call: async function() {
      jeSelectWidget(widgets.get(jeStateNow.parent));
    }
  }
];

function jeRoutineCall(callback, synchronous) {
  const f = function() {
    let routineIndex = -1;
    for(let i=jeContext.length-1; i>=0; --i) {
      if(String(jeContext[i]).match(/Routine$/)) {
        routineIndex = i;
        break;
      }
    }

    const routine = jeGetValue(jeContext.slice(1, routineIndex+1));
    if(jeContext.length >= routineIndex)
      return callback(routineIndex, routine, jeContext[routineIndex+1], routine[jeContext[routineIndex+1]]);
    else
      return callback(routineIndex, routine, null, null);
  };

  if(synchronous)
    return f;
  else
    return async _=>f();
}

function jeAddRoutineOperationCommands(command, defaults) {
  jeCommands.push({
    id: 'operation_' + command,
    name: command,
    context: `^.*Routine`,
    call: jeRoutineCall(function(routineIndex, routine, operationIndex, operation) {
      if(operationIndex === null)
        routine.push({func: '###SELECT ME###'});
      else
        routine.splice(operationIndex+1, 0, {func: '###SELECT ME###'});
      jeSetAndSelect(command);
    }),
    show: jeRoutineCall((_, routine)=>Array.isArray(routine), true)
  });

  defaults.skip = false;
  for(const property in defaults) {
    jeCommands.push({
      id: 'default_' + command + '_' + property,
      name: property,
      context: `^.* ↦ \\(${command}\\) ↦ `,
      call: jeRoutineCall(function(routineIndex, routine, operationIndex, operation) {
        jeInsert(jeContext.slice(1, routineIndex+2), property, defaults[property]);
      }),
      show: jeRoutineCall(function(routineIndex, routine, operationIndex, operation) {
        return operation && operation[property] === undefined;
      }, true)
    });
  }
}

function jeAddCommands() {
  jeAddWidgetPropertyCommands(new BasicWidget());
  jeAddWidgetPropertyCommands(new Button());
  jeAddWidgetPropertyCommands(new Canvas());
  jeAddWidgetPropertyCommands(new Card());
  jeAddWidgetPropertyCommands(new Deck());
  jeAddWidgetPropertyCommands(new Holder());
  jeAddWidgetPropertyCommands(new Label());
  jeAddWidgetPropertyCommands(new Pile());
  jeAddWidgetPropertyCommands(new Spinner());
  jeAddWidgetPropertyCommands(new Timer());

  jeAddRoutineOperationCommands('CALL', { widget: 'id', routine: 'clickRoutine', return: true, arguments: {}, variable: 'result' });
  jeAddRoutineOperationCommands('CANVAS', { canvas: null, mode: 'reset', x: 0, y: 0, colorIndex: 1 });
  jeAddRoutineOperationCommands('CLICK', { collection: 'DEFAULT', count: 1 , mode:'respect'});
  jeAddRoutineOperationCommands('COUNT', { collection: 'DEFAULT', holder: null, variable: 'COUNT' });
  jeAddRoutineOperationCommands('CLONE', { source: 'DEFAULT', collection: 'DEFAULT', xOffset: 0, yOffset: 0, count: 1, properties: null });
  jeAddRoutineOperationCommands('DELETE', { collection: 'DEFAULT'});
  jeAddRoutineOperationCommands('FLIP', { count: 0, face: null, faceCycle: 'forward', holder: null, collection: 'DEFAULT' });
  jeAddRoutineOperationCommands('GET', { variable: 'id', collection: 'DEFAULT', property: 'id', aggregation: 'first', skipMissing: false });
  jeAddRoutineOperationCommands('IF', { condition: null, operand1: null, relation: '==', operand2: null, thenRoutine: [], elseRoutine: [] });
  // INPUT is missing
  jeAddRoutineOperationCommands('LABEL', { value: 0, mode: 'set', label: null, collection: 'DEFAULT' });
  jeAddRoutineOperationCommands('MOVE', { count: 1, face: null, from: null, to: null });
  jeAddRoutineOperationCommands('MOVEXY', { count: 1, face: null, from: null, x: 0, y: 0 });
  jeAddRoutineOperationCommands('RANDOM', { min: 1, max: 10, variable: 'RANDOM' });
  jeAddRoutineOperationCommands('RECALL', { owned: true, holder: null });
  jeAddRoutineOperationCommands('ROTATE', { count: 1, angle: 90, mode: 'add', holder: null, collection: 'DEFAULT' });
  jeAddRoutineOperationCommands('SELECT', { type: 'all', property: 'parent', relation: '==', value: null, max: 999999, collection: 'DEFAULT', mode: 'add', source: 'all', sortBy: 'null' });
  jeAddRoutineOperationCommands('SET', { collection: 'DEFAULT', property: 'parent', relation: '=', value: null });
  jeAddRoutineOperationCommands('SORT', { key: 'value', reverse: false, locales: null, options: null, holder: null, collection: 'DEFAULT' });
  jeAddRoutineOperationCommands('SHUFFLE', { holder: null, collection: 'DEFAULT' });
  jeAddRoutineOperationCommands('TIMER', { value: 0, seconds: 0, mode: 'toggle', timer: null, collection: 'DEFAULT' });

  jeAddCSScommands();

  jeAddFaceCommand('border', '', 1);
  jeAddFaceCommand('css', '', '');
  jeAddFaceCommand('radius', ' (rounded corners)', 1);

  jeAddEnumCommands('^[a-z]+ ↦ type', [ null, 'button', 'canvas', 'card', 'deck', 'holder', 'label', 'spinner', 'timer' ]);
  jeAddEnumCommands('^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+ ↦ textAlign', [ 'left', 'center', 'right' ]);
  jeAddEnumCommands('^.*\\(CANVAS\\) ↦ mode', [ 'color', 'reset', 'setPixel' ]);
  jeAddEnumCommands('^.*\\(CLICK\\) ↦ mode', [ 'respect', 'ignoreClickable', 'ignoreClickRoutine', 'ignoreAll' ]);
  jeAddEnumCommands('^.*\\(FLIP\\) ↦ faceCycle', [ 'forward', 'backward', 'random' ]);
  jeAddEnumCommands('^.*\\(GET\\) ↦ aggregation', [ 'first', 'last', 'array', 'average', 'median', 'min', 'max', 'sum' ]);
  jeAddEnumCommands('^.*\\(IF\\) ↦ relation', [ '<', '<=', '==', '!=', '>', '>=' ]);
  jeAddEnumCommands('^.*\\(LABEL\\) ↦ mode', [ 'set', 'dec', 'inc', 'append' ]);
  jeAddEnumCommands('^.*\\(ROTATE\\) ↦ angle', [ 45, 60, 90, 135, 180 ]);
  jeAddEnumCommands('^.*\\(ROTATE\\) ↦ mode', [ 'set', 'add' ]);
  jeAddEnumCommands('^.*\\(SELECT\\) ↦ mode', [ 'set', 'add' ]);
  jeAddEnumCommands('^.*\\(SELECT\\) ↦ relation', [ '<', '<=', '==', '!=', '>', '>=', 'in' ]);
  jeAddEnumCommands('^.*\\(SELECT\\) ↦ type', [ 'all', null, 'button', 'card', 'deck', 'holder', 'label', 'spinner' ]);
  jeAddEnumCommands('^.*\\(SET\\) ↦ relation', [ '+', '-', '=', "*", "/",'!' ]);
  jeAddEnumCommands('^.*\\(TIMER\\) ↦ mode', [ 'pause', 'start', 'toggle', 'set', 'dec', 'inc', 'reset']);
  jeAddEnumCommands('^.*\\(TIMER\\) ↦ value', [ 0, 'start', 'end', 'milliseconds']);
  jeAddEnumCommands('^.*\\([A-Z]+\\) ↦ property', [ 'id', 'parent', 'type', 'rotation' ]);
  jeAddEnumCommands('^.* ↦ applyVariables ↦ [0-9]+ ↦ variable', [ 'COUNT', 'RANDOM', 'id', 'result', 'playerName', 'playerColor', 'activePlayers' , 'thisID' ]);

  jeAddEnumCommands('^.*\\((CLICK|COUNT|DELETE|FLIP|GET|LABEL|ROTATE|SET|SORT|SHUFFLE)\\) ↦ collection', [ 'DEFAULT', 'thisButton', 'child' ]);
  jeAddEnumCommands('^.*\\(CLONE\\) ↦ source', [ 'DEFAULT', 'thisButton', 'child' ]);
  jeAddEnumCommands('^.*\\(SELECT\\) ↦ source', [ 'all', 'DEFAULT', 'thisButton', 'child' ]);

  jeAddNumberCommand('increment number', '+', x=>x+1);
  jeAddNumberCommand('decrement number', '-', x=>x-1);
  jeAddNumberCommand('double number', '*', x=>x*2);
  jeAddNumberCommand('half number', '/', x=>x/2);
  jeAddNumberCommand('zero', '0', x=>0);
  jeAddNumberCommand('opposite value', '0', x=>-x);
}

function jeAddCSScommands() {
  for(const css of [ 'border: 1px solid black', 'background: white', 'font-size: 30px', 'color: black' , 'border-radius: 100%' ]) {
    jeCommands.push({
      id: 'css_' + css,
      name: css,
      context: '^.* ↦ (css|[a-z]+CSS)',
      call: async function() {
        jePasteText(css + '; ', true);
      },
      show: function() {
        return !String(jeGetValue()[jeGetLastKey()]).match(css.split(':')[0]);
      }
    });
  }
  for(const css of [ '--wcMain: #1f5ca6', '--wcMainOH: #0d2f5e', '--wcBorder: #0d2f5e', '--wcBorderOH: #1f5ca6', '--wcFont: #ffffff', '--wcFontOH: #ffffff' ]) {
    jeCommands.push({
      id: 'css_' + css,
      name: css,
      context: 'button ↦ (css|[a-z]+CSS)',
      call: async function() {
        jePasteText(css + '; ', true);
      },
      show: function() {
        return !String(jeGetValue()[jeGetLastKey()]).match(css.split(':')[0]);
      }
    });
  }
  for(const css of ['--wcBorderNormal: #00000000', '--wcBorderAlert: red', '--wcFontAlert: red', '--wcFontPaused: #6d6d6d', '--wcAnimationAlert: blinker 1s linear infinite', '--wcAnimationPaused: none' ]) {
    jeCommands.push({
      id: 'css_' + css,
      name: css,
      context: 'timer ↦ (css|[a-z]+CSS)',
      call: async function() {
        jePasteText(css + '; ', true);
      },
      show: function() {
        return !String(jeGetValue()[jeGetLastKey()]).match(css.split(':')[0]);
      }
    });
  }
}

function jeAddEnumCommands(context, values) {
  for(const v of values) {
    jeCommands.push({
      id: 'enum_' + String(v),
      name: String(v),
      context: context,
      call: async function() {
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
    id: 'face_' + key+description,
    name: key+description,
    context: '^deck ↦ faceTemplates ↦ [0-9]+',
    show: _=>!jeStateNow.faceTemplates[+jeContext[2]][key],
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]][key] = '###SELECT ME###';
      jeSetAndSelect(value);
    }
  });
}

function jeAddNumberCommand(name, key, callback) {
  jeCommands.push({
    id: 'number_' + name,
    name: name,
    forceKey: key,
    context: '.*',
    show: _=>jeGetValue()&&typeof jeGetValue()[jeGetLastKey()] == 'number',
    call: async function() {
      const newValue = callback(jeGetValue()[jeGetLastKey()]);
      jeGetValue()[jeGetLastKey()] = '###SELECT ME###';
      jeSetAndSelect(newValue);
    }
  });
}

function jeAddWidgetPropertyCommands(object) {
  for(const property in object.defaults)
    if(property != 'typeClasses')
      jeAddWidgetPropertyCommand(object, property);
  object.applyRemove();
}

function jeAddWidgetPropertyCommand(object, property) {
  jeCommands.push({
    id: 'widget_' + property,
    name: property,
    context: `^${object.getDefaultValue('typeClasses').replace('widget ', '')}`,
    call: async function() {
      jeInsert([], property, property.match(/Routine$/) ? [] : object.getDefaultValue(property));
    },
    show: function() {
      return jeStateNow[property] === undefined;
    }
  });
}

async function jeApplyChanges() {
  const currentStateRaw = $('#jeText').textContent;
  const completeState = JSON.parse(jePostProcessText(currentStateRaw));
  const currentState = JSON.stringify(jePostProcessObject(completeState));
  if(currentStateRaw != jeStateBeforeRaw) {
    jeDeltaIsOurs = true;
    await jeApplyExternalChanges(completeState);
    jeStateBeforeRaw = currentStateRaw;
    $('#editWidgetJSON').dataset.previousState = jeStateBefore;
    $('#editWidgetJSON').value = jeStateBefore = currentState;
    await onClickUpdateWidget(false);
    jeDeltaIsOurs = false;
  }
}

function jeApplyDelta(delta) {
  for(const field of [ 'id', 'deck' ]) {
    if(!jeDeltaIsOurs && jeStateNow && jeStateNow[field] && delta.s[jeStateNow[field]] !== undefined) {
      if(delta.s[jeStateNow[field]] === null)
        jeDisplayTree();
      else
        jeSelectWidget(widgets.get(jeStateNow.id), document.activeElement !== $('#jeText'));
    }
  }
  if(jeMode == 'tree')
    jeDisplayTree();
}

async function jeApplyExternalChanges(state) {
  const before = JSON.parse(jeStateBefore);
  if(state.type == 'card' && state.deck === before.deck) {
    const cardDefaults = widgets.get(state.deck).get('cardDefaults');
    if(JSON.stringify(state['cardDefaults (in deck)']) != JSON.stringify(cardDefaults))
      await widgets.get(state.deck).set('cardDefaults', state['cardDefaults (in deck)']);

    if(state.cardType === before.cardType) {
      const cardTypes = widgets.get(state.deck).get('cardTypes');
      const cardType = cardTypes[state.cardType];
      if(JSON.stringify(state['cardType (in deck)']) != JSON.stringify(cardType)) {
        cardTypes[state.cardType] = state['cardType (in deck)'];
        await widgets.get(state.deck).set('cardTypes', { ...cardTypes });
      }
    }
  }
}

async function jeClick(widget) {
  if(jeState.ctrl) {
    jeSelectWidget(widget);
  } else {
    await widget.click();
  }
}

function jeSelectWidget(widget, dontFocus) {
  jeMode = 'widget';
  jeWidget = widget;
  jeStateNow = widget.state;
  jeSet(jeStateBefore = jePreProcessText(JSON.stringify(jePreProcessObject(widget.state), null, '  ')), dontFocus);
}

function html(string) {
  return string.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function jeColorize() {
  const langObj = [
    [ /^( +")(.*)( \(in .*)(":.*)$/, null, 'extern', 'extern', null ],
    [ /^( +")(.*)(": ")(.*)(",?)$/, null, 'key', null, 'string', null ],
    [ /^( +")(.*)(": )(-?[0-9.]+)(,?)$/, null, 'key', null, 'number', null ],
    [ /^( +")(.*)(": )(null|true|false)(,?)$/, null, 'key', null, 'null', null ],
    [ /^( +")(.*)(":.*)$/, null, 'key', null ],
    [ /^(Room)$/, 'extern' ],
    [ /^( +"var )(.*)( = )(-?[0-9.]+)?(null|true|false)?(\$\{[^}]+\})?('(?:[a-zA-Z0-9,.() _-]|\\\\u[0-9a-fA-F]{4})*')?( )?([0-9a-zA-Z_-]+|[=+*/%<!>&|-]{1,2})?(🧮(?:[0-9a-zA-Z_-]+|[=+*/%<!>&|-]{1,2}))?( )?(-?[0-9.]+)?(null|true|false)?(\$\{[^}]+\})?('(?:[a-zA-Z0-9,.() _-]|\\\\u[0-9a-fA-F]{4})*')?( )?(-?[0-9.]+)?(null|true|false)?(\$\{[^}]+\})?('(?:[a-zA-Z0-9,.() _-]|\\\\u[0-9a-fA-F]{4})*')?( )?(-?[0-9.]+)?(null|true|false)?(\$\{[^}]+\})?('(?:[a-zA-Z0-9,.() _-]|\\\\u[0-9a-fA-F]{4})*')?(.*)(",?)$/, 'default', 'custom', null, 'number', 'null', 'variable', 'string', null, null, 'variable', null, 'number', 'null', 'variable', 'string', null, 'number', 'null', 'variable', 'string', null, 'number', 'null', 'variable', 'string', null, 'default' ],
    [ /^( +)(.*)( \()([a-z]+)( - )([0-9-]+)(,)([0-9-]+)(.*)$/, null, 'key', null, 'string', null, 'number', null, 'number', null ]
  ];
  let out = [];
  for(let line of $('#jeText').textContent.split('\n')) {
    let foundMatch = false;
    for(const l of langObj) {
      const match = line.match(l[0]);
      if(match) {
        if(match[1] == '  "' && l[2] == 'key' && (l[4] == "null" && match[4] == "null" || String(jeWidget.defaults[match[2]]) == match[4])) {
          out.push(`<i class=default>${html(line)}</i>`);
          foundMatch = true;
          break;
        }

        const c = {...l};
        if(match[1] == '  "' && l[2] == 'key' && [ 'id', 'type' ].indexOf(match[2]) == -1 && jeWidget.getDefaultValue(match[2]) === undefined)
          c[2] = 'custom';

        for(let i=1; i<l.length; ++i)
          if(l[i] && match[i])
            match[i] = `<i class=${c[i]}>${html(match[i])}</i>`;

        let newLine = match.slice(1).join('');

        if(l.indexOf('variable') == -1) {
          newLine = newLine.replace(/\$\{[^}]+\}/g, m=>`<i class=variable>${m}</i>`);
        }

        out.push(newLine);
        foundMatch = true;

        break;
      }
    }
    if(!foundMatch)
      out.push(html(line));
  }
  $('#jeTextHighlight').innerHTML = out.join('\n');
}

function jeDisplayTree() {
  const allWidgets = Array.from(widgets.values());
  let result = 'CTRL-click a widget on the left to edit it.\n\nRoom\n';
  result += jeDisplayTreeAddWidgets(allWidgets, null, '  ');
  jeMode = 'tree';
  jeWidget = null;
  jeStateNow = null;
  jeSet(jeStateBefore = result);
  jeGetContext();
  jeShowCommands();
}

function jeDisplayTreeAddWidgets(allWidgets, parent, indent) {
  let result = '';
  for(const widget of (allWidgets.filter(w=>w.get('parent')==parent)).sort((w1,w2)=>w1.get('id') > w2.get('id'))) {
    result += `${indent}${widget.get('id')} (${widget.get('type') || 'basic'} - ${Math.floor(widget.get('x'))},${Math.floor(widget.get('y'))})\n`;
    result += jeDisplayTreeAddWidgets(allWidgets, widget.get('id'), indent+'  ');
    delete allWidgets[allWidgets.indexOf(widget)];
  }
  return result;
}

function jeGetContext() {
  const aO = getSelection().anchorOffset;
  const fO = getSelection().focusOffset;
  const s = Math.min(aO, fO);
  const e = Math.max(aO, fO);
  const v = $('#jeText').textContent;
  const t = jeStateNow && jeStateNow.type || 'basic';

  const select = v.substr(s, Math.min(e-s, 100)).replace(/\n/g, '\\n');
  const line = v.split('\n')[v.substr(0, s).split('\n').length-1];

  if(jeMode == 'tree') {
    jeContext = [ 'Tree' ];
    const match = line.match(/^(  )+(.*?) \([a-z]+ - /);
    if(match)
      jeContext.push(`"${match[2]}"`);
    jeShowCommands();
    return jeContext;
  }

  if(jeMode == 'macro') {
    jeContext = [ 'Macro' ];
    jeShowCommands();
    return jeContext;
  }

  try {
    jeStateNow = JSON.parse(v);

    if(!jeStateNow.id)
      jeJSONerror = 'No ID given.';
    else if(JSON.parse(jeStateBefore).id != jeStateNow.id && widgets.has(jeStateNow.id))
      jeJSONerror = `ID ${jeStateNow.id} is already in use.`;
    else if(jeStateNow.parent && !widgets.has(jeStateNow.parent))
      jeJSONerror = `Parent ${jeStateNow.parent} does not exist.`;
    else if(jeStateNow.type == 'card' && (!jeStateNow.deck || !widgets.has(jeStateNow.deck)))
      jeJSONerror = `Deck ${jeStateNow.deck} does not exist.`;
    else if(jeStateNow.type == 'card' && !widgets.get(jeStateNow.deck).get('cardTypes'))
      jeJSONerror = `Given widget ${jeStateNow.deck} is not a deck or doesn't define cardTypes.`;
    else if(jeStateNow.type == 'card' && (!jeStateNow.cardType || !widgets.get(jeStateNow.deck).get('cardTypes')[jeStateNow.cardType]))
      jeJSONerror = `Card type ${jeStateNow.cardType} does not exist in deck ${jeStateNow.deck}.`;
    else
      jeJSONerror = null;
  } catch(e) {
    jeStateNow = null;
    jeJSONerror = e;
  }

  let keys = [ t ];
  for(const line of v.split('\n').slice(0, v.substr(0, s).split('\n').length)) {
    const m = line.match(/^( +)(["{])([^"]*)/);
    if(m) {
      const depth = m[1].length/2;
      keys[depth] = m[2]=='{' || line.match(/^ +"[^"]*",?$/) ? (keys[depth] === undefined ? -1 : keys[depth]) + 1 : m[3];
      keys = keys.slice(0, depth+1);
    }
  }
  try {
    for(let i=1; i<keys.length-1; ++i) {
      if(String(keys[i]).match(/Routine$/) && typeof keys[i+1] == 'number' && !jeJSONerror) {
        const operation = jeGetValue(keys.slice(1, i+2), true);
        const func = typeof operation == 'string' && operation.match(/^var/) ? 'var expression' : operation.func;
        keys.splice(i+2, 0, '(' + (func || String(keys.slice(0, i+2))) + ')');
      }
    }
  } catch(e) {}

  if(select)
    keys.push(`"${select}"`);

  jeContext = keys;

  jeShowCommands();

  return jeContext;
}

function jeGetLastKey() {
  return jeContext[jeContext.length-1].toString().match(/^"/) ? jeContext[jeContext.length-2] : jeContext[jeContext.length-1];
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

function jePasteText(text, select) {
  const aO = getSelection().anchorOffset;
  const fO = getSelection().focusOffset;
  const s = Math.min(aO, fO);
  const e = Math.max(aO, fO);
  const v = $('#jeText').textContent;

  $('#jeText').textContent = v.substr(0, s) + text + v.substr(e);
  $('#jeText').focus();
  jeColorize();
  jeSelect(select ? s : s + text.length, s + text.length);
}

function jePostProcessObject(o) {
  const copy = { ...o };
  for(const key in copy)
    if(copy[key] === jeWidget.getDefaultValue(key) || key.match(/in deck/))
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
      copy[match[1]] = jeWidget.getDefaultValue(match[1]);
    if(match[3] == '#')
      copy[`LINEBREAK${match[1]}`] = null;
  }

  for(const key of Object.keys(o).sort())
    if(copy[key] === undefined)
      copy[key] = o[key];

  try {
    if(copy.type == 'card') {
      copy['cardDefaults (in deck)'] = widgets.get(copy.deck).get('cardDefaults');
      copy['cardType (in deck)'] = widgets.get(copy.deck).get('cardTypes')[copy.cardType];
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

function jeSet(text, dontFocus) {
  try {
    $('#jeText').textContent = jePreProcessText(JSON.stringify(jePreProcessObject(JSON.parse(text)), null, '  '));
  } catch(e) {
    $('#jeText').textContent = text;
  }
  if(!dontFocus)
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
    if(contextMatch && (!command.context || jeStateNow && !jeJSONerror) && (!command.show || command.show())) {
      if(activeCommands[contextMatch[0]] === undefined)
        activeCommands[contextMatch[0]] = [];
      activeCommands[contextMatch[0]].push(command);
    }
  }

  const usedKeys = { a: 1, c: 1, x: 1, v: 1, w: 1, n: 1, t: 1, q: 1, j: 1, z: 1 };
  let commandText = '';

  const sortByName = function(a, b) {
    const nameA = typeof a.name == 'function' ? a.name() : a.name;
    const nameB = typeof b.name == 'function' ? b.name() : b.name;
    return nameA.localeCompare(nameB);
  }

  const displayKey = function (k) {
    return { ArrowUp: '⬆', ArrowDown: '⬇'} [k] || k;
  }
  for(const command of jeCommands) {
    const contextMatch = context.match(new RegExp(command.context));
    if(contextMatch && contextMatch[0] == "") {
      const name = (typeof command.name == 'function' ? command.name() : command.name);
      let keyName = displayKey(command.forceKey);
      commandText += `<div class='jeTopButton'><button class='top' id='${command.id}' title='${name} (Ctrl-${keyName})' ${!command.show || command.show() ? '' : 'disabled'}>${name.substr(0,2)}</button><span class='top'>${keyName}</span></div>`;
    }
  }
  delete activeCommands[""];

  if(!jeJSONerror && jeStateNow) {
    for(const contextMatch of (Object.keys(activeCommands).sort((a,b)=>b.length-a.length))) {
      commandText += `\n  <b>${contextMatch}</b>\n`;
      for(const command of activeCommands[contextMatch].sort(sortByName)) {
        try {
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
            let keyName = displayKey(command.currentKey);
            commandText += (keyName !== undefined)? `Ctrl-${keyName}: ` : `no key  `;
            commandText += `<button id="${command.id}">${name.replace(keyName, '<b>' + keyName + '</b>')}</button>\n`;
          }
        } catch(e) {
          console.error(`Failed to show command ${command.id}`, e);
        }
      }
    }
  }
  commandText += `\n\n${context}\n`;
  if(jeJSONerror) {
    if(jeMode == 'widget')
      commandText += `\nCtrl-Space: go to error\n`;
    commandText += `\n<i class=error>${String(jeJSONerror)}</i>\n`;
  }
  if(jeCommandError)
    commandText += `\n<i class=error>Last command failed: ${String(jeCommandError)}</i>\n`;
  if(jeSecondaryWidget)
    commandText += `\n\n${jeSecondaryWidget}\n`;
  $('#jeCommands').innerHTML = commandText;
  on('#jeCommands button', 'click', clickButton);
}

const clickButton = async function(event) {
  await jeCommands.find(o => o.id == event.currentTarget.id).call();
  if (jeContext != 'macro') {
    jeGetContext();
    if(jeWidget && !jeJSONerror)
      await jeApplyChanges();
    if (jeContext[0] == '###SELECT ME###')
      jeGetContext();
  }
}

window.addEventListener('mousemove', function(e) {
  if(!jeEnabled)
    return;
  jeState.mouseX = Math.floor((e.clientX - roomRectangle.left) / scale);
  jeState.mouseY = Math.floor((e.clientY - roomRectangle.top ) / scale);

  const hoveredWidgets = [];
  for(const [ widgetID, widget ] of widgets)
    if(jeState.mouseX >= widget.absoluteCoord('x') && jeState.mouseX <= widget.absoluteCoord('x')+widget.get('width'))
      if(jeState.mouseY >= widget.absoluteCoord('y') && jeState.mouseY <= widget.absoluteCoord('y')+widget.get('height'))
        hoveredWidgets.push(widget);

  for(let i=1; i<=12; ++i) {
    if(hoveredWidgets[i-1]) {
      jeWidgetLayers[i] = hoveredWidgets[i-1];
      $(`#jeWidgetLayer${i}`).textContent = `F${i}:\nid: ${hoveredWidgets[i-1].get('id')}\ntype: ${hoveredWidgets[i-1].get('type') || 'basic'}`;
    } else {
      delete jeWidgetLayers[i];
      $(`#jeWidgetLayer${i}`).textContent = '';
    }
  }
});

window.addEventListener('mouseup', async function(e) {
  if(!jeEnabled)
    return;
  if(e.target == $('#jeText') && jeContext != 'macro') {
    jeGetContext();
    if (jeContext[0] == 'Tree' && jeContext[1] != undefined) {
      await jeCommands.find(o => o.id == 'je_openWidgetById').call();
      jeGetContext();
    }
  }
});

onLoad(function() {
  on('#jeText', 'paste', function(e) {
    const paste = (e.clipboardData || window.clipboardData).getData('text');
    jePasteText(paste, false);
    e.preventDefault();
  });
});

window.addEventListener('keydown', async function(e) {
  if(e.key == 'Control')
    jeState.ctrl = true;
  if(e.key == 'Shift')
    jeState.shift = true;

  if(e.key == 'Enter' && jeEnabled) {
    document.execCommand('insertHTML', false, '\n');
    e.preventDefault();
  }

  if(jeState.ctrl) {
    if(e.key == ' ' && jeMode == 'widget') {
      const locationLine = String(jeJSONerror).match(/line ([0-9]+) column ([0-9]+)/);
      if(locationLine) {
        const pos = $('#jeText').textContent.split('\n').slice(0, locationLine[1]-1).join('\n').length + +locationLine[2];
        jeSelect(pos, pos);
      }

      const locationPostion = String(jeJSONerror).match(/position ([0-9]+)/);
      if(locationPostion)
        jeSelect(+locationPostion[1], +locationPostion[1]);
    } else if(e.key == 'j') {
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
            await command.call();
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
      let id = jeWidgetLayers[+functionKey[1]].get('id');
      if(jeContext[jeContext.length-1] == '"null"')
        id = `"${id}"`;
      jePasteText(id, true);
    } else {
      jeSelectWidget(jeWidgetLayers[+functionKey[1]]);
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
