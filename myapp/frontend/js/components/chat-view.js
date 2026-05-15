// ChatView — main chat area with message list and input
import { useStore } from '../store.js';

export default {
    name: 'ChatView',
    template: `
        <section class="flex-1 flex flex-col min-w-0 bg-gray-900">
            <!-- Messages -->
            <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth scrollbar-hide">
                <!-- Empty State -->
                <div v-if="!store.messages.value.length" class="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
                    <i class="fa-solid fa-robot text-6xl opacity-50"></i>
                    <p class="text-lg font-medium text-gray-400">上传医学影像或开始对话...</p>
                    <p class="text-sm text-gray-500 mt-1">支持 X 光、CT、MRI、病理切片等多种医学影像</p>
                </div>

                <!-- Messages -->
                <div v-for="(msg, index) in store.messages.value" :key="index"
                    :class="['flex', msg.role === 'user' ? 'justify-end' : 'justify-start']">
                    <div :class="['max-w-[80%] lg:max-w-[70%] p-3 rounded-2xl shadow-md group relative',
                        msg.role === 'user' ? 'bg-emerald-600 text-white rounded-tr-sm' : 'bg-gray-800 border border-gray-700 rounded-tl-sm']">

                        <!-- Edit Mode -->
                        <div v-if="store.editingIndex.value === index" class="min-w-[300px]">
                            <textarea v-model="store.editText.value" class="w-full bg-gray-900/50 border border-gray-500 rounded p-2 text-sm text-white resize-y min-h-[60px] focus:border-emerald-400 outline-none"></textarea>
                            <div class="flex justify-end gap-2 mt-2">
                                <button @click="store.cancelEdit()" class="px-3 py-1 text-sm rounded bg-gray-600 hover:bg-gray-500 text-white transition">取消</button>
                                <button @click="store.saveEdit(index)" class="px-3 py-1 text-sm rounded bg-green-600 hover:bg-green-500 text-white transition">保存</button>
                            </div>
                        </div>

                        <!-- Display Mode -->
                        <template v-else>
                            <!-- Toolbar -->
                            <div :class="['absolute -top-3 flex gap-1 bg-gray-700/90 rounded-full px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 border border-gray-600 shadow-sm z-10',
                                msg.role === 'user' ? 'right-0' : 'left-0']">
                                <button @click="store.setActiveFloatingImage(getFirstImage(msg))" v-if="getFirstImage(msg)"
                                    class="hover:text-emerald-400 text-gray-400 text-xs p-1 transition" title="设为参考影像">
                                    <i class="fa-solid fa-image"></i>
                                </button>
                                <button @click="store.startEdit(index, getText(msg))"
                                    class="hover:text-white text-gray-400 text-xs p-1 transition" title="编辑">
                                    <i class="fa-solid fa-pen-to-square"></i>
                                </button>
                                <button @click="store.deleteMessage(index)"
                                    class="hover:text-red-400 text-gray-400 text-xs p-1 transition" title="删除">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>

                            <!-- Content -->
                            <div v-for="(item, ci) in msg.content" :key="ci">
                                <img v-if="item.type === 'image'" :src="item.image"
                                    @click="store.previewImage(item.image)"
                                    class="max-h-64 rounded-lg mb-2 cursor-pointer hover:opacity-90 transition border border-gray-600">
                                <div v-else-if="item.type === 'text'" v-html="store.renderMarkdown(item.text)" class="prose prose-invert max-w-none prose-p:my-1 prose-pre:my-2"></div>
                            </div>

                            <!-- Detection Result Restore -->
                            <button v-if="msg.isDetectionResult"
                                @click="store.restoreDetectionView(msg)"
                                class="mt-3 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-xs transition flex items-center gap-2">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i> 查看病灶标注图
                            </button>
                        </template>
                    </div>
                </div>

                <!-- Loading Indicator -->
                <div v-if="store.isLoading.value" class="flex justify-start">
                    <div class="bg-gray-800 border border-gray-700 rounded-2xl rounded-tl-sm p-4 shadow-md flex items-center gap-2">
                        <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                        <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                    </div>
                </div>
            </div>

            <!-- Input Area -->
            <div class="bg-gray-800 p-2 sm:p-4 border-t border-gray-700 shrink-0">
                <div v-if="store.pendingImage.value" class="flex gap-4 p-2 mb-2">
                    <div class="relative w-fit">
                        <img :src="store.pendingImage.value" class="h-16 sm:h-20 w-auto rounded border border-gray-500">
                        <button @click="store.clearPendingImage()"
                            class="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-sm transition text-xs">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>
                <div class="flex gap-2 items-end max-w-5xl mx-auto">
                    <label class="p-2 sm:p-3 hover:bg-gray-700 rounded-lg transition cursor-pointer text-gray-400 hover:text-emerald-400" title="上传影像">
                        <i class="fa-solid fa-image text-xl"></i>
                        <input type="file" accept="image/*" class="hidden" @change="store.handleImageUpload">
                    </label>
                    <div class="flex-1 bg-gray-700 rounded-xl flex items-center border border-gray-600 transition focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
                        <textarea v-model="store.userInput.value" @keydown.enter.prevent="store.sendMessage()"
                            :disabled="store.isLoading.value"
                            class="flex-1 bg-transparent border-none outline-none text-white p-3 max-h-32 resize-none text-sm"
                            placeholder="输入诊断问题或描述..." rows="1"></textarea>
                    </div>
                    <button v-if="!store.isLoading.value && store.messages.value.length > 0"
                        @click="store.regenerate()"
                        class="bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl px-4 py-3 transition shadow-lg flex items-center" title="重新生成">
                        <i class="fa-solid fa-rotate-right"></i>
                    </button>
                    <button v-if="!store.isLoading.value" @click="store.sendMessage()"
                        class="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-4 py-3 transition shadow-lg disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center w-12 h-12">
                        <i class="fa-solid fa-paper-plane"></i>
                    </button>
                    <button v-else @click="store.stopGeneration()"
                        class="bg-red-500 hover:bg-red-600 text-white rounded-xl px-4 py-3 transition shadow-lg flex items-center justify-center w-12 h-12">
                        <i class="fa-solid fa-stop"></i>
                    </button>
                </div>
            </div>
        </section>
    `,
    setup() {
        const store = useStore();
        const getText = (msg) => {
            if (Array.isArray(msg.content)) {
                const t = msg.content.find(c => c.type === 'text');
                return t ? t.text : '';
            }
            return typeof msg.content === 'string' ? msg.content : '';
        };
        const getFirstImage = (msg) => {
            if (Array.isArray(msg.content)) {
                const img = msg.content.find(c => c.type === 'image');
                return img ? img.image : null;
            }
            return null;
        };
        return {
            store,
            getText,
            getFirstImage,
            chatContainer: store.chatContainer,
        };
    }
};
