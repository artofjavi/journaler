import type { JournalEntry, JournalImage, NoteEntry } from "../types/journal-entry";
import { convertDateToFile } from "./date-utils";
import { extractTagsFromText } from "./tag-utils";

export type DigestRangePreset = "all" | "this-year" | "last-90" | "last-30" | "custom";

export interface DigestExportOptions {
  preset: DigestRangePreset;
  startDate?: string;
  endDate?: string;
}

interface TipTapMark {
  type?: string;
  attrs?: Record<string, unknown>;
}

interface TipTapNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: TipTapMark[];
  content?: TipTapNode[];
}

export interface ResolvedDigestRange {
  preset: DigestRangePreset;
  label: string;
  fileSuffix: string;
  startDate: Date | null;
  endDate: Date | null;
  startIso: string | null;
  endIso: string | null;
}

function parseYmdLocal(ymd: string | undefined): Date | null {
  if (!ymd) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);

  if (parsed.getFullYear() !== year || parsed.getMonth() !== month || parsed.getDate() !== day) {
    return null;
  }

  return parsed;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function formatYmd(date: Date): string {
  return convertDateToFile(date)?.replace(/\.md$/, "") ?? "";
}

export function resolveDigestRange(
  options: DigestExportOptions,
  now: Date = new Date()
): ResolvedDigestRange {
  const todayEnd = endOfDay(now);
  const todayStart = startOfDay(now);

  switch (options.preset) {
    case "this-year": {
      const jan1 = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      return {
        preset: "this-year",
        label: `This Year (${now.getFullYear()})`,
        fileSuffix: `${now.getFullYear()}`,
        startDate: jan1,
        endDate: todayEnd,
        startIso: formatYmd(jan1),
        endIso: formatYmd(todayStart)
      };
    }

    case "last-90": {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 89);
      return {
        preset: "last-90",
        label: "Last 90 Days",
        fileSuffix: "last-90-days",
        startDate: start,
        endDate: todayEnd,
        startIso: formatYmd(start),
        endIso: formatYmd(todayStart)
      };
    }

    case "last-30": {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 29);
      return {
        preset: "last-30",
        label: "Last 30 Days",
        fileSuffix: "last-30-days",
        startDate: start,
        endDate: todayEnd,
        startIso: formatYmd(start),
        endIso: formatYmd(todayStart)
      };
    }

    case "custom": {
      let start = parseYmdLocal(options.startDate);
      let end = parseYmdLocal(options.endDate);

      if (start && end && start.getTime() > end.getTime()) {
        const swap = start;
        start = end;
        end = swap;
      }

      const startIso = start ? formatYmd(start) : null;
      const endIso = end ? formatYmd(end) : null;

      let label = "Custom Range";
      let fileSuffix = "custom";
      if (startIso && endIso) {
        label = `${startIso} to ${endIso}`;
        fileSuffix = `${startIso}-to-${endIso}`;
      } else if (startIso) {
        label = `From ${startIso}`;
        fileSuffix = `from-${startIso}`;
      } else if (endIso) {
        label = `Up to ${endIso}`;
        fileSuffix = `until-${endIso}`;
      }

      return {
        preset: "custom",
        label,
        fileSuffix,
        startDate: start ? startOfDay(start) : null,
        endDate: end ? endOfDay(end) : null,
        startIso,
        endIso
      };
    }

    case "all":
    default:
      return {
        preset: "all",
        label: "All Time",
        fileSuffix: "all",
        startDate: null,
        endDate: null,
        startIso: null,
        endIso: null
      };
  }
}

export function getDigestFilename(options: DigestExportOptions, now: Date = new Date()): string {
  const range = resolveDigestRange(options, now);
  return `journaler-digest-${range.fileSuffix}.md`;
}

function isDateInRange(date: Date, range: ResolvedDigestRange): boolean {
  const time = date.getTime();
  if (Number.isNaN(time)) return false;
  if (range.startDate && time < range.startDate.getTime()) return false;
  if (range.endDate && time > range.endDate.getTime()) return false;
  return true;
}

function getImagesFromDoc(doc?: Record<string, unknown>): JournalImage[] {
  if (!doc || !Array.isArray(doc.content)) return [];
  const collected: JournalImage[] = [];

  for (const node of doc.content as TipTapNode[]) {
    if (node?.type === "imageBlock" && Array.isArray(node.attrs?.images)) {
      collected.push(...(node.attrs.images as JournalImage[]));
    }
  }

  return collected;
}

function renderInlineNodes(nodes?: TipTapNode[]): string {
  if (!Array.isArray(nodes)) return "";

  return nodes
    .map((node) => {
      if (node.type === "hardBreak") {
        return "\n";
      }

      if (node.type !== "text" || typeof node.text !== "string") {
        return renderInlineNodes(node.content);
      }

      let out = node.text;
      const marks = Array.isArray(node.marks) ? node.marks : [];

      for (const mark of marks) {
        switch (mark.type) {
          case "code":
            out = `\`${out}\``;
            break;
          case "bold":
            out = `**${out}**`;
            break;
          case "italic":
            out = `*${out}*`;
            break;
          case "strike":
            out = `~~${out}~~`;
            break;
          case "underline":
            out = `<u>${out}</u>`;
            break;
          case "link": {
            const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
            if (href && href !== out) {
              out = `[${out}](${href})`;
            }
            break;
          }
          default:
            break;
        }
      }

      return out;
    })
    .join("");
}

function renderImagePlaceholder(images: JournalImage[]): string {
  if (images.length === 0) return "";
  const names = images
    .map((img, i) => (img.name && img.name.trim() ? img.name.trim() : `photo-${i + 1}`))
    .join(", ");
  return images.length === 1
    ? `[Photo attached: ${names}]`
    : `[${images.length} photos attached: ${names}]`;
}

function renderBlockNodes(nodes?: TipTapNode[]): string {
  if (!Array.isArray(nodes)) return "";

  const blocks: string[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case "paragraph": {
        blocks.push(renderInlineNodes(node.content));
        break;
      }
      case "heading": {
        const level = Math.min(Math.max(Number(node.attrs?.level ?? 2), 1), 6);
        const hashes = "#".repeat(level);
        blocks.push(`${hashes} ${renderInlineNodes(node.content)}`);
        break;
      }
      case "blockquote": {
        const inner = renderBlockNodes(node.content);
        const quoted = inner
          .split("\n")
          .map((line) => (line.trim() === "" ? ">" : `> ${line}`))
          .join("\n");
        blocks.push(quoted);
        break;
      }
      case "bulletList": {
        const items = Array.isArray(node.content) ? node.content : [];
        const lines = items.map((item) => {
          const text = renderBlockNodes(item.content).replace(/\n+/g, "\n  ");
          return `- ${text}`;
        });
        blocks.push(lines.join("\n"));
        break;
      }
      case "orderedList": {
        const items = Array.isArray(node.content) ? node.content : [];
        const start = Number(node.attrs?.start ?? 1);
        const lines = items.map((item, idx) => {
          const text = renderBlockNodes(item.content).replace(/\n+/g, "\n   ");
          return `${start + idx}. ${text}`;
        });
        blocks.push(lines.join("\n"));
        break;
      }
      case "codeBlock": {
        const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
        const codeText = renderInlineNodes(node.content);
        blocks.push(`\`\`\`${lang}\n${codeText}\n\`\`\``);
        break;
      }
      case "horizontalRule": {
        blocks.push("---");
        break;
      }
      case "imageBlock": {
        const imgs = Array.isArray(node.attrs?.images) ? (node.attrs.images as JournalImage[]) : [];
        const placeholder = renderImagePlaceholder(imgs);
        if (placeholder) blocks.push(placeholder);
        break;
      }
      default: {
        const fallback = renderInlineNodes(node.content);
        if (fallback) blocks.push(fallback);
        break;
      }
    }
  }

  return blocks.join("\n\n").trim();
}

function docToMarkdown(
  doc: Record<string, unknown> | undefined,
  plainContent: string,
  fallbackImages: JournalImage[]
): string {
  if (doc && Array.isArray(doc.content)) {
    const rendered = renderBlockNodes(doc.content as TipTapNode[]);
    if (rendered) return rendered;
  }

  const trimmed = plainContent.trim();
  const placeholder = renderImagePlaceholder(fallbackImages);
  if (trimmed && placeholder) return `${trimmed}\n\n${placeholder}`;
  return trimmed || placeholder || "_(No text)_";
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function formatWeekday(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function formatShortIso(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatYmd(d);
}

export interface BuildDigestParams {
  entries: JournalEntry[];
  notes: NoteEntry[];
  options: DigestExportOptions;
  now?: Date;
}

export interface BuiltDigest {
  markdown: string;
  filename: string;
  entryCount: number;
  noteCount: number;
}

export function buildJournalDigest({
  entries,
  notes,
  options,
  now = new Date()
}: BuildDigestParams): BuiltDigest {
  const range = resolveDigestRange(options, now);
  const filename = getDigestFilename(options, now);

  const filteredEntries = entries
    .map((entry) => ({
      ...entry,
      date: entry.date instanceof Date ? entry.date : new Date(entry.date)
    }))
    .filter((entry) => isDateInRange(entry.date, range))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const filteredNotes = notes
    .filter((note) => {
      if (range.preset === "all") return true;
      const updated = new Date(note.updatedAt);
      const created = new Date(note.createdAt);
      const archived = note.archivedAt ? new Date(note.archivedAt) : null;
      return (
        isDateInRange(updated, range) ||
        isDateInRange(created, range) ||
        (archived !== null && isDateInRange(archived, range))
      );
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  let totalEntryWords = 0;
  let totalPhotoDays = 0;
  let totalPhotos = 0;

  const monthlyStats = new Map<
    string,
    { entries: number; words: number; photoDays: number; photos: number }
  >();

  const tagCounts = new Map<string, { entries: number; notes: number }>();

  const normalizedEntries = filteredEntries.map((entry) => {
    const ymd = formatYmd(entry.date);
    const monthKey = ymd.slice(0, 7);
    const docImages = getImagesFromDoc(entry.doc);
    const images = docImages.length > 0 ? docImages : (entry.images ?? []);
    const photoCount = images.length;
    const words = countWords(entry.content);
    const mergedTags = Array.from(
      new Set([...(entry.tags ?? []), ...extractTagsFromText(entry.content)])
    ).sort((a, b) => a.localeCompare(b));

    totalEntryWords += words;
    totalPhotos += photoCount;
    if (photoCount > 0) totalPhotoDays += 1;

    const m = monthlyStats.get(monthKey) ?? { entries: 0, words: 0, photoDays: 0, photos: 0 };
    m.entries += 1;
    m.words += words;
    m.photos += photoCount;
    if (photoCount > 0) m.photoDays += 1;
    monthlyStats.set(monthKey, m);

    for (const tag of mergedTags) {
      const t = tagCounts.get(tag) ?? { entries: 0, notes: 0 };
      t.entries += 1;
      tagCounts.set(tag, t);
    }

    return {
      ymd,
      weekday: formatWeekday(entry.date),
      tags: mergedTags,
      images,
      photoCount,
      words,
      body: docToMarkdown(entry.doc, entry.content, images)
    };
  });

  const normalizedNotes = filteredNotes.map((note) => {
    const docImages = getImagesFromDoc(note.doc);
    const images = docImages.length > 0 ? docImages : (note.images ?? []);
    const photoCount = images.length;
    const words = countWords(note.content);
    const mergedTags = Array.from(
      new Set([...(note.tags ?? []), ...extractTagsFromText(note.content)])
    ).sort((a, b) => a.localeCompare(b));

    for (const tag of mergedTags) {
      const t = tagCounts.get(tag) ?? { entries: 0, notes: 0 };
      t.notes += 1;
      tagCounts.set(tag, t);
    }

    return {
      title: note.title || "Untitled",
      status: note.archivedAt ? "Archived" : "Active",
      created: formatShortIso(note.createdAt),
      updated: formatShortIso(note.updatedAt),
      archived: note.archivedAt ? formatShortIso(note.archivedAt) : null,
      tags: mergedTags,
      photoCount,
      words,
      body: docToMarkdown(note.doc, note.content, images)
    };
  });

  const activeNotesCount = normalizedNotes.filter((n) => n.status === "Active").length;
  const archivedNotesCount = normalizedNotes.filter((n) => n.status === "Archived").length;

  const lines: string[] = [
    "---",
    `format: journaler-digest-v1`,
    `generatedAt: ${now.toISOString()}`,
    `range: ${JSON.stringify(range.label)}`,
    ...(range.startIso ? [`startDate: ${range.startIso}`] : []),
    ...(range.endIso ? [`endDate: ${range.endIso}`] : []),
    `totalEntries: ${normalizedEntries.length}`,
    `totalEntryWords: ${totalEntryWords}`,
    `totalPhotoDays: ${totalPhotoDays}`,
    `totalPhotos: ${totalPhotos}`,
    `totalNotes: ${normalizedNotes.length}`,
    `activeNotes: ${activeNotesCount}`,
    `archivedNotes: ${archivedNotesCount}`,
    `uniqueTags: ${tagCounts.size}`,
    "---",
    "",
    `# Journaler Digest (${range.label})`,
    "",
    "This file is a plain-text summary of journal entries, notes, tags, and photo counts (image payloads omitted).",
    "",
    "## Summary Counts",
    "",
    `- **Date Range:** ${range.label}`,
    `- **Daily Entries:** ${normalizedEntries.length} (${totalEntryWords.toLocaleString("en-US")} words)`,
    `- **Days with Photos:** ${totalPhotoDays} (${totalPhotos} total photos attached)`,
    `- **Notes:** ${normalizedNotes.length} (${activeNotesCount} active, ${archivedNotesCount} archived)`,
    `- **Unique Tags:** ${tagCounts.size}`
  ];

  if (monthlyStats.size > 0) {
    lines.push(
      "",
      "### Monthly Breakdown",
      "",
      "| Month | Entries | Words | Photo Days | Photos |",
      "| --- | ---: | ---: | ---: | ---: |"
    );
    for (const [month, stats] of Array.from(monthlyStats.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    )) {
      lines.push(
        `| ${month} | ${stats.entries} | ${stats.words} | ${stats.photoDays} | ${stats.photos} |`
      );
    }
  }

  if (tagCounts.size > 0) {
    lines.push(
      "",
      "### Tag Frequency",
      "",
      "| Tag | Entry Count | Note Count | Total |",
      "| --- | ---: | ---: | ---: |"
    );
    const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => {
      const totalDiff = b[1].entries + b[1].notes - (a[1].entries + a[1].notes);
      if (totalDiff !== 0) return totalDiff;
      return a[0].localeCompare(b[0]);
    });
    for (const [tag, counts] of sortedTags) {
      lines.push(
        `| #${tag} | ${counts.entries} | ${counts.notes} | ${counts.entries + counts.notes} |`
      );
    }
  }

  lines.push("", "## Daily Entries");

  if (normalizedEntries.length === 0) {
    lines.push("", "_No daily entries in this date range._");
  } else {
    for (const entry of normalizedEntries) {
      const metaParts = [
        `Words: ${entry.words}`,
        `Photos: ${entry.photoCount}`,
        ...(entry.tags.length > 0 ? [`Tags: ${entry.tags.map((t) => `#${t}`).join(", ")}`] : [])
      ];
      lines.push(
        "",
        `### ${entry.ymd} (${entry.weekday})`,
        `_${metaParts.join(" | ")}_`,
        "",
        entry.body
      );
    }
  }

  lines.push("", "## Notes");

  if (normalizedNotes.length === 0) {
    lines.push("", "_No notes in this date range._");
  } else {
    for (const note of normalizedNotes) {
      const metaParts = [
        `Status: ${note.status}`,
        `Created: ${note.created}`,
        `Updated: ${note.updated}`,
        ...(note.archived ? [`Archived: ${note.archived}`] : []),
        `Words: ${note.words}`,
        `Photos: ${note.photoCount}`,
        ...(note.tags.length > 0 ? [`Tags: ${note.tags.map((t) => `#${t}`).join(", ")}`] : [])
      ];
      lines.push("", `### ${note.title}`, `_${metaParts.join(" | ")}_`, "", note.body);
    }
  }

  lines.push("");

  return {
    markdown: lines.join("\n"),
    filename,
    entryCount: normalizedEntries.length,
    noteCount: normalizedNotes.length
  };
}
