import { validateGameFile } from '../../validator/validate_gamefile.js';

describe('Validator custom properties', () => {
  const validateRoutine = clickRoutine => validateGameFile({
    widget: { id: 'widget', clickRoutine }
  }, false);

  const undefinedProperty = property => problem => problem.message === `'${property}' is read but nothing ever sets it - check for a typo`;

  const missingPropertyProblems = problems => problems.filter(problem =>
    problem.property.join('.') === 'clickRoutine.0.property' && undefinedProperty('customProperty')(problem)
  );

  test('GET reports a custom property that is never defined', () => {
    const problems = validateRoutine([{ func: 'GET', property: 'customProperty' }]);

    expect(missingPropertyProblems(problems)).toHaveLength(1);
  });

  test('GET accepts a custom property declared on a widget', () => {
    const problems = validateGameFile({
      widget: {
        id: 'widget',
        customProperty: 1,
        clickRoutine: [{ func: 'GET', property: 'customProperty' }]
      }
    }, false);

    expect(missingPropertyProblems(problems)).toHaveLength(0);
  });

  test('GET accepts a custom property written by SET', () => {
    const problems = validateRoutine([
      { func: 'SET', property: 'customProperty', value: 1 },
      { func: 'GET', property: 'customProperty' }
    ]);

    expect(problems.some(undefinedProperty('customProperty'))).toBe(false);
  });

  test('GET accepts a custom property written by SCORE', () => {
    const problems = validateGameFile({
      seat: { id: 'seat', type: 'seat' },
      widget: {
        id: 'widget',
        clickRoutine: [
          { func: 'SCORE', mode: 'inc', property: 'customProperty', value: 1 },
          { func: 'GET', property: 'customProperty' }
        ]
      }
    }, false);

    expect(problems.some(undefinedProperty('customProperty'))).toBe(false);
  });

  test('GET accepts the score property that SCORE writes by default', () => {
    const problems = validateGameFile({
      seat: { id: 'seat', type: 'seat' },
      widget: {
        id: 'widget',
        clickRoutine: [
          { func: 'SCORE', mode: 'inc', value: 1 },
          { func: 'GET', property: 'score' }
        ]
      }
    }, false);

    expect(problems.some(undefinedProperty('score'))).toBe(false);
  });

  test('GET accepts a custom property applied by CLONE', () => {
    const problems = validateRoutine([
      { func: 'CLONE', properties: { customProperty: 1 } },
      { func: 'GET', property: 'customProperty' }
    ]);

    expect(problems.some(undefinedProperty('customProperty'))).toBe(false);
  });

  test('GET accepts a custom property that RESET writes', () => {
    const problems = validateGameFile({
      widget: {
        id: 'widget',
        resetProperties: { customProperty: 0 },
        clickRoutine: [
          { func: 'RESET' },
          { func: 'GET', property: 'customProperty' }
        ]
      }
    }, false);

    expect(problems.some(undefinedProperty('customProperty'))).toBe(false);
  });

  test('GET accepts a custom property that an interpolated RESET map writes', () => {
    const problems = validateGameFile({
      widget: {
        id: 'widget',
        resetProperties1: { customProperty: 0 },
        clickRoutine: [
          { func: 'RESET', property: 'resetProperties${index}' },
          { func: 'GET', property: 'customProperty' }
        ]
      }
    }, false);

    expect(problems.some(undefinedProperty('customProperty'))).toBe(false);
  });

  test('GET still reports a name that no RESET map writes', () => {
    const problems = validateGameFile({
      widget: {
        id: 'widget',
        resetProperties1: { customProperty: 0 },
        clickRoutine: [
          { func: 'RESET', property: 'resetProperties${index}' },
          { func: 'GET', property: 'otherProperty' }
        ]
      }
    }, false);

    expect(problems.some(undefinedProperty('otherProperty'))).toBe(true);
  });

  test('GET accepts a name that an interpolated SET can produce', () => {
    const problems = validateRoutine([
      { func: 'SET', property: 'customProperty${index}', value: 1 },
      { func: 'GET', property: 'customProperty3' }
    ]);

    expect(problems.some(undefinedProperty('customProperty3'))).toBe(false);
  });

  test('GET still reports a name that no interpolated SET can produce', () => {
    const problems = validateRoutine([
      { func: 'SET', property: 'customProperty${index}', value: 1 },
      { func: 'GET', property: 'otherProperty' }
    ]);

    expect(problems.some(undefinedProperty('otherProperty'))).toBe(true);
  });

  test('GET accepts any name once a fully dynamic SET writes some property', () => {
    const problems = validateGameFile({
      widget: {
        id: 'widget',
        setterRoutine: [{ func: 'SET', property: '${propName}', value: '${propValue}' }],
        clickRoutine: [
          { func: 'CALL', routine: 'setterRoutine', arguments: { propName: 'customProperty', propValue: 3 } },
          { func: 'GET', property: 'customProperty' }
        ]
      }
    }, false);

    expect(problems.some(undefinedProperty('customProperty'))).toBe(false);
  });

  test('GET accepts any name once a fully dynamic RESET picks a map at runtime', () => {
    const problems = validateGameFile({
      widget: {
        id: 'widget',
        resetProperties1: { customProperty: 0 },
        clickRoutine: [
          { func: 'RESET', property: '${mapName}' },
          { func: 'GET', property: 'customProperty' }
        ]
      }
    }, false);

    expect(problems.some(undefinedProperty('customProperty'))).toBe(false);
  });

  test.each([
    ['cardDefaults', { cardDefaults: { customProperty: 1 } }],
    ['cardTypes', { cardTypes: { typeA: { customProperty: 1 } } }],
    ['face template properties', { faceTemplates: [{ properties: { customProperty: 1 } }] }]
  ])('GET accepts a card property inherited from deck %s', (source, deckProperties) => {
    const problems = validateGameFile({
      deck: { id: 'deck', type: 'deck', ...deckProperties },
      card: {
        id: 'card',
        type: 'card',
        deck: 'deck',
        cardType: 'typeA',
        clickRoutine: [{ func: 'GET', property: 'customProperty' }]
      }
    }, false);

    expect(missingPropertyProblems(problems)).toHaveLength(0);
  });

  test.each(['_absoluteX', '_totals'])('GET accepts computed read-only property %s', property => {
    const problems = validateRoutine([{ func: 'GET', property }]);

    expect(problems.some(undefinedProperty(property))).toBe(false);
  });
});
