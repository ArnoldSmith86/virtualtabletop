import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// routineTemplates.js is a plain script that gets concatenated by
// server/minify.mjs, so evaluate the source and grab the pure helpers.
const dir = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(dir, '../../client/js/editor/routineTemplates.js'), 'utf8');

const {
  routineBuilderStrings,
  routineBuilderText,
  routineBuilderOperations,
  routineBuilderCategories,
  routineBuilderClauseFields,
  routineBuilderClauseKeys,
  routineBuilderFieldValue,
  routineBuilderVariantClauses,
  routineBuilderMatch,
  routineBuilderSupports,
  routineBuilderNewOperation,
  routineBuilderVariables,
  routineBuilderCollections,
  routineBuilderRoutineLabel
} = new Function(source + `;
  return {
    routineBuilderStrings,
    routineBuilderText,
    routineBuilderOperations,
    routineBuilderCategories,
    routineBuilderClauseFields,
    routineBuilderClauseKeys,
    routineBuilderFieldValue,
    routineBuilderVariantClauses,
    routineBuilderMatch,
    routineBuilderSupports,
    routineBuilderNewOperation,
    routineBuilderVariables,
    routineBuilderCollections,
    routineBuilderRoutineLabel
  };
`)();

const placeholders = sentence => [ ...sentence.matchAll(/\{([a-zA-Z]+)\}/g) ].map(match => match[1]);

describe('routine builder string table', () => {
  test('every operation, verb, clause and enum value has a translatable string', () => {
    for(const func in routineBuilderOperations) {
      const template = routineBuilderOperations[func];
      expect(routineBuilderStrings[`op.${func}`]).toBeDefined();
      for(const variant of template.variants) {
        expect(routineBuilderStrings[`variant.${func}.${variant.id}`]).toBeDefined();
        if(template.variants.length > 1)
          expect(routineBuilderStrings[`verb.${func}.${variant.id}`]).toBeDefined();
      }
      for(const clause of template.clauses) {
        expect(routineBuilderStrings[`clause.${func}.${clause.id}`]).toBeDefined();
        for(const field of routineBuilderClauseFields(clause))
          for(const value of field.values || [])
            expect(routineBuilderStrings[`enum.${func}.${field.key}.${value}`]).toBeDefined();
      }
      for(const variant of template.variants)
        for(const field of variant.fields)
          for(const value of field.values || [])
            expect(routineBuilderStrings[`enum.${func}.${field.key}.${value}`]).toBeDefined();
    }
  });

  test('every placeholder of a sentence has a matching field', () => {
    for(const func in routineBuilderOperations) {
      const template = routineBuilderOperations[func];
      for(const variant of template.variants)
        for(const name of placeholders(routineBuilderText(`variant.${func}.${variant.id}`)))
          expect(variant.fields.map(field => field.name)).toContain(name);
      for(const clause of template.clauses)
        for(const name of placeholders(routineBuilderText(`clause.${func}.${clause.id}`)))
          expect(routineBuilderClauseFields(clause).map(field => field.name)).toContain(name);
    }
  });

  test('the add step menu offers every supported operation exactly once', () => {
    const offered = routineBuilderCategories.flatMap(category => category.funcs);
    expect([ ...offered ].sort()).toEqual(Object.keys(routineBuilderOperations).sort());
  });

  test('a new step of every offered operation renders as a sentence', () => {
    for(const func of routineBuilderCategories.flatMap(category => category.funcs))
      expect(routineBuilderSupports(routineBuilderNewOperation(func))).toBe(true);
  });
});

// Shapes taken from the frequency analysis of library/games in issue #3078.
const realWorldOperations = [
  [ { func: 'SET', property: 'rotation', value: 90 }, 'SET', 'set' ],
  [ { func: 'SET', collection: 'hand', property: 'value', relation: '+', value: 1 }, 'SET', 'inc' ],
  [ { func: 'SET', property: 'score', relation: '-', value: 1 }, 'SET', 'dec' ],
  [ { func: 'SET', property: 'clickable', relation: '!' }, 'SET', 'toggle' ],
  [ { func: 'SET', property: 'text', relation: '+', value: ' (used)' }, 'SET', 'append' ],
  [ { func: 'SET', property: 'x', relation: '*', value: 2 }, 'SET', 'mul' ],
  // the engine rewrites "==" to "=" with a warning, so it is still a plain Set
  [ { func: 'SET', property: 'value', relation: '==', value: 3 }, 'SET', 'set' ],
  [ { func: 'SELECT', property: 'cardType', value: 'ace' }, 'SELECT', 'set' ],
  [ { func: 'SELECT', type: 'card', property: 'deck', value: 'main', max: 5, random: true, collection: 'draw' }, 'SELECT', 'set' ],
  [ { func: 'SELECT', mode: 'add', property: 'owner', relation: 'in', value: [ 'red' ] }, 'SELECT', 'add' ],
  [ { func: 'SELECT', mode: 'remove', property: 'id', value: 'x1' }, 'SELECT', 'remove' ],
  [ { func: 'SELECT' }, 'SELECT', 'set' ],
  [ { func: 'GET', property: 'value', variable: 'v' }, 'GET', 'first' ],
  [ { func: 'GET', property: 'score', aggregation: 'sum', variable: 'total', skipMissing: true }, 'GET', 'sum' ],
  [ { func: 'CALL', routine: 'dealRoutine' }, 'CALL', 'call' ],
  [ { func: 'CALL', routine: 'dealRoutine', widget: 'deck1', variable: 'r' }, 'CALL', 'call' ],
  [ { func: 'MOVE', from: 'deck1', to: 'hand1', count: 5 }, 'MOVE', 'fromHolder' ],
  [ { func: 'MOVE', to: 'discard' }, 'MOVE', 'fromPick' ],
  [ { func: 'MOVE', collection: 'draw', to: 'hand1', count: 2 }, 'MOVE', 'fromPick' ],
  // legacy saves store count 0 for "all"
  [ { func: 'MOVE', from: 'deck1', to: 'hand1', count: 0 }, 'MOVE', 'fromHolder' ],
  [ { func: 'LABEL', label: 'scoreLabel', value: 'Ready' }, 'LABEL', 'set' ],
  [ { func: 'LABEL', label: 'scoreLabel', mode: 'inc', value: 1 }, 'LABEL', 'inc' ],
  [ { func: 'LABEL', collection: 'labels', mode: 'append', value: ' done' }, 'LABEL', 'append' ],
  [ { func: 'COUNT' }, 'COUNT', 'pick' ],
  [ { func: 'COUNT', holder: 'deck1', variable: 'left' }, 'COUNT', 'holder' ],
  [ { func: 'COUNT', owner: 'red' }, 'COUNT', 'owner' ],
  [ { func: 'FLIP', holder: 'deck1', face: 0 }, 'FLIP', 'up' ],
  [ { func: 'FLIP', face: 1, count: 3 }, 'FLIP', 'down' ],
  [ { func: 'FLIP', collection: 'hand', faceCycle: 'forward' }, 'FLIP', 'cycle' ],
  [ { func: 'FLIP' }, 'FLIP', 'over' ],
  [ { func: 'CLICK', collection: 'buttons', count: 2, mode: 'ignoreClickRoutine' }, 'CLICK', 'click' ],
  [ { func: 'RECALL', holder: 'deck1' }, 'RECALL', 'recall' ],
  [ { func: 'RECALL', holder: 'deck1', owned: false, byDistance: true }, 'RECALL', 'recall' ],
  [ { func: 'SHUFFLE', holder: 'deck1' }, 'SHUFFLE', 'shuffle' ],
  [ { func: 'SHUFFLE', collection: 'draw', mode: 'riffle' }, 'SHUFFLE', 'shuffle' ]
];

describe('routine builder operation matching', () => {
  test.each(realWorldOperations)('%j renders as the %s/%s sentence', (operation, func, variantID) => {
    const match = routineBuilderMatch(operation);
    expect(match).not.toBeNull();
    expect(match.variant.id).toBe(variantID);
  });

  test('rendering never touches the operation', () => {
    for(const [ operation ] of realWorldOperations) {
      const before = JSON.stringify(operation);
      routineBuilderMatch(operation);
      expect(JSON.stringify(operation)).toBe(before);
    }
  });

  test('every placeholder of the chosen sentence resolves to a value or a fallback', () => {
    for(const [ operation, func ] of realWorldOperations) {
      const { variant } = routineBuilderMatch(operation);
      for(const name of placeholders(routineBuilderText(`variant.${func}.${variant.id}`))) {
        const field = variant.fields.find(candidate => candidate.name == name);
        // dual chips carry their own two keys and always render something
        expect(field.key === '' || routineBuilderFieldValue(field, operation) !== undefined).toBe(true);
      }
    }
  });

  test('switching the verb rewrites the parameters together with the sentence', () => {
    const operation = { func: 'SET', property: 'value', value: 5 };
    const template = routineBuilderOperations.SET;
    template.variants.find(variant => variant.id == 'toggle').apply(operation);
    expect(operation).toEqual({ func: 'SET', property: 'value', relation: '!' });
    expect(routineBuilderMatch(operation).variant.id).toBe('toggle');

    template.variants.find(variant => variant.id == 'inc').apply(operation);
    expect(operation).toEqual({ func: 'SET', property: 'value', relation: '+', value: 1 });
    expect(routineBuilderMatch(operation).variant.id).toBe('inc');
  });

  test('anything the table cannot fully represent stays an advanced card', () => {
    // applyVariables is a real SET parameter the builder does not know yet
    expect(routineBuilderSupports({ func: 'SET', property: 'x', value: 1, applyVariables: [ 'x' ] })).toBe(false);
    expect(routineBuilderSupports({ func: 'IF', condition: '${x}' })).toBe(false);
    expect(routineBuilderSupports({ func: 'INPUT', header: 'hi', fields: [] })).toBe(false);
    expect(routineBuilderSupports({ func: 'SET', property: 'x', relation: '${op}', value: 1 })).toBe(false);
    expect(routineBuilderSupports('var a = 1')).toBe(false);
    expect(routineBuilderSupports(null)).toBe(false);
  });
});

describe('routine builder value and collection scanning', () => {
  const routine = [
    { func: 'COUNT', holder: 'deck1' },
    { func: 'GET', property: 'value', collection: 'hand' },
    { func: 'CALL', routine: 'sub' },
    { func: 'CALL', routine: 'sub2', return: false },
    'var doubled = ${COUNT} * 2',
    { func: 'SELECT', property: 'deck', value: 'main', collection: 'draw' },
    { func: 'SET', property: 'value', value: 1 }
  ];

  test('offers the values remembered by earlier steps only', () => {
    expect(routineBuilderVariables(routine, routine.length)).toEqual([ 'COUNT', 'value', 'result', 'doubled' ]);
    expect(routineBuilderVariables(routine, 1)).toEqual([ 'COUNT' ]);
    expect(routineBuilderVariables(routine, 0)).toEqual([]);
  });

  test('offers the groups of widgets earlier steps filled', () => {
    expect(routineBuilderCollections(routine, routine.length)).toEqual([ 'DEFAULT', 'hand', 'draw' ]);
  });
});

describe('routine builder headings', () => {
  test.each([
    [ 'clickRoutine', 'When this is clicked' ],
    [ 'enterRoutine', 'When a widget is dropped into this' ],
    [ 'millisecondsChangeRoutine', 'When milliseconds changes' ],
    [ 'dealRoutine', 'Reusable action: deal' ]
  ])('%s reads as "%s"', (property, expected) => {
    expect(routineBuilderRoutineLabel(property)).toBe(expected);
  });
});
