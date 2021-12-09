export const VERSION = 6;

export default function FileUpdater(state) {
  const v = state._meta.version;
  if(v == VERSION)
    return state;
  if(v > VERSION)
    throw Error(`File version ${v} is newer than the supported version ${VERSION}.`);

  for(const id in state)
    updateProperties(state[id], v);

  state._meta.version = VERSION;
  return state;
}

function updateProperties(properties, v) {
  if(typeof properties != 'object')
    return;

  if(!properties.type)
    updateProperties(properties.faces, v);
  if(properties.type == 'deck')
    updateProperties(properties.cardDefaults, v);
  if(properties.type == 'deck' && typeof properties.cardTypes == 'object')
    for(const cardType in properties.cardTypes)
      updateProperties(properties.cardTypes[cardType], v);

  for(const property in properties)
    if(property.match(/Routine$/))
      updateRoutine(properties[property], v);

  v<4 && v4ModifyDropTargetEmptyArray(properties);
  v<5 && v5DynamicFaceProperties(properties);
}

function updateRoutine(routine, v) {
  if(!Array.isArray(routine))
    return;

  for(const operation of routine) {
    if(operation.func == 'CLONE') {
      updateProperties(operation.properties, v);
    }
    if(operation.func == 'FOREACH') {
      updateRoutine(operation.loopRoutine, v);
    }
    if(operation.func == 'IF') {
      updateRoutine(operation.thenRoutine, v);
      updateRoutine(operation.elseRoutine, v);
    }
  }

  v<2 && v2UpdateSelectDefault(routine);
  v<3 && v3RemoveComputeAndRandomAndApplyVariables(routine);
  v<6 && v6ModifyVarSyntax(routine);
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

function v6ModifyVarSyntax(routine) {

  const specialOperation = 'push, unshift, remove, insert';
  const infixOperation = 'concat, in, includes';

  const identifier = '(?:[a-zA-Z0-9_-]|\\\\u[0-9a-fA-F]{4})+';
  const string     = `'(?:(?:[ !#-&(-[\\]-~]|\\\\u[0-9a-fA-F]{4})*)'`;
  const number     = '(?:-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?)';
  const variable   = `(?:\\$\\{[^}]+\\})`;
  const parameter  = `(null|true|false|\\[\\]|\\{\\}|${number}|${variable}|${string})`;

  const left       = `var (\\$?${identifier}(?:\\.\\$?${identifier})?)`;
  const operation  = '(?:[a-zA-Z0-9]+)';

  const regex      = `^${left} += +(?:${parameter}|(?:${parameter} +)?(🧮)?(${operation})(?: +${parameter})?(?: +${parameter})?(?: +${parameter})?)( *|(?: +//.*))?`;

  if(!Array.isArray(routine))
    return;

  for(const [i,a] of Object.entries(routine)) {
    if (typeof a != 'string')
      continue;

    const match = a.match(new RegExp(regex + '\x24'));

    if(match) {

      if(!match[5])
        continue;

      const normal = specialOperation.indexOf(match[5]) == -1;
      const infix = infixOperation.indexOf(match[5]) != -1;
      
      let first, second, third;
      [first,second,third] = match[3] !== undefined ? [match[3],match[6],match[7]] : [match[6],match[7],match[8]];

      if (infix) 
        continue;
      else if(normal) {
        if (third !== undefined)
          routine[i] = `var ${match[1]} = ${match[5]}(${first}, ${second}, ${third})`
        else if(second !== undefined)
          routine[i] = `var ${match[1]} = ${match[5]}(${first}, ${second})`
        else
          routine[i] = `var ${match[1]} = ${match[5]}(${first})`
      } else {
        if (second !== undefined)
          routine[i] = `${match[5]}(${match[1]}, ${first}, ${second})`
        else
          routine[i] = `${match[5]}(${match[1]}, ${first})`
      }
    }
  }
}
