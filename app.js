/**
 * PDP Matcher Prototype Logic
 * Handles CSV parsing, N-gram generation, matching algorithm, and UI rendering.
 */

// State
let csvData = []; // Array of { id, phrase, url, anchor, tokens, originalRow }
let lastMatches = []; // Store last run results for export

// DOM Elements
const els = {
    csvFile: document.getElementById('csvFile'),
    csvStatus: document.getElementById('csvStatus'),
    pdpInput: document.getElementById('pdpInput'),
    runBtn: document.getElementById('runBtn'),
    pdpTitle: document.getElementById('pdpTitle'),
    relatedContainer: document.getElementById('relatedContainer'),
    related: document.getElementById('related'),
    debugOut: document.getElementById('debugOut'),
    exportHtml: document.getElementById('exportHtml'),
    exportJson: document.getElementById('exportJson')
};

// --- Initialization & Event Listeners ---

els.csvFile.addEventListener('change', handleFileUpload);
els.runBtn.addEventListener('click', runMatching);
els.exportHtml.addEventListener('click', exportHTML);
els.exportJson.addEventListener('click', exportJSON);

// --- CSV Handling ---

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            if (results.errors.length) {
                console.warn("CSV Errors:", results.errors);
            }
            processCSVData(results.data, results.meta.fields);
        }
    });
}

function processCSVData(data, fields) {
    // Identify column names case-insensitively
    const headers = {};
    fields.forEach(f => headers[f.toLowerCase()] = f);

    const colPhrase = headers['pdp phrase'];
    const colUrl = headers['plp url'];
    const colAnchor = headers['anchor text'];

    if (!colPhrase || !colUrl || !colAnchor) {
        els.csvStatus.textContent = "Error: Missing columns";
        els.csvStatus.style.background = "#ffebee";
        els.csvStatus.style.color = "#c62828";
        return;
    }

    // Process and store rows
    csvData = data.map((row, index) => {
        const rawPhrase = row[colPhrase] || "";
        const normPhrase = normalize(rawPhrase);
        return {
            id: index,
            phrase: normPhrase,
            tokens: normPhrase.split(' ').filter(t => t), // Tokenize for fallback/scoring
            url: (row[colUrl] || "").trim(),
            anchor: (row[colAnchor] || "").trim(),
            originalRow: row
        };
    }).filter(item => item.phrase && item.url && item.anchor); // Filter invalid rows

    els.csvStatus.textContent = `Loaded ${csvData.length} rows`;
    els.csvStatus.style.background = "#e8f5e9";
    els.csvStatus.style.color = "#2e7d32";
    console.log("Processed CSV Data:", csvData);
}

// --- Core Logic: Normalization & Matching ---

/**
 * Normalizes text: lowercase, remove non-alphanumeric (except space),
 * collapse spaces, trim.
 */
function normalize(text) {
    return text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ') // Replace punctuation with space
        .replace(/\s+/g, ' ')         // Collapse multiple spaces
        .trim();
}

/**
 * Generates N-grams from text tokens.
 * Order: Longest N-grams first (N down to 1), preserving left-to-right order.
 */
function generateNGrams(text) {
    const tokens = text.split(' ').filter(t => t);
    const nGrams = [];
    const seen = new Set();

    const maxN = Math.min(4, tokens.length);

    // Outer loop: N size (descending)
    for (let n = maxN; n >= 1; n--) {
        // Inner loop: Sliding window
        for (let i = 0; i <= tokens.length - n; i++) {
            const gram = tokens.slice(i, i + n).join(' ');
            if (!seen.has(gram)) {
                nGrams.push(gram);
                seen.add(gram);
            }
        }
    }
    return { nGrams, tokens };
}

function runMatching() {
    if (!csvData.length) {
        alert("Please upload a CSV file first.");
        return;
    }

    const rawH1 = els.pdpInput.value;
    if (!rawH1.trim()) {
        alert("Please enter a PDP title.");
        return;
    }

    const normH1 = normalize(rawH1);
    const { nGrams, tokens: h1Tokens } = generateNGrams(normH1);
    
    const matchedRowIndices = new Set();
    const matches = [];

    // --- Pass 1: Exact Match (N-grams) ---
    // Check generated N-grams against CSV phrases
    nGrams.forEach(gram => {
        // Find all rows matching this gram
        const rows = csvData.filter(row => row.phrase === gram);
        
        rows.forEach(row => {
            if (!matchedRowIndices.has(row.id)) {
                matches.push({
                    ...row,
                    matchType: 'exact',
                    score: row.tokens.length, // Score by token length
                    matchText: gram
                });
                matchedRowIndices.add(row.id);
            }
        });
    });

    // --- Pass 2: Token Fallback ---
    // Check remaining single-word CSV phrases against H1 tokens
    csvData.forEach(row => {
        if (matchedRowIndices.has(row.id)) return; // Already matched

        // Only consider single-token phrases for fallback
        if (row.tokens.length === 1) {
            const token = row.phrase;
            // Whole-word check against H1 tokens
            if (h1Tokens.includes(token)) {
                matches.push({
                    ...row,
                    matchType: 'fallback',
                    score: 1,
                    matchText: token
                });
                matchedRowIndices.add(row.id);
            }
        }
    });

    // --- Ranking ---
    // Sort by Score (descending), then by discovery order (implicit in array push order)
    matches.sort((a, b) => b.score - a.score);

    // --- Deduplication (URL + Anchor) ---
    // If multiple rows map to same URL+Anchor, keep the highest scored one (first one)
    const uniqueMatches = [];
    const seenLinks = new Set();

    matches.forEach(m => {
        const key = `${m.url}|${m.anchor}`;
        if (!seenLinks.has(key)) {
            uniqueMatches.push(m);
            seenLinks.add(key);
        }
    });

    lastMatches = uniqueMatches;
    renderResults(rawH1, uniqueMatches);
}

// --- Rendering ---

function renderResults(originalH1, matches) {
    // 1. Highlight PDP Title
    const phrasesToHighlight = matches.map(m => escapeRegex(m.phrase));
    
    // Sort by length desc to ensure longest match wins in regex alternation
    phrasesToHighlight.sort((a, b) => b.length - a.length);

    let htmlTitle = originalH1;
    if (phrasesToHighlight.length > 0) {
        const pattern = `\\b(${phrasesToHighlight.join('|')})\\b`;
        const regex = new RegExp(pattern, 'gi');
        
        // Replace with highlight span
        htmlTitle = originalH1.replace(regex, (match) => {
            return `<span class="highlight">${match}</span>`;
        });
    }
    
    els.pdpTitle.innerHTML = htmlTitle;

    // 2. Render Related Links
    els.related.innerHTML = '';
    
    if (matches.length > 0) {
        els.relatedContainer.style.display = 'block'; // Show section
        matches.forEach(m => {
            const a = document.createElement('a');
            a.href = m.url;
            a.textContent = m.anchor;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            els.related.appendChild(a);
        });
    } else {
        els.relatedContainer.style.display = 'none'; // Hide section if no matches
    }

    // 3. Debug Output
    const debugData = matches.map(m => ({
        phrase: m.phrase,
        url: m.url,
        anchor: m.anchor,
        matchType: m.matchType,
        score: m.score
    }));
    els.debugOut.value = JSON.stringify(debugData, null, 2);

    // Enable exports
    els.exportHtml.disabled = false;
    els.exportJson.disabled = false;
}

// --- Utilities ---

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Exports ---

function exportHTML() {
    if (!lastMatches.length) return;
    const htmlContent = els.related.innerHTML;
    downloadFile('related-collections.html', htmlContent, 'text/html');
}

function exportJSON() {
    if (!lastMatches.length) return;
    const jsonContent = els.debugOut.value;
    downloadFile('matches.json', jsonContent, 'application/json');
}

function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}