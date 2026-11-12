import { type JournalImage } from "@shared/types/journal-entry";

const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.84;
const PASSTHROUGH_MAX_BYTES = 500 * 1024;

function generateImageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read image file"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function compressImageDataUrl(dataUrl: string, mimeType: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth, naturalHeight } = img;
      if (!naturalWidth || !naturalHeight) {
        resolve(dataUrl);
        return;
      }

      const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(naturalWidth, naturalHeight));
      const targetWidth = Math.max(1, Math.round(naturalWidth * scale));
      const targetHeight = Math.max(1, Math.round(naturalHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      const outputMime = mimeType === "image/png" ? "image/webp" : "image/jpeg";
      const compressed = canvas.toDataURL(outputMime, JPEG_QUALITY);
      resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function processImageFiles(files: FileList | File[]): Promise<JournalImage[]> {
  const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
  const processed: JournalImage[] = [];

  for (const file of imageFiles) {
    const rawDataUrl = await readFileAsDataUrl(file);
    const preserveOriginal =
      (file.type === "image/gif" || file.type === "image/svg+xml") &&
      file.size <= PASSTHROUGH_MAX_BYTES;

    const finalDataUrl = preserveOriginal
      ? rawDataUrl
      : await compressImageDataUrl(rawDataUrl, file.type);

    processed.push({
      id: generateImageId(),
      dataUrl: finalDataUrl,
      name: file.name
    });
  }

  return processed;
}
