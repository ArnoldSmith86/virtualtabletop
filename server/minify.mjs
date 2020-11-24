import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

import minify from '@node-minify/core';
import noCompress from '@node-minify/no-compress';
import cleanCSS from '@node-minify/clean-css';
import uglifyES from '@node-minify/uglify-es';
import htmlMinifier from '@node-minify/html-minifier';

export default function minifyRoom() {
  let roomHTML = fs.readFileSync(path.resolve() + '/client/room.html', {encoding:'utf8'});

  return new Promise((resolve, reject) => {
    minify({
      compressor: cleanCSS,
      input: [
        'client/css/layout.css',

        'client/css/editmode.css',

        'client/css/overlays/players.css',
        'client/css/overlays/states.css',

        'client/css/widgets/button.css',
        'client/css/widgets/card.css',
        'client/css/widgets/classes.css',
        'client/css/widgets/deck.css',
        'client/css/widgets/holder.css',
        'client/css/widgets/label.css',
        'client/css/widgets/pile.css',
        'client/css/widgets/spinner.css'
      ],
      output: '/tmp/out.css'
    }).then(function(min) {
      roomHTML = roomHTML.replace(/ \{\{CSS\}\} /, min);
      return minify({
        compressor: process.env.NOCOMPRESS ? noCompress : uglifyES,
        input: [
          'client/js/domhelpers.js',
          'client/js/connection.js',
          'client/js/serverstate.js',
          'client/js/editmode.js',
          'client/js/geometry.js',
          'client/js/mousehandling.js',
          'client/js/statemanaged.js',
          'client/js/widgets/widget.js',

          'client/js/widgets/basicwidget.js',
          'client/js/widgets/button.js',
          'client/js/widgets/card.js',
          'client/js/widgets/deck.js',
          'client/js/widgets/holder.js',
          'client/js/widgets/label.js',
          'client/js/widgets/pile.js',
          'client/js/widgets/spinner.js',

          'client/js/overlays/players.js',
          'client/js/overlays/states.js',

          'client/js/main.js'
        ],
        output: '/tmp/out.js'
      });
    }).then(function(min) {
      return minify({
        compressor: htmlMinifier,
        content: roomHTML.replace(/ \{\{JS\}\} /, min)
      })
    }).then(function(min) {
      roomHTML = min;
      zlib.gzip(min, (err, gzipped) => {
        resolve({ min, gzipped });
      });
    });
  });
}
