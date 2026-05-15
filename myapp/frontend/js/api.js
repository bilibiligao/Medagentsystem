// API layer — fetch wrappers for all backend endpoints

export async function chatStream(messages, settings, { onChunk, signal }) {
    const payload = {
        messages: messages.map(msg => {
            const cleanContent = msg.content.map(c => {
                if (c.type === 'text' && msg.role === 'model') {
                    return {
                        type: 'text',
                        text: c.text.replace(/<details[\s\S]*?<\/details>/gi, "").trim()
                    };
                }
                return c;
            });
            return { role: msg.role, content: cleanContent };
        }),
        config: {
            system_prompt: settings.systemPrompt,
            temperature: settings.temperature,
            top_p: settings.topP,
            max_tokens: settings.maxTokens,
            context_window: settings.contextWindow
        }
    };

    const response = await fetch(settings.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
    });

    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        onChunk(decoder.decode(value, { stream: true }));
    }
}

export async function ctUpload(files) {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }
    const response = await fetch('/api/ct/process', { method: 'POST', body: formData });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Upload failed");
    }
    return response.json();
}

export async function ctChatStream(text, settings, apiEndpoint, { onChunk }) {
    const payload = {
        messages: [{ role: 'user', content: [{ type: 'text', text }] }],
        config: {
            ...settings,
            max_tokens: 8092,
            temperature: 0.2,
            use_ct_context: true
        }
    };

    const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(response.statusText);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        onChunk(decoder.decode(value, { stream: true }));
    }
}

export async function detectRequest(imageUrl, detectionPrompt, apiEndpoint) {
    const payload = {
        messages: [{
            role: "user",
            content: [
                { type: "image", image: imageUrl },
                { type: "text", text: "Analyze this image for lesions." }
            ]
        }],
        config: { system_prompt: detectionPrompt }
    };

    const response = await fetch(apiEndpoint.replace("/chat", "/detect"), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    return response.json();
}
