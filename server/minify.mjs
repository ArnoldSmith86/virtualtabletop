import fs from 'fs';
import os from 'os';
import path from 'path';
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

export default async function minifyHTML() {
  const room = await compress('client/room.html', [
    'client/css/layout.css',

    'client/css/overlays/misc.css',
    'client/css/overlays/players.css',
    'client/css/overlays/states.css',
    'client/css/overlays/status.css',
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
  ], [
    'node_modules/dompurify/dist/purify.js',

    'client/js/domhelpers.js',
    'client/js/calculateLayout.js',
    'client/js/connection.js',
    'client/js/overlays/status.js',
    'client/js/serverstate.js',
    'client/js/legacymoderegistry.js',
    'client/js/legacymodes.js',
    'client/js/geometry.js',
    'client/js/compute.js',
    'client/js/overlaystate.js',
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
  ]);

  const editorCSS = await compressCSS([
    'client/css/editor/layout.css',
    'client/css/editor/toolbar.css',
    'client/css/editor/dragtoolbar.css',
    'client/css/editor/sidebar.css',
    'client/css/editor/sidebarModules.css',
    'client/css/editor/sidebarProperties.css',
    'client/css/editor/propertyInputs.css',
    'client/css/editor/deckeditor.css',
    'client/css/editor/controls/routine.css',
    'client/css/editor/controls/popup.css',
    'client/css/editor/controls/events.css',

    'client/css/editmode.css',
    'client/css/jsonedit.css',
    'client/css/tracing.css'
  ]);

  let editorJS = await compressJS([  // keeps its exports: main.js imports this bundle
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
    'client/js/editor/toolbar/feedback.js',
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
    'client/js/editor/controls/widgetselection.js',
    'client/js/editor/cssEditor.js',
    'client/js/editor/sidebar/properties.js',
    'client/js/editor/sidebar/undo.js',
    'client/js/editor/sidebar/json.js',
    'client/js/editor/sidebar/assets.js',
    'client/js/editor/sidebar/fileHandlers.js',
    'client/js/editor/sidebar/files.js',
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
  ], true);

  const editorHTML = await htmlMinify(fs.readFileSync(path.resolve() + '/client/editor.html', {encoding:'utf8'}), htmlMinifyOptions());

  editorJS = editorJS.replace(/["']\ \/\/\*\*\*\ CSS\ \*\*\*\/\/\ ["']/, _=>'`' + editorCSS.replace(/\\/g, '\\\\') + '`');
  editorJS = editorJS.replace(/["']\ \/\/\*\*\*\ HTML\ \*\*\*\/\/\ ["']/, _=>'`' + editorHTML + '`');

  // fflate is the one client script that does not go through the bundles: it is loaded on demand
  // (loadZipLibrary in client/js/overlays/states.js) and served straight from node_modules. It
  // already arrives minified, but it was sent uncompressed.
  const fflate = fs.readFileSync(path.resolve() + '/node_modules/fflate/umd/index.js');

  return {
    min: room.min,
    gzipped: room.gzipped,
    editorJSmin: editorJS,
    editorJSgzipped: await gzip(editorJS),
    fflateMin: fflate,
    fflateGzipped: await gzip(fflate)
  };
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
  let htmlString = fs.readFileSync(path.resolve() + '/' + htmlFile, {encoding:'utf8'});
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
