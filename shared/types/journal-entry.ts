export interface JournalImage {
  id: string;
  dataUrl: string;
  name?: string;
}

export interface JournalEntry {
  date: Date;
  content: string;
  tags?: string[];
  images?: JournalImage[];
  doc?: Record<string, unknown>;
}

export interface NoteEntry {
  id: string;
  title: string;
  content: string;
  tags?: string[];
  images?: JournalImage[];
  doc?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
