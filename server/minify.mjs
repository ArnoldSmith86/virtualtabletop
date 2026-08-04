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
  ], [
    'node_modules/dompurify/dist/purify.js',

    'client/js/domhelpers.js',
    'client/js/calculateLayout.js',
    'client/js/connection.js',
    'client/js/serverstate.js',
    'client/js/legacymodes.js',
    'client/js/geometry.js',
    'client/js/compute.js',
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

    'client/css/editmode.css',
    'client/css/jsonedit.css',
    'client/css/tracing.css'
  ]);

  let editorJS = await compressJS([
    'client/js/editor/layout.js',
    'client/js/editor/selection.js',
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
    'client/js/editor/sidebar/properties.js',
    'client/js/editor/sidebar/undo.js',
    'client/js/editor/sidebar/json.js',
    'client/js/editor/sidebar/assets.js',
    'client/js/editor/sidebar/toolbox.js',
    'client/js/editor/sidebar/gameSettings.js',
    'client/js/editor/sidebar/widgets.js',
    'client/js/editor/deckeditor.js',

    'client/js/editmode.js',
    'client/js/jsonedit.js',
    'client/js/traceviewer.js',

    'validator/validate_gamefile.js'
  ]);

  const editorHTML = await htmlMinify(fs.readFileSync(path.resolve() + '/client/editor.html', {encoding:'utf8'}), htmlMinifyOptions());

  editorJS = editorJS.replace(/["']\ \/\/\*\*\*\ CSS\ \*\*\*\/\/\ ["']/, _=>'`' + editorCSS.replace(/\\/g, '\\\\') + '`');
  editorJS = editorJS.replace(/["']\ \/\/\*\*\*\ HTML\ \*\*\*\/\/\ ["']/, _=>'`' + editorHTML + '`');

  return {
    min: room.min,
    gzipped: room.gzipped,
    editorJSmin: editorJS,
    editorJSgzipped: await util.promisify(zlib.gzip)(editorJS)
  };
}

async function compressCSS(cssFiles) {
  // Hand clean-css the files separately instead of one concatenated string: the output is
  // identical but problems are then reported as file:line:column instead of a line number
  // in a string that does not exist anywhere on disk
  const combinedCSSContent = {};
  for(const filePath of cssFiles)
    combinedCSSContent[filePath] = { styles: fs.readFileSync(filePath, 'utf8') };

  // clean-css does not throw on broken input, it drops the offending declaration and only
  // mentions it here - without this the minified client would be missing a rule silently
  const result = new CleanCSS().minify(combinedCSSContent);
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

async function compressJS(jsFiles) {
  // Combine all JavaScript files and remove import statements
  const combinedJSContent = jsFiles
    .map(filePath => fs.readFileSync(filePath, 'utf8'))  // Read each file
    .map(jsContent => removeImportStatements(jsContent))  // Remove import statements
    .join('\n');  // Combine them into a single string

  // Perform compression
  if(!minifyJavascript())
    return combinedJSContent;

  return (await jsMinify(combinedJSContent)).code;
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

  const gzipped = await util.promisify(zlib.gzip)(html);
  return {
    min: html,
    gzipped
  };
}
