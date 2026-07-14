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
});
