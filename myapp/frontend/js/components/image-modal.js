// ImageModal — full-screen image preview
import { useStore } from '../store.js';

export default {
    name: 'ImageModal',
    template: `
        <div v-if="store.previewImageUrl.value"
            @click="close"
            class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
            <img :src="store.previewImageUrl.value" class="max-w-full max-h-full rounded-lg shadow-2xl border border-gray-500" @click.stop>
        </div>
    `,
    setup() {
        const store = useStore();
        return {
            store,
            close() { store.previewImageUrl.value = null; },
        };
    }
};
