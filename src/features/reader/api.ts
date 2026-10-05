import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const LogicalPositionSchema = z.object({
  documentId: z.string(),
  sectionId: z.string().nullable().optional(),
  blockId: z.string().nullable().optional(),
  offset: z.number().nullable().optional(),
  page: z.number().nullable().optional(),
  pageOffset: z.number().nullable().optional(),
  percentage: z.number(),
  parserVersion: z.number().optional()
});

export type LogicalPosition = z.infer<typeof LogicalPositionSchema>;

export const ResolvedPositionSchema = z.object({
  sectionIndex: z.number(),
  blockId: z.string().nullable().optional(),
  offset: z.number().nullable().optional(),
  page: z.number().nullable().optional(),
  pageOffset: z.number().nullable().optional(),
  percentage: z.number(),
  linearPos: z.number(),
  fallbackTier: z.string()
});

export type ResolvedPosition = z.infer<typeof ResolvedPositionSchema>;

export const ReadingProgressSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  currentPage: z.number().nullable().optional(),
  currentPosition: LogicalPositionSchema,
  currentPos: z.number(),
  currentSectionId: z.string().nullable().optional(),
  progressPercent: z.number(),
  furthestPos: z.number(),
  totalReadMs: z.number(),
  completed: z.boolean(),
  completedAt: z.number().nullable().optional(),
  updatedAt: z.number()
});

export type ReadingProgress = z.infer<typeof ReadingProgressSchema>;

export const document_resolve_position = async (position: LogicalPosition): Promise<ResolvedPosition> => {
  return invoke("document_resolve_position", { position });
};

export const reading_update_progress = async (documentId: string, position: LogicalPosition): Promise<void> => {
  return invoke("reading_update_progress", { documentId, position });
};

export const reading_get_progress = async (documentId: string): Promise<ReadingProgress> => {
  return invoke("reading_get_progress", { documentId });
};

export const document_get_sections = async (id: string, fromIndex?: number, count?: number): Promise<unknown[]> => {
  return invoke("document_get_sections", { id, fromIndex, count });
};
