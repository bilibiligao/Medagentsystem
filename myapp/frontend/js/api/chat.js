// api/chat.js
import { state, actions, settings } from '../store.js';

async function performChatRequest(apiMessages) {
    // Add placeholder for assistant response
    const assistantMsg = {
        role: "assistant",
        content: [{ type: "text", text: "" }]
    };
    state.messages.push(assistantMsg);

    try {
        const response = await fetch(settings.apiEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: apiMessages,
                stream: true,
                temperature: settings.temperature,
                top_p: settings.topP,
                max_tokens: settings.maxTokens
            })
        });

        if (!response.body) throw new Error("ReadableStream not supported");

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let done = false;
        let responseText = "";
        let buffer = ""; // Buffer for incomplete chunks

        while (!done) {
            const { value, done: doneReading } = await reader.read();
            done = doneReading;
            const chunkValue = decoder.decode(value, { stream: true });
            
            buffer += chunkValue;
            const lines = buffer.split('\n');
            // The last element might be incomplete, keep it in the buffer
            buffer = lines.pop(); 

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('data: ') && trimmedLine !== 'data: [DONE]') {
                    try {
                        const json = JSON.parse(trimmedLine.substring(6));
                        const content = json.choices[0]?.delta?.content || "";
                        if (content) {
                            responseText += content;
                            assistantMsg.content[0].text = responseText; // Live update
                            actions.scrollToBottom();
                        }
                    } catch (e) {
                         // ignore parse errors for now
                    }
                }
            }
        }
    } catch (error) {
        throw error; // Re-throw to be caught by caller
    }
}

function buildApiMessages() {
    const apiMessages = [
        { role: "system", content: settings.systemPrompt }
    ];

    state.messages.forEach(msg => {
        const apiContent = msg.content.map(c => {
            if (c.type === 'text') return { type: 'text', text: c.text };
            if (c.type === 'image_url') return { type: 'image_url', image_url: c.image_url };
            return null;
        }).filter(Boolean);

        apiMessages.push({
            role: msg.role,
            content: apiContent
        });
    });
    return apiMessages;
}

export async function sendMessage() {
    if ((!state.userInput.trim() && !state.pendingImage) || state.isLoading) return;

    // 1. Add User Message
    const userContent = [];
    if (state.userInput.trim()) {
        userContent.push({ type: "text", text: state.userInput });
    }
    if (state.pendingImage) {
        userContent.push({ type: "image_url", image_url: { url: state.pendingImage } });
        state.activeFloatingImage = state.pendingImage;
        state.currentFindings = [];
    }

    state.messages.push({
        role: "user",
        content: userContent
    });

    const currentInput = state.userInput;
    state.userInput = "";
    state.pendingImage = null;
    state.isLoading = true;
    actions.scrollToBottom();

    try {
        const apiMessages = buildApiMessages();
        await performChatRequest(apiMessages);
    } catch (error) {
        console.error("Chat error:", error);
        // Remove the assistant message that might have been added
        state.messages = state.messages.filter(m => m.role !== 'assistant' || m.content[0].text.length > 0);
        
        // Restore user input if the last message is user (meaning query failed to even start responding)
        if (state.messages.length > 0 && state.messages[state.messages.length-1].role === 'user') {
            state.messages.pop(); // Remove user msg
            state.userInput = currentInput;
            state.pendingImage = currentInput ? null : state.activeFloatingImage; // rough restore
        }
        
        alert("发送失败，请重试");
    } finally {
        state.isLoading = false;
        actions.saveCurrentSession();
        actions.scrollToBottom();
    }
}

export async function regenerate() {
    if (state.messages.length === 0 || state.isLoading) return;

    const lastMsg = state.messages[state.messages.length - 1];
    if (lastMsg.role === 'assistant') {
        state.messages.pop(); // Remove the bad assistant response
    }
    
    // Check if there is even a user message to reply to
    if (state.messages.length === 0) return;

    state.isLoading = true;
    actions.scrollToBottom();

    try {
        const apiMessages = buildApiMessages();
        await performChatRequest(apiMessages);
    } catch (error) {
        console.error("Regenerate error:", error);
        alert("重新生成失败");
    } finally {
        state.isLoading = false;
        actions.saveCurrentSession();
        actions.scrollToBottom();
    }
}
