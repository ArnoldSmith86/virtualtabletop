#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { validateGameFile } from './validate_gamefile.js';

// Configuration
const GAMES_DIR = '../library/games';
const TUTORIALS_DIR = '../library/tutorials';
const OUTPUT_FILE = 'validation_report.html';

// Colors for different problem severity levels
const SEVERITY_COLORS = {
    error: '#dc3545',
    warning: '#ffc107',
    info: '#17a2b8'
};

// HTML template for the report
const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Virtual Tabletop Library Validation Report</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f8f9fa;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 20px;
            text-align: center;
            border-radius: 10px;
            margin-bottom: 30px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        
        .header p {
            font-size: 1.1rem;
            opacity: 0.9;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .stat-number {
            font-size: 1.5rem;
            font-weight: bold;
            color: #667eea;
        }
        
        .stat-label {
            color: #666;
            margin-top: 5px;
        }
        
        .section {
            background: white;
            border-radius: 8px;
            margin-bottom: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .section-header {
            background: #f8f9fa;
            padding: 20px;
            border-bottom: 1px solid #dee2e6;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .section-header:hover {
            background: #e9ecef;
        }
        
        .section-header h2 {
            color: #495057;
            font-size: 1.5rem;
        }
        
        .section-content {
            padding: 20px;
            display: none;
        }
        
        .section-content.expanded {
            display: block;
        }
        
        .item {
            border: 1px solid #dee2e6;
            border-radius: 6px;
            margin-bottom: 15px;
            overflow: hidden;
        }
        
        .item-header {
            padding: 15px;
            background: #f8f9fa;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        
        .item-header:hover {
            background: #e9ecef;
        }
        
        .item-image {
            width: 60px;
            height: 60px;
            border-radius: 6px;
            object-fit: cover;
            background: #ddd;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            color: #666;
        }
        
        .item-info {
            flex: 1;
        }
        
        .item-name {
            font-weight: bold;
            color: #495057;
            margin-bottom: 5px;
        }
        
        .item-path {
            font-size: 0.9rem;
            color: #6c757d;
        }
        
        .item-time {
            font-size: 0.8rem;
            color: #28a745;
            font-weight: bold;
        }
        
        .problem-count {
            padding: 5px 12px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 0.9rem;
        }
        
        .problem-count.error {
            background: #dc3545;
            color: white;
        }
        
        .problem-count.warning {
            background: #ffc107;
            color: #212529;
        }
        
        .problem-count.info {
            background: #17a2b8;
            color: white;
        }
        
        .problem-count.clean {
            background: #28a745;
            color: white;
        }
        
        .problems {
            padding: 15px;
            display: none;
            border-top: 1px solid #dee2e6;
        }
        
        .problems.expanded {
            display: block;
        }
        
        .problem {
            padding: 10px;
            margin-bottom: 10px;
            border-radius: 4px;
            border-left: 4px solid;
        }
        
        .problem.error {
            background: #f8d7da;
            border-left-color: #dc3545;
        }
        
        .problem.warning {
            background: #fff3cd;
            border-left-color: #ffc107;
        }
        
        .problem.info {
            background: #d1ecf1;
            border-left-color: #17a2b8;
        }
        
        .problem-widget {
            font-weight: bold;
            color: #495057;
            margin-bottom: 5px;
        }
        
        .problem-property {
            font-family: monospace;
            color: #6c757d;
            margin-bottom: 5px;
        }
        
        .problem-message {
            color: #495057;
        }
        
        .toggle-icon {
            transition: transform 0.2s;
        }
        
        .toggle-icon.expanded {
            transform: rotate(180deg);
        }
        
        .no-problems {
            color: #28a745;
            font-style: italic;
            text-align: center;
            padding: 20px;
        }
        
        .loading {
            text-align: center;
            padding: 40px;
            color: #6c757d;
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 10px;
            }
            
            .header h1 {
                font-size: 2rem;
            }
            
            .item-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 10px;
            }
            
            .item-image {
                width: 50px;
                height: 50px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Virtual Tabletop Library Validation Report</h1>
            <p>Generated on {{timestamp}}</p>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">{{totalItems}}</div>
                <div class="stat-label">Total Items</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">{{totalGames}}</div>
                <div class="stat-label">Games</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">{{totalTutorials}}</div>
                <div class="stat-label">Tutorials</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">{{itemsWithProblems}}</div>
                <div class="stat-label">Items with Problems</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">{{totalProblems}}</div>
                <div class="stat-label">Total Problems</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">{{runtimeMs}}ms</div>
                <div class="stat-label">Runtime</div>
            </div>
        </div>
        
        {{content}}
    </div>
    
    <script>
        // Toggle section visibility
        document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', () => {
                const content = header.nextElementSibling;
                const icon = header.querySelector('.toggle-icon');
                
                content.classList.toggle('expanded');
                icon.classList.toggle('expanded');
            });
        });
        
        // Toggle item problem details
        document.querySelectorAll('.item-header').forEach(header => {
            header.addEventListener('click', () => {
                const problems = header.nextElementSibling;
                problems.classList.toggle('expanded');
            });
        });
    </script>
</body>
</html>`;

// Helper function to get library image from JSON metadata
function getLibraryImage(jsonPath) {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (data._meta && data._meta.info && data._meta.info.image) {
        return `https://virtualtabletop.io${data._meta.info.image}`;
    }
    return null;
}

// Helper function to get game/tutorial name from JSON
function getItemName(jsonPath) {
    try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (data._meta && data._meta.info && data._meta.info.name) {
            return data._meta.info.name;
        }
        // Fallback to directory name
        return path.basename(path.dirname(jsonPath));
    } catch (error) {
        return path.basename(path.dirname(jsonPath));
    }
}

// Helper function to determine problem severity
function getProblemSeverity(problem) {
    const message = problem.message.toLowerCase();
    if (message.includes('required') || message.includes('missing') || message.includes('invalid')) {
        return 'error';
    }
    if (message.includes('unrecognized') || message.includes('unknown')) {
        return 'warning';
    }
    return 'info';
}

// Helper function to get problem count by severity
function getProblemCounts(problems) {
    const counts = { error: 0, warning: 0, info: 0 };
    problems.forEach(problem => {
        const severity = getProblemSeverity(problem);
        counts[severity]++;
    });
    return counts;
}

// Main validation function
async function validateLibrary() {
    console.log('Starting library validation...');
    const startTime = Date.now();
    
    const results = {
        games: [],
        tutorials: [],
        stats: {
            totalGames: 0,
            totalTutorials: 0,
            totalProblems: 0,
            itemsWithProblems: 0,
            runtimeMs: 0
        }
    };
    
    // Validate games
    console.log('Validating games...');
    const gamesPath = path.resolve(GAMES_DIR);
    if (fs.existsSync(gamesPath)) {
        const gameDirs = fs.readdirSync(gamesPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        for (const gameDir of gameDirs) {
            const gamePath = path.join(gamesPath, gameDir);
            const jsonFile = path.join(gamePath, '0.json');
            
            if (fs.existsSync(jsonFile)) {
                const gameStartTime = Date.now();
                try {
                    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
                    const problems = validateGameFile(data, true);
                    const gameTime = Date.now() - gameStartTime;
                    
                    const gameResult = {
                        name: getItemName(jsonFile),
                        path: jsonFile,
                        image: getLibraryImage(jsonFile),
                        problems: problems,
                        problemCounts: getProblemCounts(problems),
                        timeMs: gameTime
                    };
                    
                    results.games.push(gameResult);
                    results.stats.totalGames++;
                    results.stats.totalProblems += problems.length;
                    if (problems.length > 0) {
                        results.stats.itemsWithProblems++;
                    }
                    
                    console.log(`  ${gameDir}: ${problems.length} problems (${gameTime}ms)`);
                } catch (error) {
                    const gameTime = Date.now() - gameStartTime;
                    console.error(`  Error validating ${gameDir}:`, error.message);
                    results.games.push({
                        name: gameDir,
                        path: jsonFile,
                        image: null,
                        problems: [{
                            widget: '',
                            property: [],
                            message: `Failed to parse JSON: ${error.message}`
                        }],
                        problemCounts: { error: 1, warning: 0, info: 0 },
                        timeMs: gameTime
                    });
                    results.stats.totalGames++;
                    results.stats.totalProblems++;
                    results.stats.itemsWithProblems++;
                }
            }
        }
    }
    
    // Validate tutorials
    console.log('Validating tutorials...');
    const tutorialsPath = path.resolve(TUTORIALS_DIR);
    if (fs.existsSync(tutorialsPath)) {
        const tutorialDirs = fs.readdirSync(tutorialsPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        for (const tutorialDir of tutorialDirs) {
            const tutorialPath = path.join(tutorialsPath, tutorialDir);
            const jsonFile = path.join(tutorialPath, '0.json');
            
            if (fs.existsSync(jsonFile)) {
                const tutorialStartTime = Date.now();
                try {
                    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
                    const problems = validateGameFile(data, false); // Don't check meta for tutorials
                    const tutorialTime = Date.now() - tutorialStartTime;
                    
                    const tutorialResult = {
                        name: getItemName(jsonFile),
                        path: jsonFile,
                        image: getLibraryImage(jsonFile),
                        problems: problems,
                        problemCounts: getProblemCounts(problems),
                        timeMs: tutorialTime
                    };
                    
                    results.tutorials.push(tutorialResult);
                    results.stats.totalTutorials++;
                    results.stats.totalProblems += problems.length;
                    if (problems.length > 0) {
                        results.stats.itemsWithProblems++;
                    }
                    
                    console.log(`  ${tutorialDir}: ${problems.length} problems (${tutorialTime}ms)`);
                } catch (error) {
                    const tutorialTime = Date.now() - tutorialStartTime;
                    console.error(`  Error validating ${tutorialDir}:`, error.message);
                    results.tutorials.push({
                        name: tutorialDir,
                        path: jsonFile,
                        image: null,
                        problems: [{
                            widget: '',
                            property: [],
                            message: `Failed to parse JSON: ${error.message}`
                        }],
                        problemCounts: { error: 1, warning: 0, info: 0 },
                        timeMs: tutorialTime
                    });
                    results.stats.totalTutorials++;
                    results.stats.totalProblems++;
                    results.stats.itemsWithProblems++;
                }
            }
        }
    }
    
    results.stats.runtimeMs = Date.now() - startTime;
    return results;
}

// Generate HTML content for a section
function generateSectionHTML(title, items, type) {
    if (items.length === 0) {
        return `
        <div class="section">
            <div class="section-header">
                <h2>${title}</h2>
                <span class="toggle-icon">▼</span>
            </div>
            <div class="section-content">
                <div class="no-problems">No ${type} found.</div>
            </div>
        </div>`;
    }
    
    const itemsHTML = items.map(item => {
        const totalProblems = item.problems.length;
        const problemClass = totalProblems === 0 ? 'clean' : 
                           item.problemCounts.error > 0 ? 'error' : 
                           item.problemCounts.warning > 0 ? 'warning' : 'info';
        
        const problemsHTML = item.problems.map(problem => {
            const severity = getProblemSeverity(problem);
            const propertyPath = problem.property.length > 0 ? problem.property.join('.') : 'root';
            
            // Escape HTML content to prevent layout issues with special characters
            const escapeHtml = (text) => {
                return text
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            };
            
            return `
            <div class="problem ${severity}">
                <div class="problem-widget">${escapeHtml(problem.widget || 'root')}</div>
                <div class="problem-property">${escapeHtml(propertyPath)}</div>
                <div class="problem-message">${escapeHtml(problem.message)}</div>
            </div>`;
        }).join('');
        
        return `
        <div class="item">
            <div class="item-header">
                <div class="item-image">
                    ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width: 100%; height: 100%; object-fit: cover;">` : 'No Image'}
                </div>
                <div class="item-info">
                    <div class="item-name">${item.name}</div>
                    <div class="item-path">${item.path}</div>
                    <div class="item-time">${item.timeMs}ms</div>
                </div>
                <div class="problem-count ${problemClass}">
                    ${totalProblems}
                </div>
            </div>
            <div class="problems">
                ${problemsHTML}
            </div>
        </div>`;
    }).join('');
    
    return `
    <div class="section">
        <div class="section-header">
            <h2>${title}</h2>
            <span class="toggle-icon">▼</span>
        </div>
        <div class="section-content">
            ${itemsHTML}
        </div>
    </div>`;
}

// Generate the complete HTML report
function generateHTMLReport(results) {
    const timestamp = new Date().toLocaleString();
    const totalItems = results.stats.totalGames + results.stats.totalTutorials;
    
    // Sort items by problem count (most problems first)
    const sortedGames = results.games.sort((a, b) => b.problems.length - a.problems.length);
    const sortedTutorials = results.tutorials.sort((a, b) => b.problems.length - a.problems.length);
    
    const gamesHTML = generateSectionHTML('Games', sortedGames, 'games');
    const tutorialsHTML = generateSectionHTML('Tutorials', sortedTutorials, 'tutorials');
    
    let html = HTML_TEMPLATE
        .replace('{{timestamp}}', timestamp)
        .replace('{{totalItems}}', totalItems)
        .replace('{{totalGames}}', results.stats.totalGames)
        .replace('{{totalTutorials}}', results.stats.totalTutorials)
        .replace('{{itemsWithProblems}}', results.stats.itemsWithProblems)
        .replace('{{totalProblems}}', results.stats.totalProblems)
        .replace('{{runtimeMs}}', results.stats.runtimeMs)
        .replace('{{content}}', _=>gamesHTML + tutorialsHTML);
    
    return html;
}

// Main execution
async function main() {
    try {
        const results = await validateLibrary();
        const html = generateHTMLReport(results);
        
        const outputPath = path.resolve(OUTPUT_FILE);
        fs.writeFileSync(outputPath, html);
        
        console.log('\nValidation complete!');
        console.log(`Total games: ${results.stats.totalGames}`);
        console.log(`Total tutorials: ${results.stats.totalTutorials}`);
        console.log(`Items with problems: ${results.stats.itemsWithProblems}`);
        console.log(`Total problems: ${results.stats.totalProblems}`);
        console.log(`Runtime: ${results.stats.runtimeMs}ms`);
        console.log(`\nReport generated: ${outputPath}`);
        
        // Exit with error code if there are problems
        process.exit(results.stats.totalProblems > 0 ? 1 : 0);
    } catch (error) {
        console.error('Error during validation:', error);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
} 