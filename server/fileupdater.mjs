export const VERSION = 16;

export default function FileUpdater(state) {
  const v = state._meta.version;
  if(v == VERSION)
    return state;
  if(v > VERSION)
    throw Error(`File version ${v} is newer than the supported version ${VERSION}.`);

  const globalProperties = computeGlobalProperties(state, v);
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