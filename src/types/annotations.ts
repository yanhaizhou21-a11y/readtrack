import { z } from "zod";
import { LogicalPositionSchema } from "./document";

export const BookmarkSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  position: LogicalPositionSchema,
  pos: z.number().int(),
  page: z.number().int().optional().nullable(),
  sectionId: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  excerpt: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Bookmark = z.infer<typeof BookmarkSchema>;

export const BookmarkCreateInputSchema = z.object({
  documentId: z.string(),
  position: LogicalPositionSchema,
  title: z.string().optional(),
  note: z.string().optional(),
});
export type BookmarkCreateInput = z.infer<typeof BookmarkCreateInputSchema>;

export const BookmarkUpdateInputSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  note: z.string().optional(),
});
export type BookmarkUpdateInput = z.infer<typeof BookmarkUpdateInputSchema>;

export const HighlightColorSchema = z.enum(["yellow", "green", "blue", "pink", "purple"]);
export type HighlightColor = z.infer<typeof HighlightColorSchema>;

export const HighlightSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  positionStart: LogicalPositionSchema,
  positionEnd: LogicalPositionSchema,
  startPos: z.number().int(),
  endPos: z.number().int(),
  page: z.number().int().optional().nullable(),
  selectedText: z.string(),
  color: z.string(),
  note: z.string().optional().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Highlight = z.infer<typeof HighlightSchema>;

export const HighlightCreateInputSchema = z.object({
  documentId: z.string(),
  start: LogicalPositionSchema,
  end: LogicalPositionSchema,
  selectedText: z.string(),
  color: z.string(),
  note: z.string().optional(),
});
export type HighlightCreateInput = z.infer<typeof HighlightCreateInputSchema>;

export const HighlightUpdateInputSchema = z.object({
  id: z.string(),
  color: z.string().optional(),
  note: z.string().optional(),
});
export type HighlightUpdateInput = z.infer<typeof HighlightUpdateInputSchema>;

export const NoteSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  highlightId: z.string().optional().nullable(),
  position: LogicalPositionSchema,
  pos: z.number().int(),
  page: z.number().int().optional().nullable(),
  content: z.string(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Note = z.infer<typeof NoteSchema>;

export const NoteCreateInputSchema = z.object({
  documentId: z.string(),
  position: LogicalPositionSchema,
  content: z.string(),
  highlightId: z.string().optional(),
});
export type NoteCreateInput = z.infer<typeof NoteCreateInputSchema>;

export const NoteUpdateInputSchema = z.object({
  id: z.string(),
  content: z.string(),
});
export type NoteUpdateInput = z.infer<typeof NoteUpdateInputSchema>;
