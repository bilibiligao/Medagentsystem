// FloatingImage — bottom-right persistent image viewer with detection overlay
import { useStore } from '../store.js';

export default {
    name: 'FloatingImage',
    template: `
        <transition name="slide-up">
            <div v-if="store.activeFloatingImage.value"
                class="fixed bottom-24 right-6 w-64 z-30 bg-gray-800/90 border border-gray-600 rounded-xl shadow-2xl p-2 group hover:w-[500px] transition-all duration-500 backdrop-blur-md">
                <div class="absolute top-0 left-2 -translate-y-1/2 bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-full shadow-sm">
                    当前参考影像
                </div>
                <button @click="store.activeFloatingImage.value = null"
                    class="absolute -top-2 -right-2 bg-gray-700 border border-gray-500 rounded-full w-6 h-6 flex items-center justify-center shadow-lg hover:bg-red-500 hover:text-white transition text-gray-300 z-50 text-xs">
                    <i class="fa-solid fa-xmark text-[10px]"></i>
                </button>
                <div class="relative">
                    <img :src="store.activeFloatingImage.value"
                        @click="store.previewImage(store.activeFloatingImage.value)"
                        class="w-full h-auto rounded-lg border border-gray-500/50 cursor-zoom-in">
                    <svg v-if="store.currentFindings.value.length" class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet">
                        <rect v-for="(f, i) in store.currentFindings.value" :key="i"
                            :x="f.box_2d[1]" :y="f.box_2d[0]"
                            :width="f.box_2d[3] - f.box_2d[1]" :height="f.box_2d[2] - f.box_2d[0]"
                            fill="none" stroke="#ef4444" stroke-width="3" vector-effect="non-scaling-stroke" />
                    </svg>
                </div>
                <div class="flex items-center gap-2 mt-2 mb-2">
                    <button @click="store.detectLesions()" :disabled="store.isDetecting.value"
                        class="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 text-white text-xs rounded-full px-3 py-1.5 transition shadow-sm">
                        <i :class="store.isDetecting.value ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-magnifying-glass'"></i>
                        {{ store.isDetecting.value ? ' 检测中...' : ' 标注病灶 (Beta)' }}
                    </button>
                </div>
                <div v-if="store.currentFindings.value.length" class="text-emerald-400 text-xs px-1">
                    <i class="fa-solid fa-circle-dot mr-1"></i>{{ store.currentFindings.value.length }} 处异常发现
                </div>
            </div>
        </transition>
    `,
    setup() {
        const store = useStore();
        return { store };
    }
};
