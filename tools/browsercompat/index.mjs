// Checks the files the browser is served against the browserslist key in package.json and
// reports every feature that is newer than the oldest browser we promise to run in.
//
// Not everything it finds is a problem: a feature that is only an improvement where it exists,
// or one that something else stands in for, is fine to use. Those are marked in the source with
//
//   compat-fallback <bcd path>: <why this one is safe>
//
// which excuses the line it is on and the line below it, or with
//
//   compat-fallback-file <bcd path>: <why these are safe>
//
// which excuses the whole file - for a feature that a file uses dozens of times and one
// fallback covers all of them. A feature that needs no fallback wherever it is used goes into
// exceptions.mjs instead, once, with the same kind of reason. The bcd path is the one this
// tool prints, and it also matches everything below it (css.at-rules.container covers
// css.at-rules.container.style_queries). A marker that stops excusing anything is reported
// too, so that a fallback nobody needs anymore does not quietly stay in the code.
//
// Two fallbacks are recognised without being marked, because CSS has them built in: asking
// with @supports, and declaring the same property more than once - in either order, and
// counting the vendor prefixed spelling as the same property - so that the cascade leaves
// every browser with a declaration it understands.

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, sep } from 'path';

import { scanCSS } from './css.mjs';
import { scanJS } from './js.mjs';
import { browserNames } from './support.mjs';

const annotationPattern = /compat-fallback(-file)?\s+([\w.$-]+)\s*:[ \t]*([^\s*/][^\n]*?)\s*(\*\/|-->|$)/gm;

export function collectAnnotations(source) {
  const annotations = [];
  for(const match of source.matchAll(annotationPattern)) {
    annotations.push({
      line: source.slice(0, match.index).split('\n').length,
      scope: match[1] ? 'file' : 'line',
      feature: match[2],
      reason: match[3],
      used: 0
    });
  }
  return annotations;
}

function excuses(annotation, finding) {
  if(annotation.feature != finding.feature && !finding.feature.startsWith(`${annotation.feature}.`))
    return false;
  return annotation.scope == 'file' || annotation.line == finding.line || annotation.line == finding.line-1;
}

// the client is not only .js and .css files - room.html and editor.html carry their own
function blocks(path, source) {
  if(!path.endsWith('.html'))
    return [ { scan: path.endsWith('.css') ? scanCSS : scanJS, text: source, startLine: 1 } ];
  const found = [];
  for(const match of source.matchAll(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/gi))
    found.push({
      scan: match[1].toLowerCase() == 'style' ? scanCSS : scanJS,
      text: match[2],
      startLine: source.slice(0, match.index).split('\n').length
    });
  return found;
}

export function checkSource({ path, source, lookup, exceptions = [] }) {
  const annotations = collectAnnotations(source);
  const findings = [];
  const seen = new Set();
  const groups = new Map();
  const missingPerDeclaration = new Map();

  for(const block of blocks(path, source)) {
    for(const candidate of block.scan(block.text, { startLine: block.startLine, globalPath: lookup.globalPath })) {
      if(candidate.group) {
        if(!groups.has(candidate.group))
          groups.set(candidate.group, new Set());
        groups.get(candidate.group).add(candidate.declaration);
        if(!missingPerDeclaration.has(candidate.declaration))
          missingPerDeclaration.set(candidate.declaration, new Set());
      }
      if(!candidate.feature)
        continue;
      const missing = lookup.feature(candidate.feature);
      if(!missing)
        continue;
      for(const target of missing.missing)
        missingPerDeclaration.get(candidate.declaration)?.add(target.id);
      const key = `${missing.path}:${candidate.line}`;
      if(seen.has(key))
        continue;
      seen.add(key);
      findings.push({
        file: path,
        line: candidate.line,
        feature: missing.path,
        missing: missing.missing,
        mdn: missing.mdn,
        source: candidate.source,
        group: candidate.group,
        guardedBy: candidate.guardedBy
      });
    }
  }

  for(const finding of findings) {
    // The browser keeps the last declaration of a property it understands, so a rule that
    // declares the same property more than once - image-rendering: crisp-edges next to
    // image-rendering: pixelated, or a property next to its vendor prefixed spelling - is
    // covered as soon as every browser we support understands one of them.
    const alternatives = [ ...groups.get(finding.group) || [] ].map(declaration => missingPerDeclaration.get(declaration));
    if(!finding.guardedBy && alternatives.length > 1 && !lookup.targets.some(target => alternatives.every(missing => missing.has(target.id))))
      finding.guardedBy = 'the other declarations of the same property in the same rule';

    const annotation = annotations.find(a => excuses(a, finding));
    const exception = exceptions.find(e => excuses({ ...e, scope: 'file' }, finding));
    if(finding.guardedBy) {
      finding.status = 'guarded';
    } else if(annotation) {
      ++annotation.used;
      finding.status = 'annotated';
      finding.guardedBy = annotation.reason;
    } else if(exception) {
      exception.used = (exception.used || 0) + 1;
      finding.status = 'excepted';
      finding.guardedBy = exception.reason;
    } else {
      finding.status = 'unsupported';
    }
  }

  const stale = annotations.filter(a => !a.used);
  return { findings, annotations, stale };
}

export function checkFiles({ files, lookup, exceptions = [], read = path => readFileSync(path, 'utf8'), partial = false }) {
  const result = { findings: [], stale: [], files: files.length };
  const used = exceptions.map(exception => ({ ...exception, used: 0 }));
  for(const file of files) {
    const { findings, stale } = checkSource({ path: file, source: read(file), lookup, exceptions: used });
    result.findings.push(...findings);
    result.stale.push(...stale.map(annotation => ({ file, kind: 'marker', ...annotation })));
  }
  // An exception nobody needs anymore is as misleading as a marker nobody needs anymore - but
  // only a run over the whole client can tell that nobody needs it.
  if(!partial)
    result.stale.push(...used.filter(exception => !exception.used).map(exception => ({
      file: 'tools/browsercompat/exceptions.mjs', line: 1, kind: 'exception', ...exception
    })));
  return result;
}

export function clientFiles(root = '.', directory = 'client') {
  const files = [];
  const walk = current => {
    for(const entry of readdirSync(join(root, current)).sort()) {
      const path = join(current, entry);
      if(statSync(join(root, path)).isDirectory())
        walk(path);
      else if(/\.(css|js|mjs|html)$/.test(entry))
        files.push(path.split(sep).join('/'));
    }
  };
  walk(directory);
  // custom.css is whatever the person running the server put there, not something we ship
  return files.filter(file => file != 'client/css/custom.css');
}

export function describeTarget(target) {
  return `${browserNames[target.id] || target.id} ${target.version}`;
}

export function describeMissing(missing) {
  return missing.map(target => `${describeTarget(target)} (${target.since === false ? 'never' : `added in ${target.since}`})`).join(', ');
}
