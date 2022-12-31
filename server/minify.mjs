import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';

import minify from '@node-minify/core';
import noCompress from '@node-minify/no-compress';
import cleanCSS from '@node-minify/clean-css';
import uglifyES from '@node-minify/uglify-es';
import htmlMinifier from '@node-minify/html-minifier';

import Config from './config.mjs';

export default async function minifyRoom() {
  return await compress('client/room.html', [
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
    'client/css/widgets/seat.css',
    'client/css/widgets/spinner.css',
    'client/css/widgets/timer.css',

    'client/css/fonts.css',
  ], [
    'node_modules/dompurify/dist/purify.js',

    'client/js/domhelpers.js',
    'client/js/connection.js',
    'client/js/serverstate.js',
    'client/js/geometry.js',
    'client/js/compute.js',
    'client/js/mousehandling.js',
    'client/js/statemanaged.js',

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
    'client/js/widgets/seat.js',
    'client/js/widgets/spinner.js',
    'client/js/widgets/timer.js',

    'client/components/baseEditOverlay.js',
    'client/components/deckEditor.js',
    'client/components/loadComponents.js',

    'client/js/main.js'
  ]);
}

function compress(htmlFile, cssFiles, jsFiles) {
  let roomHTML = fs.readFileSync(path.resolve() + '/' + htmlFile, {encoding:'utf8'});

  return new Promise((resolve, reject) => {
    minify({
      compressor: cleanCSS,
      input: cssFiles,
      output: os.tmpdir() + '/out.css'
    }).then(function(min) {
      roomHTML = roomHTML.replace(/\ \/\*\*\*\ CSS\ \*\*\*\/\ /, min).replace(/\ \/\/\*\*\*\ CONFIG\ \*\*\*\/\/\ /, `const config = ${JSON.stringify(Config.config)};`);
      return minify({
        compressor: Config.get('minifyJavascript') ? uglifyES : noCompress,
        input: jsFiles,
        output: os.tmpdir() + '/out.js'
      });
    }).then(function(min) {
      const minNoImports = min.replace(/\bimport[^;]*\.\/[^;]*;/g, "")
      return minify({
        compressor: htmlMinifier,
        content: roomHTML.replace(/\ \/\/\*\*\*\ JS\ \*\*\*\/\/\ /, minNoImports),
        options: {
          conservativeCollapse: true
        }
      })
    }).then(function(min) {
      roomHTML = min;
      zlib.gzip(min, (err, gzipped) => {
        resolve({ min, gzipped });
      });
    });
  });
}
