#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { validateGameFile } from './validate_gamefile.js';

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

// Read and validate file
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const problems = validateGameFile(data, true);

for (const problem of problems) {
    console.log(`${problem.widget}[${problem.property.join('.')}]: ${problem.message}`);
}

process.exit(problems.length === 0 ? 0 : 1);
