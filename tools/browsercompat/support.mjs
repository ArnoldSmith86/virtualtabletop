// Turns the browserslist key in package.json into a set of targets in the vocabulary of
// @mdn/browser-compat-data and answers the one question the scanners ask about a feature:
// is it there in every browser we say we support?

import { createRequire } from 'module';
import browserslist from 'browserslist';

// bcd ships its data as one JSON file. Importing JSON from a module needs import attributes,
// which Node 18 - the version CI runs - does not have, so it comes in through require().
const require = createRequire(import.meta.url);

export function loadCompatData() {
  return require('@mdn/browser-compat-data');
}

// browserslist and bcd disagree on what the browsers are called. Anything we cannot name in
// bcd (op_mini, kaios, ie_mob, ...) has no compatibility data to check against, so it is
// dropped and reported instead of silently passing every feature.
const bcdBrowser = {
  chrome: 'chrome',
  and_chr: 'chrome_android',
  edge: 'edge',
  firefox: 'firefox',
  and_ff: 'firefox_android',
  ie: 'ie',
  opera: 'opera',
  op_mob: 'opera_android',
  safari: 'safari',
  ios_saf: 'safari_ios',
  samsung: 'samsunginternet_android',
  android: 'webview_android'
};

export const browserNames = {
  chrome: 'Chrome',
  chrome_android: 'Chrome for Android',
  edge: 'Edge',
  firefox: 'Firefox',
  firefox_android: 'Firefox for Android',
  ie: 'Internet Explorer',
  opera: 'Opera',
  opera_android: 'Opera Mobile',
  safari: 'Safari',
  safari_ios: 'Safari on iOS',
  samsunginternet_android: 'Samsung Internet',
  webview_android: 'Android WebView'
};

// the oldest version of each browser the browserslist query still asks for
export function resolveTargets(query, options) {
  const targets = new Map();
  const untestable = new Set();
  for(const entry of browserslist(query, options)) {
    const [ browser, version ] = entry.split(' ');
    if(!bcdBrowser[browser]) {
      untestable.add(browser);
      continue;
    }
    // browserslist reports some versions as a range ("15.2-15.3"); the lower end is the one
    // that has to be able to run the code
    const oldest = version.split('-')[0];
    const known = targets.get(bcdBrowser[browser]);
    if(known === undefined || compareVersions(oldest, known) < 0)
      targets.set(bcdBrowser[browser], oldest);
  }
  return {
    targets: [ ...targets ].map(([ id, version ]) => ({ id, version })),
    untestable: [ ...untestable ]
  };
}

export function compareVersions(a, b) {
  const pa = String(a).split('.');
  const pb = String(b).split('.');
  for(let i=0; i<Math.max(pa.length, pb.length); ++i) {
    const d = (parseInt(pa[i]) || 0) - (parseInt(pb[i]) || 0);
    if(d)
      return d < 0 ? -1 : 1;
  }
  return 0;
}

// bcd states support as a version string, true (always), false (never) or null (nobody
// knows). "≤85" means "85 or earlier", which for our purposes is 85. A release that is not
// out yet ("preview") is not something a user can have.
function version(added) {
  if(added === true)
    return '0';
  if(added === false || added === 'preview')
    return false;
  if(added === null || added === undefined)
    return null;
  return String(added).replace(/^[≤<=]+/, '');
}

// A feature can have several support statements per browser - behind a flag, under a prefix,
// under a different name, or for a version range in which it was there but incomplete. Only
// the ones spelled the way the source spells it count: support that needs a different spelling
// is no support at all. A partial implementation does count - it is a rough edge, not a browser
// that cannot run the code. When a prefix is asked for it is the other way round: the prefixed
// spelling is exactly what is being looked up, and a browser bcd files no prefixed statement
// for simply never had it (bcd records prefixed support on the unprefixed path, so "no
// statement" there is an answer, not a gap in the data).
//
// Returns true when this version of the browser has the feature, false when it does not, and
// null when bcd has no data either way.
function supportedIn(support, id, target, prefix) {
  const statements = [].concat(support?.[id] ?? []);
  let earliest = null, known = !!prefix;
  for(const statement of statements) {
    if(statement.flags || statement.alternative_name || (statement.prefix || '') != (prefix || ''))
      continue;
    const added = version(statement.version_added);
    if(added === null)
      continue;
    known = true;
    if(added === false)
      continue;
    const removed = statement.version_removed === true ? '0' : version(statement.version_removed);
    if(compareVersions(target, added) >= 0 && (!removed || compareVersions(target, removed) < 0))
      return true;
    // Which release fixes it is the one a developer needs, so a version that came and went
    // again before the target does not count: mask-image was in Edge 16 and gone again in 79,
    // and what Edge 88 waits for is 120.
    if(compareVersions(added, target) > 0 && (earliest === null || compareVersions(added, earliest) < 0))
      earliest = added;
  }
  return known ? { since: earliest === null ? false : earliest } : null;
}

function walk(data, path) {
  let node = data;
  for(const key of path.split('.')) {
    node = node?.[key];
    if(node === undefined)
      return undefined;
  }
  return node;
}

export function createLookup(data, targets) {
  const cache = new Map();

  // null when every target has the feature (or when nobody has data on it), otherwise the
  // list of targets that are too old for it. A prefix asks about the vendor prefixed spelling
  // of the same path - which browsers a -webkit- declaration actually reaches.
  function feature(path, prefix) {
    const key = prefix ? `${prefix}${path}` : path;
    if(cache.has(key))
      return cache.get(key);
    const compat = walk(data, path)?.__compat;
    let result = null;
    if(compat) {
      const missing = [];
      for(const target of targets) {
        const supported = supportedIn(compat.support, target.id, target.version, prefix);
        if(supported && supported !== true)
          missing.push({ ...target, since: supported.since });
      }
      if(missing.length)
        result = { path, missing, mdn: compat.mdn_url };
    }
    cache.set(key, result);
    return result;
  }

  // the names a browser puts on the global object: every interface and global function bcd
  // knows about, plus the built in objects of the language
  function globalPath(name) {
    if(data.api[name]?.__compat)
      return `api.${name}`;
    if(data.javascript.builtins[name]?.__compat)
      return `javascript.builtins.${name}`;
    return null;
  }

  return { targets, feature, globalPath, has: path => walk(data, path)?.__compat !== undefined };
}
