export const VERSION = 22;

export default function FileUpdater(state) {
  const v = state._meta.version;
  if(v == VERSION)
    return state;
  if(v > VERSION)
    throw Error(`File version ${v} is newer than the supported version ${VERSION}.`);

  const globalProperties = computeGlobalProperties(state, v);

  updateMeta(state._meta, v, state);
  for(const id in state)
    updateProperties(state[id], v, globalProperties);

  state._meta.version = VERSION;
  return state;
}

function computeGlobalProperties(state, v) {
  let globalProperties = {};
  if (globalProperties.v12DropShadowAllowed = v < 10) {
    for (const id in state) {
      const properties = state[id];
      if (properties.type == 'card' || properties.type == 'deck' || properties.type == 'pile') {
        globalProperties.v12DropShadowAllowed = globalProperties.v12DropShadowAllowed &&
            !hasPropertyCondition(properties, (properties) => {
              return properties.parentChangeRoutine || properties.changeRoutine;
            });
      }
      globalProperties.v12DropShadowAllowed = globalProperties.v12DropShadowAllowed &&
          !hasPropertyCondition(properties, (properties) => {
            return properties.parentGlobalUpdateRoutine || properties.globalUpdateRoutine;
          });
      if (!globalProperties.v12DropShadowAllowed)
        break;
    }
  }

  v<20 && v20WhiteSpacePreWrapRoutineCheck(state, globalProperties);

  if(v < 22)
    globalProperties.v22SeatIDs = Object.keys(state).filter(id => state[id] && state[id].type == 'seat');

  return globalProperties;
}

function hasPropertyCondition(properties, condition) {
  if (properties == null || typeof properties != 'object')
    return false;
  if (condition(properties))
    return true;
  if (properties.type) {
    for (const property of ['onPileCreation', 'onEnter', 'onLeave'])
      if (hasPropertyCondition(properties[property], condition))
        return true;
    if (typeof properties.faces == 'object')
      for (const face in properties.faces)
        if (hasPropertyCondition(properties.faces[face], condition))
          return true;
    if (properties.type == 'deck') {
      if (hasPropertyCondition(properties.cardDefaults, condition))
        return true;
      if (typeof properties.cardTypes == 'object')
        for(const cardType in properties.cardTypes)
          if (hasPropertyCondition(properties.cardTypes[cardType], condition))
            return true;
      if(typeof properties.faceTemplates == 'object')
        for(const face in properties.faceTemplates)
          if (typeof properties.faceTemplates[face] == 'object' &&
              hasPropertyCondition(properties.faceTemplates[face].properties, condition))
            return true;
    }
  }
  return false;
}

function updateMeta(meta, v, state) {
  v<18 && v18RoutineLegacyModes(meta, state);
  v<19 && v19useIframeForHtmlCards(meta, state);
  v<21 && v21DisableHolderImageWidget(meta, state);
}

function updateProperties(properties, v, globalProperties) {
  if(typeof properties != 'object')
    return;

  if(!properties.type) {
    if (typeof properties.faces == 'object') {
      for (let face in properties.faces) {
        updateProperties(properties.faces[face], v, globalProperties);
      }
    }
  }
  if(properties.type == 'deck')
    updateProperties(properties.cardDefaults, v, globalProperties);
  if(properties.type == 'deck' && typeof properties.cardTypes == 'object')
    for(const cardType in properties.cardTypes)
      updateProperties(properties.cardTypes[cardType], v, globalProperties);

  for(const property in properties)
    if(property.match(/Routine$/))
      updateRoutine(properties[property], v, globalProperties);

  v<4 && v4ModifyDropTargetEmptyArray(properties);
  v<5 && v5DynamicFaceProperties(properties);
  v<6 && v6cssPieces(properties);
  v<7 && v7HolderClickable(properties);
  v<8 && v8HoverInheritVisibleForSeat(properties);
  v<10 && v10GridOffset(properties);
  v<12 && globalProperties.v12DropShadowAllowed && v12HandDropShadow(properties);
  v<13 && v13EnlargeTinyLabels(properties);
  v<14 && v14HidePlayerCursors(properties);
  v<15 && v15SkipTurnProperty(properties);
  v<17 && v17MaterialSymbols(properties);
  v<20 && v20WhiteSpacePreWrap(properties, globalProperties);
  v<22 && v22SeatProperties(properties, globalProperties);
}

function updateRoutine(routine, v, globalProperties) {
  if(!Array.isArray(routine))
    return;

  for(const operation of routine) {
    if(operation.func == 'CLONE') {
      updateProperties(operation.properties, v, globalProperties);
    }
    if(operation.func == 'FOREACH') {
      updateRoutine(operation.loopRoutine, v, globalProperties);
    }
    if(operation.func == 'IF') {
      updateRoutine(operation.thenRoutine, v, globalProperties);
      updateRoutine(operation.elseRoutine, v, globalProperties);
    }
  }

  v<2 && v2UpdateSelectDefault(routine);
  v<3 && v3RemoveComputeAndRandomAndApplyVariables(routine);
  v<9 && v9NumericStringSort(routine);
  v<11 && v11OwnerMOVEXY(routine);
  v<15 && v15SkipTurnRoutine(routine);
  v<16 && v16UpdateCountParameter(routine);
  v<22 && v22SeatRoutine(routine, globalProperties);
}

function v2UpdateSelectDefault(routine) {
  let isNotFirstSelect = {};
  for(const operation of routine) {
    if(operation.func == 'SELECT') {
      if(operation.mode === undefined && isNotFirstSelect[operation.collection || 'DEFAULT'])
        operation.mode = 'add';
      if(operation.mode == 'set')
        delete operation.mode;
      isNotFirstSelect[operation.collection || 'DEFAULT'] = true;
    }
  }
}

function v3RemoveComputeAndRandomAndApplyVariables(routine) {
  const operationsToSplice = [];
  let orderAdded = 0;

  let stringCounter = 0;
  function removeExistingVariables(str, routineIndex) {
    return str.replace(/\$\{[^}]+\}/g, function(match) {
      operationsToSplice.push({
        index: +routineIndex,
        order: orderAdded++,
        operation: `var internal_computeMigration_existingVariable${stringCounter} = '${escapeString(match)}' // This was added by the automatic file migration because the new expression syntax does not support escaping variable expressions.`
      });
      return `\${internal_computeMigration_existingVariable${stringCounter++}}`;
    });
  }

  function removeExistingVariablesRecursively(obj, routineIndex) {
    for(const i of Object.keys(obj)) {
      if(typeof obj[i] == 'string' && i != 'template')
        obj[i] = removeExistingVariables(obj[i], routineIndex);
      else if(typeof obj[i] == 'object' && obj[i] !== null && !i.match(/Routine$/))
        removeExistingVariablesRecursively(obj[i], routineIndex);

      const temp = obj[i];
      delete obj[i];
      obj[removeExistingVariables(i, routineIndex)] = temp;
    }
  }

  function dissolveApplyVariables(obj, routineIndex) {
    if(Array.isArray(obj.applyVariables)) {
      for(const i in obj.applyVariables) {
        const v = obj.applyVariables[i];
        if(obj.func == 'COMPUTE' && !v.variable && v.template)
          obj[v.parameter] = addTempSet(routineIndex, `applyVariables${i}`, v.template.replace(/\{([^}]+)\}/g, (_,x)=>`\${${escapeString(x)}}`), 'templates in operands');
        else if(v.parameter && v.variable)
          obj[v.parameter] = `\${${escapeString(v.variable)}}`;
        else if(v.parameter && v.template)
          obj[v.parameter] = v.template.replace(/\{([^}]+)\}/g, (_,x)=>`\${${escapeString(x)}}`);
        else if(v.parameter && v.property && v.widget)
          obj[v.parameter] = `\${PROPERTY ${escapeString(v.property, /^[A-Za-z0-9 _-]$/)} OF ${escapeString(v.widget, /^[A-Za-z0-9 _-]$/)}}`;
        else if(v.parameter && v.property)
          obj[v.parameter] = `\${PROPERTY ${escapeString(v.property, /^[A-Za-z0-9 _-]$/)}}`;
      }
    }
    delete obj.applyVariables;
  }

  function addTempSet(i, propertySuffix, value, missingFeature) {
    operationsToSplice.push({ index: +i, order: orderAdded++, operation: {
      note: `This was added by the automatic file migration because the new expression syntax does not support ${missingFeature}.`,
      func: 'SET',
      collection: 'thisButton',
      property: `internal_computeMigration_${propertySuffix}`,
      value
    }});
    operationsToSplice.push({ index: +i+1, order: orderAdded++, operation: {
      note: `This was added by the automatic file migration because the new expression syntax does not support ${missingFeature}.`,
      func: 'SET',
      collection: 'thisButton',
      property: `internal_computeMigration_${propertySuffix}`,
      value: null
    }});
    return '${PROPERTY internal_computeMigration_' + propertySuffix + '}';
  }

  let variableCount = 0;
  function toVariable(i, str) {
    if(str.match(/^\$\{PROPERTY /)) {
      const newVariable = `internal_computeMigration_propertyToVariable${variableCount++}`;
      operationsToSplice.push({
        index: +i,
        order: orderAdded++,
        operation: `var ${newVariable} = ${str} // This was added by the automatic file migration because the new expression syntax does not support using widget properties as variable name or operation.`
      });
      return '${' + newVariable + '}';
    }
    return str;
  }

  function escapeString(str, valid) {
    return String(str).split('').map(function(c) {
      if(c.match(valid || /^[A-Za-z0-9_-]$/))
        return c;
      let code = c.charCodeAt(0).toString(16);
      while(code.length < 4)
        code = '0' + code;
      return `\\u${code}`;
    }).join('').replace(/^PROPERTY /, 'PROPERTY\\u0020').replace(/ OF /, '\\u0020OF ');
  }

  for(const [ i, op ] of Object.entries(routine)) {
    if(!op || !op.func)
      continue;

    removeExistingVariablesRecursively(op, i);
    dissolveApplyVariables(op, i);
    delete routine[i].applyVariables;

    if(op.func == 'CLONE' && op.properties)
      dissolveApplyVariables(routine[i].properties);

    if(op.func == 'COMPUTE') {
      const getOp = function(o) {
        if(op[o] === undefined)
          return 1;
        if(JSON.stringify(op[o]) == '[]')
          return '[]';
        if(JSON.stringify(op[o]) == '{}')
          return '{}';
        if(typeof op[o] === 'object' && op[o] !== null)
          return addTempSet(i, o, op[o], 'non-empty object literals');
        if(typeof op[o] === 'string' && op[o].match(/^\$\{[^}]+\}$/))
          return op[o];
        if(typeof op[o] === 'string')
          return `'${escapeString(op[o], /^[ !#-&(-[\]-~]$/)}'`;
        return String(op[o]);
      };

      const operandsAfterOperation = '!,hypot,min,max,sin,cos,tan,abs,cbrt,ceil,exp,floor,log,log10,log2,round,sign,sqrt,trunc,parseFloat,from,isArray,push,setIndex,randInt,randRange';
      const noOperandBeforeOperation = `random,${operandsAfterOperation},E,LN2,LN10,LOG2E,LOG10E,PI,SQRT1_2,SQRT2`;
      const lessThanTwoOperands = 'E,LN2,LN10,LOG2E,LOG10E,PI,SQRT1_2,SQRT2,!,abs,cbrt,ceil,cos,exp,floor,log,log10,log2,random,round,sign,sin,sqrt,tan,trunc,length,toLocaleLowerCase,toLocaleUpperCase,toLowerCase,toUpperCase,trim,trimEnd,trimStart,from,isArray,length,pop,reverse,shift,sort,parseFloat,push,unshift';
      const threeOperands = 'slice,randRange,substr,replace,replaceAll';
      const validOperations = `${noOperandBeforeOperation},${lessThanTwoOperands},${threeOperands},=,+,-,*,**,/,%,<,<=,==,!=,>=,>,&&,||,pow,charAt,charCodeAt,codePointAt,concat,includes,endsWith,indexOf,lastIndexOf,localeCompare,match,padEnd,padStart,repeat,search,split,startsWith,toFixed,getIndex,concatArray,includes,indexOf,join,lastIndexOf`;

      if(String(op.variable).match(/^\$\{[^}]+\}$/))
        routine[i] = `var ${toVariable(i, op.variable).replace(/^\$\{([^}]+)\}$/, (_,v)=>`$${v}`)} = `;
      else
        routine[i] = `var ${escapeString(op.variable || 'COMPUTE')} = `;

      if(noOperandBeforeOperation.split(',').indexOf(op.operation) == -1)
        routine[i] += `${getOp('operand1')} `;

      if(String(op.operation).match(/^\$\{[^}]+\}$/))
        routine[i] += toVariable(i, op.operation).replace(/^\$\{([^}]+)\}$/, (_,v)=>`🧮${v}`);
      else
        routine[i] += `${op.operation || '+'}`;

      if(operandsAfterOperation.split(',').indexOf(op.operation) != -1)
        routine[i] += ` ${getOp('operand1')}`;
      if(lessThanTwoOperands.split(',').indexOf(op.operation) == -1)
        routine[i] += ` ${getOp('operand2')}`;
      if(threeOperands.split(',').indexOf(op.operation) != -1)
        routine[i] += ` ${getOp('operand3')}`;

      if(op.note || op.Note || op.comment || op.Comment)
        routine[i] += ` // ${op.note || op.Note || op.comment || op.Comment}`;

      if(!String(op.operation).match(/^\$\{[^}]+\}$/) && validOperations.split(',').indexOf(op.operation || '+') == -1) {
        operationsToSplice.push({
          index: +i,
          order: orderAdded++,
          operation: `var internal_computeMigration_isVariableNull = \${${escapeString(op.variable || 'COMPUTE')}} == null // This was added by the automatic file migration because the COMPUTE used an invalid operation which leads to different results with the new expression syntax.`
        });
        routine[i] = {
          note: 'This was added by the automatic file migration because the COMPUTE used an invalid operation which leads to different results with the new expression syntax.',
          func: 'IF',
          condition: '${internal_computeMigration_isVariableNull}',
          thenRoutine: [
            `var ${escapeString(op.variable || 'COMPUTE')} = 0`
          ]
        };
      }

      if(op.skip) {
        routine[i] = {
          func: 'IF',
          condition: addTempSet(i, 'skip', op.skip, 'skip'),
          elseRoutine: [ routine[i] ]
        };
      }
    }

    if(op.func == 'INPUT' && Array.isArray(op.fields)) {
      for(const field of routine[i].fields)
        dissolveApplyVariables(field);
    }

    if(op.func == 'RANDOM') {
      routine[i] = `var ${escapeString(op.variable || 'RANDOM')} = randInt ${op.min === undefined ? 1 : op.min} ${op.max === undefined ? 10 : op.max}`;
      if(op.note || op.Note || op.comment || op.Comment)
        routine[i] += ` // ${op.note || op.Note || op.comment || op.Comment}`;

      if(op.skip) {
        routine[i] = {
          func: 'IF',
          condition: addTempSet(i, 'skip', op.skip, 'skip'),
          elseRoutine: [ routine[i] ]
        };
      }
    }
  }

  for(const o of operationsToSplice.sort((a,b)=>a.index==b.index?b.order-a.order:b.index-a.index))
    routine.splice(o.index, 0, o.operation);
}

function v4ModifyDropTargetEmptyArray(properties) {
  if(Array.isArray(properties.dropTarget) && properties.dropTarget.length == 0)
    properties.dropTarget = {};
}

function v5DynamicFaceProperties(properties) {
  if(Array.isArray(properties.faceTemplates)) {
    for(const face of properties.faceTemplates) {
      if(Array.isArray(face.objects)) {
        for(const object of face.objects) {
          if(object.valueType != 'static' && object.value) {
            if(typeof object.dynamicProperties != 'object')
              object.dynamicProperties = { value: object.value }
            else
              object.dynamicProperties.value = object.value;
            delete object.value;
          }
          delete object.valueType;
        }
      }
    }
  }
}

function v6cssPieces(properties) {
  const pinRE = /\bpinPiece\b/;
  const classicRE = /\bclassicPiece\b/;
  if(!properties.classes || typeof properties.classes != 'string')
    return;
  if(properties.classes.match(pinRE)) {
    if(properties.text || properties.css || !properties.height || properties.height > 60) {
      properties.classes = properties.classes.replace(pinRE, 'legacyPinPiece');
      return;
    } else {
      const length = Math.round(50 + 30 * (properties.height - 28.5)/15.33);
      if(length !=80)
        properties.css = `--pinLength: ${length}`;
      properties.width = 35.85;
      return;
    }
  } else if(properties.classes.match(classicRE)) {
    if(properties.text || properties.css || properties.width < 74 || properties.height < 87) {
      properties.classes = properties.classes.replace(classicRE, 'legacyClassicPiece');
      return;
    } else {
      properties.x += 17;
      properties.y += 3;
      properties.width = 56;
      properties.height = 84;
      return;
    }
  }
}

function v7HolderClickable(properties) {
  if (properties.clickRoutine && !properties.clickable && properties.type=='holder'){
    properties.clickable=false;
  }
}

function v8HoverInheritVisibleForSeat(properties) {
  if (properties.onlyVisibleForSeat)
    properties.hoverInheritVisibleForSeat = false;
}

function v9NumericStringSort(routine) {
  for(const key in routine)
    if(typeof routine[key] === 'string')
      routine[key] = routine[key].replace('numericSort', 'numericStringSort');
}

function v10GridOffset(properties) {
  const grid = properties.grid;
  if (!grid || typeof grid != 'object')
    return;
  for (let i in grid) {
    if (!grid[i] || typeof grid[i] != 'object')
      continue;
    const xAdjustment = -grid[i].x*0.5;
    const yAdjustment = -grid[i].y*0.5;
    grid[i].offsetX = (grid[i].offsetX || 0) + xAdjustment;
    grid[i].offsetY = (grid[i].offsetY || 0) + yAdjustment;
    if (typeof grid[i].minX == 'number')
      grid[i].minX += xAdjustment;
    if (typeof grid[i].maxX == 'number')
      grid[i].maxX += xAdjustment;
    if (typeof grid[i].minY == 'number')
      grid[i].minY += yAdjustment;
    if (typeof grid[i].maxY == 'number')
      grid[i].maxY += yAdjustment;
  }
}

function v11OwnerMOVEXY(routine) {
  for(const operation of routine)
    if(operation.func == 'MOVEXY' && operation.resetOwner === undefined)
      operation.resetOwner = false;
}

function v12HandDropShadow(properties) {
  if (properties.type == 'holder' && properties.childrenPerOwner && !properties.enterRoutine && !properties.leaveRoutine && !properties.changeRoutine) {
    properties.dropShadow = true;
  }
}

function v13EnlargeTinyLabels(properties) {
  if(properties.type == 'label') {
    const match = JSON.stringify(properties.css || '').match(/font-size"?:"? *([0-9]+) *px/);
    const fontSize = match ? +match[1] : 16;
    if((properties.height || 20) < fontSize + 2)
      properties.height = fontSize + 2;
  }
}

function v14HidePlayerCursors(properties) {
  if(properties.type == 'holder' && properties.childrenPerOwner)
    properties.hidePlayerCursors = true;
}

// There are 2 functions for v15 for skipTurn
function v15SkipTurnProperty(properties) {
  if(properties.skipTurn !== undefined) {
    properties.skipTurnFileUpdater = properties.skipTurn;
    delete properties.skipTurn;
  }
}
function v15SkipTurnRoutine(routine) {
  for(const key in routine)
    routine[key] = JSON.parse(JSON.stringify(routine[key]).replace(/\bskipTurn\b/g, 'skipTurnFileUpdater'));
}

function v16UpdateCountParameter(routine) {
  for(const key in routine) {
    if(routine[key] && [ 'FLIP', 'MOVE', 'MOVEXY', 'ROTATE' ].indexOf(routine[key].func) != -1) {
      if(typeof routine[key].count != 'undefined' && (key != 'MOVE' || !routine[key].fillTo || String(routine[key].fillTo).includes('$'))) {
        if(!routine[key].count) {
          routine[key].count = 'all';
        } else if(typeof routine[key].count == 'string' && routine[key].count.includes('$')) {
          routine[key] = {
            note: `This was added by the automatic file migration because the behavior of ${routine[key].func} with count=0 changed.`,
            func: 'IF',
            condition: routine[key].count,
            thenRoutine: [
              {...routine[key]}
            ],
            elseRoutine: [
              Object.assign({}, routine[key], { count: 'all' })
            ]
          };
        }
      }
    }
  }
}

function v17MaterialSymbols(properties) {
  for (const key in properties) {
    if (typeof properties[key] === 'object' && properties[key] !== null) {
      v17MaterialSymbols(properties[key]);
    } else if (typeof properties[key] === 'string') {
      properties[key] = properties[key].replace(/\b(material-icons(?:-(outlined|round|sharp|twotone))?)\b/g, "material-symbols");
    }
  }
}

function v18RoutineLegacyModes(meta, state) {
  meta.gameSettings = { legacyModes: {} };

  if(JSON.stringify(state).match(/"var |COMPUTE/)) {
    meta.gameSettings.legacyModes.convertNumericVarParametersToNumbers = true;
    meta.gameSettings.legacyModes.useOneAsDefaultForVarParameters = true;
  }
}

function v19useIframeForHtmlCards(meta, state) {
  for(const widget of Object.values(state))
    if(widget.type == 'deck' && Array.isArray(widget.faceTemplates))
      for(const face of widget.faceTemplates)
        if(Array.isArray(face.objects))
          for(const object of face.objects)
            if(object.type == 'html')
              return meta.gameSettings.legacyModes.useIframeForHtmlCards = true;
}

function v20WhiteSpacePreWrapRoutineCheck(obj, globalProperties) {
  // recursively check all objects in state to see if any SET operation sets html
  if(Array.isArray(obj)) {
    for(const operation of obj) {
      if(v20WhiteSpacePreWrapRoutineCheck(operation, globalProperties))
        return true;
    }
  }
  if(typeof obj == 'object' && obj !== null) {
    for(const subObj of Object.values(obj)) {
      if(v20WhiteSpacePreWrapRoutineCheck(subObj, globalProperties))
        return true;
    }
    if(obj.func == 'SET' && obj.property == 'html')
      return globalProperties.v20WhiteSpacePreWrapForAllHtml = true;
  }
  return false;
}

function v20WhiteSpacePreWrap(properties, globalProperties) {
  function hasMultipleWhitespaceOrNewline(str) {
    return typeof str == 'string' && (/[\r\n]|\s{2,}/.test(str));
  }

  function cssHasWhiteSpace(css) {
    if(typeof css == 'string')
      return /\bwhite-space(-collapse)?\s*:/i.test(css);
    if(isNestedCSS(css))
      return cssHasWhiteSpace(css['']) || cssHasWhiteSpace(css['inline']) || cssHasWhiteSpace(css['default']);
    if(typeof css == 'object' && css !== null)
      return css['white-space'] || css['white-space-collapse'];
    return false;
  }

  function isNestedCSS(css) {
    if(typeof css == 'object' && css !== null)
      for(const key in css)
        if(typeof css[key] == 'object' && css[key] !== null)
          return true;
    return false;
  }

  function addWhiteSpacePreWrapToCss(css) {
    if(!css)
      return 'white-space: pre-wrap';
    if(typeof css == 'string')
      return `${css}; white-space: pre-wrap`;
    if(isNestedCSS(css)) {
      css['default'] = addWhiteSpacePreWrapToCss(css['default'] || {});
      return css;
    }
    if(typeof css == 'object' && css !== null)
      css['white-space'] = 'pre-wrap';
    return css;
  }

  if(properties.type == 'deck' && Array.isArray(properties.faceTemplates))
    for(const face of properties.faceTemplates)
      if(Array.isArray(face.objects))
        for(const object of face.objects)
          if(object.type == 'html' && object.value && hasMultipleWhitespaceOrNewline(String(object.value)))
            if(!cssHasWhiteSpace(object.css))
              object.css = addWhiteSpacePreWrapToCss(object.css);

  if(!properties.type && (hasMultipleWhitespaceOrNewline(String(properties.html)) || String(JSON.stringify(properties.inheritFrom)).match(/"html"/)) || (typeof properties.html == 'string' && globalProperties.v20WhiteSpacePreWrapForAllHtml) && !cssHasWhiteSpace(properties.css))
    properties.css = addWhiteSpacePreWrapToCss(properties.css);
}

// v22 renamed the seat's text/color properties so that "display" is free for the
// generic show/hide boolean every other widget has:
//   display      -> seatedText   (only on seats, "display" means something else everywhere else)
//   displayEmpty -> emptyText
//   colorEmpty   -> emptyColor
// displayEmpty and colorEmpty only ever meant something on a seat, so they are
// renamed wherever a property NAME is expected: property keys, the property-name
// fields of routine operations and "${PROPERTY ...}" references. Arbitrary
// strings (labels, html, widget IDs, css class names, comments) are never
// rewritten - they may legitimately contain those words.
const v22SeatOnlyNames = { displayEmpty: 'emptyText', colorEmpty: 'emptyColor' };

// routine operation fields that hold a widget property name
const v22PropertyNameFields = { GET: 'property', SELECT: 'property', SET: 'property', RESET: 'property', SCORE: 'property', SORT: 'key' };

// "${PROPERTY <name>}" / "${PROPERTY <name> OF <id>}". The content is captured
// in one piece and split afterwards: spelling the two identifiers out in the
// pattern lets it backtrack quadratically on a crafted game file.
const v22PropertyExpression = /\$\{PROPERTY ([^{}]*)\}/g;
const v22PropertyIdentifier = /^[a-zA-Z0-9 _-]+$/;

// name and target of a property expression, or null when it is not the plain
// form evaluateVariables() resolves statically (a "$variable" indirection or an
// identifier with characters it does not accept)
function v22ParsePropertyExpression(content) {
  // identifiers may contain spaces, so the first " OF " wins - the engine
  // matches the name lazily and gets the same split
  const of = content.indexOf(' OF ');
  const name = of == -1 ? content : content.substr(0, of);
  const ofID = of == -1 ? undefined : content.substr(of + 4);
  if(!v22PropertyIdentifier.test(name) || ofID !== undefined && !v22PropertyIdentifier.test(ofID))
    return null;
  return { name, ofID };
}

// The replacement for a property name, or null to keep it. "display" is a real
// property on every widget, so it is only renamed where the widget it is read
// from is known to be a seat.
function v22SeatPropertyName(name, ofID, ownIsSeat, seatIDs) {
  if(v22SeatOnlyNames[name])
    return v22SeatOnlyNames[name];
  if(name == 'display' && (ofID === undefined ? ownIsSeat : seatIDs.indexOf(ofID) != -1))
    return 'seatedText';
  return null;
}

// A seat-only name where a property name is expected, keeping the '!' that
// negates an entry in an inheritFrom list.
function v22RenameSeatOnlyName(name) {
  if(typeof name != 'string')
    return name;
  const negated = name.charAt(0) == '!';
  const renamed = v22SeatOnlyNames[negated ? name.substr(1) : name];
  return renamed ? (negated ? '!' + renamed : renamed) : name;
}

// Walks the whole value, renaming property references inside "${PROPERTY ...}"
// expressions and inside the three structures that hold property names rather
// than values: inheritFrom (widget ID -> '*' or a list of names), svgReplaces
// (SVG color -> name) and a face object's dynamicProperties (face object
// property -> name). Nothing else is touched.
function v22RenameNames(value, ownIsSeat, seatIDs) {
  if(typeof value == 'string')
    return value.replace(v22PropertyExpression, (match, content) => {
      const expression = v22ParsePropertyExpression(content);
      const renamed = expression && v22SeatPropertyName(expression.name, expression.ofID, ownIsSeat, seatIDs);
      return renamed ? `\${PROPERTY ${renamed}${expression.ofID === undefined ? '' : ` OF ${expression.ofID}`}}` : match;
    });

  if(!value || typeof value != 'object')
    return value;

  for(const key in value) {
    const nested = value[key];
    if((key == 'inheritFrom' || key == 'svgReplaces' || key == 'dynamicProperties') && nested && typeof nested == 'object')
      for(const name in nested)
        nested[name] = Array.isArray(nested[name]) ? nested[name].map(v22RenameSeatOnlyName) : v22RenameSeatOnlyName(nested[name]);
    value[key] = v22RenameNames(nested, ownIsSeat, seatIDs);
  }
  return value;
}

function v22RenameKey(object, from, to) {
  if(object[from] !== undefined) {
    object[to] = object[from];
    delete object[from];
  }
}

function v22SeatProperties(properties, globalProperties) {
  const isSeat = properties.type == 'seat';

  v22RenameNames(properties, isSeat, globalProperties.v22SeatIDs || []);

  for(const from in v22SeatOnlyNames)
    v22RenameKey(properties, from, v22SeatOnlyNames[from]);

  // "display" is a boolean on every other widget, so it is only renamed on seats
  if(isSeat) {
    v22RenameKey(properties, 'display', 'seatedText');
    v22SeatedColorFromCSS(properties);
  }
}

// Before seatedColor existed, the editor's "Fixed color" preset pinned the color
// of an occupied seat with a ".seated { --color: <color> !important }" rule that
// beat the color the engine writes inline when someone sits down. seatedColor
// does that job now, so the rule moves into the property.
function v22SeatedColorFromCSS(properties) {
  const seated = properties.css && typeof properties.css == 'object' ? properties.css['.seated'] : null;
  if(!seated || typeof seated != 'object' || typeof seated['--color'] != 'string')
    return;

  // without !important the inline player color won anyway, so nothing to move
  const important = '!important';
  const raw = seated['--color'].trimEnd();
  if(!raw.toLowerCase().endsWith(important))
    return;
  const value = raw.slice(0, -important.length).trim();

  // the preset pointed at the seat's own empty color; anything else dynamic is
  // left alone because seatedColor is used verbatim, not evaluated
  const color = /^\$\{PROPERTY emptyColor\}$/.test(value) ? (properties.emptyColor || '#999999') : value;
  if(!color || color.indexOf('${') != -1)
    return;

  properties.seatedColor = color;
  // a seat that is occupied right now showed the fixed color through the
  // override, so keep it there instead of falling back to the player color
  if(properties.player)
    properties.color = color;

  delete seated['--color'];
  if(!Object.keys(seated).length)
    delete properties.css['.seated'];
}

// The property name an operation works on. GET also accepts a [ property, key ]
// path and SORT a list of keys, so the name can sit inside an array.
function v22OperationPropertyNames(operation, field) {
  const value = operation[field];
  if(typeof value == 'string')
    return [ { get: () => value, set: name => operation[field] = name } ];
  if(!Array.isArray(value) || !value.length)
    return [];
  // a GET property path names one property, the rest of the path are keys in it
  const entries = operation.func == 'GET' ? [ value[0] ] : value;
  return entries.map((entry, index) => typeof entry == 'string'
    ? { get: () => value[index], set: name => value[index] = name }
    : { get: () => entry && typeof entry == 'object' ? entry.key : undefined, set: name => entry.key = name });
}

// GET names its variable after the property unless one is given, so pin the old
// name down before renaming - "${colorEmpty}" further down keeps working.
function v22RenameOperationProperty(operation, field, entry, name) {
  if(operation.func == 'GET' && operation.variable === undefined)
    operation.variable = entry.get();
  entry.set(name);
}

function v22SeatRoutine(routine, globalProperties) {
  const seatIDs = globalProperties.v22SeatIDs || [];

  // What a collection provably holds: true = seats only, false = no seats at
  // all, undefined = unknown. A plain SET/GET/SELECT of "display" cannot be
  // resolved statically, so it is only renamed for a seats-only collection, or -
  // when nothing is known about the collection - when the value uses a
  // placeholder that only a seat text understands.
  const seatOnly = {};

  for(const operation of routine) {
    if(!operation || typeof operation != 'object')
      continue;
    const collection = operation.collection || 'DEFAULT';
    const field = v22PropertyNameFields[operation.func];
    const propertyNames = field ? v22OperationPropertyNames(operation, field) : [];

    for(const entry of propertyNames)
      if(v22SeatOnlyNames[entry.get()])
        v22RenameOperationProperty(operation, field, entry, v22SeatOnlyNames[entry.get()]);

    if(operation.func == 'SELECT') {
      const selectsSeats = v22SelectsSeats(operation);
      const mode = operation.mode || 'set';
      if(mode == 'set')
        seatOnly[collection] = selectsSeats;
      else if(mode == 'add')
        seatOnly[collection] = v22Union(seatOnly[collection], selectsSeats);
      else if(mode == 'intersect')
        seatOnly[collection] = v22Intersection(seatOnly[collection], selectsSeats);
      // 'remove' can never bring non-seats into the collection
    } else if(operation.func == 'CLONE') {
      delete seatOnly[collection];
    } else if(operation.func == 'CALL' || operation.func == 'FOREACH' || operation.func == 'IF') {
      // these run routines of their own which can refill any collection
      for(const name in seatOnly)
        delete seatOnly[name];
    }

    if([ 'SELECT', 'SET', 'GET' ].indexOf(operation.func) == -1)
      continue;
    // a SELECT filters on the type it selects, everything else on its collection
    const targetsSeats = operation.func == 'SELECT' ? v22SelectsSeats(operation) : seatOnly[collection];
    for(const entry of propertyNames)
      if(entry.get() == 'display' && (targetsSeats === true || targetsSeats === undefined && v22SeatTextValue(operation)))
        v22RenameOperationProperty(operation, field, entry, 'seatedText');
  }
}

// true if the SELECT provably picks only seats, false if it provably picks none,
// undefined without a type filter
function v22SelectsSeats(operation) {
  if(operation.type === undefined || operation.type == 'all' || typeof operation.type != 'string')
    return undefined;
  return operation.type == 'seat';
}

function v22Union(a, b) {
  return a === true && b === true ? true : (a === false || b === false ? false : undefined);
}

function v22Intersection(a, b) {
  return a === true || b === true ? true : (a === false && b === false ? false : undefined);
}

// only a seat text understands these placeholders, so a value using one was
// written for a seat even when the collection cannot be resolved
function v22SeatTextValue(operation) {
  return typeof operation.value == 'string' && /\b(playerName|seatIndex)\b/.test(operation.value);
}

function v21DisableHolderImageWidget(meta, state) {
  for(const id in state) {
    const properties = state[id];
    if(properties && properties.type == 'holder') {
      if(properties.image || properties.icon || properties.text || properties.textColor || properties.color || properties.svgReplaces) {
        meta.gameSettings.legacyModes.disableHolderImageWidget = true;
        return;
      }
    }
  }
}