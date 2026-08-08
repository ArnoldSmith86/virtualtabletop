import { validateGameFile } from '../../validator/validate_gamefile.js';

describe('Validator custom properties', () => {
  const validateRoutine = clickRoutine => validateGameFile({
    widget: { id: 'widget', clickRoutine }
  }, false);

  const missingPropertyProblems = problems => problems.filter(problem =>
    problem.property.join('.') === 'clickRoutine.0.property' &&
    problem.message === "property 'customProperty' not found"
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

    expect(problems.some(problem => problem.message === "property 'customProperty' not found")).toBe(false);
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

    expect(problems.some(problem => problem.message === `property '${property}' not found`)).toBe(false);
  });
});
