<template>
  <div class="flex w-full flex-col items-start justify-start gap-2">
    <Select v-model="preset">
      <SelectTrigger class="w-full">
        <SelectValue placeholder="Select range" />
      </SelectTrigger>
      <SelectContent class="z-[110]">
        <SelectItem value="all">All Time</SelectItem>
        <SelectItem value="this-year">This Year ({{ currentYear }})</SelectItem>
        <SelectItem value="last-90">Last 90 Days</SelectItem>
        <SelectItem value="last-30">Last 30 Days</SelectItem>
        <SelectItem value="custom">Custom Range</SelectItem>
      </SelectContent>
    </Select>

    <div
      v-if="preset === 'custom'"
      class="grid w-full grid-cols-2 gap-2">
      <label class="flex flex-col gap-1">
        <span class="text-[11px] text-zinc-400 dark:text-zinc-500">From</span>
        <input
          v-model="startDate"
          type="date"
          class="h-8 w-full rounded-md border border-zinc-200 bg-transparent px-2 text-xs text-zinc-700 focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-800/30 dark:text-zinc-200 dark:focus:border-zinc-600" />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-[11px] text-zinc-400 dark:text-zinc-500">To</span>
        <input
          v-model="endDate"
          type="date"
          class="h-8 w-full rounded-md border border-zinc-200 bg-transparent px-2 text-xs text-zinc-700 focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-800/30 dark:text-zinc-200 dark:focus:border-zinc-600" />
      </label>
    </div>

    <Button
      variant="outline"
      :disabled="isExporting || isCustomInvalid"
      @click="handleDownloadDigest">
      <IconDownload class="size-4" />
      <span>{{ isExporting ? "Preparing digest..." : "Download Digest" }}</span>
    </Button>

    <p class="text-xs text-zinc-500 dark:text-zinc-400">
      Single text file with entries, notes, tags, and summary counts (no photos).
    </p>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useJournalStore } from "@/store/journal-store";
import type { DigestRangePreset } from "@shared/utils/digest-export";
import { computed, ref } from "vue";
import { toast } from "vue-sonner";
import IconDownload from "~icons/mdi/download-outline";

const journalStore = useJournalStore();
const now = new Date();
const currentYear = now.getFullYear();

const toLocalYmd = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const preset = ref<DigestRangePreset>("all");
const startDate = ref<string>(`${currentYear}-01-01`);
const endDate = ref<string>(toLocalYmd(now));
const isExporting = ref(false);

const isCustomInvalid = computed(() => {
  if (preset.value !== "custom") return false;
  if (!startDate.value && !endDate.value) return true;
  if (startDate.value && endDate.value && startDate.value > endDate.value) return true;
  return false;
});

const handleDownloadDigest = async () => {
  if (isExporting.value || isCustomInvalid.value) return;
  isExporting.value = true;

  try {
    await journalStore.saveCurrent();

    if (!window.ipcRenderer) {
      toast.error("Digest export failed", {
        description: "Storage service is not available"
      });
      return;
    }

    const result = await window.ipcRenderer.exportDigest({
      preset: preset.value,
      ...(preset.value === "custom"
        ? {
            startDate: startDate.value || undefined,
            endDate: endDate.value || undefined
          }
        : {})
    });

    if (!result.success) {
      if (result.error && result.error !== "cancelled") {
        toast.error("Digest export failed", {
          description: result.error
        });
      }
      return;
    }

    toast.success("Digest downloaded", {
      description: "Saved a plain-text Markdown digest with entries, notes, tags, and counts."
    });
  } catch (err) {
    toast.error("Digest export failed", {
      description: err instanceof Error ? err.message : "Could not generate digest"
    });
  } finally {
    isExporting.value = false;
  }
};
</script>

<style scoped></style>
