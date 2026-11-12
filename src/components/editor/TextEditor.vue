<template>
  <main
    ref="scrollContainer"
    class="scroll-container w-full tracking-widest"
    @contextmenu="handleEditorContextMenu">
    <EditorContent :editor="editor" />
  </main>

  <CustomScrollbar :scroll-container="scrollContainer" />

  <input
    ref="contextFileInputRef"
    type="file"
    accept="image/*"
    multiple
    class="hidden"
    @change="handleContextFileChange" />

  <!-- Right-Click Context Menu -->
  <Teleport to="body">
    <div
      v-if="contextMenu.visible"
      ref="contextMenuRef"
      class="fixed z-[105] min-w-[148px] rounded-md border border-zinc-200 bg-white py-1 shadow-md dark:border-zinc-800 dark:bg-zinc-900"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      role="menu">
      <button
        type="button"
        role="menuitem"
        class="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-none dark:text-zinc-200 dark:hover:bg-zinc-800"
        @click="triggerImagePickerFromContextMenu">
        <ImagePlus class="size-3.5 text-zinc-500 dark:text-zinc-400" />
        <span>Add image</span>
      </button>
    </div>
  </Teleport>

  <!-- Inline #tag Autocomplete Popover -->
  <Teleport to="body">
    <div
      v-if="tagPopup.visible && tagPopupItems.length > 0"
      ref="tagPopupRef"
      class="fixed z-[104] max-w-[240px] min-w-[168px] rounded-md border border-zinc-200 bg-white py-1 shadow-md dark:border-zinc-800 dark:bg-zinc-900"
      :style="{ left: `${tagPopup.x}px`, top: `${tagPopup.y}px` }"
      role="listbox"
      aria-label="Tag suggestions">
      <button
        v-for="(item, index) in tagPopupItems"
        :key="`${item.isNew ? 'new' : 'existing'}-${item.tag}`"
        type="button"
        role="option"
        :aria-selected="tagPopup.selectedIndex === index"
        class="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors focus-visible:outline-none"
        :class="
          tagPopup.selectedIndex === index
            ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
            : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/70'
        "
        @mousedown.prevent="acceptTagSuggestion(item)">
        <span class="truncate">
          <template v-if="item.isNew">Add #{{ item.tag }}</template>
          <template v-else>#{{ item.tag }}</template>
        </span>
        <span
          v-if="item.isNew"
          class="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500">
          new
        </span>
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ImageBlock } from "@/components/editor/ImageBlockNode";
import CustomScrollbar from "@/components/shared/scrollbar/CustomScrollbar.vue";
import { type ActiveTagQuery, findActiveTagQuery, InlineTags } from "@/lib/editor/inline-tags";
import { processImageFiles } from "@/lib/image-utils";
import { useEditorStore } from "@/store/editor-store";
import { useJournalStore } from "@/store/journal-store";
import { useSearchStore } from "@/store/search-store";
import { useSettingsStore } from "@/store/settings-store";
import { type JournalImage } from "@shared/types/journal-entry";
import { getTextSerializersFromSchema } from "@tiptap/core";
import { BackgroundColor, TextStyle } from "@tiptap/extension-text-style";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { Editor, EditorContent } from "@tiptap/vue-3";
import { ImagePlus } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  type PropType,
  reactive,
  ref,
  toRaw,
  watch
} from "vue";
import { toast } from "vue-sonner";

interface InsertTarget {
  startPos: number;
  endPos: number;
  isEmpty: boolean;
}

interface TagSuggestionItem {
  tag: string;
  isNew: boolean;
}

// ------------------------ Props

const props = defineProps({
  modelValue: {
    type: [String, Object] as PropType<string | Record<string, unknown>>,
    default: ""
  }
});

// ------------------------ Emits

const emit = defineEmits(["update:modelValue"]);

// ------------------------ Variables

const editor = ref<Editor>();
const spellcheck = ref(false);
const scrollContainer = ref<HTMLElement | null>(null);
const isSettingContent = ref(false);
const contextFileInputRef = ref<HTMLInputElement | null>(null);
const contextMenuRef = ref<HTMLElement | null>(null);
const tagPopupRef = ref<HTMLElement | null>(null);

const contextMenu = reactive<{
  visible: boolean;
  x: number;
  y: number;
  target: InsertTarget | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  target: null
});

const tagPopup = reactive<{
  visible: boolean;
  x: number;
  y: number;
  selectedIndex: number;
  activeQuery: ActiveTagQuery | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  selectedIndex: -1,
  activeQuery: null
});

let dismissedTagFromPos: number | null = null;
let pendingInsertTarget: InsertTarget | null = null;
let lastEmittedDoc: Record<string, unknown> | null = null;

const editorStore = useEditorStore();
const journalStore = useJournalStore();
const searchStore = useSearchStore();

const { fontSize, textWidth, topSpacing, paragraphSpacing } = storeToRefs(useSettingsStore());

let highlightClearTimer: ReturnType<typeof setTimeout> | null = null;

const tagPopupItems = computed<TagSuggestionItem[]>(() => {
  const active = tagPopup.activeQuery;
  if (!active) return [];

  const q = active.query;
  const startsWithMatches: string[] = [];
  const includesMatches: string[] = [];

  for (const tag of journalStore.allTags) {
    if (!q || tag.startsWith(q)) {
      startsWithMatches.push(tag);
    } else if (tag.includes(q)) {
      includesMatches.push(tag);
    }
  }

  const combined = [...startsWithMatches, ...includesMatches].slice(0, 6);
  const items: TagSuggestionItem[] = combined.map((tag) => ({ tag, isNew: false }));

  if (q.length > 0 && !journalStore.allTags.includes(q)) {
    items.push({ tag: q, isNew: true });
  }

  return items;
});

// ------------------------ Helpers

/**
 * Mirror TipTap's getText() + journalStore.updateContent normalization exactly so
 * search match offsets map cleanly to ProseMirror positions across imageBlocks,
 * headings, lists, blockquotes, and hardBreaks.
 */
const mapPlainRangeToPos = (
  doc: ProseMirrorNode,
  schema: Schema,
  startOffset: number,
  endOffset: number
): { from: number; to: number } | null => {
  if (startOffset < 0 || endOffset <= startOffset) return null;

  const textSerializers = getTextSerializersFromSchema(schema);
  const rawChars: Array<{ ch: string; pmPos: number }> = [];
  const fullRange = { from: 0, to: doc.content.size };

  doc.nodesBetween(0, doc.content.size, (node, pos, parent, index) => {
    if (node.isBlock && pos > 0) {
      rawChars.push({ ch: "\n", pmPos: -1 }, { ch: "\n", pmPos: -1 });
    }

    const textSerializer = textSerializers[node.type.name];
    if (textSerializer && parent) {
      const serialized = textSerializer({
        node,
        pos,
        parent,
        index,
        range: fullRange
      });
      for (let i = 0; i < serialized.length; i++) {
        rawChars.push({ ch: serialized[i] ?? "", pmPos: -1 });
      }
      return false;
    }

    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) {
        rawChars.push({ ch: node.text[i] ?? "", pmPos: pos + i });
      }
    }
  });

  if (rawChars.length > 0 && rawChars[rawChars.length - 1]?.ch === "\n") {
    rawChars.pop();
  }

  const normChars: Array<{ ch: string; pmPos: number }> = [];
  for (let i = 0; i < rawChars.length; i++) {
    const curr = rawChars[i];
    if (!curr) continue;
    if (curr.ch === "\n" && rawChars[i + 1]?.ch === "\n") {
      normChars.push(curr);
      i += 1;
    } else {
      normChars.push(curr);
    }
  }

  const clampedEnd = Math.min(endOffset, normChars.length);
  let from: number | null = null;
  let to: number | null = null;

  for (let i = startOffset; i < clampedEnd; i++) {
    const item = normChars[i];
    if (item && item.pmPos >= 0) {
      from = item.pmPos;
      break;
    }
  }

  for (let i = clampedEnd - 1; i >= startOffset; i--) {
    const item = normChars[i];
    if (item && item.pmPos >= 0) {
      to = item.pmPos + 1;
      break;
    }
  }

  if (from === null || to === null || to <= from) return null;
  return { from, to };
};

const revealPlainTextRange = (startOffset: number, endOffset: number): boolean => {
  if (!editor.value || endOffset <= startOffset) return false;

  const { doc, schema } = editor.value.state;
  const mapped = mapPlainRangeToPos(doc, schema, startOffset, endOffset);
  if (!mapped) return false;

  const { from, to } = mapped;

  if (highlightClearTimer) {
    clearTimeout(highlightClearTimer);
    highlightClearTimer = null;
  }

  editor.value
    .chain()
    .focus()
    .setTextSelection({ from, to })
    .setBackgroundColor("rgb(var(--accent-300) / 0.55)")
    .run();

  scrollToCursor(true);

  highlightClearTimer = setTimeout(() => {
    if (!editor.value) return;

    editor.value
      .chain()
      .setTextSelection({ from, to })
      .unsetBackgroundColor()
      .setTextSelection(to)
      .run();
    highlightClearTimer = null;
  }, 1500);

  return true;
};

const tryApplyPendingReveal = () => {
  const reveal = searchStore.pendingReveal;

  if (!reveal || !editor.value) return;

  revealPlainTextRange(reveal.startOffset, reveal.endOffset);
  searchStore.clearPendingReveal();
};

const scrollToCursor = (smooth = true) => {
  if (!editor.value || !scrollContainer.value) return;

  const editorInstance = editor.value;
  const container = scrollContainer.value;

  requestAnimationFrame(() => {
    const { view } = editorInstance;
    const { state } = view;
    const { from } = state.selection;

    const coords = view.coordsAtPos(from);
    const containerRect = container.getBoundingClientRect();

    const viewportHeight = window.innerHeight;
    const visibleTop = Math.max(0, containerRect.top);
    const visibleBottom = Math.min(viewportHeight, containerRect.bottom);
    const visibleHeight = visibleBottom - visibleTop;

    const headerOffset = 48;
    const visibleCenterY = visibleTop + visibleHeight / 2 - headerOffset / 2;
    const cursorVerticalCenter = (coords.top + coords.bottom) / 2;
    const offsetFromCenter = cursorVerticalCenter - visibleCenterY;
    const newScrollTop = container.scrollTop + offsetFromCenter;

    container.scrollTo({
      top: newScrollTop,
      behavior: smooth ? "smooth" : "auto"
    });
  });
};

const applyEditorVariables = () => {
  if (editor.value) {
    editor.value.view.dom.style.setProperty("--top-spacing", `${topSpacing.value}px`);
    editor.value.view.dom.style.setProperty("--paragraph-spacing", `${paragraphSpacing.value}px`);
    editor.value.view.dom.style.setProperty("--font-size", `${fontSize.value}px`);
  }
  if (scrollContainer.value) {
    scrollContainer.value.style.setProperty("--top-spacing", `${topSpacing.value}px`);
    scrollContainer.value.style.setProperty("--paragraph-spacing", `${paragraphSpacing.value}px`);
    scrollContainer.value.style.setProperty("--font-size", `${fontSize.value}px`);
    scrollContainer.value.style.setProperty("--text-width", `${textWidth.value}px`);
  }
};

const closeTagPopup = () => {
  tagPopup.visible = false;
  tagPopup.selectedIndex = -1;
  tagPopup.activeQuery = null;
};

const updateTagSuggestionPopup = () => {
  if (!editor.value) {
    closeTagPopup();
    return;
  }

  const active = findActiveTagQuery(editor.value.state);
  if (!active) {
    dismissedTagFromPos = null;
    closeTagPopup();
    return;
  }

  if (dismissedTagFromPos === active.from) {
    closeTagPopup();
    return;
  }

  dismissedTagFromPos = null;
  tagPopup.activeQuery = active;

  if (tagPopupItems.value.length === 0) {
    tagPopup.visible = false;
    tagPopup.selectedIndex = -1;
    return;
  }

  const coords = editor.value.view.coordsAtPos(active.from);
  const menuWidth = 240;
  const menuHeight = Math.min(200, tagPopupItems.value.length * 32 + 12);

  tagPopup.x = Math.min(Math.max(8, coords.left), Math.max(8, window.innerWidth - menuWidth - 8));
  tagPopup.y =
    coords.bottom + menuHeight + 12 > window.innerHeight
      ? Math.max(8, coords.top - menuHeight - 6)
      : coords.bottom + 6;
  tagPopup.visible = true;
  if (tagPopup.selectedIndex >= tagPopupItems.value.length) {
    tagPopup.selectedIndex = tagPopupItems.value.length - 1;
  }
};

const acceptTagSuggestion = async (item: TagSuggestionItem) => {
  if (!editor.value || !tagPopup.activeQuery) return;

  const { from, to } = tagPopup.activeQuery;
  const tagText = `#${item.tag} `;

  closeTagPopup();
  await journalStore.rememberTags([item.tag]);

  editor.value
    .chain()
    .focus()
    .insertContentAt({ from, to }, tagText)
    .setTextSelection(from + tagText.length)
    .run();
};

const closeContextMenu = () => {
  contextMenu.visible = false;
};

const resolveInsertTargetAtPos = (doc: ProseMirrorNode, pos: number): InsertTarget | null => {
  const clamped = Math.min(Math.max(0, pos), doc.content.size);
  const $pos = doc.resolve(clamped);

  if ($pos.depth >= 1) {
    const topNode = $pos.node(1);
    if (topNode.type.name === "imageBlock") return null;
    return {
      startPos: $pos.before(1),
      endPos: $pos.after(1),
      isEmpty: topNode.isTextblock && topNode.content.size === 0
    };
  }

  if ($pos.nodeBefore && $pos.nodeBefore.type.name !== "imageBlock") {
    return {
      startPos: $pos.pos - $pos.nodeBefore.nodeSize,
      endPos: $pos.pos,
      isEmpty: $pos.nodeBefore.isTextblock && $pos.nodeBefore.content.size === 0
    };
  }

  if ($pos.nodeAfter && $pos.nodeAfter.type.name !== "imageBlock") {
    return {
      startPos: $pos.pos,
      endPos: $pos.pos + $pos.nodeAfter.nodeSize,
      isEmpty: $pos.nodeAfter.isTextblock && $pos.nodeAfter.content.size === 0
    };
  }

  return null;
};

const insertImageBlockForTarget = async (target: InsertTarget, images: JournalImage[]) => {
  if (!editor.value || images.length === 0) return;

  const { doc } = editor.value.state;
  const startPos = Math.min(Math.max(0, target.startPos), doc.content.size);
  const endPos = Math.min(Math.max(startPos, target.endPos), doc.content.size);
  const nextNode = doc.nodeAt(endPos);
  const hasEmptyParagraphNext = nextNode?.type.name === "paragraph" && nextNode.content.size === 0;

  const nodesToInsert = hasEmptyParagraphNext
    ? { type: "imageBlock", attrs: { images } }
    : [{ type: "imageBlock", attrs: { images } }, { type: "paragraph" }];

  if (target.isEmpty && endPos > startPos) {
    editor.value
      .chain()
      .focus()
      .insertContentAt({ from: startPos, to: endPos }, nodesToInsert)
      .setTextSelection(startPos + 2)
      .run();
  } else {
    editor.value
      .chain()
      .focus()
      .insertContentAt(endPos, nodesToInsert)
      .setTextSelection(endPos + 2)
      .run();
  }

  requestAnimationFrame(() => {
    scrollToCursor(true);
  });

  await journalStore.saveCurrent();
};

const handleEditorContextMenu = (event: MouseEvent) => {
  if (!editor.value) return;

  if (event.target instanceof HTMLElement && event.target.closest(".image-block-node")) {
    closeContextMenu();
    return;
  }

  const posInfo = editor.value.view.posAtCoords({
    left: event.clientX,
    top: event.clientY
  });

  if (!posInfo) {
    closeContextMenu();
    return;
  }

  const target = resolveInsertTargetAtPos(editor.value.state.doc, posInfo.pos);
  if (!target) {
    closeContextMenu();
    return;
  }

  event.preventDefault();

  const menuWidth = 168;
  const menuHeight = 40;
  contextMenu.x = Math.min(event.clientX, Math.max(8, window.innerWidth - menuWidth - 8));
  contextMenu.y = Math.min(event.clientY, Math.max(8, window.innerHeight - menuHeight - 8));
  contextMenu.target = target;
  contextMenu.visible = true;
};

const triggerImagePickerFromContextMenu = () => {
  pendingInsertTarget = contextMenu.target;
  closeContextMenu();
  contextFileInputRef.value?.click();
};

const handleContextFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  const target = pendingInsertTarget;
  pendingInsertTarget = null;

  if (!files || files.length === 0 || !target) {
    input.value = "";
    return;
  }

  const validImages = Array.from(files).filter((f) => f.type.startsWith("image/"));
  if (validImages.length === 0) {
    toast.error("Unsupported file", {
      description: "Please select image files (PNG, JPG, WebP, GIF, or SVG)."
    });
    input.value = "";
    return;
  }

  try {
    const processed = await processImageFiles(validImages);
    await insertImageBlockForTarget(target, processed);
  } catch (err) {
    toast.error("Failed to process image", {
      description: err instanceof Error ? err.message : "Could not read selected image"
    });
  } finally {
    input.value = "";
  }
};

const handleGlobalPointerDown = (event: PointerEvent) => {
  if (contextMenu.visible) {
    if (!(
      contextMenuRef.value &&
      event.target instanceof Node &&
      contextMenuRef.value.contains(event.target)
    )) {
      closeContextMenu();
    }
  }

  if (tagPopup.visible) {
    if (!(
      tagPopupRef.value &&
      event.target instanceof Node &&
      tagPopupRef.value.contains(event.target)
    )) {
      closeTagPopup();
    }
  }
};

const handleGlobalKeyDown = (event: KeyboardEvent) => {
  if (event.key === "Escape" && contextMenu.visible) {
    closeContextMenu();
  }
};

// ------------------------ Lifecycle

onMounted(() => {
  window.addEventListener("pointerdown", handleGlobalPointerDown, true);
  window.addEventListener("keydown", handleGlobalKeyDown, true);

  editor.value = new Editor({
    extensions: [StarterKit, TextStyle, BackgroundColor, ImageBlock, InlineTags],
    content: props.modelValue,
    autofocus: "end",
    editorProps: {
      attributes: {
        spellcheck: spellcheck.value.toString(),
        class: "text-lg p-4 mb-12"
      },
      handleKeyDown: (_view, event) => {
        if (!tagPopup.visible || tagPopupItems.value.length === 0) return false;

        if (event.key === "ArrowDown") {
          event.preventDefault();
          tagPopup.selectedIndex = (tagPopup.selectedIndex + 1) % tagPopupItems.value.length;
          return true;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          tagPopup.selectedIndex =
            tagPopup.selectedIndex <= 0
              ? tagPopupItems.value.length - 1
              : tagPopup.selectedIndex - 1;
          return true;
        }

        if (event.key === "Tab") {
          event.preventDefault();
          const idx = tagPopup.selectedIndex >= 0 ? tagPopup.selectedIndex : 0;
          const item = tagPopupItems.value[idx];
          if (item) {
            void acceptTagSuggestion(item);
          }
          return true;
        }

        if (event.key === "Enter" && tagPopup.selectedIndex >= 0) {
          event.preventDefault();
          const item = tagPopupItems.value[tagPopup.selectedIndex];
          if (item) {
            void acceptTagSuggestion(item);
          }
          return true;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          dismissedTagFromPos = tagPopup.activeQuery?.from ?? null;
          closeTagPopup();
          return true;
        }

        return false;
      },
      handlePaste: (view, event) => {
        const files = event.clipboardData?.files;
        if (!files || files.length === 0) return false;
        const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
        if (imageFiles.length === 0) return false;

        event.preventDefault();
        const { from } = view.state.selection;
        const resolvedTarget = resolveInsertTargetAtPos(view.state.doc, from);
        const end = view.state.doc.content.size;
        const target: InsertTarget = resolvedTarget ?? {
          startPos: end,
          endPos: end,
          isEmpty: false
        };

        void processImageFiles(imageFiles).then((processed) => {
          if (processed.length > 0) {
            void insertImageBlockForTarget(target, processed);
          }
        });
        return true;
      }
    },

    onCreate: () => {
      applyEditorVariables();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToCursor(false);
        });
      });
    },

    onSelectionUpdate: () => {
      updateTagSuggestionPopup();
    },

    onUpdate: () => {
      if (highlightClearTimer) {
        clearTimeout(highlightClearTimer);
        highlightClearTimer = null;
      }

      if (!editor.value) return;

      const activeTag = findActiveTagQuery(editor.value.state);
      updateTagSuggestionPopup();

      const json = editor.value.getJSON() as Record<string, unknown>;
      lastEmittedDoc = json;
      emit("update:modelValue", json);

      scrollToCursor(!isSettingContent.value);

      journalStore.updateContent(
        editor.value.getText(),
        json,
        activeTag?.query ? activeTag.query : null
      );
    }
  });

  applyEditorVariables();
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", handleGlobalPointerDown, true);
  window.removeEventListener("keydown", handleGlobalKeyDown, true);
  if (highlightClearTimer) {
    clearTimeout(highlightClearTimer);
    highlightClearTimer = null;
  }
  editor.value?.destroy();
});

// ------------------------ Watch

watch(
  () => props.modelValue,

  (value) => {
    if (!editor.value || toRaw(value) === lastEmittedDoc) return;

    if (typeof value === "string" && editor.value.getHTML() === value) {
      scrollContainer.value?.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    lastEmittedDoc = null;
    isSettingContent.value = true;
    editor.value.commands.setContent(toRaw(value), { emitUpdate: false });

    // Scroll to top after content is set (when switching entries)
    requestAnimationFrame(() => {
      if (scrollContainer.value) {
        scrollContainer.value.scrollTo({ top: 0, behavior: "auto" });
      }
      isSettingContent.value = false;
    });
  }
);

watch(
  () => searchStore.pendingReveal,
  (reveal) => {
    if (!reveal || !editor.value) return;

    // Nested rAF: run after setContent → scroll-to-top so reveal is not undone.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tryApplyPendingReveal();
      });
    });
  }
);

watch(spellcheck, (value) => {
  if (editor.value) {
    editor.value.view.dom.setAttribute("spellcheck", value.toString());
  }
});

watch([topSpacing, paragraphSpacing, fontSize, textWidth], () => {
  applyEditorVariables();
});

watch(
  () => editorStore.focusRequestCount,
  async () => {
    await nextTick();
    focusEnd();
  }
);

// ------------------------ Methods

const focusEnd = () => {
  if (!editor.value) return;

  const { doc } = editor.value.state;
  const endPos = doc.content.size;

  editor.value.chain().focus().setTextSelection(endPos).run();
};

// ------------------------ Expose

defineExpose({
  spellcheck,
  topSpacing,
  paragraphSpacing,
  focusEnd,
  revealPlainTextRange
});
</script>

<style scoped></style>
