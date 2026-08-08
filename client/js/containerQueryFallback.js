// Chromium only learned @container in 105, and the Android WebView on a device that stopped
// getting updates is regularly older than that. An unknown at-rule is dropped together with
// everything inside it, so on those browsers every responsive layout in the overlays is gone -
// they are all container queries on the board (#roomArea) since they stopped being media
// queries. The game shelf then lays itself out as if the board were a desktop one: ten columns
// of 30px tiles with the game names spilling across them, and the wrong element scrolling.
//
// This is a stand-in for exactly those browsers. The at-rules are still in the text of the
// inlined <style> - only the parsed CSSOM has thrown them away - so they can be read back: the
// stylesheet is replaced by its own pieces, one <style> per @container block and one for the
// rules around it, and the blocks are then enabled and disabled from the container's measured
// size. Splitting in place rather than appending the blocks at the end keeps every rule's
// specificity and its position in the cascade. What the copies lose is being scoped to the
// container's subtree, which only matters for the one block whose selectors don't name the
// overlay they belong to.
//
// A browser that has container queries never runs a line of this.

// Only the features the stylesheets actually query. Anything else evaluates to false, which
// leaves the browser with the layout it has without the fallback.
function evaluateFeature(feature, size) {
  const parsed = /^\s*([-\w]+)\s*:\s*(.+?)\s*$/.exec(feature);
  if(!parsed)
    return false;

  const length = /^(-?[\d.]+)px$/.exec(parsed[2]);
  const value = length ? parseFloat(length[1]) : NaN;

  switch(parsed[1].toLowerCase()) {
    case 'width':       return size.width  == value;
    case 'height':      return size.height == value;
    case 'min-width':   return size.width  >= value;
    case 'max-width':   return size.width  <= value;
    case 'min-height':  return size.height >= value;
    case 'max-height':  return size.height <= value;
    case 'orientation': return parsed[2] == 'portrait' ? size.height >= size.width : parsed[2] == 'landscape' && size.width > size.height;
  }
  return false;
}

// index is read and advanced in place so the two functions can recurse into each other
function evaluateTerm(condition, index, size) {
  while(index.at < condition.length && /\s/.test(condition[index.at]))
    index.at++;

  if(condition[index.at] != '(')
    return false;

  const start = ++index.at;
  for(let depth = 0; index.at < condition.length; index.at++) {
    if(condition[index.at] == '(')
      depth++;
    else if(condition[index.at] == ')' && depth-- == 0)
      break;
  }
  const inner = condition.slice(start, index.at++);

  // a query like (max-width: 600px) as opposed to a parenthesized ((...) or (...))
  return /^\s*[-\w]+\s*:/.test(inner) ? evaluateFeature(inner, size) : evaluateCondition(inner, size);
}

/**
 * Evaluates a container query condition against a container's content box size. CSS does not
 * allow and/or to be mixed without parentheses, so combining left to right is enough.
 *
 * @param {string} condition - e.g. '((max-width: 600px) or (max-height: 375px))'
 * @param {Object} size - { width, height } in pixels
 * @returns {boolean}
 */
export function evaluateCondition(condition, size) {
  const index = { at: 0 };
  let result = evaluateTerm(condition, index, size);

  while(index.at < condition.length) {
    const operator = /^\s*(and|or)\b/.exec(condition.slice(index.at));
    if(!operator)
      break;
    index.at += operator[0].length;
    const operand = evaluateTerm(condition, index, size);
    result = operator[1] == 'and' ? result && operand : result || operand;
  }
  return result;
}

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0, start = 0;
  for(let i = 0; i < text.length; i++) {
    if(text[i] == '(')
      depth++;
    else if(text[i] == ')')
      depth--;
    else if(text[i] == separator && !depth) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function endOfBlock(cssText, braceIndex) {
  for(let i = braceIndex, depth = 0; i < cssText.length; i++) {
    if(cssText[i] == '{')
      depth++;
    else if(cssText[i] == '}' && !--depth)
      return i;
  }
  return cssText.length;
}

/**
 * Reads the @container rules out of a stylesheet's source text, together with the elements
 * that declare themselves as containers. A query without a container name is skipped: without
 * the parsed at-rules there is no way to tell which container it would resolve to.
 *
 * @param {string} cssText
 * @returns {Object} { containers: [ { name, selector } ],
 *   blocks: [ { start, end, css, queries: [ { name, condition } ] } ] } - start and end delimit
 *   the whole at-rule in cssText, css is what it holds
 */
export function parseContainerQueries(cssText) {
  const containers = [];
  const containerDeclaration = /(?:^|[;{\s])container(?:-name)?\s*:\s*([-\w]+)/g;
  let declaration;
  while((declaration = containerDeclaration.exec(cssText)) !== null) {
    const blockStart = cssText.lastIndexOf('{', declaration.index);
    const selectorStart = Math.max(cssText.lastIndexOf('}', blockStart), cssText.lastIndexOf('{', blockStart - 1), cssText.lastIndexOf(';', blockStart));
    const selector = cssText.slice(selectorStart + 1, blockStart).trim();
    if(blockStart != -1 && selector && selector[0] != '@')
      containers.push({ name: declaration[1], selector });
  }

  const blocks = [];
  for(let index = 0, depth = 0; index < cssText.length; index++) {
    if(cssText[index] == '{') {
      depth++;
      continue;
    }
    if(cssText[index] == '}') {
      depth--;
      continue;
    }
    // an @container nested inside another at-rule is left where it is: the sheet is split along
    // the block's boundaries, which would cut the rule around it in half
    if(depth || cssText[index] != '@' || !cssText.startsWith('@container', index))
      continue;

    const braceIndex = cssText.indexOf('{', index);
    if(braceIndex == -1)
      break;
    const end = endOfBlock(cssText, braceIndex);
    const queries = [];

    for(const query of splitTopLevel(cssText.slice(index + '@container'.length, braceIndex), ',')) {
      const named = /^\s*([-\w]+)\s*(\([\s\S]*)$/.exec(query);
      if(named)
        queries.push({ name: named[1], condition: named[2].trim() });
    }
    if(queries.length)
      blocks.push({ start: index, end: end + 1, css: cssText.slice(braceIndex + 1, end), queries });
    index = end;  // the loop's index++ then moves past the closing brace
  }

  return { containers, blocks };
}

// getComputedStyle resolves width and height to the used content box size, which is what a
// container query is evaluated against. clientWidth/clientHeight would be that size rounded to
// whole pixels and with a scrollbar subtracted, and #roomArea is calc(var(--roomWidth) *
// var(--scale)) - routinely fractional, so rounding it flips a breakpoint a pixel early or late.
function contentBoxSize(element) {
  const style = getComputedStyle(element);
  const size = { width: parseFloat(style.width), height: parseFloat(style.height) };
  // a display:none container has no box and resolves both to 'auto'. Nothing inside it is
  // visible either, so leave it unmeasured rather than call it zero sized
  return isNaN(size.width) || isNaN(size.height) ? null : size;
}

// a media query that never matches, which is how a block that does not apply is switched off
const OFF = 'not all';

const containerSelectors = {};
const fallbackBlocks = [];
const readStyles = new WeakSet();
const observedContainers = new WeakSet();
let containerObserver = null;
let updateScheduled = false;
let announced = false;

function readNewStyleElements() {
  // Only <head>: both sheets that have @container rules are there (room.html's inlined one and
  // the one edit mode appends), while a card widget builds a <style> element out of its game's
  // own CSS and puts it in the body. Reading those would let a game declare itself as a
  // container and take over a name the overlays query, and split a copy of it off on every
  // re-render. A widget's stylesheet is found and replaced by its id (#STYLES_<widget>), so
  // those keep their identity as well - splitting one would leave the widget updating a
  // detached element.
  for(const styleElement of document.head.querySelectorAll('style:not([id]):not([data-container-query-fallback])')) {
    if(readStyles.has(styleElement))
      continue;
    readStyles.add(styleElement);

    const cssText = styleElement.textContent;
    const { containers, blocks } = parseContainerQueries(cssText);
    for(const container of containers)
      containerSelectors[container.name] = container.selector;
    if(!blocks.length)
      continue;

    // The sheet is replaced by its own pieces rather than having the blocks copied to the end
    // of the document: a block that is moved wins over every rule that used to come after it,
    // and the symbol picker's plain media queries are written to override one of them.
    const pieces = [];
    let cursor = 0;
    for(const block of blocks) {
      pieces.push({ css: cssText.slice(cursor, block.start) });
      pieces.push(block);
      cursor = block.end;
    }
    pieces.push({ css: cssText.slice(cursor) });

    for(const piece of pieces) {
      if(!piece.queries && !piece.css.trim())
        continue;
      const pieceElement = document.createElement('style');
      pieceElement.dataset.containerQueryFallback = piece.queries ? 'block' : 'rules';
      pieceElement.textContent = piece.css;
      if(piece.queries)
        // media, not the disabled property: media is an attribute and therefore survives the
        // sheet being copied by its outerHTML, which is how the deck editor hands the document's
        // stylesheets to its print window. A disabled block would arrive there switched on.
        pieceElement.media = OFF;
      styleElement.parentNode.insertBefore(pieceElement, styleElement);
      if(piece.queries)
        fallbackBlocks.push({ queries: piece.queries, style: pieceElement });
    }
    styleElement.remove();
  }
}

function scheduleUpdate() {
  if(updateScheduled)
    return;
  updateScheduled = true;
  // out of the ResizeObserver callback: enabling a stylesheet resizes what it observes, which
  // the browser reports as "ResizeObserver loop completed with undelivered notifications"
  requestAnimationFrame(function() {
    updateScheduled = false;
    updateContainerQueryFallback();
  });
}

/**
 * Whether this browser needs the fallback at all. Kept separate from applying it so the check
 * reads the same way at the call site as the feature it stands in for.
 */
export function needsContainerQueryFallback() {
  return !(window.CSS && CSS.supports && CSS.supports('container-type: size'));
}

/**
 * Picks up stylesheets that have been added since the last call (the editor brings its own) and
 * switches every @container block on or off for the size its container has right now.
 */
export function updateContainerQueryFallback() {
  if(!needsContainerQueryFallback())
    return;

  if(!announced) {
    announced = true;
    // the fallback only implements the features the stylesheets query today, so a query written
    // with something else silently evaluates to false - worth one line in a bug report's console
    console.warn('This browser has no CSS container queries. Laying the overlays out from containerQueryFallback.js instead.');
  }

  readNewStyleElements();

  if(!containerObserver && window.ResizeObserver)
    containerObserver = new ResizeObserver(scheduleUpdate);

  const sizes = {};
  for(const name in containerSelectors) {
    const element = document.querySelector(containerSelectors[name]);
    if(!element)
      continue;
    const size = contentBoxSize(element);
    if(size)
      sizes[name] = size;
    if(containerObserver && !observedContainers.has(element)) {
      observedContainers.add(element);
      containerObserver.observe(element);
    }
  }

  // What a real container has and this cannot give it is size containment: there, a container's
  // size never depends on what a query put inside it, which is what makes container queries
  // non-cyclic. Here a content sized container would measure differently once a block is on,
  // which could turn it off again - one flip per animation frame. Both containers are sized
  // explicitly (#roomArea by --roomWidth/--scale, .overlay by its 100%), so this stays a rule
  // about which elements may declare themselves as containers rather than a live problem.
  for(const block of fallbackBlocks) {
    const matches = block.queries.some(query => sizes[query.name] && evaluateCondition(query.condition, sizes[query.name]));
    const media = matches ? '' : OFF;
    if(block.style.media != media)
      block.style.media = media;
  }
}
