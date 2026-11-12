import { GEIST_FONT_BASE64 } from "./geist-font-base64";
import { JournalEntry, JournalImage, NoteEntry } from "@shared/types/journal-entry";
import { Result, VoidResult } from "@shared/types/result";
import { SettingsConfig } from "@shared/types/settings-config";
import { convertDateToFile } from "@shared/utils/date-utils";
import archiver from "archiver";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

interface DocNodeLike {
  type?: string;
  text?: string;
  attrs?: { images?: JournalImage[] };
  content?: DocNodeLike[];
}

interface EntrySidecar {
  content?: string;
  tags?: string[];
  images?: JournalImage[];
  doc?: Record<string, unknown>;
}

function normalizeLocalDate(date: Date | string): Date {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; ext: string } | null {
  const match = /^data:([^,;]+)(?:;([^,]+))?,(.+)$/.exec(dataUrl);
  if (!match) return null;

  const mime = match[1] ?? "image/jpeg";
  const encoding = match[2] ?? "";
  const payload = match[3] ?? "";

  const buffer = encoding.toLowerCase().includes("base64")
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf-8");

  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg"
  };

  return { buffer, ext: extMap[mime] ?? "jpg" };
}

function parseEntryDateFromFileName(fileName: string): Date | null {
  if (!fileName.endsWith(".md") && !fileName.endsWith(".json")) return null;
  const dateString = fileName.replace(/\.(md|json)$/, "");
  const dateParts = dateString.split("-");

  if (dateParts.length !== 3) {
    return null;
  }

  const year = parseInt(dateParts[0] ?? "", 10);
  const month = parseInt(dateParts[1] ?? "", 10) - 1;
  const day = parseInt(dateParts[2] ?? "", 10);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }

  return new Date(year, month, day);
}

export class FileService {
  private rootPath: string;
  private settingsPath: string;

  constructor(rootPath: string, settingsPath: string) {
    this.rootPath = path.normalize(rootPath);
    this.settingsPath = path.normalize(settingsPath);
  }

  updateRootPath(newRootPath: string) {
    this.rootPath = path.normalize(newRootPath);
  }

  private getFileFolderPath(): string {
    return this.rootPath;
  }

  private getSettingsPath(): string {
    return this.settingsPath;
  }

  private getMetaPath(...segments: string[]): string {
    return path.join(this.rootPath, ".journaler", ...segments);
  }

  private getEntrySidecarPath(mdFileName: string): string {
    const baseName = mdFileName.replace(/\.md$/, "");
    const safeName = path.basename(baseName);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safeName)) {
      throw new Error("Invalid entry filename");
    }
    return this.getMetaPath("entries", `${safeName}.json`);
  }

  private getNoteFilePath(id: string): string {
    const safeId = path.basename(id);
    if (!safeId || safeId !== id || !/^[a-zA-Z0-9_-]+$/.test(safeId)) {
      throw new Error("Invalid note id");
    }
    return this.getMetaPath("notes", `${safeId}.json`);
  }

  private getFilePath(fileName?: string): string {
    const journalerPath = this.getFileFolderPath();

    if (!fileName) {
      return journalerPath;
    }

    const normalizedFileName = path.normalize(fileName);
    const fullPath = path.join(journalerPath, normalizedFileName);
    const relativePath = path.relative(journalerPath, fullPath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new Error("Invalid file name: directory traversal detected");
    }

    return fullPath;
  }

  private async readEntrySidecar(mdFileName: string): Promise<EntrySidecar | null> {
    try {
      const sidecarPath = this.getEntrySidecarPath(mdFileName);
      const raw = await fsPromises.readFile(sidecarPath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as EntrySidecar)
        : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async createDirectory(): Promise<VoidResult> {
    try {
      await fsPromises.mkdir(this.getFilePath(), { recursive: true });

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async deleteDirectory(): Promise<VoidResult> {
    try {
      await fsPromises.rm(this.getFilePath(), { recursive: true, force: true });

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async checkFileExists(fileName: string) {
    try {
      await fsPromises.access(this.getFilePath(fileName));

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async readAllFiles(): Promise<Result<string[]>> {
    try {
      await this.createDirectory();
      const files = await fsPromises.readdir(this.getFilePath());

      return {
        success: true,
        data: files
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async readAllEntries(): Promise<Result<JournalEntry[]>> {
    try {
      const filesResult = await this.readAllFiles();

      if (!filesResult.success) {
        return filesResult;
      }

      let sidecarFiles: string[] = [];
      try {
        sidecarFiles = await fsPromises.readdir(this.getMetaPath("entries"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      const mdKeys = new Set<string>();
      for (const fileName of filesResult.data) {
        if (fileName.endsWith(".md") && parseEntryDateFromFileName(fileName)) {
          mdKeys.add(fileName);
        }
      }
      for (const sidecarFile of sidecarFiles) {
        if (sidecarFile.endsWith(".json") && parseEntryDateFromFileName(sidecarFile)) {
          mdKeys.add(sidecarFile.replace(/\.json$/, ".md"));
        }
      }

      const entries: JournalEntry[] = [];

      for (const fileName of Array.from(mdKeys)) {
        const date = parseEntryDateFromFileName(fileName);
        if (!date) continue;

        const [contentResult, sidecar] = await Promise.all([
          this.readFile(fileName),
          this.readEntrySidecar(fileName)
        ]);

        const content = contentResult.success ? contentResult.data : (sidecar?.content ?? "");
        const doc = sidecar?.doc;
        const images = doc ? extractImagesFromDoc(doc) : (sidecar?.images ?? []);
        const tags = sidecar?.tags ?? [];

        if (content === "" && images.length === 0 && tags.length === 0) {
          continue;
        }

        entries.push({
          date,
          content,
          ...(tags.length > 0 ? { tags } : {}),
          ...(images.length > 0 ? { images } : {}),
          ...(doc ? { doc } : {})
        });
      }

      return {
        success: true,
        data: entries
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async readFile(fileName: string): Promise<Result<string>> {
    try {
      const content = await fsPromises.readFile(this.getFilePath(fileName), "utf-8");

      return {
        success: true,
        data: content
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async writeFile(fileName: string, contents: string): Promise<VoidResult> {
    try {
      const directoryResult = await this.createDirectory();

      if (!directoryResult.success) {
        return directoryResult;
      }

      await fsPromises.writeFile(this.getFilePath(fileName), contents, "utf-8");

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async deleteFile(fileName: string): Promise<VoidResult> {
    try {
      await fsPromises.unlink(this.getFilePath(fileName));

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async saveSettings(settings: SettingsConfig): Promise<VoidResult> {
    try {
      const filePath = this.getSettingsPath();
      const dirPath = path.dirname(filePath);

      await fsPromises.mkdir(dirPath, { recursive: true });
      await fsPromises.writeFile(filePath, JSON.stringify(settings, null, 2), "utf8");

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async loadSettings(): Promise<Result<SettingsConfig | null>> {
    try {
      const filePath = this.getSettingsPath();

      try {
        const fileContents = await fsPromises.readFile(filePath, "utf8");
        const data = JSON.parse(fileContents);

        return { success: true, data };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { success: true, data: null };
        }

        throw error;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";

      return { success: false, error: errorMessage };
    }
  }

  async getEntry(date: Date | string): Promise<Result<JournalEntry>> {
    try {
      const normalized = normalizeLocalDate(date);
      const fileName = convertDateToFile(normalized);

      if (!fileName) {
        return {
          success: false,
          error: "Data received is not a Date"
        };
      }

      const [exists, sidecar] = await Promise.all([
        this.checkFileExists(fileName),
        this.readEntrySidecar(fileName)
      ]);

      let content = sidecar?.content ?? "";
      if (exists.success) {
        const readResult = await this.readFile(fileName);
        if (!readResult.success) {
          return readResult;
        }
        content = readResult.data;
      }

      const doc = sidecar?.doc;
      const images = doc ? extractImagesFromDoc(doc) : (sidecar?.images ?? []);
      const tags = sidecar?.tags ?? [];

      return {
        success: true,
        data: {
          date: normalized,
          content,
          tags,
          images,
          ...(doc ? { doc } : {})
        }
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";

      return { success: false, error: errorMessage };
    }
  }

  async saveEntry(entry: JournalEntry): Promise<VoidResult> {
    try {
      const normalized = normalizeLocalDate(entry.date);
      const fileName = convertDateToFile(normalized);

      if (!fileName) {
        return {
          success: false,
          error: "Entry in data received is not a Date"
        };
      }

      const docImages = entry.doc ? extractImagesFromDoc(entry.doc) : [];
      const fallbackImages = docImages.length === 0 ? (entry.images ?? []) : [];
      const hasImages = docImages.length > 0 || fallbackImages.length > 0;
      const hasTags = Boolean(entry.tags && entry.tags.length > 0);
      const hasText = entry.content !== "";

      const sidecarPath = this.getEntrySidecarPath(fileName);
      const mdPath = this.getFilePath(fileName);

      if (!hasText && !hasImages && !hasTags) {
        await Promise.all([
          fsPromises.rm(mdPath, { force: true }),
          fsPromises.rm(sidecarPath, { force: true })
        ]);
        return { success: true };
      }

      const writeResult = await this.writeFile(fileName, entry.content);
      if (!writeResult.success) {
        return writeResult;
      }

      if (hasImages || hasTags || entry.doc) {
        const sidecarPayload: EntrySidecar = {
          content: entry.content,
          ...(hasTags ? { tags: entry.tags } : {}),
          ...(fallbackImages.length > 0 ? { images: fallbackImages } : {}),
          ...(entry.doc ? { doc: entry.doc } : {})
        };
        await fsPromises.mkdir(path.dirname(sidecarPath), { recursive: true });
        await fsPromises.writeFile(sidecarPath, JSON.stringify(sidecarPayload), "utf-8");
      } else {
        await fsPromises.rm(sidecarPath, { force: true });
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  async getNotes(): Promise<Result<NoteEntry[]>> {
    try {
      const notesDir = this.getMetaPath("notes");
      let files: string[] = [];
      try {
        files = await fsPromises.readdir(notesDir);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { success: true, data: [] };
        }
        throw error;
      }

      const notes: NoteEntry[] = [];
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const raw = await fsPromises.readFile(path.join(notesDir, file), "utf-8");
          const parsed = JSON.parse(raw) as NoteEntry;
          const images = parsed.doc ? extractImagesFromDoc(parsed.doc) : (parsed.images ?? []);
          notes.push({ ...parsed, images });
        } catch {
          // Skip malformed note file
        }
      }

      notes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return { success: true, data: notes };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Failed to load notes"
      };
    }
  }

  async saveNote(note: NoteEntry): Promise<VoidResult> {
    try {
      const filePath = this.getNoteFilePath(note.id);
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

      await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
      await fsPromises.writeFile(filePath, JSON.stringify(persistedNote), "utf-8");
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Failed to save note"
      };
    }
  }

  async deleteNote(id: string): Promise<VoidResult> {
    try {
      const filePath = this.getNoteFilePath(id);
      await fsPromises.rm(filePath, { force: true });
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Failed to delete note"
      };
    }
  }

  async getTags(): Promise<Result<string[]>> {
    try {
      const tagsPath = this.getMetaPath("tags.json");
      try {
        const raw = await fsPromises.readFile(tagsPath, "utf-8");
        const parsed = JSON.parse(raw) as unknown;
        const tags = Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === "string")
          : [];
        return { success: true, data: tags };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { success: true, data: [] };
        }
        throw error;
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Failed to load tags"
      };
    }
  }

  async saveTags(tags: string[]): Promise<VoidResult> {
    try {
      const tagsPath = this.getMetaPath("tags.json");
      await fsPromises.mkdir(path.dirname(tagsPath), { recursive: true });
      await fsPromises.writeFile(tagsPath, JSON.stringify(tags, null, 2), "utf-8");
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Failed to save tags"
      };
    }
  }

  async exportEntries(savePath: string, settings?: SettingsConfig | null): Promise<VoidResult> {
    const [entriesResult, notesResult, tagsResult] = await Promise.all([
      this.readAllEntries(),
      this.getNotes(),
      this.getTags()
    ]);

    const entries = entriesResult.success ? entriesResult.data : [];
    const notes = notesResult.success ? notesResult.data : [];
    const tags = tagsResult.success ? tagsResult.data : [];

    return new Promise((resolve) => {
      try {
        const output = fs.createWriteStream(savePath);
        const archive = archiver("zip", {
          zlib: { level: 9 }
        });

        archive.on("error", (err) => {
          resolve({
            success: false,
            error: err instanceof Error ? err.message : String(err)
          });
        });

        output.on("close", () => {
          resolve({ success: true });
        });

        output.on("error", (err: Error) => {
          resolve({
            success: false,
            error: err.message
          });
        });

        archive.pipe(output);

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
                  const decoded = dataUrlToBuffer(img.dataUrl);
                  if (!decoded) continue;
                  imgCounter += 1;
                  const zipImgPath = `${imgFolder}/${imgPrefix}-${imgCounter}.${decoded.ext}`;
                  archive.append(decoded.buffer, { name: zipImgPath });
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

        const sortedEntries = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
        for (const entry of sortedEntries) {
          const mdFileName = convertDateToFile(entry.date);
          if (!mdFileName) continue;
          const baseDate = mdFileName.replace(/\.md$/, "");
          const entryTags = entry.tags ?? [];
          const body = buildDocMarkdown(entry.content, entry.doc, "images/entries", baseDate);
          const frontmatter =
            entryTags.length > 0 ? `---\ntags: [${entryTags.join(", ")}]\n---\n\n` : "";

          archive.append(`${frontmatter}${body}`, { name: `entries/${mdFileName}` });
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

          archive.append(`${frontmatter}${noteBody}`, { name: `notes/${fileSlug}.md` });
        }

        const compactEntries = sortedEntries.map((entry) => {
          if (!entry.doc) return entry;
          const { images: _omit, ...rest } = entry;
          return rest;
        });

        const backupManifest = {
          exportedAt: new Date().toISOString(),
          tags,
          settings: settings ?? null,
          entries: compactEntries,
          notes
        };

        archive.append(JSON.stringify(backupManifest, null, 2), { name: "backup.json" });
        void archive.finalize();
      } catch (err) {
        resolve({
          success: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    });
  }

  async generatePrintableHTMLForEntry(
    date: Date,
    fontSize: number = 12,
    fontFamily: string = "Georgia, serif"
  ): Promise<Result<string>> {
    try {
      const entryResult = await this.getEntry(date);

      if (!entryResult.success) {
        return entryResult;
      }

      const entry = entryResult.data;

      if (entry.content.trim() === "") {
        return {
          success: false,
          error: "Entry is empty"
        };
      }

      const formatDate = (date: Date): string => {
        const options: Intl.DateTimeFormatOptions = {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric"
        };
        return date.toLocaleDateString("en-US", options);
      };

      const escapeHTML = (text: string): string => {
        return text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      };

      const html = `
				<!DOCTYPE html>
				<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<title>Journal Entry - ${formatDate(entry.date)}</title>
					<style>
						@font-face {
							font-family: 'Geist';
							src: url('data:font/woff2;base64,${GEIST_FONT_BASE64}') format('woff2');
							font-weight: 100 900;
							font-style: normal;
						}

						@page {
							margin: 1in 1in 1.5in 1in;
							@bottom-center {
								content: counter(page);
								font-family: ${fontFamily};
								font-size: 10pt;
								color: #666;
							}
						}

						* {
							margin: 0;
							padding: 0;
							box-sizing: border-box;
						}

						body {
							font-family: ${fontFamily};
							font-size: ${fontSize}pt;
							line-height: 1.6;
							color: #000;
							background: #fff;
						}

						.entry-date {
							font-weight: bold;
							font-size: ${fontSize + 2}pt;
							margin-bottom: 1em;
							color: #333;
						}

						.entry-content {
							white-space: pre-wrap;
							word-wrap: break-word;
						}
					</style>
				</head>
				<body>
					<div class="entry">
						<div class="entry-date">${formatDate(entry.date)}</div>
						<div class="entry-content">${escapeHTML(entry.content)}</div>
					</div>
				</body>
				</html>
			`;

      return {
        success: true,
        data: html
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  async generatePrintableHTML(
    fontSize: number = 12,
    fontFamily: string = "Georgia, serif"
  ): Promise<Result<string>> {
    try {
      const entriesResult = await this.readAllEntries();

      if (!entriesResult.success) {
        return entriesResult;
      }

      const entries = entriesResult.data
        .filter((entry) => entry.content.trim() !== "")
        .sort((a, b) => a.date.getTime() - b.date.getTime());

      if (entries.length === 0) {
        return {
          success: false,
          error: "No entries to print"
        };
      }

      const formatDate = (date: Date): string => {
        const options: Intl.DateTimeFormatOptions = {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric"
        };
        return date.toLocaleDateString("en-US", options);
      };

      const escapeHTML = (text: string): string => {
        return text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      };

      const html = `
				<!DOCTYPE html>
				<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<title>Journal Entries</title>
					<style>
						@font-face {
							font-family: 'Geist';
							src: url('data:font/woff2;base64,${GEIST_FONT_BASE64}') format('woff2');
							font-weight: 100 900;
							font-style: normal;
						}

						@page {
							margin: 1in 1in 1.5in 1in;
							@bottom-center {
								content: counter(page);
								font-family: ${fontFamily};
								font-size: 10pt;
								color: #666;
							}
						}

						* {
							margin: 0;
							padding: 0;
							box-sizing: border-box;
						}

						body {
							font-family: ${fontFamily};
							font-size: ${fontSize}pt;
							line-height: 1.6;
							color: #000;
							background: #fff;
						}

						.entry {
							page-break-after: always;
							page-break-inside: avoid;
						}

						.entry:last-child {
							page-break-after: auto;
						}

						.entry-date {
							font-weight: bold;
							font-size: ${fontSize + 2}pt;
							margin-bottom: 1em;
							color: #333;
						}

						.entry-content {
							white-space: pre-wrap;
							word-wrap: break-word;
						}
					</style>
				</head>
				<body>
				${entries
          .map(
            (entry) => `
					<div class="entry">
						<div class="entry-date">${formatDate(entry.date)}</div>
						<div class="entry-content">${escapeHTML(entry.content)}</div>
					</div>`
          )
          .join("\n")}
				</body>
				</html>
			`;

      return {
        success: true,
        data: html
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
}
