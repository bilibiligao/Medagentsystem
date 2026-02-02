const { createApp, ref, reactive, nextTick, watch } = Vue;

createApp({
    setup() {
        const messages = ref([]);
        const userInput = ref("");
        const pendingImage = ref(null); // Base64 of image to be sent
        const isLoading = ref(false);
        const showSettings = ref(false);
        const chatContainer = ref(null);
        const previewImageUrl = ref(null);
        const sessions = ref([]);
        const currentSessionId = ref(null);
        const showHistory = ref(false); 

        // --- CT Analysis State ---
        const currentView = ref('chat'); // 'chat' or 'ct'
        const ctImages = ref([]);
        const ctMessages = ref([]);
        const ctInput = ref("");
        const isProcessingCT = ref(false);
        const ctChatContainer = ref(null);
        
        // New State for Edit/Float features
        const activeFloatingImage = ref(null);
        const currentFindings = ref([]); // Store detection results
        const isDetecting = ref(false);
        const editingIndex = ref(-1);
        const editText = ref("");

        const defaultSettings = {
            systemPrompt: "SYSTEM INSTRUCTION: think silently if needed.\n\nYou are MedGemma, a senior AI radiologist and medical consultant.\n\n**Instructions:**\n1. **Image Analysis**: If an image is provided, provide a structured report:\n   - **Findings**: Detailed description of anatomy, textures, and abnormalities.\n   - **Impression**: The likely diagnosis.\n   - **Reasoning**: Explain specific visual evidence.\n\n2. **Medical Consultation**: If NO image is provided, answer medical questions utilizing your professional knowledge. Be accurate, helpful, and evidence-based.\n\n3. **General**: Be concise and professional.",
            detectionPrompt: "SYSTEM INSTRUCTION: think silently to analyze the image structure and anomalies step-by-step. You are an expert AI radiologist. Your task is to output a JSON list of bounding boxes for all visual anomalies.\nREQUIREMENTS:\n1. All labels and descriptions MUST be in Simplified Chinese (简体中文).\n2. Output format: A valid JSON list of objects.\n3. Object Schema: {\"label\": \"visual finding name\", \"box_2d\": [ymin, xmin, ymax, xmax], \"description\": \"detailed visual description\"}\n4. Coordinates: Integers 0-1000 representing relative coordinates. [ymin, xmin, ymax, xmax].\n5. GEOMETRY RULES: ymax must be > ymin. xmax must be > xmin. Do not output zero-width or zero-height boxes.\n6. VERY IMPORTANT: Detection boxes must be TIGHT around the specific anomaly, not covering the whole lung. Focus on visual features (opacities, nodules, lines) rather than jumping to diagnosis.\n7. Example: [{\"label\": \"肺野高密度影\", \"box_2d\": [600, 700, 700, 800], \"description\": \"右下肺野可见局限性高密度影，边缘模糊，密度不均...\"}]",
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 4096,
            contextWindow: 20000,
            // 自动适配当前访问的域名/IP (FRP 或 局域网访问友好)
            apiEndpoint: (window.MEDGEMMA_CONFIG && window.MEDGEMMA_CONFIG.apiBaseUrl) 
                         ? (window.MEDGEMMA_CONFIG.apiBaseUrl + "/api/chat") 
                         : (window.location.origin + "/api/chat")
        };
        
        // Settings - No persistence on reload (as requested)
        const settings = reactive({ ...defaultSettings });
        
        /* 
        // Disabled Persistence Logic per request
        // Load settings
        if (localStorage.getItem('medgemma_settings')) {
            try {
                Object.assign(settings, JSON.parse(localStorage.getItem('medgemma_settings')));
            } catch(e) { console.error("Failed to load settings", e); }
        }
        
        // Auto-save settings
        watch(settings, (newVal) => {
            localStorage.setItem('medgemma_settings', JSON.stringify(newVal));
        }, { deep: true });
        */

        const resetSettings = () => {
            if (confirm("确定要恢复默认设置吗？所有配置将重置。")) {
                try {
                    // Reset all properties to defaults
                    Object.keys(defaultSettings).forEach(key => {
                        settings[key] = defaultSettings[key];
                    });
                    
                    // Force save
                    localStorage.setItem('medgemma_settings', JSON.stringify(settings));
                    
                    // Optional: Feedback could be added here if you have a toast system, 
                    // but the UI update should be immediate.
                } catch (e) {
                     console.error("Reset failed:", e);
                     alert("重置失败，请查看控制台错误。");
                }
            }
        };

        const clearCache = () => {
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
        };

        // --- CT Logic ---
        const switchView = (view) => {
            currentView.value = view;
        };

        const processCTUpload = async (event) => {
            const files = event.target.files;
            if (!files || files.length === 0) return;

            // Simple validation: check if it looks like a directory or multiple files
            // Ideally we check extension but DICOM often has no extension
            
            isProcessingCT.value = true;
            ctImages.value = [];
            ctMessages.value = []; // Reset chat for new scan
            
            try {
                const formData = new FormData();
                // Append all files
                for (let i = 0; i < files.length; i++) {
                    formData.append('files', files[i]);
                }
                
                // Show temporary message
                ctMessages.value.push({
                   role: 'assistant',
                   content: [{type: 'text', text: '正在上传并处理医学影像数据的三维重建与窗位映射，请稍候...'}] 
                });

                const response = await fetch('/api/ct/process', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(errText || "Upload failed");
                }

                const data = await response.json();
                ctImages.value = data.images;
                
                // Update success message with Action Button
                ctMessages.value = [{
                    role: 'assistant',
                    content: [
                        { type: 'text', text: `✅ 影像处理完成。\n\n已成功加载并重建 **${data.count}** 张标准切片（512px）。\n\n系统应用了三通道窗位（肺窗/软组织窗/脑窗）。\n\n您可以手动提问，或点击下方按钮开始标准分析：` },
                        // Custom action payload (rendered by special logic in template or just text hint for now)
                    ],
                    // Add a custom property for UI to show buttons
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
                event.target.value = ''; // Reset input
            }
        };

        const sendCTMessage = async (overrideText = null) => {
            // Fix: If called from UI event (Enter/Click), overrideText is an Event object.
            const isOverride = (typeof overrideText === 'string');
            const text = isOverride ? overrideText : ctInput.value;

            if (!text || typeof text !== 'string' || !text.trim() || isLoading.value) return;
            
            if(!isOverride) ctInput.value = "";
            isLoading.value = true;
            
            // 1. Add User Message to UI (Text only)
            ctMessages.value.push({ role: 'user', content: [{ type: 'text', text: text }] });
            
            // Scroll to bottom
            nextTick(() => {
                if(ctChatContainer.value) ctChatContainer.value.scrollTop = ctChatContainer.value.scrollHeight;
            });
            
            try {
                // 2. Construct Prompt Payload
                // [OPTIMIZED] Backend-side Injection logic.
                // We do NOT send images back to the server. We assume server has them cached.
                
                const payload = {
                    messages: [
                        { role: 'user', content: [{ type: 'text', text: text }] }
                    ],
                    config: {
                        ...settings,
                        max_tokens: 8092,
                        temperature: 0.2,
                        use_ct_context: true // New flag
                    }
                };
                
                // 3. Init Assistant Message
                const aiMsg = reactive({ role: 'assistant', content: [{ type: 'text', text: "" }] });
                ctMessages.value.push(aiMsg);
                
                // 4. Send Request
                const response = await fetch(settings.apiEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (!response.ok) throw new Error(response.statusText);

                // 5. Handle Streaming
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    aiMsg.content[0].text += chunk;
                    nextTick(() => {
                        if(ctChatContainer.value) ctChatContainer.value.scrollTop = ctChatContainer.value.scrollHeight;
                    });
                }
                
            } catch (e) {
                console.error(e);
                ctMessages.value.push({ role: 'assistant', content: [{ type: 'text', text: "Error: " + e.message }] });
            } finally {
                isLoading.value = false;
            }
        };

        // --- Session Management ---

        const loadSessions = () => {
            const storedSessions = localStorage.getItem('medgemma_sessions');
            if (storedSessions) {
                sessions.value = JSON.parse(storedSessions);
            }
        };

        const saveSessionList = () => {
            localStorage.setItem('medgemma_sessions', JSON.stringify(sessions.value));
        };

        const generateTitle = (msgs) => {
            if (!msgs || msgs.length === 0) return "新对话";
            // Get first user content
            const firstMsg = msgs.find(m => m.role === 'user');
            if (firstMsg) {
                const textContent = firstMsg.content.find(c => c.type === 'text');
                if (textContent) {
                    return textContent.text.substring(0, 20) + (textContent.text.length > 20 ? "..." : "");
                }
                if (firstMsg.content.some(c => c.type === 'image')) return "影像分析";
            }
            return "新对话";
        };

        const saveCurrentSession = () => {
            if (!currentSessionId.value) return;
            
            try {
                // Save messages
                localStorage.setItem(`medgemma_session_${currentSessionId.value}`, JSON.stringify(messages.value));
            } catch (e) {
                if (e.name === 'QuotaExceededError' || e.code === 22) {
                     console.warn("LocalStorage Quota Exceeded. Failed to save session history.");
                     // Optional: Notify user or handle gracefully
                } else {
                    console.error("Error saving session:", e);
                }
                return; // Stop updating metadata if content save failed
            }
            
            // Update session list metadata
            const sessionIndex = sessions.value.findIndex(s => s.id === currentSessionId.value);
            if (sessionIndex !== -1) {
                sessions.value[sessionIndex].lastModified = Date.now();
                sessions.value[sessionIndex].title = generateTitle(messages.value);
                // Move to top
                const session = sessions.value.splice(sessionIndex, 1)[0];
                sessions.value.unshift(session);
            } else {
                // Should exist, but if not create
                 sessions.value.unshift({
                    id: currentSessionId.value,
                    title: generateTitle(messages.value),
                    lastModified: Date.now()
                });
            }
            saveSessionList();
        };

        const createNewSession = () => {
             // If current session is empty, just stick to it
            if (messages.value.length === 0 && currentSessionId.value) {
                // Check if there's pending input to clear
                userInput.value = "";
                pendingImage.value = null;
                activeFloatingImage.value = null;
                currentFindings.value = []; // Clear findings
                return;
            }

            const newId = Date.now().toString();
            currentSessionId.value = newId;
            messages.value = [];
            userInput.value = ""; // Clear input
            pendingImage.value = null; // Clear pending image
            activeFloatingImage.value = null; // Clear float
            currentFindings.value = []; // Clear findings
            
            sessions.value.unshift({
                id: newId,
                title: "新对话",
                lastModified: Date.now()
            });
            saveSessionList();
            
            // Focus input (if possible)
        };

        const switchSession = (sessionId) => {
            if (currentSessionId.value === sessionId) return;
            
            // Save messages of current (usually done by watch, but force to be safe)
            // Actually watch covers it.
            
            // Load new
            const storedMsgs = localStorage.getItem(`medgemma_session_${sessionId}`);
            messages.value = storedMsgs ? JSON.parse(storedMsgs) : [];
            currentSessionId.value = sessionId;
            
            // Clear output state
            activeFloatingImage.value = null;
            currentFindings.value = [];
            
            // Close sidebar on mobile if open
            if (window.innerWidth < 1024) showHistory.value = false;
        };

        const deleteSession = (sessionId, event) => {
             if (event) event.stopPropagation(); // Stop click from switching session
             if (!confirm("确定删除此对话吗？")) return;
             
             sessions.value = sessions.value.filter(s => s.id !== sessionId);
             localStorage.removeItem(`medgemma_session_${sessionId}`);
             saveSessionList();
             
             if (currentSessionId.value === sessionId) {
                 if (sessions.value.length > 0) {
                     switchSession(sessions.value[0].id);
                 } else {
                     createNewSession();
                 }
             }
        };

        // Initialize
        loadSessions();
        if (sessions.value.length === 0) {
            createNewSession();
        } else {
            // Load the most recent
            switchSession(sessions.value[0].id);
        }

        // Auto-save on message change
        watch(messages, () => {
             saveCurrentSession();
        }, { deep: true });


        // Load settings from localStorage
        const savedSettings = localStorage.getItem('medgemma_settings');
        if (savedSettings) {
            Object.assign(settings, JSON.parse(savedSettings));
        }

        // Save settings on change
        watch(settings, (newSettings) => {
            localStorage.setItem('medgemma_settings', JSON.stringify(newSettings));
        });

        const scrollToBottom = async () => {
            await nextTick();
            if (chatContainer.value) {
                chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
            }
        };

        const handleImageUpload = (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                pendingImage.value = e.target.result;
                activeFloatingImage.value = e.target.result; // Auto float newly uploaded image
                currentFindings.value = []; // [Fix] Clear old bounding boxes when a new image is uploaded
            };
            reader.readAsDataURL(file);
            // Reset input so same file can be selected again if cleared
            event.target.value = '';
        };

        const setActiveFloatingImage = (imgUrl) => {
            if (activeFloatingImage.value !== imgUrl) {
                // Only clear findings if the image actually changes
                activeFloatingImage.value = imgUrl;
                currentFindings.value = []; // Reset findings because they belong to the old image
            }
        };



        const detectLesions = async () => {
            if (!activeFloatingImage.value || isDetecting.value) return;
            
            isDetecting.value = true;
            try {
                // Construct a temporary request just for detection
                const payload = {
                    messages: [
                        {
                            role: "user",
                            content: [
                                { type: "image", image: activeFloatingImage.value },
                                { type: "text", text: "Analyze this image for lesions." } // The system prompt is now handled by config
                            ]
                        }
                    ],
                    config: {
                        system_prompt: settings.detectionPrompt // Pass the custom prompt from frontend
                    }
                };
                
                // Note: The backend endpoint /detect usually hardcodes the prompt in detection_service.py
                // To support frontend-driven prompt editing, we need to update the backend to accept 'config.system_prompt'
                // or just send it as a special parameter. 
                // However, based on current backend implementation, let's assume we modify backend to read this.
                // Or for now, we will assume prompt testing happens by editing the file directly until backend supports override.
                // Wait, actually, let's verify if /detect supports config override.
                // Looking at app.py: yes, DetectRequest has config: Optional[Config].
                // Looking at detection_service.py: detect_findings takes 'messages'
                // We need to ensure we pass the 'custom system prompt' effectively.
                // Actually, current detection_service.py constructs the prompt internally.
                // Let's modify the backend service to use the provided system prompt.

                const response = await fetch(settings.apiEndpoint.replace("/chat", "/detect"), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();
                
                if (data.status === "success" && Array.isArray(data.findings)) {
                    currentFindings.value = data.findings;
                    // Generate Clinical Summary
                    const summary = data.findings.map((f, i) => `${i+1}. ${f.label}: ${f.description}`).join('\n');
                    
                    // Add system message with collapsible thought
                    // Note: We used a specific class or structure to identify it later if needed
                    const messageContent = `**影像分析结果** (共 ${data.findings.length} 处):\n${summary}\n\n<details><summary style="cursor: pointer; color: #60a5fa;">点击查看 AI 思考过程</summary>\n\n${data.thought || '无思考过程'}\n</details>`;

                    messages.value.push({
                        role: "model",
                        isDetectionResult: true,
                        relatedImage: activeFloatingImage.value,
                        relatedFindings: data.findings,
                        content: [{ type: "text", text: messageContent }]
                    });
                    scrollToBottom();
                } else {
                    alert("未检测到明确病灶或格式解析失败:\n" + (data.findings?.raw || "Unknown error"));
                }

            } catch (e) {
                console.error("Detection error:", e);
                alert("检测服务调用失败");
            } finally {
                isDetecting.value = false;
            }
        };

        // --- Editing Features ---
        
        const deleteMessage = (index) => {
             // Remove message at index
             if (confirm("确定要删除这条消息吗？")) {
                 messages.value.splice(index, 1);
                 saveCurrentSession();
             }
        };

        const startEdit = (index, currentTextContent) => {
            editingIndex.value = index;
            editText.value = currentTextContent || "";
        };

        const cancelEdit = () => {
            editingIndex.value = -1;
            editText.value = "";
        };

        const saveEdit = (index) => {
            if (editingIndex.value === index) {
                 const msg = messages.value[index];
                 // Assume single text block for simplicity or find first text block
                 const textItem = msg.content.find(c => c.type === 'text');
                 if (textItem) {
                     textItem.text = editText.value;
                 } else {
                     // If no text existed (only image?), add it
                     msg.content.push({ type: 'text', text: editText.value });
                 }
                 editingIndex.value = -1;
                 editText.value = "";
                 saveCurrentSession();
            }
        };

        const restoreDetectionView = (msg) => {
             if (msg.relatedImage && msg.relatedFindings) {
                 activeFloatingImage.value = msg.relatedImage;
                 currentFindings.value = msg.relatedFindings;
             }
        };

        const clearPendingImage = () => {
            pendingImage.value = null;
        };

        const renderMarkdown = (text) => {
            if (!text) return "";

            // 1. Clean system tokens
            let cleanText = text.replace(/<\/s>|<eos>|<pad>|<bos>/gi, "").trim();

            // 2. Normalize tags to standard <think> for easier processing
            // Replace <unused94> or escaped versions with <think>
            // Replace <unused95> or escaped versions with </think>
            cleanText = cleanText
                .replace(/<unused94>|&lt;unused94&gt;|&lt;think&gt;/gi, "<think>")
                .replace(/<unused95>|&lt;unused95&gt;|&lt;\/think&gt;/gi, "</think>");

            // 3. Extract Think Block
            const thinkMatch = cleanText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);

            if (thinkMatch) {
                const thoughtContent = thinkMatch[1].trim(); // Extract content
                
                // Remove the entire think block from the text to get the "Answer"
                // We use the full match to ensure we remove exactly what we matched
                const finalAnswer = cleanText.replace(thinkMatch[0], "").trim();

                // 4. Render Layout
                const thoughtHtml = `
                    <details class="mb-4 bg-gray-800/50 rounded-lg border border-gray-700/50 overflow-hidden group">
                        <summary class="cursor-pointer bg-gray-800/80 px-3 py-2 text-xs text-gray-400 font-mono hover:text-blue-300 select-none flex items-center gap-2 transition-colors">
                            <i class="fa-solid fa-brain group-open:text-blue-400"></i> 
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
        };

        let abortController = null;

        const processResponse = async () => {
            isLoading.value = true;
            abortController = new AbortController();

            try {
                const payload = {
                    messages: messages.value.map(msg => {
                        // Context Management: 
                        // Strip <details> blocks (Thought Traces) from model messages before sending back to API
                        // ensuring only the clinical summary remains in context.
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
                    signal: abortController.signal
                });

                if (!response.ok) {
                    throw new Error(`API Error: ${response.statusText}`);
                }

                messages.value.push({
                    role: 'model',
                    content: [{ type: 'text', text: '' }]
                });
                
                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                const currentMessageIndex = messages.value.length - 1;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value, { stream: true });
                    messages.value[currentMessageIndex].content[0].text += chunk;
                    
                    requestAnimationFrame(() => {
                        scrollToBottom();
                    });
                }

            } catch (error) {
                if (error.name === 'AbortError') {
                    const lastMsg = messages.value[messages.value.length - 1];
                    if (lastMsg && lastMsg.role === 'model') {
                         lastMsg.content[0].text += " [已停止]";
                    }
                } else {
                    console.error(error);
                    messages.value.push({
                        role: 'model',
                        content: [{ type: 'text', text: `**Error:** Failed to get response. ${error.message}` }]
                    });
                }
            } finally {
                isLoading.value = false;
                abortController = null;
                scrollToBottom();
            }
        };

        const sendMessage = async () => {
            console.log("sendMessage triggered. Input length:", userInput.value.length, "Image:", !!pendingImage.value);
            
            if ((!userInput.value.trim() && !pendingImage.value) || isLoading.value) {
                console.log("Validation failed or Loading. Skipping.");
                return;
            }

            const userText = userInput.value;
            const userImg = pendingImage.value;

            // Construct User Message
            const userContent = [];
            // Google/MedGemma Prompt Guide recommends: [Image, Text] or Interleaved.
            // For standard user query, putting Image first often works better for "Caption this" style.
            if (userImg) userContent.push({ type: 'image', image: userImg });
            if (userText) userContent.push({ type: 'text', text: userText });

            messages.value.push({
                role: 'user',
                content: userContent
            });

            // Clear inputs
            userInput.value = "";
            pendingImage.value = null;
            scrollToBottom();
            
            try {
                await processResponse();
            } catch (e) {
                console.error("Error in processResponse:", e);
                messages.value.push({
                    role: 'model',
                    content: [{ type: 'text', text: `**System Error:** ${e.message}` }]
                });
                isLoading.value = false;
            }
        };

        const stopGeneration = () => {
            if (abortController) {
                abortController.abort();
            }
        };

        const regenerate = async () => {
            if (isLoading.value) return;
            if (messages.value.length === 0) return;

            const lastMsg = messages.value[messages.value.length - 1];
             // If the last message is from the model, remove it to regenerate
            if (lastMsg.role === 'model') {
                messages.value.pop();
            }

            // After removing (or if user was last), ensure there is at least one message (user input) to send
            if (messages.value.length > 0) {
                await processResponse();
            }
        };

        const resetSession = () => {
            if(confirm("确定要清空当前对话历史吗？")) {
                messages.value = [];
            }
        };
        
        const getMessageText = (msg) => {
             if (Array.isArray(msg.content)) {
                 const textItem = msg.content.find(c => c.type === 'text');
                 return textItem ? textItem.text : '';
             }
             if (typeof msg.content === 'string') return msg.content;
             return '';
        };

        const previewImage = (url) => {
            previewImageUrl.value = url;
        }

        return {
            messages,
            userInput,
            pendingImage,
            isLoading,
            stopGeneration,
            regenerate,
            showSettings,
            settings,
            resetSettings,
            clearCache,
            chatContainer,
            previewImageUrl,
            handleImageUpload,
            clearPendingImage,
            sendMessage,
            renderMarkdown,
            getMessageText, // Added export
            resetSession,
            previewImage,
            sessions,
            currentSessionId,
            createNewSession,
            switchSession,
            deleteMessage: deleteMessage, // Ensure explicit assignment
            deleteSession,
            showHistory,
            // CT Exports
            currentView,
            ctImages,
            ctMessages,
            ctInput,
            isProcessingCT,
            ctChatContainer,
            switchView,
            processCTUpload,
            sendCTMessage,
            // New exports
            activeFloatingImage,
            setActiveFloatingImage,
            currentFindings,
            isDetecting,
            detectLesions,
            restoreDetectionView,
            editingIndex,
            editText,
            startEdit,
            cancelEdit,
            saveEdit
        };
    }
}).mount('#app');
