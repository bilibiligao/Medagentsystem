// components/renderer.js

// Ensure marked is available
const marked = window.marked;
if (marked) {
    marked.setOptions({
        breaks: true,
        gfm: true
    });
}

/**
 * Parses text to separate <think> blocks from main content
 * @param {string} text 
 * @returns {object} { thought: string, content: string }
 */
export function parseResponse(text) {
    if (!text) return { thought: "", content: "" };

    const thinkRegex = /<think>([\s\S]*?)<\/think>/i;
    const match = text.match(thinkRegex);
    
    if (match) {
        return {
            thought: match[1].trim(),
            content: text.replace(thinkRegex, "").trim()
        };
    }
    
    return {
        thought: "",
        content: text
    };
}

export function renderMarkdown(text) {
    if (!text) return "";
    if (!marked) return text;
    try {
        return marked.parse(text);
    } catch (e) {
        console.error("Markdown render error:", e);
        return text;
    }
}

/**
 * Converts 0-1000 relative matching coordinates to CSS percentages
 * @param {number[]} box [ymin, xmin, ymax, xmax]
 * @returns {object} CSS style object
 */
export function getBoxStyle(box) {
    if (!box || box.length !== 4) return {};
    
    const [ymin, xmin, ymax, xmax] = box;
    
    // Normalize if needed (though API enforces 0-1000)
    // output top, left, width, height in %
    
    return {
        top: `${ymin / 10}%`,
        left: `${xmin / 10}%`,
        width: `${(xmax - xmin) / 10}%`,
        height: `${(ymax - ymin) / 10}%`
    };
}
