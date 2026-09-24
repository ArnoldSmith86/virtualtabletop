#!/usr/bin/env node

// npm run browsercompat [-- <file> ...]
//
// Scans the client for features the browsers in the browserslist key of package.json do not
// have and exits non zero if any of them is unaccounted for. See index.mjs for how to tell it
// that a feature is used on purpose because something falls back for it.

import { appendFileSync } from 'fs';

import exceptions from './exceptions.mjs';
import { bundledFiles, checkFiles, clientFiles, describeMissing, describeTarget } from './index.mjs';
import { createLookup, loadCompatData, resolveTargets } from './support.mjs';

const files = process.argv.slice(2).filter(argument => !argument.startsWith('-'));
const { targets, untestable } = resolveTargets(undefined, { path: process.cwd() });

if(!targets.length) {
  console.error('The browserslist key in package.json does not name a single browser this can check.');
  process.exit(2);
}

const lookup = createLookup(loadCompatData(), targets);
const { findings, stale, files: checked } = checkFiles({
  files: files.length ? files : [ ...clientFiles(), ...bundledFiles() ],
  lookup,
  exceptions,
  partial: files.length > 0
});

const unsupported = findings.filter(finding => finding.status == 'unsupported');
const excused = findings.filter(finding => finding.status != 'unsupported');

console.log(`Browser support (browserslist key in package.json): ${targets.map(describeTarget).join(', ')}`);
if(untestable.length)
  console.log(`No compatibility data for: ${untestable.join(', ')} - not checked.`);
console.log(`${checked} files checked, ${excused.length} known exception${excused.length == 1 ? '' : 's'}.\n`);

for(const finding of unsupported) {
  console.log(`${finding.file}:${finding.line}`);
  console.log(`  ${finding.source}`);
  console.log(`  ${finding.feature} is missing from ${describeMissing(finding.missing)}`);
  if(finding.overriddenBy)
    console.log(`  "${finding.overriddenBy.source}" on line ${finding.overriddenBy.line} comes after it and works everywhere, so every browser uses that one - put the fallback first`);
  if(finding.mdn)
    console.log(`  ${finding.mdn}`);
  if(process.env.GITHUB_ACTIONS)
    annotate('error', finding.file, finding.line, `${finding.feature} is missing from ${describeMissing(finding.missing)}`);
}

for(const entry of stale) {
  const what = entry.kind == 'exception' ? 'exception' : 'compat-fallback marker';
  console.log(`${entry.file}:${entry.line}`);
  console.log(`  ${entry.feature}: ${entry.reason}`);
  console.log(`  nothing uses ${entry.feature} anymore - remove this ${what}`);
  if(process.env.GITHUB_ACTIONS)
    annotate('error', entry.file, entry.line, `nothing uses ${entry.feature} anymore - remove this ${what}`);
}

if(unsupported.length) {
  console.log(`\n${unsupported.length} feature use${unsupported.length == 1 ? '' : 's'} not supported by every browser we support.`);
  console.log('Use something older, or - if something covers it - say what, next to it:');
  console.log(`  /* compat-fallback ${unsupported[0].feature}: <what happens on a browser without it> */`);
  console.log('Use compat-fallback-file for a whole file, or tools/browsercompat/exceptions.mjs when the');
  console.log('feature needs no fallback anywhere.');
}
if(stale.length)
  console.log(`\n${stale.length} marker${stale.length == 1 ? '' : 's'} without anything left to excuse.`);
if(!unsupported.length && !stale.length)
  console.log('Everything the client uses is supported by every browser in the browserslist key.');

if(process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary());

process.exit(unsupported.length || stale.length ? 1 : 0);

function annotate(level, file, line, message) {
  console.log(`::${level} file=${file},line=${line},title=Browser compatibility::${message}`);
}

function summary() {
  const lines = [ '## Browser compatibility', '', `Target: ${targets.map(describeTarget).join(', ')}`, '' ];
  if(unsupported.length || stale.length) {
    lines.push('| file | feature | missing from |', '| --- | --- | --- |');
    for(const finding of unsupported)
      lines.push(`| \`${finding.file}:${finding.line}\` | \`${finding.feature}\` | ${describeMissing(finding.missing)} |`);
    for(const entry of stale)
      lines.push(`| \`${entry.file}:${entry.line}\` | \`${entry.feature}\` | ${entry.kind} that no longer excuses anything |`);
  } else {
    lines.push(`Everything the client uses is supported. ${excused.length} documented exception${excused.length == 1 ? '' : 's'}.`);
  }
  return `${lines.join('\n')}\n`;
}
