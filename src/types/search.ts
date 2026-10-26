import { z } from "zod";
import { opt } from "./zod-helpers";
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
  documentId: z.string().min(1),
  documentTitle: z.string(),
  sectionTitle: opt(z.string()),
  page: opt(z.number().int().nonnegative()),
  snippet: z.array(SnippetPartSchema),
  position: LogicalPositionSchema,
  refId: opt(z.string()),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

export const DocumentSearchInputSchema = z.object({
  query: z.string().min(1),
  scope: opt(z.array(z.string())),
  documentId: opt(z.string()),
  limit: opt(z.number().int().positive()),
  offset: opt(z.number().int().nonnegative()),
});
export type DocumentSearchInput = z.infer<typeof DocumentSearchInputSchema>;
