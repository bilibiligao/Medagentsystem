// api/detection.js
import { state, settings } from '../store.js';

export async function detectLesions() {
    if (!state.activeFloatingImage || state.isDetecting) return;

    state.isDetecting = true;
    state.currentFindings = [];

    try {
        const payload = {
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: settings.detectionPrompt },
                        { type: "image_url", image_url: { url: state.activeFloatingImage } }
                    ]
                }
            ],
            temperature: 0.2, // Low temp for detection stability
            top_p: 0.95,
            max_tokens: 2048,
            stream: false
        };

        const response = await fetch(settings.apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const data = await response.json();
        const content = data.choices[0].message.content;
        
        let jsonContent = content;
        // Try to find JSON block if wrapped in markdown
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
            jsonContent = jsonMatch[1];
        }

        const findings = JSON.parse(jsonContent);
        
        if (Array.isArray(findings)) {
            // Validate coordinates
            state.currentFindings = findings.filter(f => 
                f.box_2d && 
                f.box_2d.length === 4 && 
                f.box_2d[2] > f.box_2d[0] && 
                f.box_2d[3] > f.box_2d[1]
            );
            
            // Add a system message to chat history noting the detection
            state.messages.push({
                role: 'assistant',
                content: [{ 
                    type: 'text', 
                    text: `已在当前图像中检测到 ${state.currentFindings.length} 个关注区域。请点击图像查看详细标注。` 
                }],
                relatedImage: state.activeFloatingImage,
                relatedFindings: JSON.parse(JSON.stringify(state.currentFindings)) // deep copy
            });
        }
    } catch (error) {
        console.error("Detection failed:", error);
        alert(`检测失败: ${error.message}`);
    } finally {
        state.isDetecting = false;
    }
}
