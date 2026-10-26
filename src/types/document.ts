import { z } from "zod";
import { opt } from "./zod-helpers";

export const FileTypeSchema = z.enum(["pdf", "docx", "rtf", "txt", "md", "epub"]);
export type FileType = z.infer<typeof FileTypeSchema>;

export const SegmentStatusSchema = z.enum(["unread", "reading", "read", "skipped"]);
export type SegmentStatus = z.infer<typeof SegmentStatusSchema>;

export const ParseStatusSchema = z.enum(["pending", "parsing", "ready", "failed"]);
export type ParseStatus = z.infer<typeof ParseStatusSchema>;

export const LogicalPositionSchema = z.object({
  documentId: z.string().min(1),
  sectionId: opt(z.number().int().nonnegative()),
  blockId: opt(z.string()),
  offset: opt(z.number().int().nonnegative()),
  page: opt(z.number().int().nonnegative()),
  pageOffset: opt(z.number().min(0).max(1)),
  percentage: z.number().min(0).max(1),
  parserVersion: z.number().int().nonnegative(),
});
export type LogicalPosition = z.infer<typeof LogicalPositionSchema>;

export const DocumentSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(500),
  author: opt(z.string()),
  fileType: FileTypeSchema,
  fileSize: z.number().int().nonnegative(),
  pageCount: opt(z.number().int().nonnegative()),
  wordCount: opt(z.number().int().nonnegative()),
  sectionCount: z.number().int().nonnegative(),
  progress: z.number().min(0).max(1),
  completed: z.boolean(),
  isArchived: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  lastOpenedAt: opt(z.number().int().nonnegative()),
  thumbnailUrl: opt(z.string()),
  parseStatus: ParseStatusSchema,
});
export type DocumentSummary = z.infer<typeof DocumentSummarySchema>;

export const DocumentDetailSchema = DocumentSummarySchema.extend({
  originalFilename: z.string().min(1),
  mimeType: z.string().min(1),
  contentHash: z.string().length(64),
  totalReadMs: z.number().int().nonnegative(),
  sessionCount: z.number().int().nonnegative(),
  lastReadAt: opt(z.number().int().nonnegative()),
  position: opt(LogicalPositionSchema),
});
export type DocumentDetail = z.infer<typeof DocumentDetailSchema>;

export const DocumentListResponseSchema = z.object({
  items: z.array(z.unknown()).transform((rawItems) => {
    const validItems: DocumentSummary[] = [];
    for (const rawItem of rawItems) {
      const parsed = DocumentSummarySchema.safeParse(rawItem);
      if (parsed.success) {
        validItems.push(parsed.data);
      } else {
        console.error("[DocumentListResponse] Malformed document item skipped:", parsed.error, rawItem);
      }
    }
    return validItems;
  }),
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
  level: opt(z.number().int().min(1).max(6)),
});
export type Block = z.infer<typeof BlockSchema>;

export const SectionPayloadSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  title: opt(z.string()),
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
