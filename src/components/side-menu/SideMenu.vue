<template>
  <Transition
    enter-active-class="transition-transform duration-50 ease-out"
    leave-active-class="transition-transform duration-50 ease-in"
    enter-from-class="-translate-x-full"
    enter-to-class="translate-x-0"
    leave-from-class="translate-x-0"
    leave-to-class="-translate-x-full">
    <nav
      v-show="sideMenuStore.isVisible"
      class="relative h-full w-[292px] max-w-[292px] shrink-0">
      <div
        ref="scrollContainer"
        class="scroll-container flex min-h-full w-full flex-col items-start justify-start overflow-x-hidden border-r-1 border-zinc-200 bg-zinc-100 p-6 select-none dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex w-full min-w-0 flex-col items-center justify-start">
          <SideMenuAppInfo />

          <Separator class="my-4" />

          <SideMenuOptions />
        </div>

        <Separator class="my-6" />

        <div class="flex w-full min-w-0 flex-col items-center justify-start">
          <div class="mb-6 w-full min-w-0">
            <SideMenuEntryInfo />
          </div>

          <div class="w-full">
            <SideMenuCalendar />
          </div>

          <Separator class="my-6" />

          <div class="w-full min-w-0">
            <SideMenuNotes />
          </div>
        </div>
      </div>

      <CustomScrollbar
        :scroll-container="scrollContainer"
        :align-to-viewport="false" />
    </nav>
  </Transition>
</template>

<script setup lang="ts">
import CustomScrollbar from "@/components/shared/scrollbar/CustomScrollbar.vue";
import SideMenuAppInfo from "@/components/side-menu/SideMenuAppInfo.vue";
import SideMenuCalendar from "@/components/side-menu/SideMenuCalendar.vue";
import SideMenuEntryInfo from "@/components/side-menu/SideMenuEntryInfo.vue";
import SideMenuNotes from "@/components/side-menu/SideMenuNotes.vue";
import SideMenuOptions from "@/components/side-menu/SideMenuOptions.vue";
import { Separator } from "@/components/ui/separator";
import { useSideMenuStore } from "@/store/side-menu-store";
import { ref } from "vue";

// ------------------------ Variables

const scrollContainer = ref(null);
const sideMenuStore = useSideMenuStore();
</script>

<style scoped></style>
