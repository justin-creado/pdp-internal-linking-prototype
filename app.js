/**
 * PDP Matcher Prototype Logic
 * Handles CSV parsing and "Scattered Keyword Matching" algorithm.
 */

// State
let csvData = []; // Array of { id, phrase, url, anchor, requiredKeywords, originalRow }
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

// Ensure elements exist before attaching listeners (safety check)
if (els.csvFile) els.csvFile.addEventListener('change', handleFileUpload);
if (els.runBtn) els.runBtn.addEventListener('click', runMatching);
if (els.exportHtml) els.exportHtml.addEventListener('click', exportHTML);
if (els.exportJson) els.exportJson.addEventListener('click', exportJSON);

console.log("PDP Matcher Script Loaded");

// --- CSV Handling ---

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    console.log("File selected:", file.name);
    els.csvStatus.textContent = "Parsing CSV...";
    els.csvStatus.style.background = "#fff3e0";
    els.csvStatus.style.color = "#e65100";

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            if (results.errors.length) {
                console.warn("CSV Errors:", results.errors);
                els.csvStatus.textContent = "Error parsing CSV. Check console.";
                els.csvStatus.style.color = "red";
            }
            processCSVData(results.data, results.meta.fields);
        },
        error: (err) => {
            console.error("PapaParse Error:", err);
            els.csvStatus.textContent = "Critical Error: " + err.message;
            els.csvStatus.style.color = "red";
        }
    });
}

function processCSVData(data, fields) {
    if (!fields || fields.length === 0) {
        els.csvStatus.textContent = "Error: Could not read CSV headers.";
        els.csvStatus.style.color = "red";
        return;
    }

    // Identify column names case-insensitively
    const headers = {};
    fields.forEach(f => headers[f.toLowerCase()] = f);

    const colPhrase = headers['pdp phrase'];
    const colUrl = headers['plp url'];
    const colAnchor = headers['anchor text'];

    if (!colPhrase || !colUrl || !colAnchor) {
        const missing = [];
        if (!colPhrase) missing.push('PDP Phrase');
        if (!colUrl) missing.push('PLP URL');
        if (!colAnchor) missing.push('Anchor Text');

        els.csvStatus.textContent = `Error: Missing columns (${missing.join(', ')})`;
        els.csvStatus.style.background = "#ffebee";
        els.csvStatus.style.color = "#c62828";
        return;
    }

    // Process and store rows
    csvData = data.map((row, index) => {
        const rawPhrase = row[colPhrase] || "";
        const normPhrase = normalize(rawPhrase);
        // Split phrase into required keywords (e.g., "pink dupatta" -> ["pink", "dupatta"])
        const keywords = normPhrase.split(' ').filter(t => t);

        return {
            id: index,
            phrase: normPhrase,
            requiredKeywords: keywords,
            url: (row[colUrl] || "").trim(),
            anchor: (row[colAnchor] || "").trim(),
            originalRow: row
        };
    }).filter(item => item.requiredKeywords.length > 0 && item.url && item.anchor);

    els.csvStatus.textContent = `Loaded ${csvData.length} rows successfully`;
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
    if (!text) return "";
    return text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ') // Replace punctuation with space
        .replace(/\s+/g, ' ')         // Collapse multiple spaces
        .trim();
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
    // Tokenize H1 for checking presence of keywords
    const h1Tokens = new Set(normH1.split(' ').filter(t => t));

    const matches = [];

    // --- Scattered Keyword Matching ---
    // For each CSV row, check if ALL its keywords exist in the H1 tokens
    csvData.forEach(row => {
        // Check if every required keyword is in the H1 token set
        const isMatch = row.requiredKeywords.every(keyword => h1Tokens.has(keyword));

        if (isMatch) {
            matches.push({
                ...row,
                matchType: 'scattered',
                // Score = number of matched keywords (specificity)
                // "cotton blue dupatta" (3) > "cotton dupatta" (2)
                score: row.requiredKeywords.length
            });
        }
    });

    // --- Ranking ---
    // Sort by Score (descending)
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
    // We want to highlight the keywords that caused the matches.
    // Collect all keywords from all matched rows.
    const allMatchedKeywords = new Set();
    matches.forEach(m => {
        m.requiredKeywords.forEach(kw => allMatchedKeywords.add(kw));
    });

    const keywordsArray = Array.from(allMatchedKeywords);
    // Sort by length desc to ensure longest words match first in regex
    keywordsArray.sort((a, b) => b.length - a.length);

    let htmlTitle = originalH1;
    if (keywordsArray.length > 0) {
        const pattern = `\\b(${keywordsArray.map(escapeRegex).join('|')})\\b`;
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
