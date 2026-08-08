import { readFileSync } from 'fs';

import { scanCSS } from '../tools/browsercompat/css.mjs';
import { blankNonCode, scanJS } from '../tools/browsercompat/js.mjs';
import { checkFiles, checkSource, clientFiles, collectAnnotations, describeTarget } from '../tools/browsercompat/index.mjs';
import { compareVersions, createLookup, loadCompatData, resolveTargets } from '../tools/browsercompat/support.mjs';
import exceptions from '../tools/browsercompat/exceptions.mjs';

const features = paths => paths.map(path => path.feature).filter(Boolean);

// enough of the shape of @mdn/browser-compat-data to check the lookup without loading 20MB
const fakeData = {
  api: {
    ResizeObserver: { __compat: { support: { chrome: { version_added: '64' }, safari: { version_added: '13.1' } } } },
    Document: { fullscreenElement: { __compat: { support: { chrome: { version_added: '71' }, safari: { version_added: '16.4' } } } } }
  },
  javascript: { builtins: { Object: { hasOwn: { __compat: { support: { chrome: { version_added: '93' }, safari: { version_added: '15.4' } } } } } } },
  css: {
    'at-rules': { container: { __compat: { support: { chrome: { version_added: '105' }, safari: { version_added: '16' } } } } },
    properties: {
      overflow: {
        __compat: { support: { chrome: { version_added: '1' }, safari: { version_added: '1' } } },
        clip: { __compat: { support: { chrome: { version_added: '90' }, safari: { version_added: '16' } } } },
        hidden: { __compat: { support: { chrome: { version_added: '1' }, safari: { version_added: '1' } } } }
      },
      appearance: { __compat: { support: {
        chrome: [ { version_added: '84' }, { prefix: '-webkit-', version_added: '1' } ],
        safari: [ { version_added: '15.4' }, { prefix: '-webkit-', version_added: '3' } ]
      } } },
      // the shape bcd uses for "it was there all along, but incomplete until 94"
      outline: { __compat: { support: {
        chrome: [ { version_added: '94' }, { partial_implementation: true, version_added: '1', version_removed: '94' } ],
        safari: { version_added: '1' }
      } } },
      cursor: { pointer: { __compat: { support: { chrome: { version_added: '1' }, safari: { version_added: false } } } } }
    },
    selectors: { has: { __compat: { support: { chrome: { version_added: '105' }, safari: { version_added: '15.4' } } } } },
    types: { color: { 'color-mix': { __compat: { support: { chrome: { version_added: '111' }, safari: { version_added: '16.2' } } } } } }
  }
};

const targets = [ { id: 'chrome', version: '88' }, { id: 'safari', version: '14.1' } ];
const lookup = createLookup(fakeData, targets);

describe('the browser support data', () => {
  test('compares versions the way browsers number them', () => {
    expect(compareVersions('14.1', '14.5')).toBe(-1);
    expect(compareVersions('105', '87')).toBe(1);
    expect(compareVersions('16', '16.0')).toBe(0);
    expect(compareVersions('9', '10')).toBe(-1);
  });

  test('turns a browserslist query into the oldest version of each browser', () => {
    const { targets } = resolveTargets([ 'chrome >= 88', 'safari >= 14.1' ]);
    expect(targets).toEqual([ { id: 'chrome', version: '88' }, { id: 'safari', version: '14.1' } ]);
  });

  test('names the browsers it has no data for instead of passing them silently', () => {
    const { targets, untestable } = resolveTargets([ 'op_mini all', 'chrome >= 88' ]);
    expect(targets).toEqual([ { id: 'chrome', version: '88' } ]);
    expect(untestable).toEqual([ 'op_mini' ]);
  });

  test('reports the browsers that are too old for a feature', () => {
    expect(lookup.feature('css.at-rules.container').missing.map(target => target.id)).toEqual([ 'chrome', 'safari' ]);
    expect(lookup.feature('css.properties.overflow.clip').missing).toEqual([
      { id: 'chrome', version: '88', since: '90' },
      { id: 'safari', version: '14.1', since: '16' }
    ]);
    expect(lookup.feature('css.properties.overflow.hidden')).toBe(null);
    expect(lookup.feature('css.properties.nonesuch')).toBe(null);
  });

  test('does not count support that needs a different spelling', () => {
    // -webkit-appearance is support for -webkit-appearance, not for appearance
    expect(lookup.feature('css.properties.appearance').missing.map(target => target.id)).toEqual([ 'safari' ]);
  });

  test('counts a version range in which the feature was there but incomplete', () => {
    expect(lookup.feature('css.properties.outline')).toBe(null);
  });

  test('knows which names come from the browser', () => {
    expect(lookup.globalPath('ResizeObserver')).toBe('api.ResizeObserver');
    expect(lookup.globalPath('Widget')).toBe(null);
  });
});

describe('the CSS scanner', () => {
  test('names at-rules, selectors, properties, values and value functions', () => {
    const found = scanCSS(`@container roomArea (max-width: 600px) {
      .a:has(.b) { overflow: clip; background: color-mix(in srgb, red, blue) }
    }`);
    expect(features(found)).toEqual(expect.arrayContaining([
      'css.at-rules.container',
      'css.selectors.has',
      'css.properties.overflow',
      'css.properties.overflow.clip',
      'css.types.color.color-mix'
    ]));
  });

  test('reports the line a declaration starts on', () => {
    const found = scanCSS('.a {\n\n  overflow:\n    clip;\n}');
    expect(found.find(candidate => candidate.feature == 'css.properties.overflow.clip').line).toBe(3);
  });

  test('ignores comments, strings and custom properties', () => {
    const found = scanCSS(`.a { /* overflow: clip; */ content: "overflow: clip"; --overflow: clip }`);
    expect(features(found)).not.toContain('css.properties.overflow.clip');
  });

  test('leaves the vendor prefixed spelling of something alone', () => {
    const found = scanCSS('.a { -webkit-appearance: none; ::-webkit-scrollbar { width: 0 } }');
    expect(features(found)).not.toContain('css.properties.-webkit-appearance');
    expect(features(found)).not.toContain('css.selectors.-webkit-scrollbar');
  });

  test('marks a declaration inside an @supports condition that asks for it', () => {
    const found = scanCSS('@supports (color: color-mix(in srgb, red, blue)) { .a { background: color-mix(in srgb, red, blue) } }');
    expect(found.find(candidate => candidate.feature == 'css.types.color.color-mix').guardedBy).toMatch('@supports');
  });

  test('puts every spelling of a property in one group', () => {
    const found = scanCSS('.a { -webkit-appearance: none; appearance: none }');
    const groups = new Set(found.filter(candidate => candidate.group).map(candidate => candidate.group));
    expect(groups.size).toBe(1);
  });
});

describe('the JavaScript scanner', () => {
  test('blanks comments, strings, templates and regular expressions without moving anything', () => {
    const source = 'const a = "Object.hasOwn"; // Object.hasOwn\nconst b = /Object.hasOwn/; const c = `${x}Object.hasOwn`;';
    const blanked = blankNonCode(source);
    expect(blanked).toHaveLength(source.length);
    expect(blanked.split('\n')).toHaveLength(2);
    expect(blanked).not.toMatch('hasOwn');
  });

  test('names globals, members of globals and static members of the built ins', () => {
    const found = scanJS('new ResizeObserver(f); document.fullscreenElement; Object.hasOwn(a, b);', { globalPath: lookup.globalPath });
    expect(features(found)).toEqual(expect.arrayContaining([
      'api.ResizeObserver',
      'api.Document.fullscreenElement',
      'javascript.builtins.Object.hasOwn'
    ]));
  });

  test('does not take a name of ours for one of the browser\'s', () => {
    expect(features(scanJS('const ResizeObserver = 1; new ResizeObserver();', { globalPath: lookup.globalPath }))).not.toContain('api.ResizeObserver');
    expect(features(scanJS('function f(document) { return document.fullscreenElement; }', { globalPath: lookup.globalPath }))).not.toContain('api.Document.fullscreenElement');
    expect(features(scanJS('widgets.forEach(document => document.fullscreenElement)', { globalPath: lookup.globalPath }))).not.toContain('api.Document.fullscreenElement');
  });

  test('names the syntax a browser would refuse to parse', () => {
    expect(features(scanJS('a ??= b;'))).toContain('javascript.operators.nullish_coalescing_assignment');
    expect(features(scanJS('class A { #x = 1 }'))).toContain('javascript.classes.private_class_fields');
  });
});

describe('the fallback markers', () => {
  const check = source => checkSource({ path: 'test.css', source, lookup });

  test('excuses the line it is on and the line below it', () => {
    const above = check('/* compat-fallback css.properties.overflow.clip: the hidden below */\n.a { overflow: clip }');
    expect(above.findings.every(finding => finding.status != 'unsupported')).toBe(true);

    const beside = check('.a {\n  overflow: clip; /* compat-fallback css.properties.overflow.clip: reason */\n}');
    expect(beside.findings.every(finding => finding.status != 'unsupported')).toBe(true);

    const tooFarAway = check('/* compat-fallback css.properties.overflow.clip: reason */\n\n\n.a { overflow: clip }');
    expect(tooFarAway.findings.some(finding => finding.status == 'unsupported')).toBe(true);
  });

  test('covers everything below the path it names', () => {
    const { findings } = check('/* compat-fallback css.properties.overflow: reason */\n.a { overflow: clip }');
    expect(findings.every(finding => finding.status != 'unsupported')).toBe(true);
  });

  test('excuses a whole file when it says so', () => {
    const { findings } = check('/* compat-fallback-file css.at-rules.container: containerQueryFallback.js */\n.a { color: red }\n@container roomArea (max-width: 1px) { .b { color: red } }');
    expect(findings.every(finding => finding.status != 'unsupported')).toBe(true);
  });

  test('reports a marker that stopped excusing anything', () => {
    const { stale } = check('/* compat-fallback css.properties.overflow.clip: reason */\n.a { overflow: hidden }');
    expect(stale).toHaveLength(1);
    expect(stale[0].feature).toBe('css.properties.overflow.clip');
  });

  test('needs a reason', () => {
    expect(collectAnnotations('/* compat-fallback css.selectors.has: because */')).toHaveLength(1);
    expect(collectAnnotations('/* compat-fallback css.selectors.has */')).toHaveLength(0);
    expect(collectAnnotations('/* compat-fallback css.selectors.has: */')).toHaveLength(0);
  });

  test('lets a project wide exception excuse a feature everywhere', () => {
    const exceptions = [ { feature: 'css.selectors.has', reason: 'the rule is only ever an improvement' } ];
    const { findings } = checkSource({ path: 'test.css', source: '.a:has(.b) { color: red }', lookup, exceptions });
    expect(findings.find(finding => finding.feature == 'css.selectors.has').status).toBe('excepted');
    expect(exceptions[0].used).toBe(1);
  });

  test('reports an exception that stopped excusing anything', () => {
    const exceptions = [ { feature: 'css.selectors.has', reason: 'reason' } ];
    const { stale } = checkFiles({ files: [ 'test.css' ], lookup, exceptions, read: () => '.a { color: red }' });
    expect(stale.map(entry => entry.feature)).toEqual([ 'css.selectors.has' ]);
  });
});

describe('the fallbacks CSS has itself', () => {
  const check = source => checkSource({ path: 'test.css', source, lookup }).findings;

  test('takes a second declaration of the same property for one', () => {
    expect(check('.a { overflow: hidden; overflow: clip }').every(finding => finding.status != 'unsupported')).toBe(true);
    expect(check('.a { overflow: clip; overflow: hidden }').every(finding => finding.status != 'unsupported')).toBe(true);
  });

  test('takes the vendor prefixed spelling next to it for one', () => {
    expect(check('.a { -webkit-appearance: none; appearance: none }').every(finding => finding.status != 'unsupported')).toBe(true);
  });

  test('needs the declarations to cover every browser between them', () => {
    expect(check('.a { overflow: clip; overflow: clip }').some(finding => finding.status == 'unsupported')).toBe(true);
  });

  test('does not let a declaration in another rule count', () => {
    expect(check('.a { overflow: hidden } .b { overflow: clip }').some(finding => finding.status == 'unsupported')).toBe(true);
  });
});

// A browser that is too old to run the client is told so by client/room.html, including which
// version it would need. Nothing at runtime reads the browserslist key, so this is what keeps
// that list from drifting away from it.
describe('the message a browser too old for the client gets', () => {
  test('names every browser in the browserslist key, at the version the key asks for', () => {
    const room = readFileSync('client/room.html', 'utf8');
    const message = room.match(/<p id="unsupportedBrowserVersions">([\s\S]*?)<\/p>/)[1];
    const named = [ ...message.matchAll(/<b>(.*?)<\/b>/g) ].map(match => match[1]);
    const { targets } = resolveTargets(undefined, { path: process.cwd() });
    expect(named.sort()).toEqual(targets.map(target => describeTarget(target).replace(/\.0$/, '')).sort());
  });
});

// The check is only worth having if it is green on what we ship, so this runs it for real -
// same data, same files, same rules as the browser-compat workflow.
describe('the client we serve', () => {
  test('uses nothing the browsers in the browserslist key do not have', () => {
    const { targets, untestable } = resolveTargets(undefined, { path: process.cwd() });
    expect(targets.length).toBeGreaterThan(0);
    expect(untestable).toEqual([]);

    const { findings, stale } = checkFiles({
      files: clientFiles(),
      lookup: createLookup(loadCompatData(), targets),
      exceptions
    });
    expect(findings.filter(finding => finding.status == 'unsupported').map(finding => `${finding.file}:${finding.line} ${finding.feature}`)).toEqual([]);
    expect(stale.map(entry => `${entry.file}:${entry.line} ${entry.feature}`)).toEqual([]);
  });
});
