import type { JournalEntry, NoteEntry } from "@shared/types/journal-entry";
import { extractTagsFromText } from "@shared/utils/tag-utils";

export interface SearchMatch {
  kind: "entry" | "note";
  date?: Date;
  noteId?: string;
  title: string;
  tags: string[];
  matchIndex: number;
  startOffset: number;
  endOffset: number;
  snippet: string;
  snippetHighlightStart: number;
  snippetHighlightEnd: number;
  sortTime: number;
}

const SNIPPET_PAD = 60;

function buildSnippet(
  content: string,
  startOffset: number,
  endOffset: number
): Pick<SearchMatch, "snippet" | "snippetHighlightStart" | "snippetHighlightEnd"> {
  const snippetStart = Math.max(0, startOffset - SNIPPET_PAD);
  const snippetEnd = Math.min(content.length, endOffset + SNIPPET_PAD);

  const prefix = snippetStart > 0 ? "…" : "";
  const suffix = snippetEnd < content.length ? "…" : "";
  const core = content.slice(snippetStart, snippetEnd);

  return {
    snippet: `${prefix}${core}${suffix}`,
    snippetHighlightStart: prefix.length + (startOffset - snippetStart),
    snippetHighlightEnd: prefix.length + (endOffset - snippetStart)
  };
}

function buildLeadSnippet(content: string, kind: "entry" | "note", hasImages: boolean): string {
  const trimmed = content.trim();
  if (!trimmed) {
    if (hasImages) {
      return kind === "note" ? "Photo note" : "Photo entry";
    }
    return kind === "note" ? "Untitled note" : "Empty entry";
  }
  return trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
}

function parseQueryAndTags(query: string): {
  hasBareHash: boolean;
  queryTags: string[];
  textNeedle: string;
} {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  let hasBareHash = false;
  const queryTags: string[] = [];
  const textParts: string[] = [];

  for (const token of tokens) {
    if (token === "#") {
      hasBareHash = true;
    } else if (token.startsWith("#") && token.length > 1) {
      queryTags.push(token.slice(1).toLowerCase());
    } else {
      textParts.push(token);
    }
  }

  return {
    hasBareHash,
    queryTags,
    textNeedle: textParts.join(" ").toLowerCase()
  };
}

function matchesTagFilters(
  itemTags: string[],
  requiredExactTag: string | null,
  hasBareHash: boolean,
  queryTags: string[]
): boolean {
  const tags = itemTags.map((t) => t.toLowerCase());
  if (hasBareHash && tags.length === 0) {
    return false;
  }
  if (requiredExactTag && !tags.includes(requiredExactTag.toLowerCase())) {
    return false;
  }
  for (const qt of queryTags) {
    if (!tags.some((t) => t.includes(qt))) {
      return false;
    }
  }
  return true;
}

export interface SearchLibraryParams {
  entries: JournalEntry[];
  notes: NoteEntry[];
  query: string;
  tagFilter?: string | null;
}

/**
 * Case-insensitive search across both journal entries and bespoke notes,
 * supporting #tag queries, bare # (all tagged items), and tag filtering.
 */
export function searchLibrary({
  entries,
  notes,
  query,
  tagFilter = null
}: SearchLibraryParams): SearchMatch[] {
  const activeTag = tagFilter && tagFilter !== "all" ? tagFilter : null;
  const { hasBareHash, queryTags, textNeedle } = parseQueryAndTags(query);

  if (!activeTag && !hasBareHash && queryTags.length === 0 && !textNeedle) {
    return [];
  }

  const matches: SearchMatch[] = [];

  const collectForItem = (item: {
    kind: "entry" | "note";
    date?: Date;
    noteId?: string;
    title: string;
    content: string;
    tags: string[];
    hasImages: boolean;
    sortTime: number;
  }) => {
    const combinedTags = Array.from(new Set([...item.tags, ...extractTagsFromText(item.content)]));

    if (!matchesTagFilters(combinedTags, activeTag, hasBareHash, queryTags)) {
      return;
    }

    if (!textNeedle) {
      matches.push({
        kind: item.kind,
        date: item.date,
        noteId: item.noteId,
        title: item.title,
        tags: combinedTags,
        matchIndex: 0,
        startOffset: 0,
        endOffset: 0,
        snippet: buildLeadSnippet(item.content, item.kind, item.hasImages),
        snippetHighlightStart: 0,
        snippetHighlightEnd: 0,
        sortTime: item.sortTime
      });
      return;
    }

    const haystack = item.content.toLowerCase();
    let from = 0;
    let matchIndex = 0;

    if (item.content.trim() !== "") {
      while (from <= haystack.length) {
        const startOffset = haystack.indexOf(textNeedle, from);
        if (startOffset === -1) break;

        const endOffset = startOffset + textNeedle.length;
        const snippetParts = buildSnippet(item.content, startOffset, endOffset);

        matches.push({
          kind: item.kind,
          date: item.date,
          noteId: item.noteId,
          title: item.title,
          tags: combinedTags,
          matchIndex,
          startOffset,
          endOffset,
          ...snippetParts,
          sortTime: item.sortTime
        });

        matchIndex += 1;
        from = startOffset + 1;
      }
    }

    // Fallback: match by tag name even if prose content didn't contain needle verbatim
    if (matchIndex === 0 && combinedTags.some((t) => t.toLowerCase().includes(textNeedle))) {
      matches.push({
        kind: item.kind,
        date: item.date,
        noteId: item.noteId,
        title: item.title,
        tags: combinedTags,
        matchIndex: 0,
        startOffset: 0,
        endOffset: 0,
        snippet: buildLeadSnippet(item.content, item.kind, item.hasImages),
        snippetHighlightStart: 0,
        snippetHighlightEnd: 0,
        sortTime: item.sortTime
      });
    }
  };

  for (const entry of entries) {
    collectForItem({
      kind: "entry",
      date: entry.date,
      title: entry.date.toDateString(),
      content: entry.content,
      tags: entry.tags ?? [],
      hasImages: (entry.images?.length ?? 0) > 0,
      sortTime: entry.date.getTime()
    });
  }

  for (const note of notes) {
    const updatedTime = new Date(note.updatedAt).getTime();
    collectForItem({
      kind: "note",
      noteId: note.id,
      title: `Note · ${note.title || "Untitled"}`,
      content: note.content,
      tags: note.tags ?? [],
      hasImages: (note.images?.length ?? 0) > 0,
      sortTime: Number.isNaN(updatedTime) ? 0 : updatedTime
    });
  }

  matches.sort((a, b) => {
    const timeDiff = b.sortTime - a.sortTime;
    if (timeDiff !== 0) return timeDiff;
    return a.startOffset - b.startOffset;
  });

  return matches;
}
