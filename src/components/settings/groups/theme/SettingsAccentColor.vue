<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <button
      v-for="color in accentColors"
      :key="color.name"
      type="button"
      class="h-4 w-5 cursor-pointer rounded transition-all"
      :class="[
        color.bgClass,
        settingsStore.accentColor === color.name
          ? 'ring-2 ring-zinc-700 ring-offset-1 dark:ring-zinc-300 dark:ring-offset-zinc-900'
          : 'hover:scale-110'
      ]"
      :aria-label="`Select ${color.name} accent color`"
      @click="handleClick(color.name)" />

    <label
      class="relative flex h-4 w-5 cursor-pointer items-center justify-center overflow-hidden rounded border border-zinc-300 transition-all dark:border-zinc-600"
      :class="
        isCustomColor
          ? 'ring-2 ring-zinc-700 ring-offset-1 dark:ring-zinc-300 dark:ring-offset-zinc-900'
          : 'bg-zinc-200/70 hover:scale-110 dark:bg-zinc-800'
      "
      :style="isCustomColor ? { backgroundColor: settingsStore.accentColor } : undefined"
      :title="isCustomColor ? `Custom color (${settingsStore.accentColor})` : 'Pick custom color'">
      <IconPalette
        v-if="!isCustomColor"
        class="pointer-events-none size-3 text-zinc-600 dark:text-zinc-300" />
      <input
        type="color"
        aria-label="Select custom accent color"
        class="absolute inset-0 size-full cursor-pointer opacity-0"
        :value="pickerHexValue"
        @input="handleCustomColorInput" />
    </label>
  </div>
</template>

<script setup lang="ts">
import { PRESET_ACCENT_HEX } from "@/composables/use-accent-color";
import { useSettingsStore } from "@/store/settings-store";
import type { AccentColor, HexAccentColor, PresetAccentColor } from "@shared/types/accent-color";
import { computed } from "vue";
import IconPalette from "~icons/mdi/palette-outline";

// ------------------------ Interfaces

interface AccentColorItem {
  name: PresetAccentColor;
  bgClass: string;
}

// ------------------------ Variables

const settingsStore = useSettingsStore();

const accentColors: AccentColorItem[] = [
  { name: "green", bgClass: "bg-green-500" },
  { name: "blue", bgClass: "bg-blue-500" },
  { name: "purple", bgClass: "bg-purple-500" },
  { name: "red", bgClass: "bg-red-500" },
  { name: "orange", bgClass: "bg-orange-500" },
  { name: "yellow", bgClass: "bg-yellow-500" }
];

const isCustomColor = computed(() => settingsStore.accentColor.startsWith("#"));

const pickerHexValue = computed(() => {
  const current = settingsStore.accentColor;
  if (current.startsWith("#")) return current;
  return PRESET_ACCENT_HEX[current as PresetAccentColor] ?? PRESET_ACCENT_HEX.blue;
});

// ------------------------ Handlers

const handleClick = (value: AccentColor) => {
  settingsStore.setAccentColor(value);
};

const handleCustomColorInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value as HexAccentColor;
  if (value) {
    settingsStore.setAccentColor(value);
  }
};
</script>

<style scoped></style>
