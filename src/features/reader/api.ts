import { ipc } from "@/lib/ipc";
import { z } from "zod";
import { opt } from "@/types/zod-helpers";

export const LogicalPositionSchema = z.object({
  documentId: z.string().min(1),
  sectionId: opt(z.union([z.string(), z.number()])),
  blockId: opt(z.string()),
  offset: opt(z.number()),
  page: opt(z.number()),
  pageOffset: opt(z.number()),
  percentage: z.number(),
  parserVersion: opt(z.number()),
});

export type LogicalPosition = z.infer<typeof LogicalPositionSchema>;

export const ResolvedPositionSchema = z.object({
  sectionIndex: z.number(),
  blockId: opt(z.string()),
  offset: opt(z.number()),
  page: opt(z.number()),
  pageOffset: opt(z.number()),
  percentage: z.number(),
  linearPos: z.number(),
  fallbackTier: z.string(),
});

export type ResolvedPosition = z.infer<typeof ResolvedPositionSchema>;

export const ReadingProgressSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  currentPage: opt(z.number()),
  currentPosition: LogicalPositionSchema,
  currentPos: z.number(),
  currentSectionId: opt(z.string()),
  progressPercent: z.number(),
  furthestPos: z.number(),
  totalReadMs: z.number(),
  completed: z.boolean(),
  completedAt: opt(z.number()),
  updatedAt: z.number(),
});

export type ReadingProgress = z.infer<typeof ReadingProgressSchema>;

export const document_resolve_position = async (position: LogicalPosition): Promise<ResolvedPosition> => {
  return ipc("document_resolve_position", { position }, ResolvedPositionSchema);
};

export const reading_update_progress = async (documentId: string, position: LogicalPosition): Promise<ReadingProgress> => {
  return ipc("reading_update_progress", { documentId, position }, ReadingProgressSchema);
};

export const reading_get_progress = async (documentId: string): Promise<ReadingProgress> => {
  return ipc("reading_get_progress", { documentId }, ReadingProgressSchema);
};

export const document_get_sections = async (id: string, fromIndex?: number, count?: number) => {
  return ipc("document_get_sections", { id, fromIndex, count });
};
