// Walks a stylesheet and names every web feature it uses as a path into @mdn/browser-compat-data:
// at-rules, media features, selectors, properties, keyword values, value functions and units.
// It is a scanner, not a parser - it knows about braces, strings and comments and nothing else,
// which is all it takes to find the constructs whose browser support we want to know about.
//
// A vendor prefixed name (-webkit-mask-image, ::-moz-range-thumb) is never reported: it is
// already the fallback, and the browsers it is not meant for ignore it. It does count as one,
// though - an unprefixed property declared in the same rule as its prefixed spelling is fine.

const vendorPrefix = /^-(webkit|moz|ms|o|epub|khtml)-/;

// units bcd does not list one by one
const unitGroups = {
  dvh: 'viewport_percentage_units_dynamic', dvw: 'viewport_percentage_units_dynamic',
  dvi: 'viewport_percentage_units_dynamic', dvb: 'viewport_percentage_units_dynamic',
  dvmin: 'viewport_percentage_units_dynamic', dvmax: 'viewport_percentage_units_dynamic',
  lvh: 'viewport_percentage_units_large', lvw: 'viewport_percentage_units_large',
  lvi: 'viewport_percentage_units_large', lvb: 'viewport_percentage_units_large',
  lvmin: 'viewport_percentage_units_large', lvmax: 'viewport_percentage_units_large',
  svh: 'viewport_percentage_units_small', svw: 'viewport_percentage_units_small',
  svi: 'viewport_percentage_units_small', svb: 'viewport_percentage_units_small',
  svmin: 'viewport_percentage_units_small', svmax: 'viewport_percentage_units_small',
  cqw: 'container_query_length_units', cqh: 'container_query_length_units',
  cqi: 'container_query_length_units', cqb: 'container_query_length_units',
  cqmin: 'container_query_length_units', cqmax: 'container_query_length_units'
};

// a value with its strings and url()s taken out, so that neither can be mistaken for syntax
function bareValue(value) {
  return value.replace(/"[^"]*"|'[^']*'|url\([^)]*\)/g, ' ');
}

// Every bcd path a declaration uses: the property, its keyword values, the functions and the
// units in the value. The same list is built for a declaration and for the "property: value"
// pair an @supports condition asks about, which is what makes the two comparable.
function declarationFeatures(property, value) {
  const paths = [ `css.properties.${property}` ];
  for(const keyword of new Set(value.match(/[a-zA-Z][\w-]*/g) || []))
    paths.push(`css.properties.${property}.${keyword.toLowerCase()}`);
  for(const fn of new Set(value.match(/([\w-]+)\(/g) || [])) {
    const name = fn.slice(0, -1).toLowerCase();
    if(!vendorPrefix.test(name))
      paths.push(`css.types.${name}`, `css.types.color.${name}`, `css.types.image.${name}`);
  }
  for(const unit of new Set(value.match(/\d\s*[a-z]+/g) || [])) {
    const name = unit.replace(/^\d\s*/, '');
    paths.push(`css.types.length.${unitGroups[name] || name}`);
  }
  return paths;
}

// What the @supports conditions around a declaration actually test - a condition only excuses
// the very feature it asks about, so "@supports (width: 1px)" says nothing about fit-content.
// A negated condition (@supports not (...)) says the opposite and is skipped.
const conditionPattern = /\(\s*(-?[a-zA-Z][\w-]*)\s*:\s*((?:[^()]|\([^()]*\))*)\)/g;
function supportsFeatures(prelude) {
  const paths = new Set();
  for(const match of prelude.matchAll(conditionPattern)) {
    if(/\bnot\s*\(?\s*$/i.test(prelude.slice(0, match.index)))
      continue;
    for(const path of declarationFeatures(match[1].toLowerCase(), bareValue(match[2])))
      paths.add(path);
  }
  return paths;
}

export function scanCSS(text, { startLine = 1 } = {}) {
  const found = [];
  const stack = [];
  let buffer = '', bufferLine = startLine, line = startLine, i = 0, blocks = 0;

  const add = (feature, source, at, guardedBy) => found.push({ line: at, feature, source, guardedBy });

  const openBlock = prelude => {
    const at = prelude.match(/^@([\w-]+)/);
    if(at) {
      if(!vendorPrefix.test(at[1]))
        add(`css.at-rules.${at[1]}`, prelude, bufferLine);
      if(at[1] == 'media' || at[1] == 'container')
        scanConditions(at[1], prelude, bufferLine, add);
      stack.push({ id: ++blocks, atRule: at[1], prelude, declarations: [] });
    } else {
      for(const pseudo of new Set(prelude.match(/::?[\w-]+/g) || [])) {
        const name = pseudo.replace(/^::?/, '');
        if(!vendorPrefix.test(name))
          add(`css.selectors.${name}`, prelude.replace(/\s+/g, ' ').trim(), bufferLine);
      }
      stack.push({ id: ++blocks, atRule: null, prelude, declarations: [] });
    }
  };

  const declaration = declaration => {
    const block = stack[stack.length-1];
    if(!block || /^@/.test(declaration))
      return;
    const colon = declaration.indexOf(':');
    if(colon < 0)
      return;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    if(!/^-?[a-z][\w-]*$/.test(property) || property.startsWith('--'))
      return;
    block.declarations.push({
      property,
      value: bareValue(declaration.slice(colon+1)).trim(),
      line: bufferLine,
      id: `${block.id}:${block.declarations.length}`,
      // where in the rule it stands: the browser keeps the last declaration it understands
      order: block.declarations.length,
      // declaring the same property twice is the fallback the language has built in: the
      // browser keeps the last declaration it understands. The vendor prefixed spelling of a
      // property is the same thing under a different name, so it belongs to the same group.
      group: `${block.id}:${property.replace(vendorPrefix, '')}`,
      // and the other way of asking first
      supports: stack.filter(open => open.atRule == 'supports').map(open => open.prelude).join(' ')
    });
  };

  const closeBlock = () => {
    const block = stack.pop();
    if(!block)
      return;
    for(const { property, value, line, id, order, group, supports } of block.declarations) {
      const source = `${property}: ${value}`;
      // A declaration is only ever excused by the others in its group, so every one of them has
      // to be on record - even a vendor prefixed one, which is never reported itself. The same
      // goes for a prefixed spelling in the value (width: -moz-fit-content): bcd has no keyword
      // by that name, so "nothing missing" there means "nothing looked up", not "safe".
      found.push({ line, source, declaration: id, group, property, order,
        prefixedValue: /(^|[\s,(])-[a-z]+-[a-z]/.test(value) });
      if(vendorPrefix.test(property))
        continue;
      const guards = supportsFeatures(supports);
      for(const path of declarationFeatures(property, value))
        found.push({
          line, source, feature: path, declaration: id, group, property, order,
          guardedBy: guards.has(path) ? 'the @supports condition around it' : undefined
        });
    }
  };

  while(i < text.length) {
    const c = text[i];
    if(c == '/' && text[i+1] == '*') {
      const end = text.indexOf('*/', i+2);
      const comment = text.slice(i, end < 0 ? text.length : end+2);
      line += (comment.match(/\n/g) || []).length;
      i += comment.length;
      continue;
    }
    if(c == '"' || c == "'") {
      const string = text.slice(i).match(new RegExp(`^${c}(\\\\[\\s\\S]|[^\\\\${c}])*${c}?`))[0];
      line += (string.match(/\n/g) || []).length;
      buffer += string;
      i += string.length;
      continue;
    }
    if(!buffer.trim())
      bufferLine = line;
    if(c == '{') {
      openBlock(buffer.trim());
      buffer = '';
    } else if(c == '}') {
      declaration(buffer.trim());  // the last declaration of a rule may leave out its semicolon
      closeBlock();
      buffer = '';
    } else if(c == ';') {
      declaration(buffer.trim());
      buffer = '';
    } else {
      buffer += c;
    }
    if(c == '\n')
      line++;
    i++;
  }
  return found;
}

// @media (min-width: 600px) and (hover: hover), @container roomArea (max-width: 600px)
function scanConditions(atRule, prelude, line, add) {
  for(const condition of new Set(prelude.match(/\(\s*(?:min-|max-)?[\w-]+\s*[:)]/g) || [])) {
    const name = condition.replace(/^\(\s*|\s*[:)]$/g, '').replace(/^(min|max)-/, '');
    if(vendorPrefix.test(name))
      continue;
    add(`css.at-rules.media.${name}`, prelude, line);
    if(atRule == 'container')
      add(`css.at-rules.container.${name}`, prelude, line);
  }
  if(/\(\s*[\w-]+\s*[<>]=?/.test(prelude) || /[<>]=?\s*[\w.]+\s*\)/.test(prelude))
    add('css.at-rules.media.range_syntax', prelude, line);
}
