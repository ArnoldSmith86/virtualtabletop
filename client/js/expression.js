// The small algebraic expression language widget properties use where a fixed
// number is not enough - most of all dragLimit, which describes the area a
// widget can be dragged in with inequalities like "2x^2 + y > 4".
//
// An expression is ordinary infix maths: numbers, + - * / % ^, parentheses,
// comparisons (< <= > >= == === != !==), logic (&& || !), the functions and
// constants "var" has, and names. A name is resolved by the caller: a bare word
// (for dragLimit, x and y - the position being tested) and ${PROPERTY name} /
// ${PROPERTY name OF widgetID}, the same reference routines use, which is the
// only way to read a widget property here as well. A number directly in front
// of a name or a bracket multiplies, so "2x" and "3(x+1)" mean what they look
// like.
//
// Nothing here reads the room state or the DOM: it evaluates what the resolve
// callback answers, which is what makes it testable and safe to run on every
// mouse move.

// The names are the numeric ones "var" has (compute.js): same spelling, same
// meaning - angles in degrees most of all - so a formula can be moved between a
// routine and a condition without quietly computing something else.
// tests/client/expression.test.js holds every one of them against compute_ops,
// so the two languages cannot drift apart. Left out of that list is what an
// area cannot use: "random" and the two randInt/randRange (an area that is not
// the same twice can neither be slid along nor drawn) and everything that is
// about strings, arrays or colours rather than numbers.
//
// Object.create(null) rather than a plain literal: a literal also answers for
// inherited keys, so "constructor" would be a function and a widget property
// named "toString" could never be read.
const perDegree = Math.PI/180;
const functions = Object.assign(Object.create(null), {
  abs: Math.abs, acos: x=>Math.acos(x)/perDegree, asin: x=>Math.asin(x)/perDegree,
  atan: x=>Math.atan(x)/perDegree, atan2: (y, x)=>Math.atan2(y, x)/perDegree, cbrt: Math.cbrt,
  ceil: Math.ceil, cos: x=>Math.cos(x*perDegree), exp: Math.exp, floor: Math.floor,
  hypot: Math.hypot, log: Math.log, log10: Math.log10, log2: Math.log2, max: Math.max,
  min: Math.min, pow: Math.pow, round: Math.round, sign: Math.sign, sin: x=>Math.sin(x*perDegree),
  sqrt: Math.sqrt, tan: x=>Math.tan(x*perDegree), trunc: Math.trunc
});

// The bare words a dragLimit expression answers itself: the position being
// tested. Everything else is a widget property and is written the way routines
// write one, so the engine, the sidebar and the validator have to agree on this
// one list - a bare word outside it is a mistake rather than a property.
export const dragLimitNames = [ 'x', 'y' ];

const constants = Object.assign(Object.create(null), {
  E: Math.E, LN10: Math.LN10, LN2: Math.LN2, LOG10E: Math.LOG10E, LOG2E: Math.LOG2E,
  PI: Math.PI, SQRT1_2: Math.SQRT1_2, SQRT2: Math.SQRT2
});

// ${PROPERTY name} and ${PROPERTY name OF widget} come first so their contents
// are not read as operators; the rest is numbers, names and operator symbols.
// The sticky flag makes every match start where the last one ended, so nothing
// in between can be skipped silently - hence a fresh regex per call.
const tokenSource = '\\s*(?:\\$\\{\\s*PROPERTY\\s+([^}]+?)\\s*\\}|([0-9]*\\.[0-9]+|[0-9]+)|([A-Za-z_][A-Za-z0-9_]*)|(&&|\\|\\||[=!]==|[<>=!]=|\\*\\*|[-+*/%^()<>!,]))';

// A drag evaluates the same handful of strings on every mouse move, so what
// they tokenize to is kept - including the error of one that cannot be read, so
// a broken expression costs no more than a working one.
const tokenCache = new Map();

function tokenize(text) {
  if(!tokenCache.has(text)) {
    if(tokenCache.size > 1000)
      tokenCache.clear();
    try {
      tokenCache.set(text, tokenizeText(text));
    } catch(e) {
      tokenCache.set(text, e);
    }
  }
  const tokens = tokenCache.get(text);
  if(tokens instanceof Error)
    throw tokens;
  return tokens;
}

function tokenizeText(text) {
  const tokens = [];
  const tokenPattern = new RegExp(tokenSource, 'y');
  while(tokenPattern.lastIndex < text.length) {
    const start = tokenPattern.lastIndex;
    const match = tokenPattern.exec(text);
    if(!match) {
      // trailing whitespace is not a problem, anything else is
      if(text.substr(start).trim() === '')
        break;
      throw new Error(`cannot read "${text.substr(start).trim()}"`);
    }
    if(match[1] !== undefined) {
      // explicit: written as ${PROPERTY ...}, so it is a widget property even
      // when it is spelled like one of the caller's own names ("${PROPERTY x}"
      // is the widget's x property, "x" the position being tested)
      const reference = match[1].split(/\s+OF\s+/);
      tokens.push({ type: 'name', value: reference[0].trim(), widget: reference.length > 1 ? reference[1].trim() : null, explicit: true });
    } else if(match[2] !== undefined) {
      tokens.push({ type: 'number', value: +match[2] });
    } else if(match[3] !== undefined) {
      tokens.push({ type: 'name', value: match[3], widget: null, explicit: false });
    } else {
      tokens.push({ type: 'operator', value: match[4] == '**' ? '^' : match[4] });
    }
  }
  return tokens;
}

// Evaluates text, asking resolve(name, widgetID, explicit) for every name in
// it. Throws on anything it cannot read or on a name that does not answer with
// a number, so a caller can decide what a broken expression should mean.
// freeNames lists the bare words the caller answers ("x", "y" for dragLimit);
// given one, any other bare word is a mistake rather than a name, and saying so
// is what points at ${PROPERTY ...} for reading a widget property.
export function evaluateExpression(text, resolve, freeNames = null) {
  const tokens = tokenize(String(text));
  let position = 0;

  const peek = _=>tokens[position];
  const isOperator = (...values)=>peek() && peek().type == 'operator' && values.indexOf(peek().value) != -1;
  const take = _=>tokens[position++];
  const expect = value=>{
    if(!isOperator(value))
      throw new Error(`expected "${value}"`);
    ++position;
  };

  // The right side of && / || is parsed but not read once the left side has
  // decided the result, so "${PROPERTY x OF gone} != 0 && x < 5" can guard
  // itself instead of the missing widget disabling the whole condition. While
  // skipping, a name answers with 0 and nothing but a syntax error throws.
  let skipping = 0;
  const skipped = (skip, parse)=>{
    if(!skip)
      return parse();
    ++skipping;
    try {
      return parse();
    } finally {
      --skipping;
    }
  };

  const number = value=>{
    const asNumber = typeof value == 'string' && value.trim() !== '' ? +value : value;
    if(typeof asNumber != 'number' || !isFinite(asNumber)) {
      if(skipping)
        return 0;
      // marked so the syntax check can tell "this property does not answer with
      // a number" (not its business) from "this cannot be read" (its business)
      throw Object.assign(new Error(`"${value}" is not a number`), { isValueError: true });
    }
    return asNumber;
  };

  function parsePrimary() {
    if(isOperator('(')) {
      ++position;
      const value = parseOr();
      expect(')');
      return value;
    }
    const token = take();
    if(!token)
      throw new Error('expression ends early');
    if(token.type == 'number')
      return token.value;
    if(token.type != 'name')
      throw new Error(`unexpected "${token.value}"`);

    // a name directly in front of a bracket is a function call, everything
    // else is a value the caller resolves
    if(!token.explicit && functions[token.value] && isOperator('(')) {
      ++position;
      const args = [];
      if(!isOperator(')')) {
        args.push(number(parseOr()));
        while(isOperator(',')) {
          ++position;
          args.push(number(parseOr()));
        }
      }
      expect(')');
      return functions[token.value](...args);
    }
    if(!token.explicit && constants[token.value] !== undefined)
      return constants[token.value];
    // "width" reads like a property but is none: every property is written the
    // way routines write it, so the two languages agree on what a name is
    if(!token.explicit && freeNames && freeNames.indexOf(token.value) == -1)
      throw new Error(`"${token.value}" is not a name here - write "\${PROPERTY ${token.value}}" for a property of this widget, "\${PROPERTY ${token.value} OF someID}" for another widget's`);
    return number(skipping ? 0 : resolve(token.value, token.widget, token.explicit));
  }

  // right associative, and binding tighter than a unary minus so -x^2 is -(x^2)
  function parsePower() {
    const base = parsePrimary();
    if(isOperator('^')) {
      ++position;
      const exponent = number(parseUnary());
      // "2^2x" is written to mean 2^(2x) and would be read as (2^2)*x by the
      // implicit multiplication below - so it is refused rather than quietly
      // meaning one of the two. "2x^2" is unambiguous and stays 2*(x^2).
      if(peek() && (peek().type == 'name' || isOperator('(')))
        throw new Error(`"${peek().value}" directly after an exponent is ambiguous - write "2^(2x)" or "(2^2)x"`);
      return Math.pow(number(base), exponent);
    }
    return base;
  }

  function parseUnary() {
    if(isOperator('-')) {
      ++position;
      return -number(parseUnary());
    }
    if(isOperator('+')) {
      ++position;
      return number(parseUnary());
    }
    if(isOperator('!')) {
      ++position;
      return !parseUnary();
    }
    return parsePower();
  }

  function parseProduct() {
    let value = parseUnary();
    while(true) {
      if(isOperator('*', '/', '%')) {
        const operator = take().value;
        const right = number(parseUnary());
        value = operator == '*' ? number(value) * right : operator == '/' ? number(value) / right : number(value) % right;
      } else if(tokens[position-1] && tokens[position-1].type == 'number' && peek() && (peek().type == 'name' || isOperator('('))) {
        // implicit multiplication: 2x, 3(x+1), 2PI - only ever a number in
        // front of a name or a bracket, so the stray space in "2 3x" is a
        // reported error instead of quietly meaning 6x
        value = number(value) * number(parseUnary());
      } else {
        return value;
      }
    }
  }

  function parseSum() {
    let value = parseProduct();
    while(isOperator('+', '-')) {
      const operator = take().value;
      const right = number(parseProduct());
      value = operator == '+' ? number(value) + right : number(value) - right;
    }
    return value;
  }

  // Not chainable: "0 < x < 500" would otherwise read as "(0 < x) < 500", i.e.
  // "true < 500", which is true wherever the widget is - a limit that silently
  // does nothing. Saying so is the only way the author finds out.
  const comparisons = [ '<', '<=', '>', '>=', '==', '===', '!=', '!==' ];
  const equalities = [ '==', '===', '!=', '!==' ];
  function parseComparison() {
    const value = parseSum();
    if(!isOperator(...comparisons))
      return value;
    const operator = take().value;
    const right = parseSum();
    if(isOperator(...comparisons))
      throw new Error(`"${peek().value}" cannot follow "${operator}" - write "a > 0 && a < 500" instead of "0 < a < 500"`);
    // and brackets are no way around it: "(0 < x) < 500" is the same always
    // true limit. Comparing what is already true or false is only allowed
    // against the same kind, "(x > 0) == (y > 0)".
    if(typeof value == 'boolean' || typeof right == 'boolean')
      if(typeof value != typeof right || equalities.indexOf(operator) == -1)
        throw new Error(`"${operator}" cannot compare true or false with a number - write "a > 0 && a < 500" instead of "(0 < a) < 500"`);
    return operator == '<' ? value < right
         : operator == '<=' ? value <= right
         : operator == '>' ? value > right
         : operator == '>=' ? value >= right
         : operator == '==' ? value == right
         : operator == '===' ? value === right
         : operator == '!=' ? value != right
         : value !== right;
  }

  function parseAnd() {
    let value = parseComparison();
    while(isOperator('&&')) {
      ++position;
      const right = skipped(!value, parseComparison);
      value = !!value && !!right;
    }
    return value;
  }

  function parseOr() {
    let value = parseAnd();
    while(isOperator('||')) {
      ++position;
      const right = skipped(!!value, parseAnd);
      value = !!value || !!right;
    }
    return value;
  }

  if(!tokens.length)
    throw new Error('empty expression');
  const result = parseOr();
  if(position < tokens.length)
    throw new Error(`unexpected "${tokens[position].value}"`);
  return result;
}

// The two shapes a property asks for: a number (a limit, a coordinate) and a
// condition (an inequality). Both answer with the fallback rather than throwing,
// because a mistyped expression must not break dragging a widget.
export function expressionNumber(text, resolve, fallback = null) {
  if(typeof text == 'number')
    return text;
  if(typeof text != 'string')
    return fallback;
  try {
    const value = evaluateExpression(text, resolve);
    return typeof value == 'number' && isFinite(value) ? value : fallback;
  } catch(e) {
    return fallback;
  }
}

// What the validator asks: is this written down correctly? Every name answers
// with 1 and what a value turns out to be is none of its business, so only the
// syntax is judged - a property that does not exist yet is not an error here,
// but "2x^^2 > 4" or "0 < x < 500" are, and they are reported in edit mode
// instead of quietly limiting nothing. With freeNames given, a bare word that
// is not one of them is judged too: the engine would read it as nothing.
// requireCondition asks for the third member of that family: what an expression
// answers with is a number or a true/false, and which of the two it is does not
// depend on any value - so a condition written as maths rather than as an
// inequality ("x - 100", a plausible slip while a shape is being written down
// as an equation) is caught here as well, instead of reading as true at every
// position but the single line it is 0 on.
export function expressionError(text, freeNames = null, requireCondition = false) {
  let value;
  try {
    value = evaluateExpression(text, _=>1, freeNames);
  } catch(e) {
    return e.isValueError ? null : e.message;
  }
  if(requireCondition && typeof value != 'boolean')
    return 'a condition has to be a comparison like "x < 500" - this one is a number, so it is true wherever it is not 0';
  return null;
}

// Which names an expression reads: the ones the caller resolves, so the
// functions and constants the language answers itself are left out. The
// editor's drag limit preview asks this to tell a side that varies with the
// position being tested from one that is the same everywhere, and to redraw
// when a property one of them reads changes. Read off the words rather than the
// parsed expression, so half typed text still says what it reads: a name too
// many only costs a redraw, one too few would show an area that is no longer
// there.
export function expressionNames(text) {
  if(typeof text != 'string')
    return [];
  let tokens = [];
  try {
    tokens = tokenize(text);
  } catch(e) {
    return [];
  }
  const isCall = token=>token && token.type == 'operator' && token.value == '(';
  return tokens
    .filter((token, index)=>token.type == 'name' && !(!token.explicit
      && (constants[token.value] !== undefined || (functions[token.value] && isCall(tokens[index+1])))))
    .map(token=>({ name: token.value, widget: token.widget, explicit: !!token.explicit }));
}

export function expressionCondition(text, resolve, fallback = true) {
  if(typeof text == 'boolean')
    return text;
  if(typeof text != 'string')
    return fallback;
  try {
    return !!evaluateExpression(text, resolve);
  } catch(e) {
    return fallback;
  }
}
