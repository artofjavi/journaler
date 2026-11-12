/// <reference types="vite/client" />
import type { JournalEntry, NoteEntry } from "@shared/types/journal-entry";
import { Result, VoidResult } from "@shared/types/result";
import { SettingsConfig } from "@shared/types/settings-config";

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

declare global {
  interface Window {
    ipcRenderer?: {
      getPlatform(): Promise<string>;
      setup(): Promise<Result<SettingsConfig>>;
      saveSettings(settings: SettingsConfig): Promise<VoidResult>;
      loadSettings(): Promise<Result<SettingsConfig | null>>;
      getEntries(): Promise<Result<JournalEntry[]>>;
      getEntry(date: Date): Promise<Result<JournalEntry>>;
      saveEntry(entry: JournalEntry): Promise<VoidResult>;
      getPreviousEntry(date: Date): Promise<Result<JournalEntry>>;
      getNextEntry(date: Date): Promise<Result<JournalEntry>>;
      getNotes(): Promise<Result<NoteEntry[]>>;
      saveNote(note: NoteEntry): Promise<VoidResult>;
      deleteNote(id: string): Promise<VoidResult>;
      getTags(): Promise<Result<string[]>>;
      saveTags(tags: string[]): Promise<VoidResult>;
      chooseLibrary(): Promise<Result<string | null>>;
      exportEntries(): Promise<VoidResult>;
    };
  }

  const __APP_VERSION__: string;
  const __APP_NAME__: string;
}

export {};
