// Central reactive state and actions — singleton store pattern
import { DEFAULT_SETTINGS, getMessageText, generateTitle, scrollToBottom, renderMarkdown } from './utils.js';
import { chatStream, ctUpload, ctChatStream, detectRequest } from './api.js';

const { ref, reactive, watch, nextTick } = Vue;

// ── State ──────────────────────────────────────────────

export const messages = ref([]);
export const userInput = ref("");
export const pendingImage = ref(null);
export const isLoading = ref(false);
export const showSettings = ref(false);
export const chatContainer = ref(null);
export const previewImageUrl = ref(null);
export const sessions = ref([]);
export const currentSessionId = ref(null);
export const showHistory = ref(false);

export const currentView = ref('chat');
export const ctImages = ref([]);
export const ctMessages = ref([]);
export const ctInput = ref("");
export const isProcessingCT = ref(false);
export const ctChatContainer = ref(null);

export const activeFloatingImage = ref(null);
export const currentFindings = ref([]);
export const isDetecting = ref(false);
export const editingIndex = ref(-1);
export const editText = ref("");

export const settings = reactive({ ...DEFAULT_SETTINGS });

let abortController = null;

// ── Settings Actions ───────────────────────────────────

export function resetSettings() {
    if (confirm("确定要恢复默认设置吗？所有配置将重置。")) {
        try {
            Object.keys(DEFAULT_SETTINGS).forEach(key => { settings[key] = DEFAULT_SETTINGS[key]; });
            localStorage.setItem('medgemma_settings', JSON.stringify(settings));
        } catch (e) {
            console.error("Reset failed:", e);
            alert("重置失败，请查看控制台错误。");
        }
    }
}

export function clearCache() {
    if (confirm("警告：此操作将删除所有本地存储的数据，包括：\n- 所有历史对话记录\n- 自定义设置\n- 已缓存的状态\n\n您确定要重置应用为全新状态吗？")) {
        try {
            localStorage.clear();
            alert("数据已重置。页面将刷新。");
            window.location.reload();
        } catch (e) {
            console.error("Clear cache failed:", e);
            alert("清除缓存失败，请尝试手动清除浏览器数据。");
        }
    }
}

// ── Session Actions ────────────────────────────────────

export function loadSessions() {
    const stored = localStorage.getItem('medgemma_sessions');
    if (stored) sessions.value = JSON.parse(stored);
}

export function saveSessionList() {
    localStorage.setItem('medgemma_sessions', JSON.stringify(sessions.value));
}

export function saveCurrentSession() {
    if (!currentSessionId.value) return;
    try {
        localStorage.setItem(`medgemma_session_${currentSessionId.value}`, JSON.stringify(messages.value));
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            console.warn("LocalStorage Quota Exceeded.");
        } else {
            console.error("Error saving session:", e);
        }
        return;
    }
    const idx = sessions.value.findIndex(s => s.id === currentSessionId.value);
    if (idx !== -1) {
        sessions.value[idx].lastModified = Date.now();
        sessions.value[idx].title = generateTitle(messages.value);
        const session = sessions.value.splice(idx, 1)[0];
        sessions.value.unshift(session);
    } else {
        sessions.value.unshift({ id: currentSessionId.value, title: generateTitle(messages.value), lastModified: Date.now() });
    }
    saveSessionList();
}

export function createNewSession() {
    if (messages.value.length === 0 && currentSessionId.value) {
        userInput.value = "";
        pendingImage.value = null;
        activeFloatingImage.value = null;
        currentFindings.value = [];
        return;
    }
    const newId = Date.now().toString();
    currentSessionId.value = newId;
    messages.value = [];
    userInput.value = "";
    pendingImage.value = null;
    activeFloatingImage.value = null;
    currentFindings.value = [];
    sessions.value.unshift({ id: newId, title: "新对话", lastModified: Date.now() });
    saveSessionList();
}

export function switchSession(sessionId) {
    if (currentSessionId.value === sessionId) return;
    const stored = localStorage.getItem(`medgemma_session_${sessionId}`);
    messages.value = stored ? JSON.parse(stored) : [];
    currentSessionId.value = sessionId;
    activeFloatingImage.value = null;
    currentFindings.value = [];
    if (window.innerWidth < 1024) showHistory.value = false;
}

export function deleteSession(sessionId, event) {
    if (event) event.stopPropagation();
    if (!confirm("确定删除此对话吗？")) return;
    sessions.value = sessions.value.filter(s => s.id !== sessionId);
    localStorage.removeItem(`medgemma_session_${sessionId}`);
    saveSessionList();
    if (currentSessionId.value === sessionId) {
        if (sessions.value.length > 0) switchSession(sessions.value[0].id);
        else createNewSession();
    }
}

// ── Chat Actions ───────────────────────────────────────

export function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        pendingImage.value = e.target.result;
        activeFloatingImage.value = e.target.result;
        currentFindings.value = [];
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

export function clearPendingImage() {
    pendingImage.value = null;
}

export function setActiveFloatingImage(imgUrl) {
    if (activeFloatingImage.value !== imgUrl) {
        activeFloatingImage.value = imgUrl;
        currentFindings.value = [];
    }
}

export function previewImage(url) {
    previewImageUrl.value = url;
}

export async function sendMessage() {
    if ((!userInput.value.trim() && !pendingImage.value) || isLoading.value) return;

    const userText = userInput.value;
    const userImg = pendingImage.value;
    const userContent = [];
    if (userImg) userContent.push({ type: 'image', image: userImg });
    if (userText) userContent.push({ type: 'text', text: userText });

    messages.value.push({ role: 'user', content: userContent });
    userInput.value = "";
    pendingImage.value = null;
    scrollToBottom(chatContainer);

    try {
        await processResponse();
    } catch (e) {
        messages.value.push({ role: 'model', content: [{ type: 'text', text: `**System Error:** ${e.message}` }] });
        isLoading.value = false;
    }
}

export async function processResponse() {
    isLoading.value = true;
    abortController = new AbortController();

    try {
        messages.value.push({ role: 'model', content: [{ type: 'text', text: '' }] });
        const currentIndex = messages.value.length - 1;

        await chatStream(messages.value.slice(0, -1), settings, {
            onChunk: (chunk) => {
                messages.value[currentIndex].content[0].text += chunk;
                requestAnimationFrame(() => scrollToBottom(chatContainer));
            },
            signal: abortController.signal,
        });

    } catch (error) {
        if (error.name === 'AbortError') {
            const last = messages.value[messages.value.length - 1];
            if (last && last.role === 'model') last.content[0].text += " [已停止]";
        } else {
            console.error(error);
            messages.value.push({ role: 'model', content: [{ type: 'text', text: `**Error:** Failed to get response. ${error.message}` }] });
        }
    } finally {
        isLoading.value = false;
        abortController = null;
        scrollToBottom(chatContainer);
    }
}

export function stopGeneration() {
    if (abortController) abortController.abort();
}

export async function regenerate() {
    if (isLoading.value) return;
    if (messages.value.length === 0) return;
    const last = messages.value[messages.value.length - 1];
    if (last.role === 'model') messages.value.pop();
    if (messages.value.length > 0) await processResponse();
}

export function resetSession() {
    if (confirm("确定要清空当前对话历史吗？")) {
        messages.value = [];
    }
}

// ── Editing Actions ────────────────────────────────────

export function deleteMessage(index) {
    if (confirm("确定要删除这条消息吗？")) {
        messages.value.splice(index, 1);
        saveCurrentSession();
    }
}

export function startEdit(index, text) {
    editingIndex.value = index;
    editText.value = text || "";
}

export function cancelEdit() {
    editingIndex.value = -1;
    editText.value = "";
}

export function saveEdit(index) {
    if (editingIndex.value === index) {
        const msg = messages.value[index];
        const textItem = msg.content.find(c => c.type === 'text');
        if (textItem) textItem.text = editText.value;
        else msg.content.push({ type: 'text', text: editText.value });
        editingIndex.value = -1;
        editText.value = "";
        saveCurrentSession();
    }
}

// ── Detection Actions ──────────────────────────────────

export function restoreDetectionView(msg) {
    if (msg.relatedImage && msg.relatedFindings) {
        activeFloatingImage.value = msg.relatedImage;
        currentFindings.value = msg.relatedFindings;
    }
}

export async function detectLesions() {
    if (!activeFloatingImage.value || isDetecting.value) return;
    isDetecting.value = true;

    try {
        const data = await detectRequest(activeFloatingImage.value, settings.detectionPrompt, settings.apiEndpoint);

        if (data.status === "success" && Array.isArray(data.findings)) {
            currentFindings.value = data.findings;
            const summary = data.findings.map((f, i) => `${i + 1}. ${f.label}: ${f.description}`).join('\n');
            const messageContent = `**影像分析结果** (共 ${data.findings.length} 处):\n${summary}\n\n<details><summary style="cursor: pointer; color: #34d399;">点击查看 AI 思考过程</summary>\n\n${data.thought || '无思考过程'}\n</details>`;

            messages.value.push({
                role: "model",
                isDetectionResult: true,
                relatedImage: activeFloatingImage.value,
                relatedFindings: data.findings,
                content: [{ type: "text", text: messageContent }]
            });
            scrollToBottom(chatContainer);
        } else {
            alert("未检测到明确病灶或格式解析失败:\n" + (data.findings?.raw || "Unknown error"));
        }
    } catch (e) {
        console.error("Detection error:", e);
        alert("检测服务调用失败");
    } finally {
        isDetecting.value = false;
    }
}

// ── CT Actions ─────────────────────────────────────────

export function switchView(view) {
    currentView.value = view;
}

export async function processCTUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    isProcessingCT.value = true;
    ctImages.value = [];
    ctMessages.value = [];

    try {
        ctMessages.value.push({
            role: 'assistant',
            content: [{ type: 'text', text: '正在上传并处理医学影像数据的三维重建与窗位映射，请稍候...' }]
        });

        const data = await ctUpload(files);
        ctImages.value = data.images;

        ctMessages.value = [{
            role: 'assistant',
            content: [
                { type: 'text', text: `✅ 影像处理完成。\n\n已成功加载并重建 **${data.count}** 张标准切片（512px）。\n\n系统应用了三通道窗位（肺窗/软组织窗/脑窗）。\n\n您可以手动提问，或点击下方按钮开始标准分析：` },
            ],
            actions: [
                { label: '🔍 全面自动分析', query: '详细分析这组 CT 影像。请按顺序以中文描述：1. 图像质量与窗口设置；2. 主要发现（解剖结构与异常）；3. 诊断意见 (Impression)。' }
            ]
        }];
    } catch (e) {
        console.error(e);
        ctMessages.value.push({
            role: 'assistant',
            content: [{ type: 'text', text: `❌ 处理失败: ${e.message || "无法解析 DICOM 文件"}` }]
        });
    } finally {
        isProcessingCT.value = false;
        event.target.value = '';
    }
}

export async function sendCTMessage(overrideText = null) {
    const isOverride = (typeof overrideText === 'string');
    const text = isOverride ? overrideText : ctInput.value;

    if (!text || typeof text !== 'string' || !text.trim() || isLoading.value) return;
    if (!isOverride) ctInput.value = "";
    isLoading.value = true;

    ctMessages.value.push({ role: 'user', content: [{ type: 'text', text }] });
    nextTick(() => scrollToBottom(ctChatContainer));

    try {
        const aiMsg = reactive({ role: 'assistant', content: [{ type: 'text', text: "" }] });
        ctMessages.value.push(aiMsg);

        await ctChatStream(text, settings, settings.apiEndpoint, {
            onChunk: (chunk) => {
                aiMsg.content[0].text += chunk;
                nextTick(() => scrollToBottom(ctChatContainer));
            }
        });
    } catch (e) {
        console.error(e);
        ctMessages.value.push({ role: 'assistant', content: [{ type: 'text', text: "Error: " + e.message }] });
    } finally {
        isLoading.value = false;
    }
}

// ── Init ───────────────────────────────────────────────

loadSessions();
if (sessions.value.length === 0) {
    createNewSession();
} else {
    switchSession(sessions.value[0].id);
}

// Load saved settings
const savedSettings = localStorage.getItem('medgemma_settings');
if (savedSettings) Object.assign(settings, JSON.parse(savedSettings));

// Auto-save watchers
watch(messages, () => saveCurrentSession(), { deep: true });
watch(settings, (s) => localStorage.setItem('medgemma_settings', JSON.stringify(s)));

// ── Public API ─────────────────────────────────────────

export function useStore() {
    return {
        messages, userInput, pendingImage, isLoading, showSettings, chatContainer,
        previewImageUrl, sessions, currentSessionId, showHistory,
        currentView, ctImages, ctMessages, ctInput, isProcessingCT, ctChatContainer,
        activeFloatingImage, currentFindings, isDetecting, editingIndex, editText,
        settings,
        resetSettings, clearCache,
        loadSessions, saveSessionList, saveCurrentSession, createNewSession,
        switchSession, deleteSession,
        handleImageUpload, clearPendingImage, setActiveFloatingImage, previewImage,
        sendMessage, processResponse, stopGeneration, regenerate, resetSession,
        deleteMessage, startEdit, cancelEdit, saveEdit,
        restoreDetectionView, detectLesions,
        switchView, processCTUpload, sendCTMessage,
        renderMarkdown, getMessageText, generateTitle, scrollToBottom,
    };
}
