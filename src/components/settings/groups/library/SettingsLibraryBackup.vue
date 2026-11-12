<template>
  <div class="flex w-full flex-col items-start justify-start gap-1.5">
    <Button
      variant="outline"
      :disabled="isExporting"
      @click="handleBackupZip">
      <IconDownload class="size-4" />
      <span>{{ isExporting ? "Preparing zip..." : "Download Zip" }}</span>
    </Button>

    <p class="text-xs text-zinc-500 dark:text-zinc-400">
      Includes all entries, notes, tags, and photos.
    </p>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { useJournalStore } from "@/store/journal-store";
import { ref } from "vue";
import { toast } from "vue-sonner";
import IconDownload from "~icons/mdi/download-outline";

const journalStore = useJournalStore();
const isExporting = ref(false);

const handleBackupZip = async () => {
  if (isExporting.value) return;
  isExporting.value = true;

  try {
    await journalStore.saveCurrent();

    if (!window.ipcRenderer) {
      toast.error("Backup failed", {
        description: "Storage service is not available"
      });
      return;
    }

    const result = await window.ipcRenderer.exportEntries();
    if (!result.success) {
      if (result.error && result.error !== "cancelled") {
        toast.error("Backup failed", {
          description: result.error
        });
      }
      return;
    }

    toast.success("Backup downloaded", {
      description: "Saved a zip archive with your entries, notes, tags, and photos."
    });
  } catch (err) {
    toast.error("Backup failed", {
      description: err instanceof Error ? err.message : "Could not create zip archive"
    });
  } finally {
    isExporting.value = false;
  }
};
</script>

<style scoped></style>
