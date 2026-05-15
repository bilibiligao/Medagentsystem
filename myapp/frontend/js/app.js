// MedGemma Frontend — Entry Point
// Registers all components and mounts the Vue 3 app.
import { useStore } from './store.js';
import AppHeader from './components/app-header.js';
import HistorySidebar from './components/history-sidebar.js';
import ChatView from './components/chat-view.js';
import CTView from './components/ct-view.js';
import SettingsPanel from './components/settings-panel.js';
import ImageModal from './components/image-modal.js';
import FloatingImage from './components/floating-image.js';

const { createApp } = Vue;
const store = useStore();

createApp({
    setup() {
        return {
            currentView: store.currentView,
            showSettings: store.showSettings,
        };
    }
})
    .component('app-header', AppHeader)
    .component('history-sidebar', HistorySidebar)
    .component('chat-view', ChatView)
    .component('ct-view', CTView)
    .component('settings-panel', SettingsPanel)
    .component('image-modal', ImageModal)
    .component('floating-image', FloatingImage)
    .mount('#app');
