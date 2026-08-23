// Builds the minified client bundles and stores them in the disk cache that minifyHTML() reads,
// without starting a server. Minifying takes about half a minute on a production checkout, which
// a restart would otherwise spend before it can listen - long enough for a deploy script to give
// up waiting and kill the server it just started.
//
//   node server/prebuild.mjs
//
// The deploy scripts (misc/server-scripts/puppeteer) run this after updating the checkout and
// before stopping the old server, from the same working directory and with the same config.json
// and environment the new server will start with - those decide both what is built and where the
// cache lives, so anything else fills a cache the server will not look at. The new server then
// finds the entry and is listening within seconds. Running it again after a hit does nothing.
//
// Exits 0 once the bundles were built, non-zero if the build failed. A cache that cannot be
// written is reported but is not an error: the server still starts, it just builds them itself.

import fs from 'fs';

import Logging from './logging.mjs';
import minifyHTML, { cacheDirectory, cacheKey } from './minify.mjs';

const started = Date.now();

try {
  await minifyHTML();

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const entry = `${cacheDirectory()}/${cacheKey()}`;
  if(fs.existsSync(entry))
    Logging.log(`Prebuild finished after ${seconds} s - the server will find its client bundles in ${entry}`);
  else
    Logging.log(`WARNING - Prebuild finished after ${seconds} s but stored nothing - the server will build the client bundles itself`);
} catch(e) {
  Logging.handleGenericException('prebuild', e);
  process.exit(1);
}
