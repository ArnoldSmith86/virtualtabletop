export const VERSION = 3;

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
    updateProperties(properties.faces);
  if(properties.type == 'deck')
    updateProperties(properties.cardDefaults);
  if(properties.type == 'deck' && typeof properties.cardTypes == 'object')
    for(const cardType in properties.cardTypes)
      updateProperties(properties.cardTypes[cardType]);

  for(const property in properties)
    if(property.match(/Routine$/))
      updateRoutine(properties[property], v);
}

function updateRoutine(routine, v) {
  if(!Array.isArray(routine))
    return;

  for(const operation of routine) {
    if(operation.func == 'IF') {
      updateRoutine(operation.thenRoutine);
      updateRoutine(operation.elseRoutine);
    }
  }

  v<2 && v2UpdateSelectDefault(routine);
  v<3 && v3RemoveComputeAndApplyVariables(routine);
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

function v3RemoveComputeAndApplyVariables(routine) {
  function dissolveApplyVariables(obj) {
    if(Array.isArray(obj.applyVariables)) {
      for(const v of obj.applyVariables) {
        if(obj.func == 'COMPUTE' && !v.variable && v.template)
          throw Error('Cannot migrate COMPUTE with template to v3.');
        if(v.parameter && v.variable)
          obj[v.parameter] = `\${${v.variable}}`;
        else if(v.parameter && v.template)
          obj[v.parameter] = v.template.replace(/\{/g, '${');
        else if(v.parameter && v.property && v.widget)
          obj[v.parameter] = `\${PROPERTY ${v.property} OF ${v.widget}}`;
        else if(v.parameter && v.property)
          obj[v.parameter] = `\${PROPERTY ${v.property}}`;
      }
    }
    delete obj.applyVariables;
  }

  for(const [ i, op ] of Object.entries(routine)) {
    dissolveApplyVariables(op);
    delete routine[i].applyVariables;

    if(op.func == 'CLONE' && op.properties)
      dissolveApplyVariables(routine[i].properties);

    if(op.func == 'COMPUTE') {
      const getOp = function(o) {
        if(op[o] === undefined)
          return 1;
        if(typeof op[o] === 'object' && op[o] !== null)
          throw Error("Objects are not supported");
        if(typeof op[o] === 'string' && op[o].match(/^\$\{[^}]+\}$/))
          return op[o];
        if(typeof op[o] === 'string')
          return `'${op[o]}'`;
        return String(op[o]);
      };

      routine[i] = `var ${op.variable || 'COMPUTE'} = ${getOp('operand1')} ${op.operation || '+'}`;
      if('!,abs,cbrt,ceil,cos,exp,floor,log,log10,log2,round,sign,sin,sqrt,tan,trunc,length,toLocaleLowerCase,toLocaleUpperCase,toLowerCase,toUpperCase,trim,trimEnd,trimStart,from,isArray,join,length,pop,reverse,shift,sort,parseFloat,push,unshift'.split(',').indexOf(op.operation) == -1)
        routine[i] += ` ${getOp('operand2')}`;
      if([ 'slice', 'randRange', 'substr', 'replace', 'replaceAll' ].indexOf(op.operation) != -1)
        routine[i] += ` ${getOp('operand3')}`;
      if(op.note)
        routine[i] += ` // ${op.note}`;

      if(op.skip) {
        routine[i] = {
          func: 'IF',
          condition: op.skip,
          elseRoutine: [ routine[i] ]
        };
      }
    }

    if(op.func == 'INPUT' && Array.isArray(op.fields)) {
      for(const field of routine[i].fields)
        dissolveApplyVariables(field);
    }
  }
}
