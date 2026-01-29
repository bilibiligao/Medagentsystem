// store.js
const { ref, reactive, watch } = Vue;

export const state = reactive({
    messages: [],
    userInput: "",
    pendingImage: null,
    isLoading: false,
    showSettings: false,
    previewImageUrl: null,
    sessions: [],
    currentSessionId: null,
    showHistory: false,
    
    // Edit/Float features
    activeFloatingImage: null,
    currentFindings: [],
    isDetecting: false,
    editingIndex: -1,
    editText: "",
    
    // Chat container ref (special case, usually managed in component)
    chatContainer: null
});

// Settings
export const defaultSettings = {
    systemPrompt: "SYSTEM INSTRUCTION: think silently if needed.\n\nYou are MedGemma, a senior AI radiologist and medical consultant.\n\n**Instructions:**\n1. **Image Analysis**: If an image is provided, provide a structured report:\n   - **Findings**: Detailed description of anatomy, textures, and abnormalities.\n   - **Impression**: The likely diagnosis.\n   - **Reasoning**: Explain specific visual evidence.\n\n2. **Medical Consultation**: If NO image is provided, answer medical questions utilizing your professional knowledge. Be accurate, helpful, and evidence-based.\n\n3. **General**: Be concise and professional.",
    detectionPrompt: "SYSTEM INSTRUCTION: think silently to analyze the image structure and anomalies step-by-step. You are an expert AI radiologist. Your task is to output a JSON list of bounding boxes for all visual anomalies.\nREQUIREMENTS:\n1. All labels and descriptions MUST be in Simplified Chinese (简体中文).\n2. Output format: A valid JSON list of objects.\n3. Object Schema: {\"label\": \"visual finding name\", \"box_2d\": [ymin, xmin, ymax, xmax], \"description\": \"detailed visual description\"}\n4. Coordinates: Integers 0-1000 representing relative coordinates. [ymin, xmin, ymax, xmax].\n5. GEOMETRY RULES: ymax must be > ymin. xmax must be > xmin. Do not output zero-width or zero-height boxes.\n6. VERY IMPORTANT: Detection boxes must be TIGHT around the specific anomaly, not covering the whole lung. Focus on visual features (opacities, nodules, lines) rather than jumping to diagnosis.\n7. Example: [{\"label\": \"肺野高密度影\", \"box_2d\": [600, 700, 700, 800], \"description\": \"右下肺野可见局限性高密度影，边缘模糊，密度不均...\"}]",
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 4096,
    contextWindow: 20000,
    apiEndpoint: window.location.origin + "/api/chat"
};

export const settings = reactive({ ...defaultSettings });

// Actions
export const actions = {
    // Settings Actions
    resetSettings() {
        if (confirm("确定要恢复默认设置吗？所有配置将重置。")) {
            try {
                Object.keys(defaultSettings).forEach(key => {
                    settings[key] = defaultSettings[key];
                });
                // Note: persistence removed per user request
            } catch (e) {
                 console.error("Reset failed:", e);
                 alert("重置失败，请查看控制台错误。");
            }
        }
    },
    
    // Session Actions
    loadSessions() {
        const storedSessions = localStorage.getItem('medgemma_sessions');
        if (storedSessions) {
            state.sessions = JSON.parse(storedSessions);
        }
    },

    saveSessionList() {
        localStorage.setItem('medgemma_sessions', JSON.stringify(state.sessions));
    },
    
    generateTitle(msgs) {
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
    },

    saveCurrentSession() {
        if (!state.currentSessionId) return;
        
        localStorage.setItem(`medgemma_session_${state.currentSessionId}`, JSON.stringify(state.messages));
        
        const sessionIndex = state.sessions.findIndex(s => s.id === state.currentSessionId);
        if (sessionIndex !== -1) {
            state.sessions[sessionIndex].lastModified = Date.now();
            state.sessions[sessionIndex].title = this.generateTitle(state.messages);
            const session = state.sessions.splice(sessionIndex, 1)[0];
            state.sessions.unshift(session);
        } else {
             state.sessions.unshift({
                id: state.currentSessionId,
                title: this.generateTitle(state.messages),
                lastModified: Date.now()
            });
        }
        this.saveSessionList();
    },

    createNewSession() {
        if (state.messages.length === 0 && state.currentSessionId) {
            state.userInput = "";
            state.pendingImage = null;
            state.activeFloatingImage = null;
            return;
        }

        const newId = Date.now().toString();
        state.currentSessionId = newId;
        state.messages = [];
        state.userInput = "";
        state.pendingImage = null;
        state.activeFloatingImage = null;
        
        state.sessions.unshift({
            id: newId,
            title: "新对话",
            lastModified: Date.now()
        });
        this.saveSessionList();
    },

    switchSession(sessionId) {
        if (state.currentSessionId === sessionId) return;
        
        const storedMsgs = localStorage.getItem(`medgemma_session_${sessionId}`);
        state.messages = storedMsgs ? JSON.parse(storedMsgs) : [];
        state.currentSessionId = sessionId;
        
        if (window.innerWidth < 1024) state.showHistory = false;
    },

    deleteSession(sessionId, event) {
         if (event) event.stopPropagation();
         if (!confirm("确定删除此对话吗？")) return;
         
         state.sessions = state.sessions.filter(s => s.id !== sessionId);
         localStorage.removeItem(`medgemma_session_${sessionId}`);
         this.saveSessionList();
         
         if (state.currentSessionId === sessionId) {
             if (state.sessions.length > 0) {
                 this.switchSession(state.sessions[0].id);
             } else {
                 this.createNewSession();
             }
         }
    },
    
    // UI Helpers
    setChatContainer(el) {
        state.chatContainer = el;
    },
    
    async scrollToBottom() {
        await Vue.nextTick();
        if (state.chatContainer) {
            state.chatContainer.scrollTop = state.chatContainer.scrollHeight;
        }
    },
    
    handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            state.pendingImage = e.target.result;
            state.activeFloatingImage = e.target.result; 
        };
        reader.readAsDataURL(file);
        event.target.value = '';
    },
    
    setActiveFloatingImage(imgUrl) {
        state.activeFloatingImage = imgUrl;
        state.currentFindings = [];
    },
    
    clearPendingImage() {
        state.pendingImage = null;
    },
    
    previewImage(url) {
        state.previewImageUrl = url;
    },
    
    // Edit & Restore
    deleteMessage(index) {
         if (confirm("确定要删除这条消息吗？")) {
             state.messages.splice(index, 1);
             this.saveCurrentSession();
         }
    },
    
    startEdit(index, currentTextContent) {
        state.editingIndex = index;
        state.editText = currentTextContent || "";
    },
    
    cancelEdit() {
        state.editingIndex = -1;
        state.editText = "";
    },
    
    saveEdit(index) {
        if (state.editingIndex === index) {
             const msg = state.messages[index];
             const textItem = msg.content.find(c => c.type === 'text');
             if (textItem) {
                 textItem.text = state.editText;
             } else {
                 msg.content.push({ type: 'text', text: state.editText });
             }
             state.editingIndex = -1;
             state.editText = "";
             this.saveCurrentSession();
        }
    },
    
    restoreDetectionView(msg) {
         if (msg.relatedImage && msg.relatedFindings) {
             state.activeFloatingImage = msg.relatedImage;
             state.currentFindings = msg.relatedFindings;
         }
    },
    
    resetSession() {
        if(confirm("确定要清空当前对话历史吗？")) {
            state.messages = [];
        }
    }
};

// Auto-save on message change
watch(() => state.messages, () => {
     actions.saveCurrentSession();
}, { deep: true });
