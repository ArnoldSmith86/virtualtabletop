import { createWidget, addLabel, removeWidget } from './client-util.js';

describe("Scenarios: Reading and writing values inside widget properties", () => {
  const testName = "nested-values";
  let testWidget;
  let targetWidget;
  let secondTargetWidget;
  let testLabel;

  beforeAll(() => {
    testWidget = createWidget({ id: `${testName}-test-widget`, clickable: true, type: "widget" });
    targetWidget = createWidget({ id: `${testName}-target-widget`, type: "widget", group: testName });
    secondTargetWidget = createWidget({ id: `${testName}-second-target-widget`, type: "widget", group: testName });
    testLabel = addLabel(`${testName}-test-label`);
    window.jeRoutineLogging = false;
  });
  afterAll(() => {
    removeWidget(testWidget.get('id'));
    removeWidget(targetWidget.get('id'));
    removeWidget(secondTargetWidget.get('id'));
    removeWidget(testLabel.get('id'));
  });

  async function run(routine, targetProperties, secondTargetProperties) {
    for(const [ widget, properties ] of [ [ targetWidget, targetProperties ], [ secondTargetWidget, secondTargetProperties ] ]) {
      await widget.set('css', null);
      await widget.set('cardTypes', null);
      for(const [ property, value ] of Object.entries(properties || {}))
        await widget.set(property, value);
    }
    await testWidget.set('clickRoutine', [
      secondTargetProperties ? { func: 'SELECT', property: 'group', value: testName } : { func: 'SELECT', property: 'id', value: targetWidget.get('id') }
    ].concat(routine));
    await testWidget.click();
  }

  describe("Given a SET operation with a property path", () => {
    test("Then it adds the key to an existing object", async () => {
      await run([
        { func: 'SET', property: [ 'css', 'default', 'background' ], value: 'red' }
      ], { css: { default: { color: 'blue' } } });
      expect(targetWidget.get('css')).toEqual({ default: { color: 'blue', background: 'red' } });
    });

    test("Then it creates the objects along the path if they are missing", async () => {
      await run([
        { func: 'SET', property: [ 'cardTypes', 'Ace', 'color' ], value: '#00767a' }
      ]);
      expect(targetWidget.get('cardTypes')).toEqual({ Ace: { color: '#00767a' } });
    });

    test("Then it creates an array for a numeric key", async () => {
      await run([
        { func: 'SET', property: [ 'cardTypes', 0, 'color' ], value: 'red' }
      ]);
      expect(targetWidget.get('cardTypes')).toEqual([ { color: 'red' } ]);
    });

    test("Then it applies the relation to the old value", async () => {
      await run([
        { func: 'SET', property: [ 'css', 'default', 'width' ], relation: '+', value: 5 }
      ], { css: { default: { width: 10 } } });
      expect(targetWidget.get('css').default.width).toBe(15);
    });

    test("Then it leaves other widgets and other keys untouched", async () => {
      await run([
        { func: 'SET', property: [ 'css', 'inline' ], value: 'color: red' }
      ], { css: { default: { color: 'blue' } } });
      expect(targetWidget.get('css')).toEqual({ default: { color: 'blue' }, inline: 'color: red' });
      expect(testWidget.get('css')).toBe('');
    });

    test("Then it replaces a property that is not an object", async () => {
      await run([
        { func: 'SET', property: [ 'css', 'default' ], value: 'color: red' }
      ], { css: 'color: blue' });
      expect(targetWidget.get('css')).toEqual({ default: 'color: red' });
    });

    test("Then the relation of one widget does not affect the next one", async () => {
      await run([
        { func: 'SET', property: [ 'cardTypes', 'count' ], relation: '+', value: 1 }
      ], {}, { cardTypes: { count: 10 } });
      expect(targetWidget.get('cardTypes')).toEqual({ count: 1 });
      expect(secondTargetWidget.get('cardTypes')).toEqual({ count: 11 });
    });

    test("Then it appends to an array property", async () => {
      await run([
        { func: 'SET', property: [ 'cardTypes', 2 ], value: 'c' }
      ], { cardTypes: [ 'a', 'b' ] });
      expect(targetWidget.get('cardTypes')).toEqual([ 'a', 'b', 'c' ]);
    });

    test("Then it refuses a key that is not an index in an array property", async () => {
      await run([
        { func: 'SET', property: [ 'cardTypes', 'a' ], value: 5 }
      ], { cardTypes: [ 1, 2 ] });
      expect(targetWidget.get('cardTypes')).toEqual([ 1, 2 ]);
    });

    test("Then it refuses an index that would leave a gap in an array property", async () => {
      await run([
        { func: 'SET', property: [ 'cardTypes', 100000 ], value: 5 }
      ], { cardTypes: [ 1, 2 ] });
      expect(targetWidget.get('cardTypes')).toEqual([ 1, 2 ]);
    });

    test("Then a numeric string is a key of an object, not an array index", async () => {
      await run([
        { func: 'SET', property: [ 'cardTypes', '007' ], value: 'Bond' },
        { func: 'SET', property: [ 'cardTypes', '1754300000000' ], value: 'timestamp' }
      ]);
      expect(targetWidget.get('cardTypes')).toEqual({ '007': 'Bond', '1754300000000': 'timestamp' });
    });

    test("Then it refuses to write into the prototype chain", async () => {
      await run([
        { func: 'SET', property: [ 'cardTypes', '__proto__', 'polluted' ], value: 'yes' },
        { func: 'SET', property: [ 'cardTypes', 'constructor', 'prototype', 'polluted' ], value: 'yes' }
      ], { cardTypes: { Ace: { color: 'red' } } });
      expect(targetWidget.get('cardTypes')).toEqual({ Ace: { color: 'red' } });
      expect({}.polluted).toBeUndefined();
      expect(Object.prototype.polluted).toBeUndefined();
    });
  });

  describe("Given a GET operation with a property path", () => {
    test("Then it reads the value inside the object", async () => {
      await run([
        { func: 'GET', property: [ 'css', 'default', 'background' ], variable: 'result' },
        { func: 'LABEL', label: testLabel.get('id'), value: '${result}' }
      ], { css: { default: { background: 'red' } } });
      expect(testLabel.get('text')).toBe('red');
    });

    test("Then it keeps values that are falsy", async () => {
      await run([
        { func: 'GET', property: [ 'css', 'default', 'opacity' ], variable: 'result' },
        { func: 'LABEL', label: testLabel.get('id'), value: '${result}' }
      ], { css: { default: { opacity: 0 } } });
      expect(testLabel.get('text')).toBe(0);
    });

    test("Then it returns no value for a missing key", async () => {
      await run([
        { func: 'GET', property: [ 'css', 'default', 'background' ], variable: 'result' },
        { func: 'LABEL', label: testLabel.get('id'), value: '${result}' }
      ], { css: { default: {} } });
      expect(testLabel.get('text')).toBe('');
    });

    test("Then it does not read through the prototype chain", async () => {
      await run([
        { func: 'GET', property: [ 'css', 'default', 'constructor' ], variable: 'result' },
        { func: 'LABEL', label: testLabel.get('id'), value: '${result}' }
      ], { css: { default: { color: 'blue' } } });
      expect(testLabel.get('text')).toBe('');
    });
  });

  describe("Given a PROPERTY expression with a key path", () => {
    test("Then it reads a value of another widget", async () => {
      await run([
        { func: 'LABEL', label: testLabel.get('id'), value: `\${PROPERTY css.default.background OF ${targetWidget.get('id')}}` }
      ], { css: { default: { background: 'red' } } });
      expect(testLabel.get('text')).toBe('red');
    });

    test("Then it resolves variables used as keys", async () => {
      await run([
        { func: 'VAR', variables: { cardType: 'Ace' } },
        { func: 'LABEL', label: testLabel.get('id'), value: `\${PROPERTY cardTypes.$cardType.color OF ${targetWidget.get('id')}}` }
      ], { cardTypes: { Ace: { color: 'blue' } } });
      expect(testLabel.get('text')).toBe('blue');
    });

    test("Then it returns no value for a missing key", async () => {
      await run([
        { func: 'LABEL', label: testLabel.get('id'), value: `\${PROPERTY css.default.background OF ${targetWidget.get('id')}}` }
      ]);
      expect(testLabel.get('text')).toBe('');
    });
  });

  describe("Given a variable with a key path", () => {
    test("Then it indexes more than one level deep", async () => {
      await run([
        { func: 'VAR', variables: { data: { a: { b: 'deep' } } } },
        { func: 'LABEL', label: testLabel.get('id'), value: '${data.a.b}' }
      ]);
      expect(testLabel.get('text')).toBe('deep');
    });

    test("Then it still indexes strings and arrays like before", async () => {
      await run([
        { func: 'VAR', variables: { text: 'hello', list: [ 'a', 'b' ] } },
        { func: 'LABEL', label: testLabel.get('id'), value: '${text.length}${list.1}${list.length}' }
      ]);
      expect(testLabel.get('text')).toBe('5b2');
    });

    test("Then it returns an empty string when a key in the middle is missing", async () => {
      await run([
        { func: 'VAR', variables: { data: { a: {} } } },
        { func: 'LABEL', label: testLabel.get('id'), value: 'x${data.a.b.c}' }
      ]);
      expect(testLabel.get('text')).toBe('x');
    });
  });
});
