import { z } from "zod";

// --- Types matching docs/API_CONTRACT.md and docs/DOCUMENT_MODEL.md ---

export const FileTypeSchema = z.enum(["pdf", "docx", "rtf", "txt", "md", "epub"]);
export type FileType = z.infer<typeof FileTypeSchema>;

export const SegmentStatusSchema = z.enum(["unread", "reading", "read", "skipped"]);
export type SegmentStatus = z.infer<typeof SegmentStatusSchema>;

export const ParseStatusSchema = z.enum(["pending", "parsing", "ready", "failed"]);
export type ParseStatus = z.infer<typeof ParseStatusSchema>;

export const AppErrorCodeSchema = z.enum([
  "DocumentNotFound",
  "UnsupportedFormat",
  "DuplicateDocument",
  "InvalidDocument",
  "ParseFailed",
  "DatabaseError",
  "ExportFailed",
  "PermissionDenied",
  "StorageUnavailable",
  "InvalidInput",
  "NotFound",
  "Internal",
]);
export type AppErrorCode = z.infer<typeof AppErrorCodeSchema>;

export const AppErrorDtoSchema = z.object({
  code: AppErrorCodeSchema,
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
  retryable: z.boolean(),
});
export type AppErrorDto = z.infer<typeof AppErrorDtoSchema>;

export const LogicalPositionSchema = z.object({
  documentId: z.string().min(1),
  sectionId: z.number().int().nonnegative().optional(),
  blockId: z.string().optional(),
  offset: z.number().int().nonnegative().optional(),
  page: z.number().int().positive().optional(),
  pageOffset: z.number().min(0).max(1).optional(),
  percentage: z.number().min(0).max(1),
  parserVersion: z.number().int().positive(),
});
export type LogicalPosition = z.infer<typeof LogicalPositionSchema>;

export const ResolvedPositionSchema = z.object({
  sectionIndex: z.number().int().nonnegative(),
  blockId: z.string().optional(),
  offset: z.number().int().nonnegative().optional(),
  page: z.number().int().positive().optional(),
  pageOffset: z.number().min(0).max(1).optional(),
  percentage: z.number().min(0).max(1),
  linearPos: z.number().int().nonnegative(),
  fallbackTier: z.enum(["exact", "linear_proximity", "percentage", "start", "clamped"]),
});
export type ResolvedPosition = z.infer<typeof ResolvedPositionSchema>;

export const DocumentSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  author: z.string().optional(),
  fileType: FileTypeSchema,
  fileSize: z.number().int().nonnegative(),
  pageCount: z.number().int().positive().optional(),
  wordCount: z.number().int().nonnegative().optional(),
  sectionCount: z.number().int().nonnegative(),
  progress: z.number().min(0).max(1),
  completed: z.boolean(),
  isArchived: z.boolean(),
  createdAt: z.number().int().positive(),
  lastOpenedAt: z.number().int().positive().optional(),
  thumbnailUrl: z.string().optional(),
  parseStatus: ParseStatusSchema,
});
export type DocumentSummary = z.infer<typeof DocumentSummarySchema>;

export const DocumentDetailSchema = DocumentSummarySchema.extend({
  originalFilename: z.string().min(1),
  mimeType: z.string().min(1),
  contentHash: z.string().length(64), // BLAKE3 hex hash
  totalReadMs: z.number().int().nonnegative(),
  sessionCount: z.number().int().nonnegative(),
  lastReadAt: z.number().int().positive().optional(),
  position: LogicalPositionSchema.optional(),
});
export type DocumentDetail = z.infer<typeof DocumentDetailSchema>;

export const DocumentListResponseSchema = z.object({
  items: z.array(DocumentSummarySchema),
  total: z.number().int().nonnegative(),
});
export type DocumentListResponse = z.infer<typeof DocumentListResponseSchema>;

export const BlockTypeSchema = z.enum([
  "heading",
  "paragraph",
  "list",
  "quote",
  "image",
  "table",
  "code",
  "separator",
]);

export const BlockSchema = z.object({
  id: z.string().min(1),
  type: BlockTypeSchema,
  text: z.string(),
  wordCount: z.number().int().nonnegative(),
  level: z.number().int().min(1).max(6).optional(),
});
export type Block = z.infer<typeof BlockSchema>;

export const SectionPayloadSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  title: z.string().optional(),
  level: z.number().int().min(0).max(6),
  wordCount: z.number().int().nonnegative(),
  blocks: z.array(BlockSchema),
});
export type SectionPayload = z.infer<typeof SectionPayloadSchema>;

export interface TocEntry {
  title: string;
  sectionIndex: number;
  blockId?: string;
  page?: number;
  children?: TocEntry[];
}

export const TocEntrySchema: z.ZodType<TocEntry> = z.lazy(() =>
  z.object({
    title: z.string().min(1),
    sectionIndex: z.number().int().nonnegative(),
    blockId: z.string().optional(),
    page: z.number().int().positive().optional(),
    children: z.array(TocEntrySchema).optional(),
  })
);
export type TocEntry = z.infer<typeof TocEntrySchema>;

export const SearchHitSchema = z.object({
  kind: z.enum(["title", "author", "content", "note", "highlight", "bookmark"]),
  documentId: z.string().uuid(),
  documentTitle: z.string().min(1),
  sectionTitle: z.string().optional(),
  page: z.number().int().positive().optional(),
  snippet: z.array(
    z.object({
      text: z.string(),
      match: z.boolean(),
    })
  ),
  position: LogicalPositionSchema,
  refId: z.string().optional(),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

export const ViewportReportSchema = z.object({
  sessionId: z.string().uuid(),
  ts: z.number().int().positive(),
  visible: z.array(
    z.object({
      segmentIndex: z.number().int().nonnegative(),
      ratio: z.number().min(0).max(1),
    })
  ),
  position: LogicalPositionSchema,
  interacting: z.boolean(),
  foreground: z.boolean(),
  jump: z.enum(["none", "toc", "search", "bookmark", "resume", "slider"]),
});
export type ViewportReport = z.infer<typeof ViewportReportSchema>;

export const ReadingProgressSchema = z.object({
  documentId: z.string().uuid(),
  progressPercent: z.number().min(0).max(1),
  completed: z.boolean(),
  completedAt: z.number().int().positive().optional(),
  totalReadMs: z.number().int().nonnegative(),
  furthestPos: z.number().int().nonnegative(),
  currentPosition: LogicalPositionSchema,
});
export type ReadingProgress = z.infer<typeof ReadingProgressSchema>;

export const ReadingMapSchema = z.object({
  documentId: z.string().uuid(),
  progress: z.number().min(0).max(1),
  completed: z.boolean(),
  totalReadMs: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
  lastReadAt: z.number().int().positive().optional(),
  sections: z.array(
    z.object({
      sectionId: z.string().min(1),
      index: z.number().int().nonnegative(),
      title: z.string(),
      progress: z.number().min(0).max(1),
      status: z.enum(["unread", "reading", "read"]),
      lastReadAt: z.number().int().positive().optional(),
      readMs: z.number().int().nonnegative(),
      sessions: z.number().int().nonnegative(),
      segments: z.array(
        z.object({
          index: z.number().int().nonnegative(),
          status: SegmentStatusSchema,
          wordCount: z.number().int().nonnegative(),
        })
      ),
      startPos: LogicalPositionSchema,
    })
  ),
  current: LogicalPositionSchema,
});
export type ReadingMap = z.infer<typeof ReadingMapSchema>;

export const BookmarkSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  position: LogicalPositionSchema,
  title: z.string().optional(),
  excerpt: z.string().optional(),
  note: z.string().optional(),
  createdAt: z.number().int().positive(),
});
export type Bookmark = z.infer<typeof BookmarkSchema>;
