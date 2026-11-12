<template>
  <Teleport to="body">
    <div
      v-if="searchStore.isOpen"
      class="fixed inset-0 z-[100] flex items-start justify-center bg-zinc-950/50 px-4 pt-[18vh] backdrop-blur-[2px]"
      style="-webkit-app-region: no-drag"
      @mousedown.self="searchStore.close()">
      <div
        class="flex w-full max-w-xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        role="dialog"
        aria-modal="true"
        aria-label="Search entries and notes"
        @keydown="onOverlayKeydown">
        <!-- Search input -->
        <div class="flex items-center gap-3 border-b border-zinc-200 px-4 dark:border-zinc-700">
          <IconSearch class="size-5 shrink-0 text-zinc-400" />
          <input
            ref="inputRef"
            :value="searchStore.query"
            type="text"
            class="h-14 w-full bg-transparent text-base text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            placeholder="Search entries, notes, or #tag…"
            autocomplete="off"
            spellcheck="false"
            @input="onInput" />
        </div>

        <!-- Tag Filter Row -->
        <div
          v-if="journalStore.allTags.length > 0"
          class="flex flex-wrap items-center gap-1.5 border-b border-zinc-200/80 px-4 py-2 dark:border-zinc-800">
          <button
            type="button"
            class="cursor-pointer rounded-md px-2 py-0.5 text-xs whitespace-nowrap transition-colors focus-visible:outline-none"
            :class="
              selectedTag === 'all'
                ? 'bg-zinc-200 font-medium text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100'
                : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
            "
            @click="selectTagFilter('all')">
            All
          </button>
          <button
            v-for="tag in journalStore.allTags"
            :key="tag"
            type="button"
            class="cursor-pointer rounded-md px-2 py-0.5 text-xs whitespace-nowrap transition-colors focus-visible:outline-none"
            :class="
              selectedTag === tag
                ? 'bg-zinc-200 font-medium text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100'
                : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
            "
            @click="selectTagFilter(selectedTag === tag ? 'all' : tag)">
            #{{ tag }}
          </button>
        </div>

        <!-- Results / empty states -->
        <div class="max-h-[min(24rem,50vh)] overflow-y-auto py-2">
          <p
            v-if="!hasActiveFilter"
            class="px-4 py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
            Type to search entries, notes, or #tags…
          </p>

          <p
            v-else-if="results.length === 0"
            class="px-4 py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
            No matches
          </p>

          <button
            v-for="(match, index) in results"
            :key="`${match.kind}-${match.noteId ?? match.date?.getTime()}-${match.matchIndex}`"
            :ref="(el) => setResultRef(el, index)"
            type="button"
            class="flex w-full cursor-pointer flex-col gap-0.5 px-4 py-2.5 text-left transition-colors"
            :class="
              index === searchStore.selectedIndex
                ? 'bg-zinc-100 dark:bg-zinc-800'
                : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
            "
            @click="openMatch(match)"
            @mouseenter="searchStore.selectIndex(index)">
            <span
              class="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <span>{{ match.title }}</span>
              <template v-if="match.tags.length > 0">
                <span aria-hidden="true">·</span>
                <span class="font-normal text-zinc-400 dark:text-zinc-500">
                  {{ match.tags.map((t) => `#${t}`).join(" ") }}
                </span>
              </template>
            </span>

            <span class="line-clamp-2 text-sm text-zinc-800 dark:text-zinc-200">
              <template v-if="match.snippetHighlightEnd > match.snippetHighlightStart">
                <template v-if="match.snippetHighlightStart > 0">{{
                  match.snippet.slice(0, match.snippetHighlightStart)
                }}</template>
                <mark
                  class="rounded-sm bg-[rgb(var(--accent-300)/0.55)] text-inherit dark:bg-[rgb(var(--accent-500)/0.35)]"
                  >{{
                    match.snippet.slice(match.snippetHighlightStart, match.snippetHighlightEnd)
                  }}</mark
                >
                <template v-if="match.snippetHighlightEnd < match.snippet.length">{{
                  match.snippet.slice(match.snippetHighlightEnd)
                }}</template>
              </template>
              <template v-else>
                {{ match.snippet }}
              </template>
            </span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { searchLibrary, type SearchMatch } from "@/lib/search/search-entries";
import { useJournalStore } from "@/store/journal-store";
import { useSearchStore } from "@/store/search-store";
import { computed, nextTick, ref, watch } from "vue";
import IconSearch from "~icons/mdi/magnify";

// ------------------------ Variables

const searchStore = useSearchStore();
const journalStore = useJournalStore();

const inputRef = ref<HTMLInputElement | null>(null);
const resultRefs = ref<(HTMLElement | null)[]>([]);
const selectedTag = ref<string>("all");

const hasActiveFilter = computed(
  () => searchStore.query.trim().length > 0 || selectedTag.value !== "all"
);

const results = computed(() =>
  searchLibrary({
    entries: journalStore.allEntries,
    notes: journalStore.notes,
    query: searchStore.query,
    tagFilter: selectedTag.value
  })
);

// ------------------------ Functions

const onInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value;
  searchStore.setQuery(value);
};

const selectTagFilter = (tag: string) => {
  selectedTag.value = tag;
  searchStore.selectIndex(0);
  void nextTick(() => {
    inputRef.value?.focus();
  });
};

const setResultRef = (el: unknown, index: number) => {
  resultRefs.value[index] = el instanceof HTMLElement ? el : null;
};

const openMatch = async (match: SearchMatch) => {
  searchStore.close();

  if (match.kind === "note" && match.noteId) {
    await journalStore.openNote(match.noteId);
    if (match.endOffset > match.startOffset) {
      searchStore.setPendingReveal({
        startOffset: match.startOffset,
        endOffset: match.endOffset
      });
    }
    return;
  }

  if (match.date) {
    await journalStore.getEntry(match.date);

    if (match.endOffset > match.startOffset) {
      // Set after getEntry so reveal maps against the loaded entry, not the previous one.
      searchStore.setPendingReveal({
        startOffset: match.startOffset,
        endOffset: match.endOffset
      });
    }
  }
};

const onOverlayKeydown = (event: KeyboardEvent) => {
  const key = event.key;

  if (key === "ArrowDown") {
    event.preventDefault();

    searchStore.moveSelection(1, results.value.length);

    return;
  }

  if (key === "ArrowUp") {
    event.preventDefault();

    searchStore.moveSelection(-1, results.value.length);

    return;
  }

  if (key === "Enter") {
    event.preventDefault();

    const match = results.value[searchStore.selectedIndex];

    if (match) {
      void openMatch(match);
    }
  }
};

const refreshLibraryInBackground = () => {
  void Promise.all([
    journalStore.getAllEntries(),
    journalStore.loadNotes(),
    journalStore.loadTags()
  ]).then(() => {
    // Keep unsaved current entry/note text searchable after a storage refresh.
    const current = journalStore.current;
    if (current) {
      const index = journalStore.allEntries.findIndex(
        (e) => e.date.getTime() === current.date.getTime()
      );
      if (index >= 0) {
        journalStore.allEntries[index] = current;
      } else if (
        current.content.trim() !== "" ||
        (current.tags?.length ?? 0) > 0 ||
        (current.images?.length ?? 0) > 0
      ) {
        journalStore.allEntries.push(current);
      }
    }

    const currentNote = journalStore.currentNote;
    if (currentNote) {
      const idx = journalStore.notes.findIndex((n) => n.id === currentNote.id);
      if (idx >= 0) {
        journalStore.notes[idx] = currentNote;
      } else {
        journalStore.notes.unshift(currentNote);
      }
    }
  });
};

// ------------------------ Watch

watch(
  () => searchStore.isOpen,
  async (open) => {
    if (!open) {
      selectedTag.value = "all";
      resultRefs.value = [];

      return;
    }

    selectedTag.value = "all";
    refreshLibraryInBackground();

    await nextTick();

    inputRef.value?.focus();
  }
);

watch(
  () => searchStore.selectedIndex,
  async () => {
    await nextTick();

    resultRefs.value[searchStore.selectedIndex]?.scrollIntoView({
      block: "nearest"
    });
  }
);
</script>
