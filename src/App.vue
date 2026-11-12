<template>
  <div class="h-screen w-screen">
    <div class="flex size-full flex-row">
      <div class="relative flex h-full w-auto flex-row items-center">
        <SideMenu class="z-10" />
        <SlidePanel class="z-0" />

        <button
          type="button"
          :aria-label="sideMenuStore.isVisible ? 'Close sidebar' : 'Open sidebar'"
          class="z-40 flex h-10 w-8 cursor-pointer items-center justify-center rounded-r-full bg-zinc-700 text-white transition-colors duration-200 hover:bg-zinc-600 focus-visible:outline-none"
          @click="sideMenuStore.setIsVisible(!sideMenuStore.isVisible)">
          <IconChevronLeft
            v-if="sideMenuStore.isVisible"
            class="-ml-1 size-5" />
          <IconChevronRight
            v-else
            class="-ml-1 size-5" />
        </button>
      </div>

      <EditorArea />
    </div>

    <Toaster
      :toast-options="{
        class: 'toast'
      }" />

    <GlobalSearchOverlay />
  </div>
</template>

<script setup lang="ts">
import EditorArea from "@/components/editor/EditorArea.vue";
import GlobalSearchOverlay from "@/components/search/GlobalSearchOverlay.vue";
import SideMenu from "@/components/side-menu/SideMenu.vue";
import SlidePanel from "@/components/slide-panel/SlidePanel.vue";
import { Toaster } from "@/components/ui/sonner";
import { useAccentColor } from "@/composables/use-accent-color";
import { useGlobalSearchShortcut } from "@/composables/use-global-search-shortcut";
import { useTheme } from "@/composables/use-theme";
import { useJournalStore } from "@/store/journal-store";
import { useSettingsStore } from "@/store/settings-store";
import { useSideMenuStore } from "@/store/side-menu-store";
import { onBeforeUnmount, onMounted } from "vue";
import IconChevronLeft from "~icons/mdi/chevron-left";
import IconChevronRight from "~icons/mdi/chevron-right";

// ------------------------ Variables

useTheme(); // Initialize theme sync on app startup
useAccentColor(); // Initialize accent color sync on app startup
useGlobalSearchShortcut();

const settingsStore = useSettingsStore();
const journalStore = useJournalStore();
const sideMenuStore = useSideMenuStore();

const handleBeforeUnload = () => {
  journalStore.flushPendingSave();
};

const handleVisibilityChange = () => {
  if (document.visibilityState === "hidden") {
    journalStore.flushPendingSave();
  }
};

onMounted(async () => {
  window.addEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("pagehide", handleBeforeUnload);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  if (window.ipcRenderer) {
    const response = await settingsStore.loadSettings();

    if (response.success) {
      await journalStore.getEntry(new Date());
    }

    await Promise.all([journalStore.getAllEntries(), journalStore.loadNotes()]);
    await journalStore.loadTags();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", handleBeforeUnload);
  window.removeEventListener("pagehide", handleBeforeUnload);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});
</script>
