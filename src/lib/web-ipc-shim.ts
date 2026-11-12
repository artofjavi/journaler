import { DEFAULT_SETTINGS } from "@shared/constants/settings-defaults";
import { type JournalEntry, type JournalImage, type NoteEntry } from "@shared/types/journal-entry";
import { type Result, type VoidResult } from "@shared/types/result";
import { type SettingsConfig } from "@shared/types/settings-config";
import {
  convertDateToFile,
  getNextDate,
  getPreviousDate,
  isFutureDate
} from "@shared/utils/date-utils";

const SETTINGS_STORAGE_KEY = "journaler:settings";
const ENTRIES_STORAGE_KEY = "journaler:entries";
const ENTRIES_DOCS_STORAGE_KEY = "journaler:entry-docs";
const ENTRY_TAGS_STORAGE_KEY = "journaler:entry-tags";
const NOTES_STORAGE_KEY = "journaler:notes";
const TAG_COLLECTION_STORAGE_KEY = "journaler:tag-collection";
const BROWSER_LIBRARY_LABEL = "Browser Storage (localStorage)";

interface DocNodeLike {
  type?: string;
  text?: string;
  attrs?: { images?: JournalImage[] };
  content?: DocNodeLike[];
}

function normalizeLocalDate(date: Date | string): Date {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function readEntriesMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ENTRIES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}

function writeEntriesMap(entriesMap: Record<string, string>): void {
  localStorage.setItem(ENTRIES_STORAGE_KEY, JSON.stringify(entriesMap));
}

function readDocsMap(): Record<string, Record<string, unknown>> {
  try {
    const raw = localStorage.getItem(ENTRIES_DOCS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, Record<string, unknown>>;
    }
    return {};
  } catch {
    return {};
  }
}

function writeDocsMap(docsMap: Record<string, Record<string, unknown>>): void {
  localStorage.setItem(ENTRIES_DOCS_STORAGE_KEY, JSON.stringify(docsMap));
}

function readEntryTagsMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(ENTRY_TAGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string[]>;
    }
    return {};
  } catch {
    return {};
  }
}

function writeEntryTagsMap(tagsMap: Record<string, string[]>): void {
  localStorage.setItem(ENTRY_TAGS_STORAGE_KEY, JSON.stringify(tagsMap));
}

function readNotesArray(): NoteEntry[] {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as NoteEntry[]) : [];
  } catch {
    return [];
  }
}

function writeNotesArray(notes: NoteEntry[]): void {
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
}

function readTagCollection(): string[] {
  try {
    const raw = localStorage.getItem(TAG_COLLECTION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function writeTagCollection(tags: string[]): void {
  localStorage.setItem(TAG_COLLECTION_STORAGE_KEY, JSON.stringify(tags));
}

function extractImagesFromDoc(doc?: Record<string, unknown>): JournalImage[] {
  if (!doc || !Array.isArray(doc.content)) return [];
  const collected: JournalImage[] = [];

  for (const node of doc.content as DocNodeLike[]) {
    if (node?.type === "imageBlock" && Array.isArray(node.attrs?.images)) {
      collected.push(...node.attrs.images);
    }
  }

  return collected;
}

function extractTextFromNode(node: DocNodeLike): string {
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content.map(extractTextFromNode).join("");
}

function parseEntryDateFromFileName(fileName: string): Date | null {
  if (!fileName.endsWith(".md")) return null;
  const dateString = fileName.slice(0, -3);
  const parts = dateString.split("-");
  if (parts.length !== 3) return null;

  const [yearStr, monthStr, dayStr] = parts;
  if (!yearStr || !monthStr || !dayStr) return null;

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }

  return new Date(year, month, day);
}

// Minimal CRC-32 + uncompressed ZIP builder for browser export
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    const tableValue = CRC_TABLE[(crc ^ byte) & 0xff] ?? 0;
    crc = tableValue ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dataUrlToUint8Array(dataUrl: string): { bytes: Uint8Array; ext: string } | null {
  const match = /^data:([^,;]+)(?:;([^,]+))?,(.+)$/.exec(dataUrl);
  if (!match) return null;

  const mime = match[1] ?? "image/jpeg";
  const encoding = match[2] ?? "";
  const payload = match[3] ?? "";

  let bytes: Uint8Array;
  if (encoding.toLowerCase().includes("base64")) {
    const binary = atob(payload);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(payload));
  }

  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg"
  };

  return { bytes, ext: extMap[mime] ?? "jpg" };
}

function buildZipBlob(files: Array<{ name: string; content: string | Uint8Array }>): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes =
      typeof file.content === "string" ? encoder.encode(file.content) : file.content;
    const crc = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x5421, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  let centralSize = 0;
  for (const part of centralParts) {
    centralSize += part.length;
  }

  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, endRecord] as BlobPart[], {
    type: "application/zip"
  });
}

async function getAllEntriesInternal(): Promise<Result<JournalEntry[]>> {
  try {
    const map = readEntriesMap();
    const docsMap = readDocsMap();
    const tagsMap = readEntryTagsMap();
    const allKeys = new Set([
      ...Object.keys(map),
      ...Object.keys(docsMap),
      ...Object.keys(tagsMap)
    ]);
    const entries: JournalEntry[] = [];

    for (const fileName of allKeys) {
      const date = parseEntryDateFromFileName(fileName);
      if (!date) continue;
      const doc = docsMap[fileName];
      const images = extractImagesFromDoc(doc);
      const tags = tagsMap[fileName];
      const content = map[fileName] ?? "";

      if (content === "" && images.length === 0 && (!tags || tags.length === 0)) {
        continue;
      }

      entries.push({
        date,
        content,
        ...(tags && tags.length > 0 ? { tags } : {}),
        ...(images.length > 0 ? { images } : {}),
        ...(doc ? { doc } : {})
      });
    }

    return { success: true, data: entries };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to read entries"
    };
  }
}

async function getEntryInternal(date: Date): Promise<Result<JournalEntry>> {
  try {
    const normalized = normalizeLocalDate(date);
    const fileName = convertDateToFile(normalized);

    if (!fileName) {
      return { success: false, error: "Data received is not a Date" };
    }

    const map = readEntriesMap();
    const docsMap = readDocsMap();
    const tagsMap = readEntryTagsMap();

    const doc = docsMap[fileName];
    const images = extractImagesFromDoc(doc);
    const tags = tagsMap[fileName] ?? [];

    return {
      success: true,
      data: {
        date: normalized,
        content: map[fileName] ?? "",
        tags,
        images,
        ...(doc ? { doc } : {})
      }
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load entry"
    };
  }
}

export function installWebIpcShim(): void {
  if (typeof window === "undefined" || window.ipcRenderer) {
    return;
  }

  window.ipcRenderer = {
    async getPlatform(): Promise<string> {
      return "web";
    },

    async setup(): Promise<Result<SettingsConfig>> {
      const settingsWithDefaults: SettingsConfig = {
        ...DEFAULT_SETTINGS,
        libraryLocation: BROWSER_LIBRARY_LABEL
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsWithDefaults));
      return { success: true, data: settingsWithDefaults };
    },

    async saveSettings(settings: SettingsConfig): Promise<VoidResult> {
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed to save settings"
        };
      }
    },

    async loadSettings(): Promise<Result<SettingsConfig | null>> {
      try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!raw) {
          return { success: true, data: null };
        }
        const parsed = JSON.parse(raw) as SettingsConfig;
        const migrationKey = "journaler:migrated-paragraph-spacing-v2";
        if (parsed.paragraphSpacing === 4 && !localStorage.getItem(migrationKey)) {
          parsed.paragraphSpacing = DEFAULT_SETTINGS.paragraphSpacing;
          localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(parsed));
          localStorage.setItem(migrationKey, "1");
        } else if (!localStorage.getItem(migrationKey)) {
          localStorage.setItem(migrationKey, "1");
        }
        if (typeof parsed.topSpacing !== "number") {
          parsed.topSpacing = DEFAULT_SETTINGS.topSpacing;
        }
        return { success: true, data: parsed };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed to load settings"
        };
      }
    },

    async getEntries(): Promise<Result<JournalEntry[]>> {
      return getAllEntriesInternal();
    },

    async getEntry(date: Date): Promise<Result<JournalEntry>> {
      return getEntryInternal(date);
    },

    async saveEntry(entry: JournalEntry): Promise<VoidResult> {
      try {
        const normalized = normalizeLocalDate(entry.date);
        const fileName = convertDateToFile(normalized);

        if (!fileName) {
          return { success: false, error: "Entry in data received is not a Date" };
        }

        const hasImages = Boolean(entry.doc && extractImagesFromDoc(entry.doc).length > 0);
        const hasTags = Boolean(entry.tags && entry.tags.length > 0);
        const hasText = entry.content !== "";

        const map = readEntriesMap();
        if (hasText || hasImages || hasTags) {
          map[fileName] = entry.content;
        } else {
          delete map[fileName];
        }
        writeEntriesMap(map);

        const docsMap = readDocsMap();
        if (hasImages && entry.doc) {
          docsMap[fileName] = entry.doc;
        } else {
          delete docsMap[fileName];
        }
        writeDocsMap(docsMap);

        const tagsMap = readEntryTagsMap();
        if (hasTags && entry.tags) {
          tagsMap[fileName] = entry.tags;
        } else {
          delete tagsMap[fileName];
        }
        writeEntryTagsMap(tagsMap);

        return { success: true };
      } catch (err) {
        return {
          success: false,
          error:
            err instanceof Error ? err.message : "Failed to save entry (storage quota may be full)"
        };
      }
    },

    async getPreviousEntry(date: Date): Promise<Result<JournalEntry>> {
      const previousDate = getPreviousDate(normalizeLocalDate(date));
      if (!previousDate) {
        return { success: false, error: "Entry in data received is not a Date" };
      }
      return getEntryInternal(previousDate);
    },

    async getNextEntry(date: Date): Promise<Result<JournalEntry>> {
      const nextDate = getNextDate(normalizeLocalDate(date));
      if (!nextDate) {
        return { success: false, error: "Entry in data received is not a Date" };
      }
      if (isFutureDate(nextDate)) {
        return { success: false, error: "Cannot write to future dates" };
      }
      return getEntryInternal(nextDate);
    },

    async getNotes(): Promise<Result<NoteEntry[]>> {
      try {
        const notes = readNotesArray()
          .map((note) => {
            const images = note.doc ? extractImagesFromDoc(note.doc) : (note.images ?? []);
            return { ...note, images };
          })
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        return { success: true, data: notes };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed to load notes"
        };
      }
    },

    async saveNote(note: NoteEntry): Promise<VoidResult> {
      try {
        const notes = readNotesArray();
        const hasDocImages = Boolean(note.doc && extractImagesFromDoc(note.doc).length > 0);
        const persistedNote: NoteEntry = hasDocImages
          ? {
              id: note.id,
              title: note.title,
              content: note.content,
              ...(note.tags ? { tags: note.tags } : {}),
              doc: note.doc,
              createdAt: note.createdAt,
              updatedAt: note.updatedAt
            }
          : note;

        const index = notes.findIndex((item) => item.id === note.id);
        if (index >= 0) {
          notes[index] = persistedNote;
        } else {
          notes.unshift(persistedNote);
        }
        writeNotesArray(notes);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error:
            err instanceof Error ? err.message : "Failed to save note (storage quota may be full)"
        };
      }
    },

    async deleteNote(id: string): Promise<VoidResult> {
      try {
        const notes = readNotesArray().filter((item) => item.id !== id);
        writeNotesArray(notes);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed to delete note"
        };
      }
    },

    async getTags(): Promise<Result<string[]>> {
      try {
        return { success: true, data: readTagCollection() };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed to load tags"
        };
      }
    },

    async saveTags(tags: string[]): Promise<VoidResult> {
      try {
        writeTagCollection(tags);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed to save tags"
        };
      }
    },

    async chooseLibrary(): Promise<Result<string | null>> {
      return { success: true, data: BROWSER_LIBRARY_LABEL };
    },

    async exportEntries(): Promise<VoidResult> {
      try {
        const map = readEntriesMap();
        const docsMap = readDocsMap();
        const tagsMap = readEntryTagsMap();
        const notes = readNotesArray();
        const tagCollection = readTagCollection();
        const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
        const settings = rawSettings ? (JSON.parse(rawSettings) as SettingsConfig) : null;

        const files: Array<{ name: string; content: string | Uint8Array }> = [];
        const allKeys = new Set([
          ...Object.keys(map),
          ...Object.keys(docsMap),
          ...Object.keys(tagsMap)
        ]);

        const buildDocMarkdown = (
          plainContent: string,
          doc: Record<string, unknown> | undefined,
          imgFolder: string,
          imgPrefix: string
        ): string => {
          if (doc && Array.isArray(doc.content)) {
            let imgCounter = 0;
            const lines: string[] = [];

            for (const node of doc.content as DocNodeLike[]) {
              if (node.type === "imageBlock" && Array.isArray(node.attrs?.images)) {
                for (const img of node.attrs.images) {
                  const decoded = dataUrlToUint8Array(img.dataUrl);
                  if (!decoded) continue;
                  imgCounter += 1;
                  const zipImgPath = `${imgFolder}/${imgPrefix}-${imgCounter}.${decoded.ext}`;
                  files.push({ name: zipImgPath, content: decoded.bytes });
                  lines.push(`![${img.name || "image"}](../${zipImgPath})`);
                }
              } else {
                lines.push(extractTextFromNode(node));
              }
            }

            return lines.join("\n");
          }

          return plainContent;
        };

        for (const name of Array.from(allKeys).sort()) {
          if (!name.endsWith(".md")) continue;
          const doc = docsMap[name];
          const plain = map[name] ?? "";
          const tags = tagsMap[name] ?? [];
          const baseDate = name.replace(/\.md$/, "");

          if (plain.trim() === "" && !doc && tags.length === 0) {
            continue;
          }

          const body = buildDocMarkdown(plain, doc, "images/entries", baseDate);
          const frontmatter = tags.length > 0 ? `---\ntags: [${tags.join(", ")}]\n---\n\n` : "";

          files.push({
            name: `entries/${name}`,
            content: `${frontmatter}${body}`
          });
        }

        const usedNoteFilenames = new Set<string>();
        for (const note of notes) {
          const slugBase =
            (note.title || "untitled")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")
              .slice(0, 40) || "untitled";

          let fileSlug = slugBase;
          let suffix = 1;
          while (usedNoteFilenames.has(fileSlug)) {
            suffix += 1;
            fileSlug = `${slugBase}-${suffix}`;
          }
          usedNoteFilenames.add(fileSlug);

          const noteBody = buildDocMarkdown(note.content ?? "", note.doc, "images/notes", fileSlug);
          const metaLines = [
            `title: ${JSON.stringify(note.title || "Untitled")}`,
            `createdAt: ${note.createdAt}`,
            `updatedAt: ${note.updatedAt}`
          ];
          if (note.tags && note.tags.length > 0) {
            metaLines.push(`tags: [${note.tags.join(", ")}]`);
          }
          const frontmatter = `---\n${metaLines.join("\n")}\n---\n\n`;

          files.push({
            name: `notes/${fileSlug}.md`,
            content: `${frontmatter}${noteBody}`
          });
        }

        const entriesResult = await getAllEntriesInternal();
        const compactEntries = (entriesResult.success ? entriesResult.data : []).map((entry) => {
          if (!entry.doc) return entry;
          const { images: _omit, ...rest } = entry;
          return rest;
        });

        const backupManifest = {
          exportedAt: new Date().toISOString(),
          tags: tagCollection,
          settings,
          entries: compactEntries,
          notes
        };

        files.push({
          name: "backup.json",
          content: JSON.stringify(backupManifest, null, 2)
        });

        const todayStamp = convertDateToFile(new Date())?.replace(/\.md$/, "") ?? "archive";
        const blob = buildZipBlob(files);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `journaler-backup-${todayStamp}.zip`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Export failed"
        };
      }
    }
  };
}
