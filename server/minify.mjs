import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import url from 'url';
import util from 'util';
import zlib from 'zlib';

import CleanCSS from 'clean-css';
import { minify as htmlMinify } from 'html-minifier-terser';
import { minify as jsMinify } from 'terser';

import Config from './config.mjs';
import Logging from './logging.mjs';

// Config.get returns environment overrides verbatim, so MINIFYJAVASCRIPT=false arrives as the
// truthy string 'false'. Both minification passes read the flag through here so they agree.
function minifyJavascript() {
  const value = Config.get('minifyJavascript');
  return !!value && ![ 'false', '0', 'no', 'off' ].includes(String(value).toLowerCase());
}

// Everything that is compressed here is sent to the browser exactly once per build, so it is
// worth spending the time on the slowest setting - it costs a few seconds at startup and nothing
// afterwards.
const gzip = content => util.promisify(zlib.gzip)(content, { level: zlib.constants.Z_BEST_COMPRESSION });

// Both bundles end up as a single ES module: the client JS becomes the inline <script type=module>
// of room.html, the editor JS is fetched as /edit.js and loaded through import(). A top-level name
// of a module is invisible from the outside, so terser can rename or drop all of them. The names
// that have to survive are the ones that cross a bundle boundary, and terser keeps those by
// itself: main.js hands edit mode its half of the API as shorthand object keys (Object.assign
// (window, { $, widgets, Widget, ... }), where the key stays and only the value gets renamed) and
// edit mode hands back its half as module exports. Globals that neither bundle declares - fflate,
// loaded on demand from /scripts/fflate, being the interesting one - are left alone anyway.
//
// This only works because neither bundle contains a *direct* eval anymore (widget.js used to have
// one and now uses the indirect form): a direct eval can read every name of every enclosing scope,
// so terser refuses to rename anything up to and including the top level of the bundle it is in.
// Terser's mangle.eval option lifts that refusal but is not a way around it - with the client JS
// going through terser twice (here and again as the inline <script> of room.html) it produces a
// bundle in which a renamed local shadows a renamed top level function that a closure next to it
// calls, which fails at runtime as "x is not a function".
function jsMinifyOptions() {
  return {
    module: true,  // implies toplevel mangling and dropping of unused top-level definitions
    compress: {
      passes: 2
    }
  };
}

// html-minifier-terser routes the failures of its own terser and clean-css passes through log()
// and defaults that to a no-op, so a broken inline <script> or <style> would just come back
// unchanged without a trace - the same silent failure this file now reports for compressCSS.
// Its own timing line is the one non-problem message it sends here.
function htmlMinifyLog(message) {
  if(!/^minified in: /.test(String(message)))
    Logging.log(`WARNING - HTML minification - ${message}`);
}

// html-minifier-terser enables nothing by default, so spell out the set the previous wrapper used.
// minifyJS follows the config: the old uglify-js based pass silently failed on our client code,
// while terser does parse it and would minify even when the config asks for readable output.
// When it is enabled the client JS goes through terser twice (compressJS and again here as part
// of the surrounding <script>) which is redundant but cheap - and it also covers the config
// object that is injected into the HTML after compressJS has run.
function htmlMinifyOptions() {
  return {
    collapseBooleanAttributes: true,
    collapseInlineTagWhitespace: true,
    collapseWhitespace: true,
    conservativeCollapse: true,
    log: htmlMinifyLog,
    minifyCSS: true,
    minifyJS: minifyJavascript(),
    removeAttributeQuotes: true,
    removeComments: true,
    removeEmptyAttributes: true,
    removeOptionalTags: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    useShortDoctype: true
  };
}

// The build reads these lists and the disk cache hashes them, so they live here instead of inline:
// a file that is added to a bundle but not to the hash would be served from a stale cache entry
// forever. The order is what ends up in the bundle - do not sort them.
const ROOM_HTML = 'client/room.html';
const EDITOR_HTML = 'client/editor.html';
const FFLATE_JS = 'node_modules/fflate/umd/index.js';
const SYMBOLS_JSON = 'assets/fonts/symbols.json';

const CLIENT_CSS = [
  'client/css/layout.css',

  'client/css/overlays/misc.css',
  'client/css/overlays/players.css',
  'client/css/overlays/states.css',
  'client/css/overlays/connectionlost.css',
  'client/css/overlays/about.css',
  'client/css/overlays/welcome.css',

  'client/css/widgets/basicwidget.css',
  'client/css/widgets/imagewidget.css',
  'client/css/widgets/button.css',
  'client/css/widgets/canvas.css',
  'client/css/widgets/card.css',
  'client/css/widgets/classes.css',
  'client/css/widgets/deck.css',
  'client/css/widgets/dice.css',
  'client/css/widgets/holder.css',
  'client/css/widgets/label.css',
  'client/css/widgets/line.css',
  'client/css/widgets/pile.css',
  'client/css/widgets/scoreboard.css',
  'client/css/widgets/seat.css',
  'client/css/widgets/spinner.css',
  'client/css/widgets/timer.css',

  'client/css/fonts.css',
  'client/css/custom.css'
];

const CLIENT_JS = [
  'node_modules/dompurify/dist/purify.js',

  'client/js/domhelpers.js',
  'client/js/calculateLayout.js',
  'client/js/connection.js',
  'client/js/serverstate.js',
  'client/js/legacymoderegistry.js',
  'client/js/legacymodes.js',
  'client/js/geometry.js',
  'client/js/compute.js',
  'client/js/expression.js',
  'client/js/mousehandling.js',
  'client/js/zoom.js',
  'client/js/tracing.js',
  'client/js/statemanaged.js',
  'client/js/color.js',
  'client/js/symbols.js',
  'client/js/audio.js',

  'client/js/overlays/players.js',
  'client/js/overlays/states.js',
  'client/js/overlays/welcome.js',

  'client/js/widgets/widget.js',
  'client/js/widgets/imagewidget.js',
  'client/js/widgets/basicwidget.js',
  'client/js/widgets/button.js',
  'client/js/widgets/canvas.js',
  'client/js/widgets/card.js',
  'client/js/widgets/deck.js',
  'client/js/widgets/dice.js',
  'client/js/widgets/holder.js',
  'client/js/widgets/label.js',
  'client/js/widgets/line.js',
  'client/js/widgets/pile.js',
  'client/js/widgets/scoreboard.js',
  'client/js/widgets/seat.js',
  'client/js/widgets/spinner.js',
  'client/js/widgets/timer.js',

  'client/js/main.js'
];

const EDITOR_CSS = [
  'client/css/editor/layout.css',
  'client/css/editor/toolbar.css',
  'client/css/editor/dragtoolbar.css',
  'client/css/editor/sidebar.css',
  'client/css/editor/sidebarModules.css',
  'client/css/editor/sidebarProperties.css',
  'client/css/editor/propertyInputs.css',
  'client/css/editor/deckeditor.css',
  'client/css/editor/controls/routine.css',
  'client/css/editor/controls/selectionbar.css',
  'client/css/editor/controls/popup.css',
  'client/css/editor/controls/events.css',

  'client/css/editmode.css',
  'client/css/jsonedit.css',
  'client/css/tracing.css'
];

const EDITOR_JS = [
  'client/js/editor/layout.js',
  'client/js/editor/selection.js',
  'client/js/editor/smartClone.js',
  'client/js/editor/toolbarButton.js',
  'client/js/editor/toolbar/new.js',
  'client/js/editor/toolbar/save.js',
  'client/js/editor/toolbar/darkmode.js',
  'client/js/editor/toolbar/zoomout.js',
  'client/js/editor/toolbar/display.js',
  'client/js/editor/toolbar/fullscreen.js',
  'client/js/editor/toolbar/close.js',
  'client/js/editor/toolbar/undo.js',
  'client/js/editor/toolbar/selectmode.js',
  'client/js/editor/toolbar/add.js',
  'client/js/editor/toolbar/delete.js',
  'client/js/editor/toolbar/align.js',
  'client/js/editor/toolbar/group.js',
  'client/js/editor/toolbar/grid.js',
  'client/js/editor/toolbar/deckeditor.js',
  'client/js/editor/toolbar/tutorials.js',
  'client/js/editor/toolbar/wiki.js',
  'client/js/editor/dragButton.js',
  'client/js/editor/dragbuttons/drag.js',
  'client/js/editor/dragbuttons/settings.js',
  'client/js/editor/dragbuttons/clone.js',
  'client/js/editor/dragbuttons/spacing.js',
  'client/js/editor/dragbuttons/rotate.js',
  'client/js/editor/dragbuttons/move.js',
  'client/js/editor/dragbuttons/resize.js',
  'client/js/editor/sidebarModule.js',
  'client/js/editor/propertyInputs.js',
  'client/js/editor/controls/selectionbar.js',
  'client/js/editor/controls/widgetselection.js',
  'client/js/editor/cssEditor.js',
  'client/js/editor/sidebar/properties.js',
  'client/js/editor/sidebar/undo.js',
  'client/js/editor/sidebar/json.js',
  'client/js/editor/sidebar/assets.js',
  'client/js/editor/sidebar/toolbox.js',
  'client/js/editor/sidebar/gameSettings.js',
  'client/js/editor/sidebar/widgets.js',
  'client/js/editor/deckeditor.js',

  'client/js/editor/controls/routine.js',
  'client/js/editor/controls/popup.js',
  'client/js/editor/controls/events.js',

  'client/js/editmode.js',
  'client/js/jsonedit.js',
  'client/js/traceviewer.js',

  'validator/validate_gamefile.js'
];

const INPUT_FILES = [ ROOM_HTML, ...CLIENT_CSS, ...CLIENT_JS, EDITOR_HTML, ...EDITOR_CSS, ...EDITOR_JS, FFLATE_JS, SYMBOLS_JSON ];

export async function buildHTML() {
  const room = await compress(ROOM_HTML, CLIENT_CSS, CLIENT_JS);

  const editorCSS = await compressCSS(EDITOR_CSS);

  let editorJS = await compressJS(EDITOR_JS, true);  // keeps its exports: main.js imports this bundle

  const editorHTML = await htmlMinify(readInputFile(EDITOR_HTML).toString('utf8'), htmlMinifyOptions());

  editorJS = editorJS.replace(/["']\ \/\/\*\*\*\ CSS\ \*\*\*\/\/\ ["']/, _=>'`' + editorCSS.replace(/\\/g, '\\\\') + '`');
  editorJS = editorJS.replace(/["']\ \/\/\*\*\*\ HTML\ \*\*\*\/\/\ ["']/, _=>'`' + editorHTML + '`');

  // fflate is the one client script that does not go through the bundles: it is loaded on demand
  // (loadZipLibrary in client/js/overlays/states.js) and served straight from node_modules. It
  // already arrives minified, but it was sent uncompressed.
  const fflate = readInputFile(FFLATE_JS);

  // symbols.json is by far the biggest file the client fetches (the icon pickers read it in one go) and
  // express.static sends it as it is, so keep it gzipped here as well - it compresses to about a fifth
  const symbols = readInputFile(SYMBOLS_JSON);

  // none of these three depend on each other and zlib does its work in the libuv threadpool, so
  // waiting for them together instead of one after the other shortens the tail of the build by
  // roughly the two smaller ones. What comes out is the same either way.
  const [ editorJSgzipped, fflateGzipped, symbolsGzipped ] = await Promise.all([ gzip(editorJS), gzip(fflate), gzip(symbols) ]);

  return {
    min: room.min,
    gzipped: room.gzipped,
    editorJSmin: editorJS,
    editorJSgzipped,
    fflateMin: fflate,
    fflateGzipped,
    symbolsGzipped
  };
}

function readInputFile(file) {
  return fs.readFileSync(path.resolve() + '/' + file);
}

async function compressCSS(cssFiles) {
  // Hand clean-css the files separately instead of one concatenated string: the output is
  // identical but problems are then reported as file:line:column instead of a line number
  // in a string that does not exist anywhere on disk
  const combinedCSSContent = {};
  for(const filePath of cssFiles)
    combinedCSSContent[filePath] = { styles: fs.readFileSync(filePath, 'utf8') };

  // level 2 additionally merges and reorders rules that cannot affect each other, which pays off
  // here because the stylesheets are split by widget and repeat a lot of their declarations. Note
  // that this makes the order of the files above matter a little less than plain concatenation
  // would - it still only merges rules whose selectors cannot match the same element, but a
  // self-hoster who relies on client/css/custom.css coming last to override a rule should check
  // that their override still wins
  //
  // clean-css does not throw on broken input, it drops the offending declaration and only
  // mentions it here - without this the minified client would be missing a rule silently
  const result = new CleanCSS({ level: 2 }).minify(combinedCSSContent);
  for(const error of result.errors)
    Logging.log(`ERROR - CSS minification - ${error}`);
  for(const warning of result.warnings)
    Logging.log(`WARNING - CSS minification - ${warning}`);

  return result.styles;
}

// Helper function to remove import statements
function removeImportStatements(jsContent) {
  return jsContent.replace(/^import\s+[^;]+;\r?\n/gm, '');
}

// Once the files are concatenated their exports have no importer left, but terser has to assume
// somebody could import them and therefore keeps every exported definition, used or not. This is
// only true for the client bundle: the editor bundle is imported by main.js, so its exports are
// its interface and have to stay.
function removeExportStatements(jsContent) {
  const stripped = jsContent
    .replace(/^export\s*(?:\*|\{[^}]*\})[^;\n]*;?\r?\n/gm, '')  // export {a, b}; and both re-export forms
    .replace(/^export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm, '');

  // export default is the one form that cannot just be unwrapped - dropping the keywords would
  // leave an anonymous declaration behind - so anything left is reported instead of being shipped
  for(const [ statement ] of stripped.matchAll(/^export\b.*/gm))
    Logging.log(`ERROR - JS minification - cannot remove "${statement.trim()}" from the client bundle`);

  return stripped;
}

async function compressJS(jsFiles, keepExports) {
  // Combine all JavaScript files and remove import statements
  const combinedJSContent = jsFiles
    .map(filePath => fs.readFileSync(filePath, 'utf8'))  // Read each file
    .map(jsContent => removeImportStatements(jsContent))  // Remove import statements
    .map(jsContent => keepExports ? jsContent : removeExportStatements(jsContent))
    .join('\n');  // Combine them into a single string

  // Perform compression
  if(!minifyJavascript())
    return combinedJSContent;

  return (await jsMinify(combinedJSContent, jsMinifyOptions())).code;
}

async function compress(htmlFile, cssFiles, jsFiles) {
  let htmlString = readInputFile(htmlFile).toString('utf8');
  htmlString = htmlString.replace(/\ \/\*\*\*\ TITLE\ \*\*\*\/\ /g, _=>Config.get('serverName'));
  htmlString = htmlString.replace(/\ \/\*\*\*\ EXTERNAL_URL\ \*\*\*\/\ /g, _=>Config.get('externalURL'));
  htmlString = htmlString.replace(/\ \/\*\*\*\ URL_PREFIX\ \*\*\*\/\ /g, _=>Config.get('urlPrefix'));

  const css = await compressCSS(cssFiles);
  htmlString = htmlString.replace(/\ \/\*\*\*\ CSS\ \*\*\*\/\ /, _=>css).replace(/\ \/\/\*\*\*\ CONFIG\ \*\*\*\/\/\ /, _=>`const config = ${JSON.stringify(Config.getClientConfig())};`);

  const js = await compressJS(jsFiles);
  htmlString = htmlString.replace(/\ \/\/\*\*\*\ JS\ \*\*\*\/\/\ /, _=>js);

  const html = await htmlMinify(htmlString, htmlMinifyOptions());

  return {
    min: html,
    gzipped: await gzip(html)
  };
}

// The disk cache below turns the build into something a deploy can do ahead of time.
//
// Bump this when the stored shape changes, so that entries written by an older version are
// ignored instead of being loaded as something they are not.
const CACHE_FORMAT = 1;

// How many builds to keep. A handful is enough to survive switching back and forth between two
// branches or between a minified and a readable build.
const CACHE_ENTRIES = 5;

// The fields minifyHTML() returns, and the file each of them is stored in. Buffers are written as
// they are, strings as UTF-8, so an entry is roughly the size of what it holds.
const CACHE_FILES = [
  { field: 'min',             file: 'room.html',       encoding: 'utf8' },
  { field: 'gzipped',         file: 'room.html.gz'                      },
  { field: 'editorJSmin',     file: 'edit.js',         encoding: 'utf8' },
  { field: 'editorJSgzipped', file: 'edit.js.gz'                        },
  { field: 'fflateMin',       file: 'fflate.js'                         },
  { field: 'fflateGzipped',   file: 'fflate.js.gz'                      },
  { field: 'symbolsGzipped',  file: 'symbols.json.gz'                   }
];

const TOOL_PACKAGES = [ 'terser', 'clean-css', 'html-minifier-terser' ];

function toolVersion(name) {
  return JSON.parse(fs.readFileSync(`${path.resolve()}/node_modules/${name}/package.json`, 'utf8')).version;
}

export function cacheDirectory() {
  return Config.directory('save') + '/minify-cache';
}

// Everything a build depends on: the files that go into it, everything that gets injected into
// it, the minifiers doing the work and the code driving them. Two checkouts that agree on all of
// those produce the same bytes, and only then may an entry of one be used by the other.
export function cacheKey() {
  const hash = crypto.createHash('sha256');
  const stamp = value => hash.update(String(value) + '\0');

  stamp(`format ${CACHE_FORMAT}`);
  for(const name of TOOL_PACKAGES)
    stamp(`${name} ${toolVersion(name)}`);

  stamp(`serverName ${Config.get('serverName')}`);
  stamp(`externalURL ${Config.get('externalURL')}`);
  stamp(`urlPrefix ${Config.get('urlPrefix')}`);
  stamp(`minifyJavascript ${minifyJavascript()}`);
  stamp(`clientConfig ${JSON.stringify(Config.getClientConfig())}`);

  // this module decides what the input files turn into, so editing it invalidates the cache just
  // like editing one of them - and it is read through its own URL because prebuild and server may
  // run it from a different working directory than the one the input files are read from
  stamp('server/minify.mjs');
  hash.update(fs.readFileSync(url.fileURLToPath(import.meta.url)));
  stamp('');

  for(const file of INPUT_FILES) {
    stamp(file);
    hash.update(readInputFile(file));
    stamp('');
  }

  return hash.digest('hex');
}

// Throws on anything unexpected - a missing, truncated or foreign entry is a miss, not a reason
// to serve half a build.
export function loadFromCache(directory, key) {
  const entry = JSON.parse(fs.readFileSync(`${directory}/${key}/entry.json`, 'utf8'));
  if(entry.format !== CACHE_FORMAT || entry.key !== key)
    throw new Error('entry was written for a different build');

  const build = {};
  for(const { field, file, encoding } of CACHE_FILES) {
    const content = fs.readFileSync(`${directory}/${key}/${file}`);
    if(content.length !== entry.sizes[file])
      throw new Error(`${file} is ${content.length} bytes instead of ${entry.sizes[file]}`);
    build[field] = encoding ? content.toString(encoding) : content;
  }
  return build;
}

function entryIsUsable(directory, key) {
  try {
    loadFromCache(directory, key);
    return true;
  } catch(e) {
    return false;
  }
}

export function storeInCache(directory, key, build) {
  // the random part keeps two processes that happen to share a PID - which containers on a common
  // save volume do - from writing into the half-built directory of the other
  const temporary = `${directory}/.tmp-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
  fs.mkdirSync(temporary, { recursive: true });

  try {
    const sizes = {};
    for(const { field, file, encoding } of CACHE_FILES) {
      const content = encoding ? Buffer.from(build[field], encoding) : build[field];
      fs.writeFileSync(`${temporary}/${file}`, content);
      sizes[file] = content.length;
    }
    fs.writeFileSync(`${temporary}/entry.json`, JSON.stringify({ format: CACHE_FORMAT, key, sizes }));

    // an entry that is already there was written by a build that agrees with this one, so it is
    // just as good - unless it does not load, in which case nothing else would ever repair it
    if(fs.existsSync(`${directory}/${key}`) && !entryIsUsable(directory, key))
      fs.rmSync(`${directory}/${key}`, { recursive: true, force: true });

    // the rename is what makes the entry visible, in one step: a crash before it leaves a stale
    // temporary directory behind - which pruneCache removes later - but never half an entry
    fs.renameSync(temporary, `${directory}/${key}`);
  } catch(e) {
    fs.rmSync(temporary, { recursive: true, force: true });
    if(!fs.existsSync(`${directory}/${key}`))  // a parallel build got there first, which is fine
      throw e;
  }
}

function pruneCache(directory) {
  const names = fs.readdirSync(directory);
  // another process pruning the same directory can take a name away between the readdir and the
  // stat, which says the same thing as an old entry does: it is gone or on its way out
  const modified = name => fs.statSync(`${directory}/${name}`, { throwIfNoEntry: false })?.mtimeMs;

  const entries = names.filter(name => /^[0-9a-f]{64}$/.test(name))
    .map(name => ({ name, time: modified(name) ?? 0 }))
    .sort((a, b) => b.time - a.time);
  for(const { name } of entries.slice(CACHE_ENTRIES))
    fs.rmSync(`${directory}/${name}`, { recursive: true, force: true });

  const anHourAgo = Date.now() - 60*60*1000;
  for(const name of names.filter(name => name.startsWith('.tmp-')))
    if(modified(name) < anHourAgo)
      fs.rmSync(`${directory}/${name}`, { recursive: true, force: true });
}

// Building the client bundles takes about half a minute on a production checkout and the result
// only lives in memory, so every restart would pay for it again. server/prebuild.mjs calls this
// while the old server is still serving, which fills the cache below; server.mjs then calls it
// again at startup, finds the entry and is listening within seconds. A checkout that changed in
// any way the build cares about misses the cache and builds exactly as before, and so does one
// whose cache directory cannot be written - the cache never decides whether the server can start.
export default async function minifyHTML() {
  let directory, key;
  try {
    directory = cacheDirectory();
    fs.mkdirSync(directory, { recursive: true });
    fs.accessSync(directory, fs.constants.W_OK);
    key = cacheKey();
  } catch(e) {
    Logging.log(`WARNING - Client bundles: cache unusable (${e.message}), building in memory`);
    return await buildHTML();
  }

  const shortKey = key.slice(0, 8);

  // having no entry for this key is the normal case and stays silent, but once entry.json is
  // there the rest of the entry has to be readable as well - anything else is worth a warning
  let cached = null;
  if(fs.existsSync(`${directory}/${key}/entry.json`)) {
    try {
      cached = loadFromCache(directory, key);
    } catch(e) {
      Logging.log(`WARNING - Client bundles: discarding cache entry ${shortKey} (${e.message})`);
    }
  }

  if(cached) {
    try {
      fs.utimesSync(`${directory}/${key}`, new Date(), new Date());  // youngest by use, not by build
    } catch(e) {
      // an entry written by another user can be read but not re-stamped, which only costs it its
      // place in the pruning order - it never invalidates a build that already loaded
    }
    Logging.log(`Client bundles: cache hit ${shortKey}`);
    return cached;
  }

  const started = Date.now();
  const build = await buildHTML();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  try {
    storeInCache(directory, key, build);
    Logging.log(`Client bundles: cache miss, built in ${seconds} s, stored as ${shortKey}`);
  } catch(e) {
    Logging.log(`WARNING - Client bundles: cache miss, built in ${seconds} s, could not be stored (${e.message})`);
  }

  // housekeeping of entries this build does not depend on, so whether it works says nothing about
  // the entry that was just stored
  try {
    pruneCache(directory);
  } catch(e) {
    Logging.log(`WARNING - Client bundles: could not prune the cache (${e.message})`);
  }

  return build;
}
