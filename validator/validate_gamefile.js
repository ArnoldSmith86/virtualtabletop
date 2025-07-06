const validators = {
    asset: v=>!!String(v).match(/^\/assets\/-?[0-9]+_[0-9]+$|^\/i\/|^http/) || 'asset expected (format: /assets/1_1, /i/icon.png or http://example.com/image.png)',
    routineProperty: v=>!!String(v).match(/.Routine$/) || 'routine name expected (format: myRoutine)',
    idArray: (v,p)=>asArray(v).every(id=>p.widgets[id] || id.includes('$')) || `widgets ${asArray(v).filter(id=>!p.widgets[id] && !id.includes('$')).join(', ')} not found`,
    id: (v,p)=>p.widgets[v] || v.includes('$') || `widget '${v}' not found`,
    number: v=>typeof v === 'number' || 'number expected',
    object: v=>typeof v === 'object' && v !== null || 'object expected',
    boolean: v=>typeof v === 'boolean' || 'boolean expected',
    string: v=>typeof v === 'string' || 'string expected',
    inCollection: (v,p,propertyPath)=>{
        const problems = [];
        if(p.validCollections[v])
            return true;
        if(typeof v === 'string' && p.widgets[v])
            return `Collection '${v}' not found but it is a widget ID. Did you mean ['${v}'] as an anonymous collection?`;
        if(typeof v === 'string')
            return `Collection '${v}' is undefined.`;
        if(Array.isArray(v)) {
            for(const [key, id] of v.entries()) {
                if(!id.includes('$') && !p.widgets[id]) {
                    problems.push({
                        widget: p.widgetId,
                        property: [...propertyPath, key],
                        message: `Widget "${id}" not found`
                    });
                }
            }
        }
        if(Array.isArray(v) && v.length === 1 && p.validCollections[v[0]])
            return `Widget '${v[0]}' does not exist but it is a valid collection. Did you mean '${v[0]}' (without brackets)?`;
        return problems;
    },
    routine: (v,p,propertyPath=[])=>{
        const context = Object.assign({}, p, { validVariables: p.validVariables || {...SUPER_GLOBALS.variables}, validCollections: p.validCollections || {...SUPER_GLOBALS.collections} });
        return validateRoutine(v,context,propertyPath);
    },
    positiveNumber: v=>typeof v === 'number' && v >= 0 || 'positive number expected',
    property: (v,p)=>Object.values(WIDGET_PROPERTIES).some(props=>Object.keys(props).includes(v)) || Object.values(p.widgets).some(w=>w[v] !== undefined) || p.customProperties.includes(v) || `property '${v}' not found`,
    vttSymbol: v=>v === null || typeof v === 'string', // TODO: replace with actual VTT symbol name check if available
    countOrAll: v=>v === 'all' || typeof v === 'number' || 'number or "all" expected',
    any: v=>true
}

// Common properties for all widgets
const COMMON_PROPERTIES = {
    id: 'string',
    type: 'string',
    display: 'boolean',
    x: 'number',
    y: 'number',
    z: 'number',
    width: 'number',
    height: 'number',
    layer: 'number',
    borderRadius: 'any',
    rotation: 'number',
    scale: 'number',
    dragLimit: 'any',
    classes: 'string',
    css: 'any',
    movable: 'boolean',
    movableInEdit: 'boolean',
    clickable: 'boolean',
    clickSound: 'any',
    grid: 'any',
    enlarge: 'any',
    overlap: 'any',
    ignoreOnLeave: 'any',
    parent: 'id',
    fixedParent: 'boolean',
    inheritFrom: 'any',
    owner: v=>typeof v === 'string' || Array.isArray(v) || 'string or array of strings expected',
    dragging: 'string',
    dropOffsetX: 'number',
    dropOffsetY: 'number',
    dropShadowOwner: 'string',
    dropShadowWidget: 'id',
    dropTarget: 'any',
    dropLimit: 'number',
    inheritChildZ: 'boolean',
    hoverTarget: 'id',
    hoverParent: 'id',
    hidePlayerCursors: 'boolean',
    linkedToSeat: 'idArray',
    onlyVisibleForSeat: 'idArray',
    hoverInheritVisibleForSeat: 'boolean',
    clickRoutine: 'routine',
    changeRoutine: 'routine',
    enterRoutine: getRoutineValidator({}, {'child': 1}),
    leaveRoutine: getRoutineValidator({}, {'child': 1}),
    globalUpdateRoutine: 'routine',
    gameStartRoutine: 'routine',
    hotkey: 'string',
    animatePropertyChange: 'any',
    resetProperties: 'object',
    clonedFrom: 'string',
    editorGroup: 'boolean'
};

const WIDGET_PROPERTIES = {
    BasicWidget: {
        ...COMMON_PROPERTIES,
        faces: 'any', faceCycle: 'any', activeFace: 'any', image: 'any', color: 'any', svgReplaces: 'any', text: 'any', html: 'any'
    },
    Canvas: {
        ...COMMON_PROPERTIES,
        artist: 'any', resolution: 'any', activeColor: 'any', colorMap: 'any'
    },
    Card: {
        ...COMMON_PROPERTIES,
        faceCycle: 'any', activeFace: 'any', deck: 'any', cardType: 'string', onPileCreation: 'object'
    },
    Dice: {
        ...COMMON_PROPERTIES,
        classes: 'any', clickable: 'boolean', movable: 'boolean', layer: 'any', borderRadius: 'any', color: 'any', pipColor: 'any', borderColor: 'any', faces: v=>Array.isArray(v) || typeof v === 'string' || 'faces must be an array or string', activeFace: 'any', rollCount: 'any', rollTime: 'any', swapTime: 'any', image: 'any', imageScale: 'any', text: 'any', pips: 'any', svgReplaces: 'any', faceCSS: 'any', pipSymbols: 'any', shape3d: 'any'
    },
    Holder: {
        ...COMMON_PROPERTIES,
        movable: 'boolean', layer: 'number', dropTarget: 'any', dropOffsetX: 'number', dropOffsetY: 'number', dropShadow: 'any', alignChildren: 'any', preventPiles: 'any', childrenPerOwner: 'any', showInactiveFaceToSeat: 'any', onEnter: 'object', onLeave: 'object', stackOffsetX: 'number', stackOffsetY: 'number', borderRadius: 'any'
    },
    Label: {
        ...COMMON_PROPERTIES,
        height: 'number', movable: 'boolean', layer: 'any', clickable: 'boolean', spellCheck: 'any', tabIndex: 'any', placeholderText: 'any', text: 'any', editable: 'any', twoRowBottomAlign: 'any'
    },
    Pile: {
        ...COMMON_PROPERTIES,
        typeClasses: 'any', x: 'number', y: 'number', alignChildren: 'any', inheritChildZ: 'any', text: 'any', pileSnapRange: 'any', handleCSS: 'any', handleSize: 'any', handleOffset: 'any', handlePosition: 'string'
    },
    Scoreboard: {
        ...COMMON_PROPERTIES,
        movable: 'boolean', layer: 'any', playersInColumns: 'any', rounds: 'any', roundLabel: 'any', totalsLabel: 'any', scoreProperty: 'any', firstColWidth: 'any', verticalHeader: 'any', seats: 'any', showAllRounds: 'any', showAllSeats: 'any', showPlayerColors: 'any', showTotals: 'any', sortField: 'any', sortAscending: 'any', currentRound: 'any', autosizeColumns: 'any', borderRadius: 'any', editPaneTitle: 'any'
    },
    Seat: {
        ...COMMON_PROPERTIES,
        typeClasses: 'any', movable: 'boolean', index: 'any', turn: 'any', skipTurn: 'any', player: 'any', display: 'any', displayEmpty: 'any', hideTurn: 'any', hideWhenUnused: 'any', hand: 'id', color: 'any', colorEmpty: 'any', layer: 'any', borderRadius: 'any'
    },
    Spinner: {
        ...COMMON_PROPERTIES,
        options: 'any', value: 'any', angle: 'any', backgroundCSS: 'any', spinnerCSS: 'any', valueCSS: 'any', textColor: 'any', lineColor: 'any', borderRadius: 'any'
    },
    Timer: {
        ...COMMON_PROPERTIES,
        layer: 'any', movable: 'boolean', milliseconds: 'any', precision: 'any', paused: 'any', alert: 'any', countdown: 'any', start: 'any', end: 'any'
    },
    Button: {
        ...COMMON_PROPERTIES,
        layer: 'any', movable: 'boolean', image: 'any', color: 'any', svgReplaces: 'any', backgroundColor: 'any', borderColor: 'any', textColor: 'any', backgroundColorOH: 'any', borderColorOH: 'any', textColorOH: 'any', text: 'any', borderRadius: 'any'
    },
    Deck: {
        ...COMMON_PROPERTIES,
        clickable: 'boolean', cardDefaults: 'any', cardTypes: 'any', borderRadius: 'any',
        faceTemplates: (v,p,propertyPath=[])=>{
            const problems = [];
            if(!Array.isArray(v))
                return 'faceTemplates must be an array of face definitions, each containing an array of objects';
            for(const [faceIndex, face] of v.entries()) {
                if(typeof face !== 'object' || face === null) {
                    problems.push({
                        widget: p.widgetId,
                        property: [...propertyPath, faceIndex],
                        message: 'must be an object'
                    });
                    continue;
                }
                
                // Check for $ in face-level properties
                for(const [key, value] of Object.entries(face)) {
                    problems.push(...checkForDollarSign(value, p, [...propertyPath, faceIndex, key]));
                }
                
                // Check for unused face-level properties
                const validFaceProps = ['css', 'classes', 'border', 'radius', 'objects', 'type', 'properties'];
                for(const prop of Object.keys(face)) {
                    if(!validFaceProps.includes(prop)) {
                        problems.push({
                            widget: p.widgetId,
                            property: [...propertyPath, faceIndex, prop],
                            message: `invalid property. Valid face properties: ${validFaceProps.join(', ')}`
                        });
                    }
                }
                
                // Check objects array if present
                if(Array.isArray(face.objects)) {
                    for(const [objIndex, obj] of face.objects.entries()) {
                        if(typeof obj !== 'object' || obj === null) {
                            problems.push({
                                widget: p.widgetId,
                                property: [...propertyPath, faceIndex, 'objects', objIndex],
                                message: 'must be an object'
                            });
                            continue;
                        }
                        
                        // Check for $ in object properties
                        for(const [key, value] of Object.entries(obj)) {
                            problems.push(...checkForDollarSign(value, p, [...propertyPath, faceIndex, 'objects', objIndex, key]));
                        }
                        
                        // Check for properties defined both directly and through dynamicProperties
                        if(obj.dynamicProperties && typeof obj.dynamicProperties === 'object') {
                            const directProps = Object.keys(obj);
                            const dynamicProps = Object.keys(obj.dynamicProperties);
                            const conflictingProps = dynamicProps.filter(prop => directProps.includes(prop));
                            if(conflictingProps.length > 0) {
                                problems.push({
                                    widget: p.widgetId,
                                    property: [...propertyPath, faceIndex, 'objects', objIndex],
                                    message: `has properties defined both directly and through dynamicProperties: ${conflictingProps.join(', ')}. The static value will be used instead of the dynamic one.`
                                });
                            }
                        }
                        
                        const validObjProps = ['type', 'x', 'y', 'width', 'height', 'fontSize', 'textAlign', 'rotation', 'display', 'classes', 'css', 'dynamicProperties', 'svgReplaces', 'value', 'color', 'note'];
                        for(const prop of Object.keys(obj)) {
                            if(!validObjProps.includes(prop)) {
                                problems.push({
                                    widget: p.widgetId,
                                    property: [...propertyPath, faceIndex, 'objects', objIndex, prop],
                                    message: `invalid property. Valid object properties: ${validObjProps.join(', ')}`
                                });
                            }
                        }
                    }
                }
            }
            return problems;
        }
    }
};

const SUPER_GLOBALS = {
    variables: { activeColors: 1, mouseCoords: 1, seatIndex: 1, seatID: 1, activeSeats: 1, playerName: 1, playerColor: 1, activePlayers: 1, thisID: 1},
    collections: { playerSeats: 1, activeSeats: 1, thisButton: 1 }
};

// Map lowercase type to canonical type name
const TYPE_MAP = {};
for (const type of Object.keys(WIDGET_PROPERTIES)) {
    TYPE_MAP[type.toLowerCase()] = type;
}

const ALLOWED_LANGUAGES = [
    'cy-GB', 'de-DE', 'el-GR', 'en-GB', 'en-US', 'es', 'es-ES', 'fr-FR',
    'he-IL', 'it-IT', 'pt-BR', 'uk-UA', 'zh-CN', ''
];

function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined) return [];
    return [value];
}

function unescape(str) {
    if(typeof str != 'string')
      return str;
    return str.replace(/\\u([0-9a-fA-F]{4})/g, function(m, c) {
      return String.fromCharCode(parseInt(c, 16));
    });
}

function getWidgetType(widget) {
    const t = widget.type;
    if (!t) {
        return "BasicWidget";
    }
    return TYPE_MAP[t.toLowerCase()] || "BasicWidget";
}

function parseStringOperation(a) {
    const identifier = '(?:[a-zA-Z0-9_-]|\\\\u[0-9a-fA-F]{4})+';
    const string     = `'((?:[ !#-&(-[\\]-~]|\\\\u[0-9a-fA-F]{4})*)'`;
    const number     = '(-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?)';
    const variable   = `(\\$\\{[^}]+\\})`;
    const parameter  = `(null|true|false|\\[\\]|\\{\\}|${number}|${variable}|${string})`;

    const left       = `var (\\$)?(${identifier})(?:\\.(\\$)?(${identifier}))?`;
    const operation  = `${identifier}|[=+*/%<!>&|-]{1,3}`;

    const regex      = `^${left} += +(?:${parameter}|(?:${parameter} +)?(🧮)?(${operation})(?: +${parameter})?(?: +${parameter})?(?: +${parameter})?)(?: *|(?: +//.*))?`;

    const match = a.match(new RegExp(regex + '\x24')); // the minifier doesn't like a "$" here

    if(match)
        return match;

    const withoutVars = a.replace(new RegExp(variable, 'g'), '').replace(/false|null/g, 0).replace(/true/g, 1);
    const mathExpression = withoutVars.match(new RegExp(`^${left} += +([() 0-9.&|!*/+-]+)(?: +//.*)?`+'\x24'));
    return mathExpression;
}

function parsePropertySyntax(string) {
    const identifierWithSpace = '(?:[a-zA-Z0-9 _-]|\\\\u[0-9a-fA-F]{4})+';
    const property            = `PROPERTY (\\$)?(${identifierWithSpace}?)(?: OF (\\$)?(${identifierWithSpace}))?`;
    const match               = string.match(new RegExp(`^\\$\\{(?:${property})\\}` + '\x24'));

    return match;
}

function validateRoutine(routine, context, propertyPath = []) {
    const problems = [];

    if (!Array.isArray(routine)) {
        problems.push({
            widget: context.widgetId,
            property: propertyPath,
            message: 'routine must be an array'
        });
        return problems;
    }
    
    for (let i = 0; i < routine.length; i++) {
        const operation = routine[i];

        if(typeof operation === 'object' && operation !== null && Object.keys(operation).length === 1 && ['Note', 'note', 'Comment', 'comment'].includes(Object.keys(operation)[0])) {
            continue;
        }

        context.operation = operation;
        const operationPath = [...propertyPath, i];
        
        if (typeof operation === 'string') {
            if(operation.startsWith('//'))
                continue;

            const match = parseStringOperation(operation);
            if(match) {
                if(match[1] === undefined)
                    context.validVariables[unescape(match[2])] = 1;
            } else {
                problems.push({
                    widget: context.widgetId,
                    property: operationPath,
                    message: `not a valid string operation: ${operation}`
                });
            }
            continue;
        }
        
        if (typeof operation !== 'object' || operation === null) {
            problems.push({
                widget: context.widgetId,
                property: operationPath,
                message: 'routine operations must be an object or string'
            });
            continue;
        }
        
        if (!operation.func) {
            problems.push({
                widget: context.widgetId,
                property: operationPath,
                message: 'missing func property'
            });
            continue;
        }
        
        // Validate operation properties based on func type
        const func = operation.func;
        const knownProps = operationProps[func];

        if(!knownProps) {
            problems.push({
                widget: context.widgetId,
                property: operationPath,
                message: `${func} is not a valid function (valid functions: ${Object.keys(operationProps).join(', ')})`
            });
            continue;
        }
        
        for (const prop of Object.keys(operation)) {
            if (['Note', 'note', 'Comment', 'comment', 'func'].includes(prop)) continue;
            
            const propPath = [...operationPath, prop];
            
            // Handle both Set and object-based property definitions
            const isKnown = knownProps instanceof Set ? knownProps.has(prop) : knownProps[prop] !== undefined;
            let propMatch, varMatch;
            
            if (!isKnown) {
                problems.push({
                    widget: context.widgetId,
                    property: propPath,
                    message: `${func} has unknown property '${prop}' (valid properties: ${Object.keys(knownProps).join(', ')})`
                });
            } else if (knownProps instanceof Set) {
                // No validation for Set-based properties
                continue;
            } else if (propMatch = parsePropertySyntax(String(operation[prop]))) {
                if(propMatch[1] && !context.validVariables[propMatch[2]])
                    problems.push({
                        widget: context.widgetId,
                        property: propPath,
                        message: `${func} uses undefined variable '${propMatch[2]}'`
                    });
                else if(propMatch[3] && !context.validVariables[propMatch[4]])
                    problems.push({
                        widget: context.widgetId,
                        property: propPath,
                        message: `${func} uses undefined variable '${propMatch[4]}'`
                    });
                else if(!propMatch[3] && propMatch[4] && !context.widgets[propMatch[4]])
                    problems.push({
                        widget: context.widgetId,
                        property: propPath,
                        message: `${func} uses invalid widget '${propMatch[4]}'`
                    });
                else
                    continue;
            } else if (varMatch = String(operation[prop]).match(/^\$\{([^.}]+)(?:\.[^.}]+)?\}$/)) {
                if(context.validVariables[varMatch[1]])
                    continue;
                problems.push({
                    widget: context.widgetId,
                    property: propPath,
                    message: `${func} uses undefined variable '${varMatch[1]}'`
                });
                continue;
            } else if(typeof operation[prop] === 'string' && operation[prop].match(/\$\{([^.}]+)(?:\.[^.}]+)?\}/)) {
                continue;
            } else {
                const validator = validators[knownProps[prop]] || knownProps[prop];
                if (validator) {
                    const result = validator(operation[prop], context, propPath);
                    if (Array.isArray(result)) {
                        // Validator returned an array of problems
                        problems.push(...result);
                    } else if (typeof result === 'string') {
                        problems.push({
                            widget: context.widgetId,
                            property: propPath,
                            message: result
                        });
                    } else if (!result) {
                        problems.push({
                            widget: context.widgetId,
                            property: propPath,
                            message: `Property is invalid ${JSON.stringify(result)}`
                        });
                    }
                }
            }
        }

        // variable tracking
        if(func === 'CALL' && operation.routine && (!Array.isArray(context.recursionCheck) || !context.recursionCheck.includes(operation.routine))) {
            const recursionCheck = JSON.parse(JSON.stringify(context.recursionCheck || []));
            recursionCheck.push(operation.routine);
            context.calledCustomRoutines.push(operation.routine);
            const newContext = Object.assign({}, JSON.parse(JSON.stringify(context)), {recursionCheck, calledCustomRoutines: context.calledCustomRoutines});
            if(typeof operation.arguments === 'object' && operation.arguments !== null)
                for(const key of Object.keys(operation.arguments))
                    if(typeof operation.arguments[key] === 'string')
                        newContext.validVariables[operation.arguments[key]] = 1;
            for(const widget of Object.values(context.widgets))
                if(Array.isArray(widget[operation.routine]))
                    validateRoutine(widget[operation.routine], Object.assign(newContext, {widgetId: widget.id}), [operation.routine]);
            context.validVariables[operation.variable || 'result'] = 1;
        }
        if(func === 'COUNT')
            context.validVariables[operation.variable || 'COUNT'] = 1;
        if(func === 'GET')
            context.validVariables[operation.variable || operation.property || 'id'] = 1;
        if(func === 'INPUT' && Array.isArray(operation.fields)) {
            for(const field of operation.fields) {
                if(typeof field.variable === 'string')
                    context.validVariables[field.variable] = 1;
                if(field.type === 'choose')
                    context.validCollections[field.collection || 'DEFAULT'] = 1;
            }
        }
        if(func === 'SELECT')
            context.validCollections[operation.collection || 'DEFAULT'] = 1;
        if(func === 'VAR' && typeof operation.variables === 'object' && operation.variables !== null)
            for(const key of Object.keys(operation.variables))
                context.validVariables[key] = 1;
    }
    
    return problems;
}

function getEnumValidator(values) {
    return v=>values.includes(v) || `'${v}' is not in the allowed list of values: ${values.join(', ')}`;
}

function getRoutineValidator(variables, collections, isolateContext = true) {
    return (v, context, propertyPath = []) => {
        if(isolateContext) {
            context.validVariables = JSON.parse(JSON.stringify(context.validVariables || {}));
            context.validCollections = JSON.parse(JSON.stringify(context.validCollections || {}));
        }
        context.validVariables = Object.assign(context.validVariables || {}, SUPER_GLOBALS.variables, variables);
        context.validCollections = Object.assign(context.validCollections || {}, SUPER_GLOBALS.collections, collections);
        const problems = validateRoutine(v, context, propertyPath);
        if(problems.length > 0)
            return problems;
        return true;
    }
}

function getWidgetTypeValidator(types, canBeArray = false) {
    return (v, context) => {
        if(!canBeArray && Array.isArray(v))
            return 'should not be an array';
        for(const id of asArray(v)) {
            if(!context.widgets[id])
                return `'${id}' is not a widget`;
            if(!types.includes(context.widgets[id].type))
                return `'${id}' is not a valid widget type (found ${context.widgets[id].type} - valid types: ${types.join(', ')})`;
        }
        return true;
    }
}

function checkForDollarSign(value, context, propertyPath = []) {
    const problems = [];
    if (typeof value === 'string' && value.includes('$')) {
        problems.push({
            widget: context.widgetId,
            property: propertyPath,
            message: `contains '$' - use dynamicProperties to map widget property names to face object properties instead`
        });
    }
    if (typeof value === 'object' && value !== null) {
        for (const [key, val] of Object.entries(value)) {
            problems.push(...checkForDollarSign(val, context, [...propertyPath, key]));
        }
    }
    return problems;
}

const operationProps = {
    'AUDIO': {
        'source':    'asset',
        'maxVolume': v => typeof v === 'number' && v >= 0 && v <= 1,
        'length':    v => v === null || (typeof v === 'number' && v >= 0),
        'player':    v => v === null || typeof v === 'string' || (Array.isArray(v) && v.every(x => typeof x === 'string')),
        'count':     v => v === 'loop' || (typeof v === 'number' && v >= 0),
        'silence':   'boolean'
    },
    'CALL': { 
        'routine':   'routineProperty', 
        'widget':    'idArray', 
        'variable':  'string',
        'return':    'boolean',
        'arguments': 'object'
    },
    'CANVAS': { 
        'canvas':     'idArray', 
        'collection': 'inCollection', 
        'color':      v=>typeof v === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(v) || 'color expected (format: #RGB, #RGBA, #RRGGBB or #RRGGBBAA)',
        'mode':       getEnumValidator(['set', 'inc', 'dec', 'change', 'reset', 'setPixel']),
        'value':      'positiveNumber',
        'x':          'positiveNumber',
        'y':          'positiveNumber'
    },
    'CLICK': { 
        'collection': 'inCollection', 
        'count':      'positiveNumber',
        'mode':       getEnumValidator(['respect', 'ignoreClickable', 'ignoreClickRoutine', 'ignoreAll'])
    },
    'CLONE': { 
        'source':     'inCollection', 
        'count':      'positiveNumber',
        'xOffset':    'number',
        'yOffset':    'number',
        'properties': 'object',
        'recursive':  'boolean',
        'collection': 'string'
    },
    'COUNT': { 
        'collection': 'inCollection', 
        'holder':     'idArray',
        'owner':      'string',
        'variable':   'string'
    },
    'DELETE': { 
        'collection': 'inCollection'
    },
    'FLIP': { 
        'holder':     'idArray', 
        'collection': 'inCollection', 
        'count':      'countOrAll',
        'face':       'number',
        'faceCycle':  getEnumValidator(['forward', 'backward', 'random'])
    },
    'FOREACH': {
        'collection': 'inCollection',
        'in': v=>typeof v === 'string' || Array.isArray(v) || (typeof v === 'object' && v !== null),
        'range': v=>Array.isArray(v) ? (v.length >= 1 && v.length <= 3 && v.every(x=>typeof x === 'number' || typeof x === 'string')) : (typeof v === 'number' || typeof v === 'string'),
        'loopRoutine': (v, context, propertyPath) => {
            let variables = {};
            let collections = {};
            if(context.operation.in)
                variables = {value: 1, key: 1};
            else if(context.operation.range)
                variables = {value: 1};
            else {
                variables = {widgetID: 1};
                collections = {DEFAULT: 1};
            }
            return getRoutineValidator(variables, collections, false)(v, context, propertyPath);
        }
    },
    'GET': {
        'collection':  'inCollection',
        'property':    'property',
        'variable':    'string',
        'aggregation': getEnumValidator(['first', 'last', 'sum', 'average', 'median', 'min', 'max', 'array']),
        'skipMissing': 'boolean'
    },
    'IF': {
        'condition':   'any',
        'relation':    getEnumValidator(['<','<=','==','!=','>=','>']),
        'operand1':    'any',
        'operand2':    'any',
        'thenRoutine': getRoutineValidator({}, {}, false),
        'elseRoutine': getRoutineValidator({}, {}, false)
    },
    'INPUT': {
        'cancelButtonIcon': 'vttSymbol',
        'cancelButtonText': v=>v === null || typeof v === 'string',
        'confirmButtonIcon': 'vttSymbol',
        'confirmButtonText': v=>v === null || typeof v === 'string',
        'header': v=>typeof v === 'string',
        'fields': v=>Array.isArray(v) || 'fields must be an array'
    },
    'LABEL': {
        'label': 'idArray',
        'collection': 'inCollection',
        'mode': getEnumValidator(['set','inc','dec','append']),
        'value': v=>typeof v === 'string' || typeof v === 'number' || v === undefined
    },
    'MOVE': {
        'from': getWidgetTypeValidator(['holder', 'seat'], true),
        'collection': 'inCollection',
        'to': getWidgetTypeValidator(['holder', 'seat'], true),
        'count': 'countOrAll',
        'fillTo': 'number',
        'face': 'positiveNumber'
    },
    'MOVEXY': {
        'from': 'idArray',
        'count': 'countOrAll',
        'x': 'number',
        'y': 'number',
        'resetOwner': 'boolean',
        'z': 'number',
        'face': 'positiveNumber',
        'snapToGrid': 'boolean'
    },
    'RECALL': {
        'excludeCollection': 'inCollection',
        'holder': 'idArray',
        'inHolder': 'boolean',
        'owned': 'boolean',
        'byDistance': 'boolean'
    },
    'RESET': {
        'property': 'string'
    },
    'ROTATE': {
        'holder': 'idArray',
        'collection': 'inCollection',
        'angle': 'number',
        'count': 'countOrAll',
        'mode': getEnumValidator(['set','add']),
    },
    'SCORE': {
        'mode': getEnumValidator(['set','inc','dec']),
        'property': 'string',
        'seats': 'idArray',
        'round': v=>v === null || (typeof v === 'number' && Number.isInteger(v)),
        'value': v=>v === null || typeof v === 'number'
    },
    'SELECT': {
        'source': v=>v === 'all' || typeof v === 'string',
        'type': 'string',
        'property': 'string',
        'relation': getEnumValidator(['<','<=','==','===','!=','>=','>','in']),
        'value': 'any',
        'max': 'number',
        'collection': 'string',
        'mode': getEnumValidator(['set','add','remove','intersect']),
        'sortBy': 'any',
        'random': 'boolean'
    },
    'SET': {
        'collection': 'inCollection',
        'property': 'string',
        'relation': 'string',
        'value': 'any'
    },
    'SHUFFLE': {
        'holder': 'idArray',
        'collection': 'inCollection',
        'mode': getEnumValidator(['overhand','reverse','riffle','seeded','true random']),
        'modeValue': 'number'
    },
    'SORT': {
        'holder': 'idArray',
        'collection': 'inCollection',
        'key': 'any',
        'reverse': 'boolean',
        'locales': 'any',
        'options': 'any',
        'rearrange': 'boolean'
    },
    'SWAPHANDS': {
        'interval': v=>typeof v === 'number' && Number.isInteger(v),
        'direction': getEnumValidator(['forward','backward','random']),
        'source': 'inCollection'
    },
    'TIMER': {
        'timer': 'idArray',
        'collection': 'inCollection',
        'mode': getEnumValidator(['set','inc','dec','pause','start','toggle','reset']),
        'value': v=>typeof v === 'number' || typeof v === 'string',
        'seconds': 'number'
    },
    'TURN': {
        'turn': v=>typeof v === 'number' || v === 'first' || v === 'last',
        'turnCycle': getEnumValidator(['forward','backward','random','position','seat']),
        'source': 'inCollection',
        'collection': 'string'
    },
    'VAR': {
        'variables': 'object'
    }
};

function customWidgetChecks(widget, widgets, problems) {
    if(widget.type === 'deck') {
        for(const prop of ['width', 'height', 'movable', 'layer', 'clickable']) {
            if(widget[prop] !== undefined) {
                problems.push({
                    widget: widget.id,
                    property: [prop],
                    message: `Deck uses its '${prop}' property - you probably want to use 'cardDefaults.${prop}' instead`
                });
            }
        }
        if(widget.cardTypes === undefined) {
            problems.push({
                widget: widget.id,
                property: ['cardTypes'],
                message: 'Deck has no cardTypes'
            });
        } else if(typeof widget.cardTypes === 'object' && widget.cardTypes !== null) {
            for(const cardType of Object.keys(widget.cardTypes)) {
                if(typeof widget.cardTypes[cardType] !== 'object' || widget.cardTypes[cardType] === null) {
                    problems.push({
                        widget: widget.id,
                        property: ['cardTypes', cardType],
                        message: `cardType must be an object`
                    });
                } else if(!Object.values(widgets).some(w=>w.cardType === cardType)) {
                    problems.push({
                        widget: widget.id,
                        property: ['cardTypes', cardType],
                        message: `Deck has unused cardType '${cardType}' - add card widgets with this cardType`
                    });
                }
            }
        }
        if(widget.faceTemplates === undefined) {
            problems.push({
                widget: widget.id,
                property: ['faceTemplates'],
                message: 'Deck has no faceTemplates - cards will be blank and transparent'
            });
        }
    }

    if(widget.type === 'pile') {
        if(!Object.values(widgets).some(w=>w.parent === widget.id)) {
            problems.push({
                widget: widget.id,
                property: ['parent'],
                message: 'Pile has no children - a pile is meant to be a handle for a set of cards or other children (did you mean to use a holder?)'
            });
        }
    }
}

function getCustomPropertyUsage(data) {
    const customProperties = new Set();
    
    // Helper function to extract property names from ${PROPERTY xxx} syntax
    function extractPropertyFromSyntax(value) {
        if (typeof value === 'string') {
            const regex = /\$\{(PROPERTY )([^ }]+)/g;
            let match;
            while ((match = regex.exec(value)) !== null) {
                if (match && match[2]) {
                    customProperties.add(match[2]);
                }
            }
        }
    }
    
    // Helper function to recursively scan objects for property usage
    function scanForProperties(obj) {
        if (typeof obj === 'string') {
            return extractPropertyFromSyntax(obj);
        }   
        if (typeof obj !== 'object' || obj === null) {
            return;
        }
        
        if (Array.isArray(obj)) {
            obj.forEach((item, index) => {
                scanForProperties(item);
            });
            return;
        }
        
        for (const [key, value] of Object.entries(obj)) {
            // Check for ${PROPERTY xxx} syntax
            extractPropertyFromSyntax(value);
            
            // Check for dropTarget objects - extract property names used as keys
            if (key === 'dropTarget') {
                if (typeof value === 'object' && value !== null) {
                    if (Array.isArray(value)) {
                        // Handle array of dropTarget objects
                        for (const dropTargetObj of value) {
                            if (typeof dropTargetObj === 'object' && dropTargetObj !== null) {
                                for (const dropTargetKey of Object.keys(dropTargetObj)) {
                                    customProperties.add(dropTargetKey);
                                }
                            }
                        }
                    } else {
                        // Handle single dropTarget object
                        for (const dropTargetKey of Object.keys(value)) {
                            customProperties.add(dropTargetKey);
                        }
                    }
                }
            }
            
            // Check for dynamicProperties
            if (key === 'dynamicProperties' && typeof value === 'object' && value !== null) {
                for (const propName of Object.keys(value)) {
                    customProperties.add(propName);
                }
            }
            
            // Check for svgReplaces
            if (key === 'svgReplaces' && typeof value === 'object' && value !== null) {
                for (const propName of Object.values(value)) {
                    customProperties.add(propName);
                }
            }
            
            if (key === 'faceTemplates' && Array.isArray(value)) {
                for (const faceTemplate of value) {
                    if (typeof faceTemplate === 'object' && faceTemplate !== null && typeof faceTemplate.objects === 'object' && faceTemplate.objects !== null) {
                        for (const o of Object.values(faceTemplate.objects)) {
                            if (typeof o === 'object' && o !== null && typeof o.dynamicProperties === 'object' && o.dynamicProperties !== null) {
                                for (const propName of Object.values(o.dynamicProperties)) {
                                    customProperties.add(propName);
                                }
                            }
                        }
                    }
                }
            }
            
            // Check for specific operation types that use properties
            if (obj.func) {
                const func = obj.func;
                if (func === 'CALL' && key === 'routine' && typeof value === 'string') {
                    customProperties.add(value);
                } else if (func === 'GET' && key === 'property' && typeof value === 'string') {
                    customProperties.add(value);
                } else if (func === 'RESET' && key === 'property' && typeof value === 'string') {
                    customProperties.add(value);
                } else if (func === 'SELECT' && key === 'property' && typeof value === 'string') {
                    customProperties.add(value);
                } else if (func === 'SCORE' && key === 'property' && typeof value === 'string') {
                    customProperties.add(value);
                } else if (func === 'SORT' && key === 'key' && typeof value === 'string') {
                    customProperties.add(value);
                } else if (func === 'SET' && key === 'property' && typeof value === 'string') {
                    customProperties.add(value);
                }
            }
            
            // Recursively scan nested objects
            scanForProperties(value);
        }
    }
    
    // Scan all widgets
    for (const [key, widget] of Object.entries(data)) {
        if (key === "_meta" || typeof widget !== 'object' || widget === null) {
            continue;
        }
        
        // Scan widget properties
        scanForProperties(widget);
    }
    
    return [...customProperties];
}

function validateGameFile(data, checkMeta) {
    const problems = [];
    
    // Get all custom properties used in the game file
    const customProperties = getCustomPropertyUsage(data);
    const calledCustomRoutines = [];
    
    // Basic structure validation
    if (typeof data !== 'object' || data === null) {
        problems.push({
            widget: '',
            property: [],
            message: 'Game file must be a JSON object'
        });
        return problems;
    }
    
    // Check for _meta
    if (checkMeta && !data._meta) {
        problems.push({
            widget: '',
            property: ['_meta'],
            message: 'Missing required _meta object'
        });
        return problems;
    }
    
    // Validate _meta structure
    if (checkMeta && (typeof data._meta !== 'object' || data._meta === null)) {
        problems.push({
            widget: '',
            property: ['_meta'],
            message: '_meta must be an object'
        });
        return problems;
    }
    
    // Check for required version
    if (checkMeta && typeof data._meta.version !== 'number') {
        problems.push({
            widget: '',
            property: ['_meta', 'version'],
            message: '_meta.version is required and must be a number'
        });
    }
    
    // Validate _meta.info if present
    if (checkMeta && data._meta.info !== undefined) {
        if (typeof data._meta.info !== 'object' || data._meta.info === null) {
            problems.push({
                widget: '',
                property: ['_meta', 'info'],
                message: '_meta.info must be an object'
            });
        } else {
            // Validate info properties - include all properties from the schema
            const infoProps = [
                'name', 'image', 'rules', 'bgg', 'year', 'mode', 'time', 'attribution', 
                'lastUpdate', 'language', 'showName', 'skill', 'description', 'similarImage', 
                'similarName', 'similarDesigner', 'similarAwards', 'ruleText', 'helpText', 
                'players', 'variant', 'variantImage'
            ];
            for (const prop of Object.keys(data._meta.info)) {
                if (!infoProps.includes(prop)) {
                    problems.push({
                        widget: '',
                        property: ['_meta', 'info', prop],
                        message: `_meta.info has unknown property '${prop}'`
                    });
                }
            }
        }
    }
    
    // Widget validation
    for (const [key, widget] of Object.entries(data)) {
        if (key === "_meta" || typeof widget !== 'object' || widget === null) {
            continue;
        }
        
        customWidgetChecks(widget, data, problems);

        // Basic widget validation
        if (!widget.id) {
            problems.push({
                widget: key,
                property: ['id'],
                message: 'Widget missing required id property'
            });
            continue;
        }
        
        if (widget.id !== key) {
            problems.push({
                widget: key,
                property: ['id'],
                message: 'Widget id must be the same as the key in the game file'
            });
            continue;
        }
        
        if (typeof widget.id !== 'string') {
            problems.push({
                widget: key,
                property: ['id'],
                message: 'Widget id must be a string'
            });
            continue;
        }
        
        const wtype = getWidgetType(widget);
        const known = WIDGET_PROPERTIES[wtype];
        
        // Check for unrecognized properties
        for (const prop of Object.keys(widget)) {
            // For Card, cardType and deck are required, everything else optional
            if (!(prop in known) && !prop.match(/^((.+G|g)lobalUpdateRoutine|(.+C|c)hangeRoutine)$/)) {
                // Only warn if this property is not used anywhere in the game file
                if (!customProperties.includes(prop)) {
                    problems.push({
                        widget: key,
                        property: [prop],
                        message: 'unrecognized (and seemingly unused) property'
                    });
                }
            } else {
                // Validate property value if a validator is defined
                let validator = known[prop];
                if (typeof validator === 'string' && validators[validator]) {
                    validator = validators[validator];
                }
                if(prop.match(/^.+ChangeRoutine$/))
                    validator = getRoutineValidator({oldValue: 1, value: 1}, {}, false);
                if(prop == 'changeRoutine')
                    validator = getRoutineValidator({property: 1, oldValue: 1, value: 1}, {}, false);
                if(prop.match(/^.+GlobalUpdateRoutine$/))
                    validator = getRoutineValidator({widgetID: 1, oldValue: 1, value: 1}, {widget: 1}, false);
                if(prop == 'globalUpdateRoutine')
                    validator = getRoutineValidator({widgetID: 1, property: 1, oldValue: 1, value: 1}, {widget: 1}, false);

                if (typeof validator === 'function') {
                    const result = validator(widget[prop], {widgetId: key, widgets: data, customProperties, calledCustomRoutines}, [prop]);
                    if (Array.isArray(result)) {
                        // Validator returned an array of problems
                        problems.push(...result);
                    } else if (typeof result === 'string') {
                        problems.push({
                            widget: key,
                            property: [prop],
                            message: result
                        });
                    } else if (!result) {
                        problems.push({
                            widget: key,
                            property: [prop],
                            message: `Property is invalid ${JSON.stringify(result)}`
                        });
                    }
                }
            }
        }        
    }
    
    for (const [key, widget] of Object.entries(data)) {
        const wtype = getWidgetType(widget);
        const known = WIDGET_PROPERTIES[wtype];
        // Routine validation for properties ending with 'Routine'
        for (const [propName, propValue] of Object.entries(widget)) {
            if (propName.endsWith('Routine') && !known[propName] && Array.isArray(propValue) && !calledCustomRoutines.includes(propName) && !propName.match(/^((.+G|g)lobalUpdateRoutine|(.+C|c)hangeRoutine)$/)) {
                const context = { widgetId: key, widgets: data, validVariables: {...SUPER_GLOBALS.variables}, validCollections: {...SUPER_GLOBALS.collections}, customProperties, calledCustomRoutines };
                const routineProblems = validateRoutine(propValue, context, [propName]);
                problems.push({
                    widget: key,
                    property: [propName],
                    message: 'Routine is not being called'
                });
                problems.push(...routineProblems);
            }
        }
    }

    if(checkMeta) {
        // Language validation
        const info = (data._meta || {}).info || {};
        const language = info.language || '';
        if (language && !ALLOWED_LANGUAGES.includes(language)) {
            problems.push({
                widget: '',
                property: ['_meta', 'info', 'language'],
                message: `'${language}' is not in the allowed list: ${ALLOWED_LANGUAGES.join(', ')}`
            });
        }
        
        // BGG URL validation
        if (!/^https?:\/\/(www\.)?boardgamegeek\.com\//.test(info.bgg)) {
            problems.push({
                widget: '',
                property: ['_meta', 'info', 'bgg'],
                message: 'does not look like a BoardGameGeek URL'
            });
        }
    
        if (!info.image) {
            problems.push({
                widget: '',
                property: ['_meta', 'info', 'image'],
                message: 'is missing'
            });
        } else if (!/^\/(asset|i)/.test(info.image)) {
            problems.push({
                widget: '',
                property: ['_meta', 'info', 'image'],
                message: 'is not an internal asset: ' + info.image
            });
        } else if (info.image.match(/[0-9]+$/)[0] > 50000) {
            problems.push({
                widget: '',
                property: ['_meta', 'info', 'image'],
                message: 'image is bigger than 50000'
            });
        }
    }
    return problems;
}

// ES6 export for use in ES modules
export { validateGameFile, getWidgetType, validateRoutine, getCustomPropertyUsage }; 