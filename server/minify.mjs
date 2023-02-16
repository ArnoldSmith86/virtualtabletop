import fs from 'fs';
import os from 'os';
import path from 'path';
import util from 'util';
import zlib from 'zlib';

import minify from '@node-minify/core';
import noCompress from '@node-minify/no-compress';
import cleanCSS from '@node-minify/clean-css';
import uglifyES from '@node-minify/uglify-es';
import htmlMinifier from '@node-minify/html-minifier';

import Config from './config.mjs';

export default async function minifyHTML() {
  const room = await compress('client/room.html', [
    'client/css/layout.css',

    'client/css/overlays/misc.css',
    'client/css/overlays/players.css',
    'client/css/overlays/states.css',
    'client/css/overlays/connectionlost.css',
    'client/css/overlays/about.css',

    'client/css/widgets/basicwidget.css',
    'client/css/widgets/button.css',
    'client/css/widgets/canvas.css',
    'client/css/widgets/card.css',
    'client/css/widgets/classes.css',
    'client/css/widgets/deck.css',
    'client/css/widgets/holder.css',
    'client/css/widgets/label.css',
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
    'client/js/connection.js',
    'client/js/serverstate.js',
    'client/js/geometry.js',
    'client/js/compute.js',
    'client/js/mousehandling.js',
    'client/js/tracing.js',
    'client/js/statemanaged.js',
    'client/js/color.js',

    'client/js/overlays/players.js',
    'client/js/overlays/states.js',

    'client/js/widgets/widget.js',
    'client/js/widgets/basicwidget.js',
    'client/js/widgets/button.js',
    'client/js/widgets/canvas.js',
    'client/js/widgets/card.js',
    'client/js/widgets/deck.js',
    'client/js/widgets/holder.js',
    'client/js/widgets/label.js',
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
    'client/css/editor/sidebar.css',

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
    'client/js/editor/toolbar/close.js',
    'client/js/editor/sidebarModule.js',
    'client/js/editor/sidebar/properties.js',
    'client/js/editor/sidebar/undo.js',
    'client/js/editor/sidebar/json.js',

    'node_modules/vue/dist/vue.global.js',

    'client/js/editmode.js',
    'client/js/jsonedit.js',
    'client/js/traceviewer.js',

    'client/components/baseEditOverlay.js',
    'client/components/deckEditor.js',
    'client/components/loadComponents.js'
  ]);
  editorJS = editorJS.replace(/["']\ \/\/\*\*\*\ CSS\ \*\*\*\/\/\ ["']/, '`' + editorCSS.replace(/\\/g, '\\\\') + '`');
  editorJS = editorJS.replace(/["']\ \/\/\*\*\*\ HTML\ \*\*\*\/\/\ ["']/, '`' + await minify({
    compressor: htmlMinifier,
    content: fs.readFileSync(path.resolve() + '/client/editor.html', {encoding:'utf8'}),
    options: {
      conservativeCollapse: true
    }
  }) + '`');

  return {
    min: room.min,
    gzipped: room.gzipped,
    editorJSmin: editorJS,
    editorJSgzipped: await util.promisify(zlib.gzip)(editorJS)
  };
}

async function compressCSS(cssFiles) {
  return await minify({
    compressor: cleanCSS,
    input: cssFiles,
    output: os.tmpdir() + '/out.css'
  });
}

async function compressJS(jsFiles) {
  return await minify({
    compressor: Config.get('minifyJavascript') ? uglifyES : noCompress,
    input: jsFiles,
    output: os.tmpdir() + '/out.js'
  });
}

async function compress(htmlFile, cssFiles, jsFiles) {
  let htmlString = fs.readFileSync(path.resolve() + '/' + htmlFile, {encoding:'utf8'});

  const css = await compressCSS(cssFiles);
  htmlString = htmlString.replace(/\ \/\*\*\*\ CSS\ \*\*\*\/\ /, css).replace(/\ \/\/\*\*\*\ CONFIG\ \*\*\*\/\/\ /, `const config = ${JSON.stringify(Config.config)};`);

  const js = await compressJS(jsFiles);
  htmlString = htmlString.replace(/\ \/\/\*\*\*\ JS\ \*\*\*\/\/\ /, js.replace(/\bimport[^(][^;]*\.\/[^;]*;/g, ""));

  const html = await minify({
    compressor: htmlMinifier,
    content: htmlString,
    options: {
      conservativeCollapse: true
    }
  });

  const gzipped = await util.promisify(zlib.gzip)(html);
  return {
    min: html,
    gzipped
  };
}
