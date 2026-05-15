// SettingsPanel — slide-out settings drawer
import { useStore } from '../store.js';

export default {
    name: 'SettingsPanel',
    template: `
        <transition name="slide">
            <aside v-if="store.showSettings.value"
                class="absolute right-0 top-0 bottom-0 w-80 bg-gray-800 border-l border-gray-700 shadow-2xl z-30 flex flex-col p-6 overflow-y-auto">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-xl font-bold text-white"><i class="fa-solid fa-sliders mr-2"></i>设置</h2>
                    <button @click="close" class="text-gray-400 hover:text-white p-1"><i class="fa-solid fa-xmark text-lg"></i></button>
                </div>

                <div class="space-y-6 flex-1">
                    <!-- System Prompt -->
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-300">系统提示词 (System Prompt)</label>
                        <textarea v-model="store.settings.systemPrompt" class="w-full bg-gray-900/50 border border-gray-600 rounded p-3 text-sm text-white h-32 resize-y focus:border-emerald-500 outline-none"></textarea>
                    </div>

                    <!-- Temperature -->
                    <div class="space-y-2">
                        <div class="flex justify-between"><label class="text-sm font-medium text-gray-300">Temperature</label><span class="text-sm text-gray-400">{{ store.settings.temperature }}</span></div>
                        <input type="range" v-model.number="store.settings.temperature" min="0" max="1" step="0.01" class="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer">
                    </div>

                    <!-- Top P -->
                    <div class="space-y-2">
                        <div class="flex justify-between"><label class="text-sm font-medium text-gray-300">Top P</label><span class="text-sm text-gray-400">{{ store.settings.topP }}</span></div>
                        <input type="range" v-model.number="store.settings.topP" min="0" max="1" step="0.01" class="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer">
                    </div>

                    <!-- Max Tokens -->
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-300">最大 Token 数 (Max Tokens)</label>
                        <input type="number" v-model.number="store.settings.maxTokens" min="256" max="16384" class="w-full bg-gray-900/50 border border-gray-600 rounded p-2 text-sm focus:border-emerald-500 outline-none">
                    </div>

                    <!-- Context Window -->
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-300">上下文窗口 (Context Window)</label>
                        <input type="number" v-model.number="store.settings.contextWindow" min="512" max="32768" class="w-full bg-gray-900/50 border border-gray-600 rounded p-2 text-sm focus:border-emerald-500 outline-none">
                    </div>

                    <!-- Detection Settings -->
                    <details class="group border-t border-gray-700 pt-4">
                        <summary class="cursor-pointer list-none text-sm font-medium text-gray-300 hover:text-white flex items-center gap-2">
                            <i class="fa-solid fa-crosshairs"></i> 病灶检测设置 <i class="fa-solid fa-chevron-down text-[10px] text-gray-500 group-open:rotate-180 transition ml-auto"></i>
                        </summary>
                        <div class="space-y-2 mt-2 animate-fadeIn">
                            <label class="text-xs text-gray-500">检测提示词 (Detection Prompt)</label>
                            <textarea v-model="store.settings.detectionPrompt" class="w-full bg-gray-900/50 border border-gray-600 rounded p-3 text-sm text-white h-32 resize-y font-mono focus:border-emerald-500 outline-none"></textarea>
                        </div>
                    </details>

                    <!-- API Endpoint -->
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-300">API 端点</label>
                        <input type="text" v-model="store.settings.apiEndpoint" class="w-full bg-gray-900/50 border border-gray-600 rounded p-2 text-sm font-mono focus:border-emerald-500 outline-none">
                    </div>
                </div>

                <!-- Danger Zone -->
                <div class="mt-6 space-y-1">
                    <p class="text-xs text-red-400 font-medium mb-2">⚠️ 危险操作区</p>
                    <button @click="store.resetSettings()" class="w-full bg-gray-700 hover:bg-gray-600 text-white rounded px-3 py-2 text-sm transition">
                        <i class="fa-solid fa-arrow-rotate-left mr-2"></i>恢复默认设置
                    </button>
                    <button @click="store.clearCache()" class="w-full bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-800 rounded px-3 py-2 text-sm transition">
                        <i class="fa-solid fa-triangle-exclamation mr-2"></i>重置所有数据
                    </button>
                </div>

                <div class="mt-4 text-center text-gray-600 text-[10px]">
                    MedGemma 1.5 Local
                </div>
            </aside>
        </transition>
    `,
    setup() {
        const store = useStore();
        return { store, close() { store.showSettings.value = false; } };
    }
};
