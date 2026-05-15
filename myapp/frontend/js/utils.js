// Pure utility functions — no Vue dependency

export const DEFAULT_SETTINGS = {
    systemPrompt: "SYSTEM INSTRUCTION: think silently if needed.\n\nYou are MedGemma, a senior AI radiologist and medical consultant.\n\n**Instructions:**\n1. **Image Analysis**: If an image is provided, provide a structured report:\n   - **Findings**: Detailed description of anatomy, textures, and abnormalities.\n   - **Impression**: The likely diagnosis.\n   - **Reasoning**: Explain specific visual evidence.\n\n2. **Medical Consultation**: If NO image is provided, answer medical questions utilizing your professional knowledge. Be accurate, helpful, and evidence-based.\n\n3. **General**: Be concise and professional.",
    detectionPrompt: "SYSTEM INSTRUCTION: think silently to analyze the image structure and anomalies step-by-step. You are an expert AI radiologist. Your task is to output a JSON list of bounding boxes for all visual anomalies.\nREQUIREMENTS:\n1. All labels and descriptions MUST be in Simplified Chinese (简体中文).\n2. Output format: A valid JSON list of objects.\n3. Object Schema: {\"label\": \"visual finding name\", \"box_2d\": [ymin, xmin, ymax, xmax], \"description\": \"detailed visual description\"}\n4. Coordinates: Integers 0-1000 representing relative coordinates. [ymin, xmin, ymax, xmax].\n5. GEOMETRY RULES: ymax must be > ymin. xmax must be > xmin. Do not output zero-width or zero-height boxes.\n6. VERY IMPORTANT: Detection boxes must be TIGHT around the specific anomaly, not covering the whole lung. Focus on visual features (opacities, nodules, lines) rather than jumping to diagnosis.\n7. Example: [{\"label\": \"肺野高密度影\", \"box_2d\": [600, 700, 700, 800], \"description\": \"右下肺野可见局限性高密度影，边缘模糊，密度不均...\"}]",
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 4096,
    contextWindow: 20000,
    apiEndpoint: (window.MEDGEMMA_CONFIG && window.MEDGEMMA_CONFIG.apiBaseUrl)
                 ? (window.MEDGEMMA_CONFIG.apiBaseUrl + "/api/chat")
                 : (window.location.origin + "/api/chat")
};

export function getMessageText(msg) {
    if (Array.isArray(msg.content)) {
        const textItem = msg.content.find(c => c.type === 'text');
        return textItem ? textItem.text : '';
    }
    if (typeof msg.content === 'string') return msg.content;
    return '';
}

export function generateTitle(msgs) {
    if (!msgs || msgs.length === 0) return "新对话";
    const firstMsg = msgs.find(m => m.role === 'user');
    if (firstMsg) {
        const textContent = firstMsg.content.find(c => c.type === 'text');
        if (textContent) {
            return textContent.text.substring(0, 20) + (textContent.text.length > 20 ? "..." : "");
        }
        if (firstMsg.content.some(c => c.type === 'image')) return "影像分析";
    }
    return "新对话";
}

export function scrollToBottom(containerRef) {
    if (containerRef && containerRef.value) {
        containerRef.value.scrollTop = containerRef.value.scrollHeight;
    }
}

export function renderMarkdown(text) {
    if (!text) return "";

    let cleanText = text.replace(/<\/s>|<eos>|<pad>|<bos>/gi, "").trim();

    cleanText = cleanText
        .replace(/<unused94>|&lt;unused94&gt;|&lt;think&gt;/gi, "<think>")
        .replace(/<unused95>|&lt;unused95&gt;|&lt;\/think&gt;/gi, "</think>");

    const thinkMatch = cleanText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);

    if (thinkMatch) {
        const thoughtContent = thinkMatch[1].trim();
        const finalAnswer = cleanText.replace(thinkMatch[0], "").trim();

        const thoughtHtml = `
            <details class="mb-4 bg-gray-800/50 rounded-lg border border-gray-700/50 overflow-hidden group">
                <summary class="cursor-pointer bg-gray-800/80 px-3 py-2 text-xs text-gray-400 font-mono hover:text-emerald-300 select-none flex items-center gap-2 transition-colors">
                    <i class="fa-solid fa-brain group-open:text-emerald-400"></i>
                    <span>思考过程 (Reasoning)</span>
                    <span class="ml-auto text-[10px] opacity-50 block group-open:hidden">点击展开</span>
                </summary>
                <div class="p-3 text-gray-400 text-sm border-t border-gray-700/50 bg-gray-900/30 prose prose-invert max-w-none prose-p:my-1 prose-pre:my-2 animate-fadeIn">
                    ${marked.parse(thoughtContent)}
                </div>
            </details>
        `;

        return thoughtHtml + (finalAnswer ? marked.parse(finalAnswer) : '<span class="animate-pulse inline-block w-2 h-4 bg-gray-600 align-middle ml-1"></span>');
    }

    return marked.parse(cleanText);
}
