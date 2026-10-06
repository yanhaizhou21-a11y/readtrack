import { z } from "zod";
import { ipc } from "@/lib/ipc";
import {
  ExportInput,
  ExportResult,
  ExportResultSchema,
  ExportShareInput,
} from "@/types";

export async function exportXlsx(input: ExportInput = {}): Promise<ExportResult> {
  return ipc("export_xlsx", { input }, ExportResultSchema);
}

export async function exportPdf(input: ExportInput = {}): Promise<ExportResult> {
  return ipc("export_pdf", { input }, ExportResultSchema);
}

export async function exportShare(input: ExportShareInput): Promise<void> {
  await ipc("export_share", { input }, z.void().or(z.null()).or(z.undefined()));
}
