import { z } from "zod";

export const ExportKindSchema = z.enum(["xlsx", "pdf"]);
export type ExportKind = z.infer<typeof ExportKindSchema>;

export const ExportInputSchema = z.object({
  documentIds: z.array(z.string()).optional(),
});
export type ExportInput = z.infer<typeof ExportInputSchema>;

export const ExportResultSchema = z.object({
  path: z.string(),
  fileName: z.string(),
});
export type ExportResult = z.infer<typeof ExportResultSchema>;

export const ExportShareInputSchema = z.object({
  path: z.string(),
});
export type ExportShareInput = z.infer<typeof ExportShareInputSchema>;

export const ExportProgressPayloadSchema = z.object({
  jobId: z.string(),
  kind: ExportKindSchema,
  percent: z.number().int().min(0).max(100),
  stage: z.string(),
});
export type ExportProgressPayload = z.infer<typeof ExportProgressPayloadSchema>;
