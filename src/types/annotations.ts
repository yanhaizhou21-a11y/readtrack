import { z } from "zod";
import { opt } from "./zod-helpers";
import { LogicalPositionSchema } from "./document";

export const BookmarkSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  position: LogicalPositionSchema,
  pos: z.number().int(),
  page: opt(z.number().int().nonnegative()),
  sectionId: opt(z.string()),
  title: opt(z.string()),
  excerpt: opt(z.string()),
  note: opt(z.string()),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type Bookmark = z.infer<typeof BookmarkSchema>;

export const BookmarkCreateInputSchema = z.object({
  documentId: z.string().min(1),
  position: LogicalPositionSchema,
  title: opt(z.string()),
  note: opt(z.string()),
});
export type BookmarkCreateInput = z.infer<typeof BookmarkCreateInputSchema>;

export const BookmarkUpdateInputSchema = z.object({
  id: z.string().min(1),
  title: opt(z.string()),
  note: opt(z.string()),
});
export type BookmarkUpdateInput = z.infer<typeof BookmarkUpdateInputSchema>;

export const HighlightColorSchema = z.enum(["yellow", "green", "blue", "pink", "purple"]);
export type HighlightColor = z.infer<typeof HighlightColorSchema>;

export const HighlightSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  positionStart: LogicalPositionSchema,
  positionEnd: LogicalPositionSchema,
  startPos: z.number().int(),
  endPos: z.number().int(),
  page: opt(z.number().int().nonnegative()),
  selectedText: z.string(),
  color: z.string(),
  note: opt(z.string()),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type Highlight = z.infer<typeof HighlightSchema>;

export const HighlightCreateInputSchema = z.object({
  documentId: z.string().min(1),
  start: LogicalPositionSchema,
  end: LogicalPositionSchema,
  selectedText: z.string(),
  color: z.string(),
  note: opt(z.string()),
});
export type HighlightCreateInput = z.infer<typeof HighlightCreateInputSchema>;

export const HighlightUpdateInputSchema = z.object({
  id: z.string().min(1),
  color: opt(z.string()),
  note: opt(z.string()),
});
export type HighlightUpdateInput = z.infer<typeof HighlightUpdateInputSchema>;

export const NoteSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  highlightId: opt(z.string()),
  position: LogicalPositionSchema,
  pos: z.number().int(),
  page: opt(z.number().int().nonnegative()),
  content: z.string(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type Note = z.infer<typeof NoteSchema>;

export const NoteCreateInputSchema = z.object({
  documentId: z.string().min(1),
  position: LogicalPositionSchema,
  content: z.string(),
  highlightId: opt(z.string()),
});
export type NoteCreateInput = z.infer<typeof NoteCreateInputSchema>;

export const NoteUpdateInputSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
});
export type NoteUpdateInput = z.infer<typeof NoteUpdateInputSchema>;
