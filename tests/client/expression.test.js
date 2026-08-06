import { compute_ops } from '../../client/js/compute.js';
import { evaluateExpression, expressionCondition, expressionError, expressionNames, expressionNumber } from '../../client/js/expression.js';

// x and y are what a dragLimit condition is tested with, everything else stands
// in for a widget property
const scope = { x: 3, y: 4, width: 100, seats: 2 };
const resolve = (name, widgetID) => widgetID === null ? scope[name] : ({ board: { seats: 5 } }[widgetID] || {})[name];

const value = text => evaluateExpression(text, resolve);

describe('the expression language', () => {
  test('reads numbers, names and property references', () => {
    expect(value('42')).toBe(42);
    expect(value('1.5')).toBe(1.5);
    expect(value('x')).toBe(3);
    expect(value('${PROPERTY width}')).toBe(100);
    expect(value('${PROPERTY seats OF board}')).toBe(5);
  });

  test('applies the usual precedence', () => {
    expect(value('1 + 2 * 3')).toBe(7);
    expect(value('(1 + 2) * 3')).toBe(9);
    expect(value('2 ^ 3 ^ 2')).toBe(512);
    expect(value('-2 ^ 2')).toBe(-4);
    expect(value('7 % 4')).toBe(3);
    expect(value('10 / 4')).toBe(2.5);
  });

  test('multiplies a number written in front of a name or a bracket', () => {
    expect(value('2x')).toBe(6);
    expect(value('2x^2')).toBe(18);
    expect(value('3(x + 1)')).toBe(12);
    expect(value('2PI')).toBeCloseTo(2 * Math.PI);
  });

  test('compares and combines', () => {
    expect(value('x < y')).toBe(true);
    expect(value('x >= 3 && y != 4')).toBe(false);
    expect(value('x >= 3 || y != 4')).toBe(true);
    expect(value('!(x > y)')).toBe(true);
  });

  test('calls the maths functions', () => {
    expect(value('sqrt(16)')).toBe(4);
    expect(value('min(x, y, 1)')).toBe(1);
    expect(value('abs(0 - x)')).toBe(3);
    expect(value('floor(2.7) + ceil(0.2) + round(1.5)')).toBe(5);
  });

  test('reads an inequality written without spaces or multiplication signs', () => {
    // "2x^2+y>4" and "2y+10>5x" - with x=3, y=4: 22 > 4 and 18 > 15
    expect(value('2x^2+y>4')).toBe(true);
    expect(value('2y+10>5x')).toBe(true);
    expect(evaluateExpression('2x^2+y>4', (name)=>({ x: 0, y: 1 }[name]))).toBe(false);
    expect(evaluateExpression('2y+10>5x', (name)=>({ x: 10, y: 1 }[name]))).toBe(false);
  });

  test('reads the right side of && and || only when it decides the result', () => {
    // a name that cannot be read throws - but not where it is never reached,
    // so a condition can check whether the widget it reads exists at all
    expect(_=>value('nope > 1')).toThrow();
    expect(value('x > 100 && nope > 1')).toBe(false);
    expect(value('x > 1 || nope > 1')).toBe(true);
    expect(_=>value('x > 1 && nope > 1')).toThrow();
    // a syntax error is still one, reached or not
    expect(_=>value('x > 100 && 2x^^2 > 1')).toThrow();
  });

  test('throws rather than guessing', () => {
    expect(_=>value('x +')).toThrow();
    expect(_=>value('(x')).toThrow();
    expect(_=>value('x @ y')).toThrow();
    expect(_=>value('nope + 1')).toThrow();     // no such property
    expect(_=>value('')).toThrow();
  });

  test('refuses a chained comparison instead of always answering true', () => {
    // "0 < x < 500" reads as "(0 < x) < 500", i.e. "true < 500" - true for
    // every x, which as a dragLimit would be a limit that limits nothing
    expect(_=>value('0 < x < 500')).toThrow();
    expect(_=>value('1 == 1 == 1')).toThrow();
    expect(value('x > 0 && x < 500')).toBe(true);
  });

  test('refuses brackets as a way around that, too', () => {
    // "(0 < x) < 500" is the same always true limit written differently
    expect(_=>value('(0 < x) < 500')).toThrow();
    expect(_=>value('(x > 0) + 1 > 0')).toThrow();
    // comparing two of them against each other is not that mistake, though
    expect(value('(x > 0) == (y > 0)')).toBe(true);
    expect(value('(x > 0) != (y > 9)')).toBe(true);
  });

  test('refuses an implicit multiplication that would read as an exponent', () => {
    // "2^2x" is written to mean 2^(2x) and would be read as (2^2)*x, so it is
    // reported rather than quietly meaning one of the two
    expect(_=>value('2^2x')).toThrow();
    expect(_=>value('2^2(x + 1)')).toThrow();
    expect(value('2^(2x)')).toBe(64);
    expect(value('(2^2)*x')).toBe(12);
    // the case the property advertises stays as it reads: 2 * (x^2)
    expect(value('2x^2')).toBe(18);
  });

  test('multiplies implicitly only where a number is written in front', () => {
    expect(_=>value('2 3')).toThrow();          // a stray space in "23"
    expect(_=>value('x y')).toThrow();
    expect(value('2 x')).toBe(6);               // spaces around it are fine
  });

  test('says what the same name says in var', () => {
    // the point of the whole table: a formula can be moved between a routine
    // and a condition without quietly computing something else - angles most of
    // all, which are degrees on both sides
    const varOp = name=>compute_ops.find(op=>op.name == name);
    const oneArgument = {
      abs: -3.5, acos: 0.5, asin: 0.5, atan: 2, cbrt: 27, ceil: 2.2, cos: 60, exp: 1.5,
      floor: 2.7, log: 5, log10: 1000, log2: 8, round: 1.5, sign: -4, sin: 30, sqrt: 20,
      tan: 45, trunc: -2.7
    };
    for(const [ name, argument ] of Object.entries(oneArgument))
      expect(value(`${name}(${argument})`)).toBeCloseTo(varOp(name).call(undefined, argument), 10);

    const twoArguments = { atan2: [ 3, 4 ], hypot: [ 3, 4 ], max: [ 3, 4 ], min: [ 3, 4 ], pow: [ 3, 4 ] };
    for(const [ name, [ first, second ] ] of Object.entries(twoArguments))
      expect(value(`${name}(${first}, ${second})`)).toBeCloseTo(varOp(name).call(undefined, first, second), 10);

    for(const name of [ 'E', 'LN10', 'LN2', 'LOG10E', 'LOG2E', 'PI', 'SQRT1_2', 'SQRT2' ])
      expect(value(name)).toBe(varOp(name).call(undefined));

    expect(value('sin(90)')).toBe(1);
    expect(value('atan2(1, 1)')).toBeCloseTo(45);
  });

  test('leaves out of that table what an area cannot use', () => {
    // an area that is not the same twice can neither be slid along nor drawn,
    // so the three random operations are names like any other - i.e. properties
    expect(_=>value('random')).toThrow();
    expect(_=>value('randInt(1, 6)')).toThrow();
    expect(evaluateExpression('random + 1', name=>({ random: 41 }[name]))).toBe(42);
  });

  test('compares with === and !== like var does', () => {
    expect(value('x === 3')).toBe(true);
    expect(value('x !== 3')).toBe(false);
    expect(value('(x > 0) === (y > 0)')).toBe(true);
    expect(_=>value('0 === x === 3')).toThrow();
  });

  test('does not answer with what every object inherits', () => {
    // a widget property named "constructor" or "toString" is read like any
    // other name rather than resolving to Object.prototype
    expect(_=>value('constructor')).toThrow();
    expect(_=>value('toString(1)')).toThrow();
    expect(evaluateExpression('constructor + 1', name=>({ constructor: 41 }[name]))).toBe(42);
  });
});

describe('the two shapes a property asks for', () => {
  test('a number keeps a plain number and falls back on anything unreadable', () => {
    expect(expressionNumber(7, resolve)).toBe(7);
    expect(expressionNumber('${PROPERTY width} / 2', resolve)).toBe(50);
    expect(expressionNumber('x > 1', resolve, -1)).toBe(-1); // a condition is not a number
    expect(expressionNumber('nope', resolve, -1)).toBe(-1);
    expect(expressionNumber(null, resolve, -1)).toBe(-1);
  });

  test('a condition holds unless it is written down and false', () => {
    expect(expressionCondition('x < y', resolve)).toBe(true);
    expect(expressionCondition('x > y', resolve)).toBe(false);
    expect(expressionCondition('x + 1', resolve)).toBe(true); // 4 is truthy
    expect(expressionCondition('broken(', resolve)).toBe(true);
    expect(expressionCondition(undefined, resolve)).toBe(true);
  });
});

// what the validator reports in edit mode, since a broken expression is
// ignored rather than complained about while dragging
describe('the syntax check', () => {
  test('passes anything that can be read, whatever it reads', () => {
    expect(expressionError('2x^2 + y > 4')).toBe(null);
    expect(expressionError('${PROPERTY seats OF board} * 100')).toBe(null);
    expect(expressionError('whatever + 1')).toBe(null); // a property, not a typo
    expect(expressionError('x / (y - 1) + 1')).toBe(null); // what it computes is not its business
  });

  test('names what cannot be read', () => {
    expect(expressionError('2x^^2 > 4')).toEqual(expect.any(String));
    expect(expressionError('0 < x < 500')).toEqual(expect.any(String));
    expect(expressionError('(0 < x) < 500')).toEqual(expect.any(String));
    expect(expressionError('2^2x')).toEqual(expect.any(String));
    expect(expressionError('(x + 1')).toEqual(expect.any(String));
    expect(expressionError('')).toEqual(expect.any(String));
  });
});

// what the editor's drawing asks: which of the names an expression reads are
// the caller's to answer, so it can tell a side that varies with the position
// from one that does not and redraw when a property it reads changes
describe('the names an expression reads', () => {
  test('are the ones the caller resolves', () => {
    expect(expressionNames('2x^2 + y > 4')).toEqual([ { name: 'x', widget: null }, { name: 'y', widget: null } ]);
    expect(expressionNames('${PROPERTY edge OF board} - limitWidth')).toEqual([
      { name: 'edge', widget: 'board' }, { name: 'limitWidth', widget: null }
    ]);
  });

  test('leave out what the language answers itself', () => {
    expect(expressionNames('sqrt(x) + 2PI')).toEqual([ { name: 'x', widget: null } ]);
    // a property called sqrt is still a property when it is not called
    expect(expressionNames('sqrt + 1')).toEqual([ { name: 'sqrt', widget: null } ]);
  });

  test('are read off the words, so half written text still answers', () => {
    // reporting a name too many only costs a redraw, so text that does not
    // parse (yet) still says what it reads
    expect(expressionNames('2x^^2 > 4')).toEqual([ { name: 'x', widget: null } ]);
    expect(expressionNames('x @ 1')).toEqual([]); // nothing that can even be read as words
    expect(expressionNames(400)).toEqual([]);
    expect(expressionNames(null)).toEqual([]);
  });
});
