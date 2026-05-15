// HistorySidebar — session list + view switcher
import { useStore } from '../store.js';

export default {
    name: 'HistorySidebar',
    template: `
        <aside :class="['bg-gray-800 border-r border-gray-700 transition-all duration-300 flex flex-col shrink-0 z-20',
            showHistory ? 'absolute inset-y-0 left-0 w-64 lg:w-64' : 'hidden lg:flex lg:w-64']">
            <div class="p-4 border-b border-gray-700 shrink-0">
                <div class="flex gap-1 mb-3 bg-gray-900 p-1 rounded-lg">
                    <button @click="switchTo('chat')" :class="['flex-1 py-1.5 px-2 rounded text-xs transition flex items-center justify-center gap-1',
                        currentView === 'chat' ? 'bg-gray-700 text-white shadow font-bold' : 'text-gray-400 hover:text-gray-300']">
                        <i class="fa-solid fa-message text-[10px]"></i> 普通影像
                    </button>
                    <button @click="switchTo('ct')" :class="['flex-1 py-1.5 px-2 rounded text-xs transition flex items-center justify-center gap-1',
                        currentView === 'ct' ? 'bg-gray-700 text-white shadow font-bold' : 'text-gray-400 hover:text-gray-300']">
                        <i class="fa-solid fa-layer-group text-[10px]"></i> 3D断层
                    </button>
                </div>
                <button @click="store.createNewSession()"
                    class="w-full bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/50 rounded-lg py-2 px-3 text-sm transition flex items-center justify-center gap-2">
                    <i class="fa-solid fa-plus text-xs"></i> 新建对话
                </button>
            </div>
            <div class="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-hide">
                <div v-for="session in store.sessions.value" :key="session.id"
                    @click="store.switchSession(session.id)"
                    :class="['rounded-lg cursor-pointer group p-3 text-sm transition truncate',
                        session.id === store.currentSessionId.value ? 'bg-gray-700 text-white shadow-inner' : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200']">
                    <div class="flex items-center justify-between">
                        <span class="truncate flex-1">{{ session.title || '新对话' }}</span>
                        <button @click="store.deleteSession(session.id, $event)"
                            class="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition p-1 ml-2">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </div>
                <div v-if="!store.sessions.value.length" class="text-center text-gray-500 text-xs py-8">暂无对话历史</div>
            </div>
        </aside>
    `,
    setup() {
        const store = useStore();
        return {
            store,
            currentView: store.currentView,
            showHistory: store.showHistory,
            switchTo(view) {
                store.switchView(view);
                if (window.innerWidth < 1024) store.showHistory.value = false;
            },
        };
    }
};
