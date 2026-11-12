export const TAG_TOKEN_REGEX = /(^|\s)#([a-zA-Z0-9][a-zA-Z0-9_-]*)/g;

export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/[\s,]+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
}

export function extractTagsFromText(text: string): string[] {
  const tags = new Set<string>();
  TAG_TOKEN_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TAG_TOKEN_REGEX.exec(text)) !== null) {
    const normalized = normalizeTag(match[2] ?? "");
    if (normalized) {
      tags.add(normalized);
    }
  }

  return Array.from(tags);
}
