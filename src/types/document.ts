import { z } from "zod";

export const FileTypeSchema = z.enum(["pdf", "docx", "rtf", "txt", "md", "epub"]);
export type FileType = z.infer<typeof FileTypeSchema>;

export const SegmentStatusSchema = z.enum(["unread", "reading", "read", "skipped"]);
export type SegmentStatus = z.infer<typeof SegmentStatusSchema>;

export const ParseStatusSchema = z.enum(["pending", "parsing", "ready", "failed"]);
export type ParseStatus = z.infer<typeof ParseStatusSchema>;

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
  contentHash: z.string().length(64),
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
export type BlockType = z.infer<typeof BlockTypeSchema>;

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

export interface ImportDocumentInput {
  source: string;
  onDuplicate?: "ask" | "open_existing" | "replace";
}

export interface ListDocumentsInput {
  filter?: "all" | "in_progress" | "completed" | "archived" | "recent_added" | "recent_opened";
  sort?: "recent_opened" | "recent_added" | "title" | "progress";
  query?: string;
  limit?: number;
  offset?: number;
}
