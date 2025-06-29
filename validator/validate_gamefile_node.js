#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { validateGameFile } = require('./validate_gamefile.js');

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
//try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    const problems = validateGameFile(data, true);
    
    if (problems.length === 0) {
        console.log('Valid!');
    } else {
        console.log('Invalid!');
        for (const problem of problems) {
            console.log(`${problem.widget}[${problem.property.join('.')}]: ${problem.message}`);
        }
    }
    
    process.exit(problems.length === 0 ? 0 : 1);
    
//} catch (error) {
//    console.error(`Error: ${error.message}`);
//    process.exit(1);
//} 