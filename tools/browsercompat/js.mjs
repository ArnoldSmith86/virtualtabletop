// The same idea as css.mjs for client side JavaScript: name the web platform features a file
// uses as paths into @mdn/browser-compat-data. Comments, strings, template literals and regular
// expressions are blanked out first so that only code is looked at.
//
// What it can check is what can be resolved without knowing any types: names that come from the
// browser rather than from us, members of the handful of objects the browser puts a name on,
// static members of the built in objects, and syntax. A member of anything else - foo.at(),
// bar.replaceChildren() - is not checked, because nothing here knows what foo and bar are and
// guessing produces far more wrong answers than right ones.

// the built in objects whose static members can be resolved by their name alone
const namespaces = [
  'Array', 'ArrayBuffer', 'Atomics', 'BigInt', 'Boolean', 'DataView', 'Date', 'Error',
  'Function', 'Intl', 'JSON', 'Map', 'Math', 'Number', 'Object', 'Promise', 'Proxy',
  'Reflect', 'RegExp', 'Set', 'String', 'Symbol', 'WeakMap', 'WeakSet'
];

// the objects the browser itself puts on the global scope, and the interface each one is an
// instance of - navigator.share, document.fullscreenElement, screen.orientation
const globalObjects = {
  caches: 'CacheStorage',
  console: 'console',
  crypto: 'Crypto',
  document: 'Document',
  history: 'History',
  indexedDB: 'IDBFactory',
  localStorage: 'Storage',
  location: 'Location',
  navigator: 'Navigator',
  performance: 'Performance',
  screen: 'Screen',
  sessionStorage: 'Storage',
  speechSynthesis: 'SpeechSynthesis',
  visualViewport: 'VisualViewport'
};

const syntax = [
  { pattern: /\?\./, path: 'javascript.operators.optional_chaining' },
  { pattern: /\?\?=/, path: 'javascript.operators.nullish_coalescing_assignment' },
  { pattern: /\?\?[^=]/, path: 'javascript.operators.nullish_coalescing' },
  { pattern: /\|\|=/, path: 'javascript.operators.logical_or_assignment' },
  { pattern: /&&=/, path: 'javascript.operators.logical_and_assignment' },
  { pattern: /(^|[^\w$.])#[A-Za-z_$][\w$]*/, path: 'javascript.classes.private_class_fields' },
  { pattern: /\bfor\s+await\b/, path: 'javascript.statements.for_await_of' },
  { pattern: /\bstatic\s*{/, path: 'javascript.classes.static_initialization_blocks' },
  { pattern: /\bcatch\s*{/, path: 'javascript.statements.try_catch.optional_catch_binding' },
  { pattern: /\.{3}[A-Za-z_$[{]/, path: 'javascript.operators.spread' },
  { pattern: /\bimport\s*\(/, path: 'javascript.statements.import.dynamic_import' }
];

// How far a regular expression literal at the start of this text reaches, or null if it turns
// out not to be one. Written by hand rather than as a pattern: a regular expression that matches
// regular expression literals needs an alternation inside a repetition (an escape, a character
// class, an ordinary character), and that is the shape that takes exponential time to fail on
// input built to make it - which CodeQL rightly complains about.
function regexLiteral(text) {
  let inClass = false;
  for(let i=1; i<text.length; ++i) {
    if(text[i] == '\n')
      return null;
    if(text[i] == '\\')
      ++i;
    else if(inClass)
      inClass = text[i] != ']';
    else if(text[i] == '[')
      inClass = true;
    else if(text[i] == '/') {
      let end = i+1;
      while(end < text.length && /[a-z]/.test(text[end]))
        ++end;
      return text.slice(0, end);
    }
  }
  return null;
}

// Blanking keeps the length and the line breaks of what it removes, so every index into the
// result still points at the same place in the original file.
export function blankNonCode(text) {
  let out = '', i = 0, previous = '';
  const blank = string => string.replace(/[^\n]/g, ' ');
  const canBeRegex = () => !/[\w$)\]]$/.test(previous);
  while(i < text.length) {
    const rest = text.slice(i);
    let match = null;
    if(rest.startsWith('//'))
      match = rest.match(/^\/\/[^\n]*/)[0];
    else if(rest.startsWith('/*'))
      match = rest.match(/^\/\*[\s\S]*?(\*\/|$)/)[0];
    else if(rest[0] == '"' || rest[0] == "'" || rest[0] == '`')
      match = rest.match(new RegExp(`^${rest[0]}(\\\\[\\s\\S]|[^\\\\${rest[0]}])*(${rest[0]}|$)`))[0];
    else if(rest[0] == '/' && canBeRegex())
      match = regexLiteral(rest);
    if(match) {
      out += blank(match);
      i += match.length;
      continue;
    }
    out += text[i];
    if(/\S/.test(text[i]))
      previous = text[i];
    ++i;
  }
  return out;
}

// Names the file gives to something of its own are not the browser's, however much they look
// like it - a parameter called history is not window.history.
function locallyDeclared(code) {
  const names = new Set();
  for(const match of code.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g))
    names.add(match[1]);
  for(const match of code.matchAll(/(?:\bfunction\b[\w$\s]*|\bcatch\s*|(?=\([^()]*\)\s*=>))\(([^()]*)\)/g))
    for(const parameter of match[1].match(/[A-Za-z_$][\w$]*/g) || [])
      names.add(parameter);
  for(const match of code.matchAll(/(^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/g))
    names.add(match[2]);
  return names;
}

function lineIndex(text) {
  const starts = [ 0 ];
  for(let i=0; i<text.length; ++i)
    if(text[i] == '\n')
      starts.push(i+1);
  return offset => {
    let low = 0, high = starts.length-1;
    while(low < high) {
      const mid = (low+high+1) >> 1;
      if(starts[mid] <= offset)
        low = mid;
      else
        high = mid-1;
    }
    return low;
  };
}

export function scanJS(text, { startLine = 1, globalPath = () => null } = {}) {
  const code = blankNonCode(text);
  const lineOf = lineIndex(code);
  const local = locallyDeclared(code);
  const found = [];
  const sourceAt = offset => {
    const end = code.indexOf('\n', offset);
    return text.slice(code.lastIndexOf('\n', offset)+1, end < 0 ? text.length : end).trim();
  };
  const add = (feature, offset) => found.push({ feature, line: startLine + lineOf(offset), source: sourceAt(offset) });

  for(const match of code.matchAll(/(^|[^\w$.])([A-Za-z_$][\w$]*)\s*\??\.\s*([A-Za-z_$][\w$]*)/g)) {
    const offset = match.index + match[1].length;
    if(local.has(match[2]))
      continue;
    if(namespaces.includes(match[2]))
      add(`javascript.builtins.${match[2]}.${match[3]}`, offset);
    else if(globalObjects[match[2]])
      add(`api.${globalObjects[match[2]]}.${match[3]}`, offset);
    else if(match[2] == 'window')
      add(globalPath(match[3]) || `api.Window.${match[3]}`, offset);
  }

  for(const match of code.matchAll(/(^|[^\w$.])([A-Za-z_$][\w$]*)/g))
    if(!local.has(match[2]) && globalPath(match[2]))
      add(globalPath(match[2]), match.index + match[1].length);

  for(const { pattern, path } of syntax)
    for(const match of code.matchAll(new RegExp(pattern.source, 'g')))
      add(path, match.index);

  return found;
}
