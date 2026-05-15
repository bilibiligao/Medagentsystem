// CTView — CT 3D analysis split-pane view
import { useStore } from '../store.js';

export default {
    name: 'CTView',
    template: `
        <section class="flex-1 flex min-w-0 bg-gray-900">
            <!-- Left: Image Viewer -->
            <div class="w-1/2 bg-black border-r border-gray-700 flex flex-col">
                <div class="p-2 border-b border-gray-800 flex items-center justify-between shrink-0">
                    <div class="flex items-center gap-2 text-gray-300 text-sm">
                        <i class="fa-solid fa-x-ray text-emerald-500"></i>
                        <span>影像工作站</span>
                        <span v-if="store.ctImages.value.length" class="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{{ store.ctImages.value.length }} 切片</span>
                    </div>
                    <label :class="['px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs transition cursor-pointer shadow-sm',
                        store.isProcessingCT.value ? 'opacity-50 cursor-not-allowed' : '']">
                        <i class="fa-solid fa-folder-open mr-1"></i> 打开序列
                        <input type="file" class="hidden" webkitdirectory directory multiple @change="store.processCTUpload" :disabled="store.isProcessingCT.value">
                    </label>
                </div>
                <div class="flex-1 overflow-y-auto scrollbar-hide relative">
                    <!-- Loading Overlay -->
                    <div v-if="store.isProcessingCT.value" class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10 gap-4">
                        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500"></div>
                        <p class="text-emerald-400 text-sm animate-pulse">正在进行3D窗位重构与采样...</p>
                    </div>
                    <!-- Empty State -->
                    <div v-if="!store.ctImages.value.length && !store.isProcessingCT.value" class="flex items-center justify-center h-full text-gray-600">
                        <div class="text-center">
                            <i class="fa-solid fa-x-ray text-5xl mb-3 opacity-50"></i>
                            <p class="text-lg font-medium text-gray-500">暂无影像数据</p>
                            <p class="text-xs text-gray-600 mt-1">点击"打开序列"选择 DICOM 文件夹</p>
                        </div>
                    </div>
                    <!-- Image Grid -->
                    <div v-else class="grid grid-cols-4 gap-1 p-1 content-start">
                        <div v-for="img in store.ctImages.value" :key="img.index"
                            @click="store.previewImage(img.image)"
                            class="aspect-square bg-black group relative cursor-pointer border border-transparent hover:border-emerald-500/50 transition">
                            <img :src="img.image" class="w-full h-full object-cover" loading="lazy">
                            <div class="absolute top-0 right-0 bg-black/60 text-gray-300 text-[10px] px-1 font-mono">{{ img.index }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right: Analysis Chat -->
            <div class="w-1/2 flex flex-col bg-gray-900">
                <div class="p-2 border-b border-gray-800 flex items-center gap-2 shrink-0 text-sm">
                    <i class="fa-solid fa-brain text-emerald-400"></i>
                    <span class="text-gray-300 font-medium">智能诊断</span>
                    <span class="text-[10px] text-gray-500 ml-auto">MedGemma 3D</span>
                </div>
                <div ref="ctChatContainer" class="flex-1 overflow-y-auto p-3 space-y-4 scroll-smooth scrollbar-hide">
                    <!-- Empty State -->
                    <div v-if="!store.ctMessages.value.length" class="flex items-center justify-center h-full text-gray-600">
                        <div class="text-center">
                            <i class="fa-solid fa-brain text-5xl mb-3 opacity-50"></i>
                            <p class="text-sm font-medium text-gray-500">加载影像后，在此处开始分析...</p>
                        </div>
                    </div>

                    <!-- CT Messages -->
                    <div v-for="(msg, index) in store.ctMessages.value" :key="index"
                        :class="['flex', msg.role === 'user' ? 'justify-end' : 'justify-start']">
                        <div :class="['max-w-[85%] p-3 rounded-2xl shadow-md',
                            msg.role === 'user' ? 'bg-emerald-600 text-white rounded-tr-sm' : 'bg-gray-800 border border-gray-700 rounded-tl-sm']">
                            <div v-for="(item, ci) in msg.content" :key="ci">
                                <img v-if="item.type === 'image'" :src="item.image" class="max-h-48 rounded-lg mb-2">
                                <div v-else-if="item.type === 'text'" v-html="store.renderMarkdown(item.text)" class="prose prose-invert max-w-none prose-p:my-1 prose-pre:my-2"></div>
                            </div>
                            <!-- Action Buttons -->
                            <div v-if="msg.actions" class="flex flex-wrap gap-2 mt-2">
                                <button v-for="(action, ai) in msg.actions" :key="ai"
                                    @click="store.sendCTMessage(action.query)"
                                    class="bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/50 rounded-full px-3 py-1 text-[10px] transition">
                                    {{ action.label }}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- CT Input -->
                <div class="p-3 bg-gray-800 border-t border-gray-700 shrink-0">
                    <div class="flex gap-2">
                        <textarea v-model="store.ctInput.value" @keydown.enter.prevent="store.sendCTMessage()"
                            :disabled="store.isLoading.value"
                            class="flex-1 bg-gray-900 border border-gray-700 rounded text-sm text-white p-2 resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            placeholder="输入关于这组影像的问题..." rows="2"></textarea>
                        <button @click="store.sendCTMessage()" :disabled="store.isLoading.value || !store.ctImages.value.length"
                            class="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded px-4 transition flex items-center justify-center w-12">
                            <i :class="store.isLoading.value ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-paper-plane'"></i>
                        </button>
                    </div>
                </div>
            </div>
        </section>
    `,
    setup() {
        const store = useStore();
        return {
            store,
            ctChatContainer: store.ctChatContainer,
        };
    }
};
