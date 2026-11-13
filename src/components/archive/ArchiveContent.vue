<template>
  <div class="flex w-full flex-col gap-3">
    <div
      class="flex w-full items-center justify-between border-b border-zinc-200 pb-3 text-zinc-500 dark:border-zinc-800 dark:text-zinc-300">
      <h2 class="text-sm font-bold">Notes Archive</h2>
      <span
        v-if="journalStore.archivedNotes.length > 0"
        class="text-xs text-zinc-400 tabular-nums dark:text-zinc-500">
        {{ journalStore.archivedNotes.length }}
      </span>
    </div>

    <p
      v-if="journalStore.archivedNotes.length === 0"
      class="py-1 text-xs text-zinc-400 dark:text-zinc-500">
      No archived notes yet
    </p>

    <div
      v-else
      class="flex w-full min-w-0 flex-col gap-0.5">
      <div
        v-for="note in journalStore.archivedNotes"
        :key="note.id"
        :draggable="journalStore.archivedNotes.length > 1"
        class="group relative flex w-full min-w-0 items-center justify-between gap-1.5 rounded-md px-2 py-1.5 transition-colors"
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
          class="flex min-w-0 flex-1 cursor-pointer items-baseline justify-between gap-2 text-left focus-visible:outline-none"
          :class="journalStore.archivedNotes.length > 1 ? 'cursor-grab active:cursor-grabbing' : ''"
          @click="handleOpenNote(note.id)">
          <span class="min-w-0 truncate text-sm font-normal">
            {{ note.title || "Untitled" }}
          </span>
          <span class="shrink-0 text-[11px] text-zinc-400 tabular-nums dark:text-zinc-500">
            {{ formatShortDate(note.archivedAt || note.updatedAt) }}
          </span>
        </button>

        <div
          class="flex shrink-0 items-center gap-0.5"
          @mousedown.stop>
          <button
            type="button"
            title="Restore to Notes"
            aria-label="Restore note"
            draggable="false"
            class="flex size-5 cursor-pointer items-center justify-center rounded-sm text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-300/60 hover:text-zinc-700 focus-visible:opacity-100 focus-visible:outline-none dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            @click.stop="handleUnarchiveNote(note.id)">
            <IconRestore class="size-3.5" />
          </button>

          <button
            type="button"
            title="Delete note"
            aria-label="Delete note"
            draggable="false"
            class="flex size-5 cursor-pointer items-center justify-center rounded-sm text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-300/60 hover:text-zinc-700 focus-visible:opacity-100 focus-visible:outline-none dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
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
import { ref } from "vue";
import IconRestore from "~icons/mdi/archive-arrow-up-outline";
import IconClose from "~icons/mdi/close";

const journalStore = useJournalStore();

const draggedNoteId = ref<string | null>(null);
const dropTargetId = ref<string | null>(null);
const dropPosition = ref<"before" | "after">("before");

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
  if (journalStore.archivedNotes.length <= 1) {
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

  const ids = journalStore.archivedNotes.map((n) => n.id);
  const fromIdx = ids.indexOf(sourceId);
  const targetIdx = ids.indexOf(targetNoteId);
  if (fromIdx === -1 || targetIdx === -1) return;

  const reordered = [...ids];
  const [moved] = reordered.splice(fromIdx, 1);
  if (!moved) return;

  const adjustedTargetIdx = reordered.indexOf(targetNoteId);
  const insertAt = position === "after" ? adjustedTargetIdx + 1 : adjustedTargetIdx;
  reordered.splice(insertAt, 0, moved);

  await journalStore.reorderArchivedNotes(reordered);
};

const onDragEnd = () => {
  resetDragState();
};

const handleOpenNote = async (id: string) => {
  await journalStore.openNote(id);
};

const handleUnarchiveNote = async (id: string) => {
  await journalStore.unarchiveNote(id);
};

const handleDeleteNote = async (id: string) => {
  await journalStore.deleteNote(id);
};
</script>

<style scoped></style>
