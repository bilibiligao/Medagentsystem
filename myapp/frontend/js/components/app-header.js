// AppHeader — top navigation bar
import { useStore } from '../store.js';

export default {
    name: 'AppHeader',
    template: `
        <header class="bg-gray-800 border-b border-gray-700 p-3 sm:p-4 flex justify-between items-center shadow-lg z-10 shrink-0">
            <div class="flex items-center gap-2 sm:gap-3">
                <button @click="toggleHistory"
                    class="lg:hidden p-2 hover:bg-gray-700 rounded-full transition text-gray-400 hover:text-white">
                    <i class="fa-solid fa-bars"></i>
                </button>
                <i class="fa-solid fa-notes-medical text-emerald-500 text-xl sm:text-2xl"></i>
                <h1 class="text-lg sm:text-xl font-bold text-white tracking-wide">AI 诊疗助手</h1>
            </div>
            <div class="flex items-center gap-2">
                <button @click="newChat"
                    class="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-full text-sm transition shadow-sm flex items-center gap-1">
                    <i class="fa-solid fa-plus text-xs"></i> <span class="hidden sm:inline">新对话</span>
                </button>
                <button @click="toggleSettings"
                    class="p-2 hover:bg-gray-700 rounded-full transition text-gray-400 hover:text-white">
                    <i class="fa-solid fa-gear text-lg"></i>
                </button>
            </div>
        </header>
    `,
    setup() {
        const store = useStore();
        return {
            toggleHistory() { store.showHistory.value = !store.showHistory.value; },
            toggleSettings() { store.showSettings.value = !store.showSettings.value; },
            newChat() { store.createNewSession(); },
        };
    }
};
