<template>
  <div class="flex w-full min-w-0 flex-col gap-2">
    <!-- Section Header + New Note Button -->
    <div class="flex w-full items-center justify-between">
      <div class="flex items-center gap-1.5">
        <h2 class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Notes</h2>
        <button
          type="button"
          title="New note"
          aria-label="New note"
          class="flex size-5 cursor-pointer items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-700 focus-visible:outline-none dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          @click="handleCreateNote">
          <IconPlus class="size-3.5" />
        </button>
      </div>

      <span
        v-if="journalStore.activeNotes.length > 0"
        class="text-[11px] text-zinc-400 tabular-nums dark:text-zinc-500">
        {{ filteredNotes.length }}
      </span>
    </div>

    <!-- Tag Filter Strip (only shown when notes have tags) -->
    <div
      v-if="noteTags.length > 0"
      class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <button
        type="button"
        class="cursor-pointer text-[11px] whitespace-nowrap transition-colors focus-visible:outline-none"
        :class="
          activeTagFilter === 'all'
            ? 'font-medium text-zinc-800 underline underline-offset-4 dark:text-zinc-100'
            : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
        "
        @click="activeTagFilter = 'all'">
        All
      </button>

      <button
        v-for="tag in noteTags"
        :key="tag"
        type="button"
        class="cursor-pointer text-[11px] whitespace-nowrap transition-colors focus-visible:outline-none"
        :class="
          activeTagFilter === tag
            ? 'font-medium text-zinc-800 underline underline-offset-4 dark:text-zinc-100'
            : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
        "
        @click="activeTagFilter = activeTagFilter === tag ? 'all' : tag">
        #{{ tag }}
      </button>
    </div>

    <!-- Notes List -->
    <p
      v-if="journalStore.activeNotes.length === 0"
      class="py-1 text-xs text-zinc-400 dark:text-zinc-500">
      No notes yet — click + for ideas
    </p>

    <p
      v-else-if="filteredNotes.length === 0"
      class="py-1 text-xs text-zinc-400 dark:text-zinc-500">
      No notes with #{{ activeTagFilter }}
    </p>

    <div
      v-else
      class="flex w-full min-w-0 flex-col gap-0.5">
      <div
        v-for="note in filteredNotes"
        :key="note.id"
        :draggable="filteredNotes.length > 1"
        class="group relative flex w-full min-w-0 items-center justify-between gap-1 rounded-md px-2 py-1.5 transition-colors"
        :class="[
          journalStore.currentNote?.id === note.id
            ? 'bg-zinc-200/80 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100'
            : 'text-zinc-600 hover:bg-zinc-200/50 dark:text-zinc-300/80 dark:hover:bg-zinc-800/60',
          draggedNoteId === note.id ? 'opacity-40' : ''
        ]"
        @dragstart="onDragStart(note.id, $event)"
        @dragover.prevent="onDragOver(note.id, $event)"
        @dragleave="onDragLeave(note.id, $event)"
        @drop.prevent="onDrop(note.id)"
        @dragend="onDragEnd">
        <span
          v-if="dropTargetId === note.id"
          aria-hidden="true"
          class="pointer-events-none absolute right-1 left-1 z-10 h-0.5 rounded-full bg-[rgb(var(--accent-500))]"
          :class="dropPosition === 'before' ? '-top-px' : '-bottom-px'" />
        <button
          type="button"
          class="flex min-w-0 flex-1 cursor-pointer flex-col items-start text-left focus-visible:outline-none"
          :class="filteredNotes.length > 1 ? 'cursor-grab active:cursor-grabbing' : ''"
          @click="handleOpenNote(note.id)">
          <span class="w-full truncate text-sm font-normal">
            {{ note.title || "Untitled" }}
          </span>
          <span
            v-if="(note.tags?.length ?? 0) > 0 || note.updatedAt"
            class="w-full truncate text-[11px] text-zinc-400 dark:text-zinc-500">
            <span>{{ formatShortDate(note.updatedAt) }}</span>
            <template v-if="note.tags && note.tags.length > 0">
              <span aria-hidden="true"> · </span>
              <span>{{ note.tags.map((t) => `#${t}`).join(" ") }}</span>
            </template>
          </span>
        </button>

        <div
          class="flex shrink-0 items-center gap-0.5"
          @mousedown.stop>
          <button
            type="button"
            title="Archive note"
            aria-label="Archive note"
            draggable="false"
            class="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-300/60 hover:text-zinc-700 focus-visible:opacity-100 focus-visible:outline-none dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            @click.stop="handleArchiveNote(note.id)">
            <IconArchive class="size-3.5" />
          </button>

          <button
            type="button"
            title="Delete note"
            aria-label="Delete note"
            draggable="false"
            class="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-300/60 hover:text-zinc-700 focus-visible:opacity-100 focus-visible:outline-none dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            @click.stop="handleDeleteNote(note.id)">
            <IconClose class="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useJournalStore } from "@/store/journal-store";
import { computed, ref, watch } from "vue";
import IconArchive from "~icons/mdi/archive-outline";
import IconClose from "~icons/mdi/close";
import IconPlus from "~icons/mdi/plus";

const journalStore = useJournalStore();
const activeTagFilter = ref<string>("all");

const draggedNoteId = ref<string | null>(null);
const dropTargetId = ref<string | null>(null);
const dropPosition = ref<"before" | "after">("before");

const sortedNotes = computed(() => journalStore.activeNotes);

const noteTags = computed(() => {
  const tagSet = new Set<string>();
  for (const note of journalStore.activeNotes) {
    for (const tag of note.tags ?? []) {
      tagSet.add(tag);
    }
  }
  return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
});

watch(noteTags, (tags) => {
  if (activeTagFilter.value !== "all" && !tags.includes(activeTagFilter.value)) {
    activeTagFilter.value = "all";
  }
});

const filteredNotes = computed(() => {
  if (activeTagFilter.value === "all") return sortedNotes.value;
  return sortedNotes.value.filter((note) => note.tags?.includes(activeTagFilter.value));
});

const formatShortDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const resetDragState = () => {
  draggedNoteId.value = null;
  dropTargetId.value = null;
};

const onDragStart = (noteId: string, event: DragEvent) => {
  if (filteredNotes.value.length <= 1) {
    event.preventDefault();
    return;
  }
  draggedNoteId.value = noteId;
  dropTargetId.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", noteId);
  }
};

const onDragOver = (noteId: string, event: DragEvent) => {
  if (!draggedNoteId.value || draggedNoteId.value === noteId) return;
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return;

  const rect = target.getBoundingClientRect();
  const pos: "before" | "after" = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  dropTargetId.value = noteId;
  dropPosition.value = pos;

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
};

const onDragLeave = (noteId: string, event: DragEvent) => {
  const currentTarget = event.currentTarget as HTMLElement | null;
  const related = event.relatedTarget as Node | null;
  if (currentTarget && related && currentTarget.contains(related)) return;
  if (dropTargetId.value === noteId) {
    dropTargetId.value = null;
  }
};

const onDrop = async (targetNoteId: string) => {
  const sourceId = draggedNoteId.value;
  const position = dropPosition.value;
  resetDragState();

  if (!sourceId || sourceId === targetNoteId) return;

  const visibleIds = filteredNotes.value.map((n) => n.id);
  const fromVisibleIdx = visibleIds.indexOf(sourceId);
  const targetVisibleIdx = visibleIds.indexOf(targetNoteId);
  if (fromVisibleIdx === -1 || targetVisibleIdx === -1) return;

  const reorderedVisible = [...visibleIds];
  const [moved] = reorderedVisible.splice(fromVisibleIdx, 1);
  if (!moved) return;

  const adjustedTargetIdx = reorderedVisible.indexOf(targetNoteId);
  const insertAt = position === "after" ? adjustedTargetIdx + 1 : adjustedTargetIdx;
  reorderedVisible.splice(insertAt, 0, moved);

  // If a tag filter is active, reorder filtered notes across their existing slots in activeNotes
  const allIds = sortedNotes.value.map((n) => n.id);
  const visibleSet = new Set(visibleIds);
  let visibleCursor = 0;
  const finalOrderedIds = allIds.map((id) => {
    if (!visibleSet.has(id)) return id;
    const nextId = reorderedVisible[visibleCursor];
    visibleCursor += 1;
    return nextId ?? id;
  });

  await journalStore.reorderActiveNotes(finalOrderedIds);
};

const onDragEnd = () => {
  resetDragState();
};

const handleCreateNote = async () => {
  await journalStore.createNote(
    activeTagFilter.value !== "all" ? activeTagFilter.value : undefined
  );
};

const handleOpenNote = async (id: string) => {
  await journalStore.openNote(id);
};

const handleArchiveNote = async (id: string) => {
  await journalStore.archiveNote(id);
};

const handleDeleteNote = async (id: string) => {
  await journalStore.deleteNote(id);
};
</script>

<style scoped></style>
