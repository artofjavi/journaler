<template>
  <div class="flex w-full grow flex-col">
    <button
      v-for="item in items"
      :key="item.name"
      class="flex w-full cursor-pointer flex-row items-center gap-3 rounded-md p-2 px-3 text-zinc-500 hover:bg-zinc-200 dark:text-zinc-300/80 dark:hover:bg-zinc-800"
      @click="item.action()">
      <component :is="item.icon" />

      <p class="text-sm font-normal">
        {{ item.name }}
      </p>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useSearchStore } from "@/store/search-store";
import { useSlidePanelStore } from "@/store/slide-panel-store";
import type { FunctionalComponent } from "vue";
import IconArchive from "~icons/mdi/archive-outline";
import IconSearch from "~icons/mdi/magnify";
import IconSettings from "~icons/mdi/settings-outline";

// ------------------------ Interfaces

interface SideMenuItem {
  name: string;
  icon: FunctionalComponent;
  action: () => void;
}

// ------------------------ Variables

const slidePanelStore = useSlidePanelStore();
const searchStore = useSearchStore();

// ------------------------ Items

const items: SideMenuItem[] = [
  {
    name: "Search",
    icon: IconSearch,
    action: () => {
      searchStore.open();
    }
  },
  {
    name: "Archive",
    icon: IconArchive,
    action: () => {
      slidePanelStore.togglePanel("archive");
    }
  },
  {
    name: "Settings",
    icon: IconSettings,
    action: () => {
      slidePanelStore.togglePanel("settings");
    }
  }
];
</script>

<style scoped></style>
