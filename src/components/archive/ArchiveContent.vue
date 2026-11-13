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
        class="group flex w-full min-w-0 items-center justify-between gap-1.5 rounded-md px-2 py-1.5 transition-colors"
        :class="
          journalStore.currentNote?.id === note.id
            ? 'bg-zinc-200/80 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100'
            : 'text-zinc-600 hover:bg-zinc-200/50 dark:text-zinc-300/80 dark:hover:bg-zinc-800/60'
        ">
        <button
          type="button"
          class="flex min-w-0 flex-1 cursor-pointer items-baseline justify-between gap-2 text-left focus-visible:outline-none"
          @click="handleOpenNote(note.id)">
          <span class="min-w-0 truncate text-sm font-normal">
            {{ note.title || "Untitled" }}
          </span>
          <span class="shrink-0 text-[11px] text-zinc-400 tabular-nums dark:text-zinc-500">
            {{ formatShortDate(note.archivedAt || note.updatedAt) }}
          </span>
        </button>

        <div class="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            title="Restore to Notes"
            aria-label="Restore note"
            class="flex size-5 cursor-pointer items-center justify-center rounded-sm text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-300/60 hover:text-zinc-700 focus-visible:opacity-100 focus-visible:outline-none dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            @click.stop="handleUnarchiveNote(note.id)">
            <IconRestore class="size-3.5" />
          </button>

          <button
            type="button"
            title="Delete note"
            aria-label="Delete note"
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
import IconRestore from "~icons/mdi/archive-arrow-up-outline";
import IconClose from "~icons/mdi/close";

const journalStore = useJournalStore();

const formatShortDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
