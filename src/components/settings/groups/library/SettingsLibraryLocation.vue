<template>
  <div class="flex w-full flex-col items-start justify-start gap-1">
    <p
      v-if="isWeb"
      class="w-full rounded-md border-1 border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
      Saved automatically in browser storage (localStorage).
    </p>

    <template v-else>
      <input
        disabled
        class="w-full rounded-md border-1 border-zinc-300 bg-zinc-50 p-1 px-2 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400"
        :value="displayPath" />

      <Button
        variant="outline"
        @click="handleChooseFile">
        Choose
      </Button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { usePlatform } from "@/composables/use-platform";
import { useJournalStore } from "@/store/journal-store";
import { useSettingsStore } from "@/store/settings-store";
import { computed } from "vue";

const { isWeb } = usePlatform();
const settingsStore = useSettingsStore();
const journalStore = useJournalStore();

const displayPath = computed(() => {
  return settingsStore.libraryLocation || "Default (Documents)";
});

const handleChooseFile = async () => {
  if (isWeb.value) return;

  if (window.ipcRenderer) {
    const result = await window.ipcRenderer.chooseLibrary();

    if (result.success && result.data) {
      settingsStore.setLibraryLocation(result.data);
      await journalStore.rescanLibrary();
    }
  }
};
</script>

<style scoped></style>
