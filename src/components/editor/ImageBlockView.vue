<template>
  <NodeViewWrapper
    class="image-block-node tracking-normal select-none"
    contenteditable="false">
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      multiple
      class="hidden"
      @change="handleFileChange" />

    <div
      class="group relative overflow-hidden rounded-md border border-zinc-200/80 bg-zinc-100/30 focus-visible:outline-none dark:border-zinc-800 dark:bg-zinc-900/30"
      :class="isDraggingOver ? 'ring-1 ring-zinc-400 dark:ring-zinc-500' : ''"
      tabindex="0"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
      @keydown="onKeyDown">
      <!-- Reorder Mode (locked for moving images) -->
      <template v-if="isReordering && images.length > 1">
        <div
          class="px-3 pt-12 pb-3"
          aria-label="Reorder images">
          <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <div
              v-for="(img, idx) in images"
              :key="img.id"
              draggable="true"
              role="button"
              tabindex="0"
              :title="`Image ${idx + 1} — drag to reorder`"
              :aria-label="`Image ${idx + 1} of ${images.length}, drag to reorder`"
              class="group/tile relative aspect-[4/3] cursor-grab overflow-hidden rounded-md bg-zinc-200/50 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500))] focus-visible:outline-none active:cursor-grabbing dark:bg-zinc-800/60"
              :class="[
                idx === activeIndex
                  ? 'ring-2 ring-[rgb(var(--accent-500))]'
                  : 'ring-1 ring-zinc-300/80 dark:ring-zinc-700/80',
                draggedSlideIndex === idx ? 'scale-95 opacity-35' : '',
                dragOverSlideIndex === idx && draggedSlideIndex !== idx
                  ? 'ring-2 ring-zinc-900 dark:ring-white'
                  : ''
              ]"
              @click.stop="activeIndex = idx"
              @keydown.enter.prevent.stop="activeIndex = idx"
              @dragstart.stop="onSlideDragStart(idx, $event)"
              @dragover.prevent.stop="onSlideDragOver(idx, $event)"
              @dragleave.stop="onSlideDragLeave(idx)"
              @drop.prevent.stop="onSlideDrop(idx)"
              @dragend.stop="onSlideDragEnd">
              <img
                :src="img.dataUrl"
                :alt="img.name || `Image ${idx + 1}`"
                referrerPolicy="no-referrer"
                draggable="false"
                class="pointer-events-none size-full object-cover select-none" />

              <span
                class="pointer-events-none absolute top-1.5 left-1.5 rounded bg-zinc-950/65 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums backdrop-blur-xs">
                {{ idx + 1 }}
              </span>

              <div
                class="absolute right-1.5 bottom-1.5 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 [@media(hover:none)]:opacity-100">
                <button
                  v-if="idx > 0"
                  type="button"
                  title="Move earlier"
                  aria-label="Move image earlier"
                  class="flex size-6 cursor-pointer items-center justify-center rounded bg-zinc-950/65 text-white backdrop-blur-xs transition-colors hover:bg-zinc-950/85 focus-visible:outline-none"
                  @click.stop="reorderSlide(idx, idx - 1)">
                  <IconChevronLeft class="size-4" />
                </button>
                <button
                  v-if="idx < images.length - 1"
                  type="button"
                  title="Move later"
                  aria-label="Move image later"
                  class="flex size-6 cursor-pointer items-center justify-center rounded bg-zinc-950/65 text-white backdrop-blur-xs transition-colors hover:bg-zinc-950/85 focus-visible:outline-none"
                  @click.stop="reorderSlide(idx, idx + 1)">
                  <IconChevronRight class="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <span
          class="pointer-events-none absolute top-3 left-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Drag images to reorder
        </span>
      </template>

      <!-- Single Image (full natural height) -->
      <template v-else-if="images.length === 1 && images[0]">
        <img
          :src="images[0].dataUrl"
          :alt="images[0].name || 'Journal entry image'"
          referrerPolicy="no-referrer"
          class="block h-auto w-full cursor-zoom-in select-none"
          draggable="false"
          @click="openLightbox(0)" />
      </template>

      <!-- Carousel (2+ images, full natural height) -->
      <template v-else-if="activeImage">
        <img
          :key="activeImage.id"
          :src="activeImage.dataUrl"
          :alt="activeImage.name || `Journal entry image ${activeIndex + 1}`"
          referrerPolicy="no-referrer"
          class="block h-auto w-full cursor-zoom-in select-none"
          draggable="false"
          @click="openLightbox(activeIndex)" />

        <!-- Carousel Navigation Arrows -->
        <button
          type="button"
          aria-label="Previous image"
          class="absolute top-1/2 left-2.5 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-zinc-950/50 text-white/90 opacity-0 backdrop-blur-xs transition-opacity duration-150 group-hover:opacity-100 hover:bg-zinc-950/75 focus-visible:opacity-100 focus-visible:outline-none [@media(hover:none)]:opacity-100"
          @click.stop="prevSlide">
          <IconChevronLeft class="size-5" />
        </button>

        <button
          type="button"
          aria-label="Next image"
          class="absolute top-1/2 right-2.5 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-zinc-950/50 text-white/90 opacity-0 backdrop-blur-xs transition-opacity duration-150 group-hover:opacity-100 hover:bg-zinc-950/75 focus-visible:opacity-100 focus-visible:outline-none [@media(hover:none)]:opacity-100"
          @click.stop="nextSlide">
          <IconChevronRight class="size-5" />
        </button>
      </template>

      <!-- Minimalist Top-Right Controls (Reorder / + Add / × Remove) -->
      <div
        class="absolute top-2.5 right-2.5 flex items-center gap-1 transition-opacity duration-150 focus-within:opacity-100 [@media(hover:none)]:opacity-100"
        :class="isReordering ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'">
        <button
          v-if="images.length > 1"
          type="button"
          :title="isReordering ? 'Done reordering' : 'Reorder images'"
          :aria-label="isReordering ? 'Done reordering' : 'Reorder images'"
          :aria-pressed="isReordering"
          class="flex size-7 cursor-pointer items-center justify-center rounded-md backdrop-blur-xs transition-colors focus-visible:outline-none"
          :class="
            isReordering
              ? 'bg-[rgb(var(--accent-500))] text-[rgb(var(--accent-today-fg))] hover:bg-[rgb(var(--accent-500)/0.85)]'
              : 'bg-zinc-950/55 text-white/90 hover:bg-zinc-950/80'
          "
          @click.stop="toggleReorderMode">
          <IconCheck
            v-if="isReordering"
            class="size-4" />
          <IconSwapHorizontal
            v-else
            class="size-4" />
        </button>

        <button
          type="button"
          title="Add image to carousel"
          aria-label="Add image to carousel"
          class="flex size-7 cursor-pointer items-center justify-center rounded-md bg-zinc-950/55 text-white/90 backdrop-blur-xs transition-colors hover:bg-zinc-950/80 focus-visible:outline-none"
          :disabled="isProcessing"
          @click.stop="openFilePicker">
          <IconPlus class="size-4" />
        </button>

        <button
          type="button"
          title="Remove image"
          aria-label="Remove image"
          class="flex size-7 cursor-pointer items-center justify-center rounded-md bg-zinc-950/55 text-white/90 backdrop-blur-xs transition-colors hover:bg-zinc-950/80 focus-visible:outline-none"
          @click.stop="removeCurrentImage">
          <IconClose class="size-4" />
        </button>
      </div>
    </div>

    <!-- Minimalist Numeric Counter (e.g. 1/3) -->
    <div
      v-if="images.length > 1"
      class="mt-1.5 text-center text-xs text-zinc-400 tabular-nums dark:text-zinc-500">
      {{ activeIndex + 1 }}/{{ images.length }}
    </div>

    <!-- Minimalist Lightbox Viewer -->
    <Teleport to="body">
      <div
        v-if="lightboxOpen && activeImage"
        ref="lightboxRef"
        class="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/88 p-6 backdrop-blur-xs"
        role="dialog"
        aria-modal="true"
        aria-label="Image preview"
        @click.self="closeLightbox">
        <button
          ref="lightboxCloseBtnRef"
          type="button"
          aria-label="Close image preview"
          class="fixed top-4 right-4 flex size-9 cursor-pointer items-center justify-center rounded-full bg-zinc-900/70 text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
          @click="closeLightbox">
          <IconClose class="size-5" />
        </button>

        <button
          v-if="images.length > 1"
          type="button"
          aria-label="Previous image"
          class="fixed top-1/2 left-4 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-zinc-900/70 text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
          @click.stop="prevSlide">
          <IconChevronLeft class="size-6" />
        </button>

        <img
          :src="activeImage.dataUrl"
          :alt="activeImage.name || 'Journal entry image'"
          referrerPolicy="no-referrer"
          class="max-h-[88vh] max-w-[90vw] rounded-md object-contain select-none" />

        <div
          v-if="images.length > 1"
          class="fixed bottom-5 left-1/2 -translate-x-1/2 text-xs text-zinc-300 tabular-nums">
          {{ activeIndex + 1 }}/{{ images.length }}
        </div>

        <button
          v-if="images.length > 1"
          type="button"
          aria-label="Next image"
          class="fixed top-1/2 right-4 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-zinc-900/70 text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
          @click.stop="nextSlide">
          <IconChevronRight class="size-6" />
        </button>
      </div>
    </Teleport>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { processImageFiles } from "@/lib/image-utils";
import { useJournalStore } from "@/store/journal-store";
import { type JournalImage } from "@shared/types/journal-entry";
import { nodeViewProps, NodeViewWrapper } from "@tiptap/vue-3";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { toast } from "vue-sonner";
import IconCheck from "~icons/mdi/check";
import IconChevronLeft from "~icons/mdi/chevron-left";
import IconChevronRight from "~icons/mdi/chevron-right";
import IconClose from "~icons/mdi/close";
import IconPlus from "~icons/mdi/plus";
import IconSwapHorizontal from "~icons/mdi/swap-horizontal";

const SLIDE_DRAG_MIME = "application/x-journaler-slide";

const props = defineProps(nodeViewProps);
const journalStore = useJournalStore();

const fileInputRef = ref<HTMLInputElement | null>(null);
const lightboxRef = ref<HTMLElement | null>(null);
const lightboxCloseBtnRef = ref<HTMLButtonElement | null>(null);
const activeIndex = ref(0);
const isProcessing = ref(false);
const isDraggingOver = ref(false);
const isReordering = ref(false);
const lightboxOpen = ref(false);

const draggedSlideIndex = ref<number | null>(null);
const dragOverSlideIndex = ref<number | null>(null);

const images = computed<JournalImage[]>(() => {
  const attr = props.node.attrs.images;
  return Array.isArray(attr) ? (attr as JournalImage[]) : [];
});

const activeImage = computed(() => images.value[activeIndex.value] ?? null);

watch(
  () => images.value.length,
  (len) => {
    if (len <= 1) {
      isReordering.value = false;
    }
    if (len === 0) {
      activeIndex.value = 0;
      lightboxOpen.value = false;
    } else if (activeIndex.value >= len) {
      activeIndex.value = len - 1;
    }
  }
);

const toggleReorderMode = () => {
  if (images.value.length <= 1) return;
  isReordering.value = !isReordering.value;
  draggedSlideIndex.value = null;
  dragOverSlideIndex.value = null;
};

const openFilePicker = () => {
  fileInputRef.value?.click();
};

const appendImages = async (files: FileList | File[]) => {
  if (isProcessing.value) return;
  const incoming = Array.from(files);
  if (incoming.length === 0) return;

  const validCount = incoming.filter((f) => f.type.startsWith("image/")).length;
  if (validCount === 0) {
    toast.error("Unsupported file", {
      description: "Please select image files (PNG, JPG, WebP, GIF, or SVG)."
    });
    return;
  }

  isProcessing.value = true;
  try {
    const previousCount = images.value.length;
    const processed = await processImageFiles(incoming);
    if (processed.length > 0) {
      props.updateAttributes({
        images: [...images.value, ...processed]
      });
      activeIndex.value = previousCount;
      await journalStore.saveCurrent();
    }
  } catch (err) {
    toast.error("Failed to process image", {
      description: err instanceof Error ? err.message : "Could not read selected image"
    });
  } finally {
    isProcessing.value = false;
  }
};

const handleFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    await appendImages(input.files);
  }
  input.value = "";
};

const removeCurrentImage = async () => {
  const current = images.value[activeIndex.value];
  if (!current) return;

  const nextImages = images.value.filter((img) => img.id !== current.id);
  if (nextImages.length === 0) {
    lightboxOpen.value = false;
    isReordering.value = false;
    props.deleteNode();
  } else {
    props.updateAttributes({ images: nextImages });
  }
  await journalStore.saveCurrent();
};

const reorderSlide = async (fromIndex: number, toIndex: number) => {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= images.value.length ||
    toIndex >= images.value.length
  ) {
    return;
  }

  const nextImages = [...images.value];
  const [moved] = nextImages.splice(fromIndex, 1);
  if (!moved) return;
  nextImages.splice(toIndex, 0, moved);

  const currentActiveId = images.value[activeIndex.value]?.id;
  props.updateAttributes({ images: nextImages });

  if (currentActiveId) {
    const nextActiveIdx = nextImages.findIndex((img) => img.id === currentActiveId);
    if (nextActiveIdx >= 0) {
      activeIndex.value = nextActiveIdx;
    }
  }

  await journalStore.saveCurrent();
};

const onSlideDragStart = (index: number, event: DragEvent) => {
  if (!isReordering.value) return;
  draggedSlideIndex.value = index;
  dragOverSlideIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(SLIDE_DRAG_MIME, String(index));
  }
};

const onSlideDragOver = (index: number, event: DragEvent) => {
  if (!isReordering.value || draggedSlideIndex.value === null) return;
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
  dragOverSlideIndex.value = index;
};

const onSlideDragLeave = (index: number) => {
  if (dragOverSlideIndex.value === index) {
    dragOverSlideIndex.value = null;
  }
};

const onSlideDrop = async (targetIndex: number) => {
  if (!isReordering.value) return;
  const fromIndex = draggedSlideIndex.value;
  draggedSlideIndex.value = null;
  dragOverSlideIndex.value = null;

  if (fromIndex !== null && fromIndex !== targetIndex) {
    await reorderSlide(fromIndex, targetIndex);
  }
};

const onSlideDragEnd = () => {
  draggedSlideIndex.value = null;
  dragOverSlideIndex.value = null;
};

const prevSlide = () => {
  if (images.value.length <= 1) return;
  activeIndex.value = (activeIndex.value - 1 + images.value.length) % images.value.length;
};

const nextSlide = () => {
  if (images.value.length <= 1) return;
  activeIndex.value = (activeIndex.value + 1) % images.value.length;
};

let previouslyFocusedElement: HTMLElement | null = null;

const openLightbox = (index: number) => {
  if (isReordering.value) return;
  previouslyFocusedElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  activeIndex.value = index;
  lightboxOpen.value = true;
  void nextTick(() => {
    lightboxCloseBtnRef.value?.focus();
  });
};

const closeLightbox = () => {
  lightboxOpen.value = false;
  const toRestore = previouslyFocusedElement;
  previouslyFocusedElement = null;
  if (toRestore && document.contains(toRestore)) {
    void nextTick(() => {
      toRestore.focus();
    });
  }
};

const onKeyDown = (event: KeyboardEvent) => {
  if (images.value.length <= 1) return;
  if (isReordering.value) {
    if (event.key === "Escape") {
      event.preventDefault();
      isReordering.value = false;
      return;
    }
    if (event.key === "ArrowLeft" && activeIndex.value > 0) {
      event.preventDefault();
      void reorderSlide(activeIndex.value, activeIndex.value - 1);
      return;
    }
    if (event.key === "ArrowRight" && activeIndex.value < images.value.length - 1) {
      event.preventDefault();
      void reorderSlide(activeIndex.value, activeIndex.value + 1);
      return;
    }
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    prevSlide();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    nextSlide();
  }
};

const onWindowKeyDown = (event: KeyboardEvent) => {
  if (!lightboxOpen.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeLightbox();
  } else if (event.key === "Tab" && lightboxRef.value) {
    const focusables = Array.from(
      lightboxRef.value.querySelectorAll<HTMLElement>("button:not([disabled])")
    );
    if (focusables.length > 0) {
      const currentIdx = focusables.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      const nextIdx = event.shiftKey
        ? currentIdx <= 0
          ? focusables.length - 1
          : currentIdx - 1
        : (currentIdx + 1) % focusables.length;
      focusables[nextIdx]?.focus();
    }
  } else if (event.key === "ArrowLeft" && images.value.length > 1) {
    event.preventDefault();
    prevSlide();
  } else if (event.key === "ArrowRight" && images.value.length > 1) {
    event.preventDefault();
    nextSlide();
  }
};

const onDragOver = (event: DragEvent) => {
  if (isReordering.value || draggedSlideIndex.value !== null) return;
  if (event.dataTransfer?.types.includes("Files")) {
    isDraggingOver.value = true;
  }
};

const onDragLeave = () => {
  isDraggingOver.value = false;
};

const onDrop = async (event: DragEvent) => {
  isDraggingOver.value = false;
  if (
    isReordering.value ||
    draggedSlideIndex.value !== null ||
    event.dataTransfer?.types.includes(SLIDE_DRAG_MIME)
  ) {
    return;
  }
  const files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    await appendImages(files);
  }
};

onMounted(() => {
  window.addEventListener("keydown", onWindowKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onWindowKeyDown);
});
</script>

<style scoped></style>
