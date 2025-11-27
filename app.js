    // Sort by length descending to handle "soft cotton" before "cotton"
    phrasesToHighlight.sort((a, b) => b.length - a.length);

    // We will use a placeholder strategy to avoid double-replacing inside HTML tags
    // 1. Find matches and replace with a unique placeholder
    // 2. Replace placeholders with span tags
    
    const placeholders = [];
    
    phrasesToHighlight.forEach((phrase, index) => {
        // Construct regex: \bPHRASE\b with case insensitivity
        // Since 'phrase' is normalized (no punctuation), we need to be careful if original has punctuation.
        // But the prompt says "replace matched substrings".
        // If H1 is "Soft-Cotton", normalized is "soft cotton". Regex \bsoft cotton\b won't match "Soft-Cotton".
        // The prompt says "Normalize... Remove any non-alphanumeric... replace punctuation with spaces".
        // So "Soft-Cotton" -> "soft cotton".
        // If we use the normalized phrase for highlighting, we might miss the hyphenated version in the original text if we just search for space.
        // COMPROMISE: We will try to match the words separated by non-word chars.
        
        const parts = phrase.split(' ').map(escapeRegex);
        // Allow any non-alphanumeric chars between words
        const regexPattern = '\\b' + parts.join('[^a-zA-Z0-9]+') + '\\b';
        const regex = new RegExp(regexPattern, 'gi');
        
        highlightedHtml = highlightedHtml.replace(regex, (match) => {
            const placeholder = `__MATCH_${index}__`;
            placeholders.push({ id: placeholder, text: match });
            return placeholder;
        });
    });

    // Restore placeholders with spans
    placeholders.forEach(p => {
        highlightedHtml = highlightedHtml.replace(p.id, `<span class="highlight">${p.text}</span>`);
    });

    els.pdpTitle.innerHTML = highlightedHtml;
}

// --- Exports ---

els.exportHtml.addEventListener('click', () => {
    const html = els.related.innerHTML;
    downloadFile('related-collections.html', html, 'text/html');
});

els.exportJson.addEventListener('click', () => {
    const json = els.debugOut.textContent;
    downloadFile('matches.json', json, 'application/json');
});

function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
