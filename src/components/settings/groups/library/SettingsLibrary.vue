<template>
  <SettingsGroup name="Saving">
    <!-- Library Location -->

    <SettingsItem name="Library Location">
      <SettingsLibraryLocation />
    </SettingsItem>

    <!-- Backup -->

    <SettingsItem name="Backup">
      <SettingsLibraryBackup />
    </SettingsItem>
  </SettingsGroup>
</template>

<script setup lang="ts">
import SettingsLibraryBackup from "@/components/settings/groups/library/SettingsLibraryBackup.vue";
import SettingsLibraryLocation from "@/components/settings/groups/library/SettingsLibraryLocation.vue";
import SettingsGroup from "@/components/settings/groups/SettingsGroup.vue";
import SettingsItem from "@/components/settings/groups/SettingsItem.vue";
</script>

<style scoped></style>
