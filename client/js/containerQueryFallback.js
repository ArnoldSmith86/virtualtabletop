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
  for(let index = 0; (index = cssText.indexOf('@container', index)) != -1; ) {
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
    index = end + 1;
  }

  return { containers, blocks };
}

function contentBoxSize(element) {
  const style = getComputedStyle(element);
  return {
    width:  element.clientWidth  - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    height: element.clientHeight - parseFloat(style.paddingTop)  - parseFloat(style.paddingBottom)
  };
}

const containerSelectors = {};
const fallbackBlocks = [];
const readStyles = new WeakSet();
const observedContainers = new WeakSet();
let containerObserver = null;
let updateScheduled = false;

function readNewStyleElements() {
  // a widget's stylesheet is found and replaced by its id (#STYLES_<widget>), so those keep
  // their identity - splitting one would leave the widget updating a detached element
  for(const styleElement of document.querySelectorAll('style:not([id]):not([data-container-query-fallback])')) {
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
      styleElement.parentNode.insertBefore(pieceElement, styleElement);
      if(piece.queries) {
        pieceElement.disabled = true; // only takes effect once the element has a sheet
        fallbackBlocks.push({ queries: piece.queries, style: pieceElement });
      }
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

  readNewStyleElements();

  if(!containerObserver && window.ResizeObserver)
    containerObserver = new ResizeObserver(scheduleUpdate);

  const sizes = {};
  for(const name in containerSelectors) {
    const element = document.querySelector(containerSelectors[name]);
    if(!element)
      continue;
    sizes[name] = contentBoxSize(element);
    if(containerObserver && !observedContainers.has(element)) {
      observedContainers.add(element);
      containerObserver.observe(element);
    }
  }

  for(const block of fallbackBlocks) {
    const matches = block.queries.some(query => sizes[query.name] && evaluateCondition(query.condition, sizes[query.name]));
    if(block.style.disabled == matches)
      block.style.disabled = !matches;
  }
}
