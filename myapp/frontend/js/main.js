// main.js
import { state, actions, settings } from './store.js';
import { detectLesions } from './api/detection.js';
import { sendMessage, regenerate } from './api/chat.js';
import { renderMarkdown, getBoxStyle } from './components/renderer.js';

// Retrieve global Vue from CDN (or window)
const { createApp, toRefs, onMounted } = window.Vue;

const app = createApp({
    setup() {
        onMounted(() => {
            // Initialize sessions
            actions.loadSessions();
            
            // Optional: Restore last session or start new?
            // Current store logic initializes empty state.
            // If user has sessions, they can click.
            // If we want to auto-load text, we could do:
            // if (state.sessions.length > 0) actions.switchSession(state.sessions[0].id);
        });

        return {
            // State (reactive properties)
            ...toRefs(state),
            settings,
            
            // Actions
            ...actions,
            detectLesions,
            sendMessage,
            regenerate,
            
            // Render Helpers
            renderMarkdown,
            getBoxStyle
        };
    }
});

app.mount('#app');
