import { textToHtml } from "@/lib/utils";
import { useEditorStore } from "@/store/editor-store";
import { type JournalEntry, type JournalImage, type NoteEntry } from "@shared/types/journal-entry";
import { extractTagsFromText, normalizeTag } from "@shared/utils/tag-utils";
import { defineStore } from "pinia";
import { computed, ref, toRaw } from "vue";
import { toast } from "vue-sonner";

function deriveNoteTitle(content: string): string {
  const firstLine = content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine || "Untitled";
}

export const useJournalStore = defineStore("journal", () => {
  const current = ref<JournalEntry | null>(null);
  const allEntries = ref<JournalEntry[]>([]);

  const currentNote = ref<NoteEntry | null>(null);
  const notes = ref<NoteEntry[]>([]);

  const tagCollection = ref<string[]>([]);

  const editorStore = useEditorStore();

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelScheduledSave = () => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  };

  const extractImagesFromDoc = (doc?: Record<string, unknown>): JournalImage[] => {
    if (!doc || !Array.isArray(doc.content)) return [];
    const collected: JournalImage[] = [];

    for (const node of doc.content) {
      if (!node || typeof node !== "object") continue;
      const typedNode = node as { type?: string; attrs?: { images?: JournalImage[] } };
      if (typedNode.type === "imageBlock" && Array.isArray(typedNode.attrs?.images)) {
        collected.push(...node.attrs.images);
      }
    }

    return collected;
  };

  const syncCurrentToAllEntries = () => {
    if (!current.value) return;

    const index = allEntries.value.findIndex(
      (e) => e.date.getTime() === current.value?.date.getTime()
    );
    if (index >= 0) {
      allEntries.value[index] = current.value;
    } else {
      allEntries.value.push(current.value);
    }
  };

  const syncCurrentNoteToNotes = () => {
    if (!currentNote.value) return;

    const index = notes.value.findIndex((n) => n.id === currentNote.value?.id);
    if (index >= 0) {
      notes.value[index] = currentNote.value;
    } else {
      notes.value.unshift(currentNote.value);
    }
  };

  const rememberTags = async (tags: string[]) => {
    if (tags.length === 0) return;

    const merged = new Set(tagCollection.value);
    let changed = false;

    for (const raw of tags) {
      const normalized = normalizeTag(raw);
      if (normalized && !merged.has(normalized)) {
        merged.add(normalized);
        changed = true;
      }
    }

    if (changed) {
      tagCollection.value = Array.from(merged).sort((a, b) => a.localeCompare(b));
      await window.ipcRenderer?.saveTags(tagCollection.value);
    }
  };

  const loadTags = async () => {
    if (!window.ipcRenderer) return;
    const result = await window.ipcRenderer.getTags();
    const collected = new Set<string>(result.success ? result.data : []);

    for (const entry of allEntries.value) {
      for (const tag of extractTagsFromText(entry.content)) collected.add(tag);
      for (const tag of entry.tags ?? []) collected.add(tag);
    }
    for (const note of notes.value) {
      for (const tag of extractTagsFromText(note.content)) collected.add(tag);
      for (const tag of note.tags ?? []) collected.add(tag);
    }

    tagCollection.value = Array.from(collected).sort((a, b) => a.localeCompare(b));
  };

  const activeTags = computed<string[]>(() => {
    if (currentNote.value) {
      return currentNote.value.tags ?? [];
    }
    return current.value?.tags ?? [];
  });

  const allTags = computed<string[]>(() => {
    const tagSet = new Set<string>(tagCollection.value);
    for (const entry of allEntries.value) {
      for (const tag of entry.tags ?? []) tagSet.add(tag);
    }
    for (const tag of current.value?.tags ?? []) tagSet.add(tag);
    for (const note of notes.value) {
      for (const tag of note.tags ?? []) tagSet.add(tag);
    }
    for (const tag of currentNote.value?.tags ?? []) tagSet.add(tag);
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  });

  const setCurrent = (entry: JournalEntry | null) => {
    if (!entry) {
      current.value = null;
      return;
    }

    currentNote.value = null;
    const images = entry.doc ? extractImagesFromDoc(entry.doc) : (entry.images ?? []);
    const parsedTags = extractTagsFromText(entry.content);
    const mergedTags = Array.from(new Set([...(entry.tags ?? []), ...parsedTags]));

    current.value = {
      ...entry,
      tags: mergedTags,
      images
    };

    if (mergedTags.length > 0) {
      void rememberTags(mergedTags);
    }

    // Sync editor content when current entry changes
    if (entry.doc) {
      editorStore.setContent(entry.doc);
    } else {
      const htmlContent = textToHtml(entry.content);
      editorStore.setContent(htmlContent);
    }
  };

  const saveCurrent = async () => {
    cancelScheduledSave();

    if (!window.ipcRenderer) return;

    if (currentNote.value) {
      const rawNote = toRaw(currentNote.value);
      const tags = extractTagsFromText(rawNote.content);
      currentNote.value.tags = tags;
      await rememberTags(tags);

      const rawDoc = rawNote.doc
        ? (JSON.parse(JSON.stringify(toRaw(rawNote.doc))) as Record<string, unknown>)
        : undefined;
      const docImages = rawDoc ? extractImagesFromDoc(rawDoc) : [];
      const payload: NoteEntry = {
        id: rawNote.id,
        title: rawNote.title,
        content: rawNote.content,
        tags,
        // Avoid duplicating base64 image payloads when doc already stores them
        ...(docImages.length === 0 && (rawNote.images?.length ?? 0) > 0
          ? { images: (rawNote.images ?? []).map((img) => ({ ...toRaw(img) })) }
          : {}),
        ...(rawDoc ? { doc: rawDoc } : {}),
        createdAt: rawNote.createdAt,
        updatedAt: rawNote.updatedAt,
        ...(rawNote.archivedAt ? { archivedAt: rawNote.archivedAt } : {})
      };

      const result = await window.ipcRenderer.saveNote(payload);
      if (result && !result.success) {
        toast.error("Could not save note", {
          description: result.error || "Storage limit reached"
        });
      }
      return result;
    }

    if (current.value) {
      const rawEntry = toRaw(current.value);
      const tags = extractTagsFromText(rawEntry.content);
      current.value.tags = tags;
      await rememberTags(tags);

      const rawDoc = rawEntry.doc
        ? (JSON.parse(JSON.stringify(toRaw(rawEntry.doc))) as Record<string, unknown>)
        : undefined;
      const payload: JournalEntry = {
        date: rawEntry.date,
        content: rawEntry.content,
        tags,
        images: (rawEntry.images ?? []).map((img) => ({ ...toRaw(img) })),
        ...(rawDoc ? { doc: rawDoc } : {})
      };

      const result = await window.ipcRenderer.saveEntry(payload);

      if (result && !result.success) {
        toast.error("Could not save entry", {
          description: result.error || "Storage limit reached"
        });
      }

      return result;
    }
  };

  const scheduleSave = () => {
    cancelScheduledSave();
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void saveCurrent();
    }, 1000);
  };

  const flushPendingSave = () => {
    if (saveTimer !== null) {
      void saveCurrent();
    }
  };

  const docHasStructuralBlocks = (doc?: Record<string, unknown>): boolean => {
    if (!doc || !Array.isArray(doc.content)) return false;
    return (doc.content as Array<{ type?: unknown }>).some(
      (node) => node?.type === "horizontalRule" || node?.type === "imageBlock"
    );
  };

  const updateContent = (
    content: string,
    doc?: Record<string, unknown>,
    activePartialTag?: string | null
  ) => {
    // TipTap's getText() adds a newline after each block element
    // Remove the trailing newline and normalize double newlines to single
    const normalizedContent = content.replace(/\n$/, "").replace(/\n\n/g, "\n");

    const extractedTags = extractTagsFromText(normalizedContent);
    const completedTags = activePartialTag
      ? extractedTags.filter((tag) => tag !== activePartialTag)
      : extractedTags;

    if (completedTags.length > 0) {
      void rememberTags(completedTags);
    }

    if (currentNote.value) {
      currentNote.value.content = normalizedContent;
      currentNote.value.title = deriveNoteTitle(normalizedContent);
      currentNote.value.tags = extractedTags;
      currentNote.value.updatedAt = new Date().toISOString();

      if (doc) {
        const images = extractImagesFromDoc(doc);
        const hasBlocks = docHasStructuralBlocks(doc);
        currentNote.value.images = images;
        currentNote.value.doc =
          normalizedContent !== "" || images.length > 0 || hasBlocks ? doc : undefined;
      }

      syncCurrentNoteToNotes();
      scheduleSave();
      return;
    }

    if (current.value) {
      current.value.content = normalizedContent;
      current.value.tags = extractedTags;

      if (doc) {
        const images = extractImagesFromDoc(doc);
        const hasBlocks = docHasStructuralBlocks(doc);
        current.value.images = images;
        current.value.doc =
          normalizedContent !== "" || images.length > 0 || hasBlocks ? doc : undefined;
      }

      syncCurrentToAllEntries();
      scheduleSave();
    }
  };

  const getEntry = async (date: Date) => {
    if (window.ipcRenderer) {
      await saveCurrent();
      const result = await window.ipcRenderer.getEntry(date);

      if (result.success) {
        setCurrent(result.data);
      }
    }
  };

  const getPreviousEntry = async () => {
    if (window.ipcRenderer && current.value) {
      await saveCurrent();
      const result = await window.ipcRenderer.getPreviousEntry(current.value.date);

      if (result.success) {
        setCurrent(result.data);
      }
    }
  };

  const getNextEntry = async () => {
    if (window.ipcRenderer && current.value) {
      await saveCurrent();
      const result = await window.ipcRenderer.getNextEntry(current.value.date);

      if (result.success) {
        setCurrent(result.data);
      }
    }
  };

  const loadNotes = async () => {
    if (window.ipcRenderer) {
      const result = await window.ipcRenderer.getNotes();
      if (result.success) {
        notes.value = result.data.map((note) => {
          const parsedTags = extractTagsFromText(note.content);
          const mergedTags = Array.from(new Set([...(note.tags ?? []), ...parsedTags]));
          const images = note.doc ? extractImagesFromDoc(note.doc) : (note.images ?? []);
          return { ...note, tags: mergedTags, images };
        });
      }
    }
  };

  const openNote = async (id: string) => {
    await saveCurrent();
    const found = notes.value.find((n) => n.id === id);
    if (!found) return;

    current.value = null;
    const images = found.doc ? extractImagesFromDoc(found.doc) : (found.images ?? []);
    const parsedTags = extractTagsFromText(found.content);
    const mergedTags = Array.from(new Set([...(found.tags ?? []), ...parsedTags]));

    currentNote.value = {
      ...found,
      tags: mergedTags,
      images
    };

    if (mergedTags.length > 0) {
      void rememberTags(mergedTags);
    }

    if (found.doc) {
      editorStore.setContent(found.doc);
    } else {
      editorStore.setContent(textToHtml(found.content));
    }
  };

  const createNote = async (initialTag?: string) => {
    await saveCurrent();

    const now = new Date().toISOString();
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const normalizedInitialTag = initialTag ? normalizeTag(initialTag) : "";
    const initialContent = normalizedInitialTag ? `#${normalizedInitialTag} ` : "";
    const newNote: NoteEntry = {
      id,
      title: normalizedInitialTag ? `#${normalizedInitialTag}` : "Untitled",
      content: initialContent,
      tags: normalizedInitialTag ? [normalizedInitialTag] : [],
      images: [],
      createdAt: now,
      updatedAt: now
    };

    notes.value.unshift(newNote);
    current.value = null;
    currentNote.value = newNote;
    editorStore.setContent(textToHtml(initialContent));
    editorStore.requestFocus();

    if (window.ipcRenderer) {
      await window.ipcRenderer.saveNote(newNote);
    }
  };

  const activeNotes = computed(() => notes.value.filter((n) => !n.archivedAt));

  const archivedNotes = computed(() => {
    return notes.value
      .filter((n) => Boolean(n.archivedAt))
      .sort(
        (a, b) =>
          new Date(b.archivedAt ?? b.updatedAt).getTime() -
          new Date(a.archivedAt ?? a.updatedAt).getTime()
      );
  });

  const persistNoteEntry = async (note: NoteEntry) => {
    if (!window.ipcRenderer) return;
    const rawNote = toRaw(note);
    const rawDoc = rawNote.doc
      ? (JSON.parse(JSON.stringify(toRaw(rawNote.doc))) as Record<string, unknown>)
      : undefined;
    const docImages = rawDoc ? extractImagesFromDoc(rawDoc) : [];
    const payload: NoteEntry = {
      id: rawNote.id,
      title: rawNote.title,
      content: rawNote.content,
      tags: rawNote.tags ?? [],
      ...(docImages.length === 0 && (rawNote.images?.length ?? 0) > 0
        ? { images: (rawNote.images ?? []).map((img) => ({ ...toRaw(img) })) }
        : {}),
      ...(rawDoc ? { doc: rawDoc } : {}),
      createdAt: rawNote.createdAt,
      updatedAt: rawNote.updatedAt,
      ...(rawNote.archivedAt ? { archivedAt: rawNote.archivedAt } : {})
    };
    const result = await window.ipcRenderer.saveNote(payload);
    if (result && !result.success) {
      toast.error("Could not update note", {
        description: result.error || "Storage limit reached"
      });
    }
  };

  const archiveNote = async (id: string) => {
    const index = notes.value.findIndex((n) => n.id === id);
    if (index < 0) return;

    const wasActive = currentNote.value?.id === id;
    if (wasActive) {
      await saveCurrent();
    }

    const archivedAt = new Date().toISOString();
    const target = notes.value[index];
    if (!target) return;
    const updated: NoteEntry = { ...target, archivedAt };
    notes.value[index] = updated;

    if (wasActive && currentNote.value) {
      currentNote.value.archivedAt = archivedAt;
    }

    await persistNoteEntry(updated);

    if (wasActive) {
      currentNote.value = null;
      const nextNote = activeNotes.value[0];
      if (nextNote) {
        await openNote(nextNote.id);
      } else {
        await getEntry(new Date());
      }
    }
  };

  const unarchiveNote = async (id: string) => {
    const index = notes.value.findIndex((n) => n.id === id);
    if (index < 0) return;

    const target = notes.value[index];
    if (!target) return;
    const { archivedAt: _omit, ...rest } = target;
    const updated: NoteEntry = { ...rest };
    notes.value[index] = updated;

    if (currentNote.value?.id === id) {
      delete currentNote.value.archivedAt;
    }

    await persistNoteEntry(updated);
  };

  const deleteNote = async (id: string) => {
    const wasActive = currentNote.value?.id === id;
    if (wasActive) {
      cancelScheduledSave();
    }
    const target = notes.value.find((n) => n.id === id);
    const wasArchived = Boolean(target?.archivedAt);
    notes.value = notes.value.filter((n) => n.id !== id);

    if (window.ipcRenderer) {
      await window.ipcRenderer.deleteNote(id);
    }

    if (wasActive) {
      currentNote.value = null;
      const pool = wasArchived ? archivedNotes.value : activeNotes.value;
      const nextNote = pool[0] ?? activeNotes.value[0];
      if (nextNote) {
        await openNote(nextNote.id);
      } else {
        await getEntry(new Date());
      }
    }
  };

  const setAllEntries = (entries: JournalEntry[] | null) => {
    allEntries.value = (entries ?? []).map((entry) => {
      const parsedTags = extractTagsFromText(entry.content);
      const mergedTags = Array.from(new Set([...(entry.tags ?? []), ...parsedTags]));
      return { ...entry, tags: mergedTags };
    });
  };

  const getAllEntries = async () => {
    if (window.ipcRenderer) {
      const result = await window.ipcRenderer.getEntries();

      if (result.success) {
        setAllEntries(result.data);
      }
    }
  };

  const rescanLibrary = async () => {
    if (window.ipcRenderer) {
      await getAllEntries();
      await loadNotes();
      await loadTags();
      await getEntry(new Date());
    }
  };

  return {
    current,
    setCurrent,
    currentNote,
    notes,
    activeNotes,
    archivedNotes,
    loadNotes,
    openNote,
    createNote,
    archiveNote,
    unarchiveNote,
    deleteNote,
    tagCollection,
    loadTags,
    rememberTags,
    activeTags,
    allTags,
    updateContent,
    saveCurrent,
    flushPendingSave,
    getEntry,
    getPreviousEntry,
    getNextEntry,
    allEntries,
    getAllEntries,
    rescanLibrary
  };
});
