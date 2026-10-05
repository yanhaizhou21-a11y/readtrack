import { z } from "zod";
import { LogicalPositionSchema } from "./document";

export const SnippetPartSchema = z.object({
  text: z.string(),
  match: z.boolean(),
});
export type SnippetPart = z.infer<typeof SnippetPartSchema>;

export const SearchHitKindSchema = z.enum([
  "title",
  "author",
  "content",
  "note",
  "highlight",
  "bookmark",
]);
export type SearchHitKind = z.infer<typeof SearchHitKindSchema>;

export const SearchHitSchema = z.object({
  kind: SearchHitKindSchema,
  documentId: z.string(),
  documentTitle: z.string(),
  sectionTitle: z.string().optional().nullable(),
  page: z.number().int().optional().nullable(),
  snippet: z.array(SnippetPartSchema),
  position: LogicalPositionSchema,
  refId: z.string().optional().nullable(),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

export const DocumentSearchInputSchema = z.object({
  query: z.string().min(1),
  scope: z.array(z.string()).optional(),
  documentId: z.string().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
});
export type DocumentSearchInput = z.infer<typeof DocumentSearchInputSchema>;
