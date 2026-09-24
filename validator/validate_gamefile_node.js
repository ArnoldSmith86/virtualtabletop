#!/usr/bin/env node

import path from 'path';

import { validateGameFile } from './validate_gamefile.js';
import { readUpdatedGameFile } from './updated_gamefile.js';

// Parse command line arguments
const args = process.argv.slice(2);
let filePath = null;

for (let i = 0; i < args.length; i++) {
    if (!filePath) {
        filePath = args[i];
    }
}

if (!filePath) {
    console.error('Usage: node validate_gamefile_node.js <file>');
    console.error('  <file>     Path to the game JSON file');
    process.exit(1);
}

// Read and validate file. A file that cannot be read or parsed is a problem with the
// file itself, so it is reported like any other finding instead of throwing.
let data;
try {
    data = readUpdatedGameFile(filePath);
} catch (error) {
    const message = error instanceof SyntaxError ? `Not valid JSON: ${error.message}` : error.message;
    console.log(`[]: ${message}`);
    process.exit(1);
}

const problems = validateGameFile(data, true);

for (const problem of problems) {
    console.log(`${problem.widget}[${problem.property.join('.')}]: ${problem.message}`);
}

process.exit(problems.length === 0 ? 0 : 1);
