import { z } from "zod";
import { ipc } from "@/lib/ipc";
import {
  DocumentDetail,
  DocumentDetailSchema,
  DocumentListResponse,
  DocumentListResponseSchema,
  DocumentSummary,
  DocumentSummarySchema,
  ImportDocumentInput,
  ListDocumentsInput,
  SectionPayload,
  SectionPayloadSchema,
} from "@/types";

export async function importDocument(input: ImportDocumentInput): Promise<DocumentSummary> {
  return ipc(
    "document_import",
    { input: { source: input.source, onDuplicate: input.onDuplicate } },
    DocumentSummarySchema
  );
}

export async function listDocuments(input: ListDocumentsInput = {}): Promise<DocumentListResponse> {
  return ipc(
    "document_list",
    {
      input: {
        filter: input.filter,
        sort: input.sort,
        query: input.query,
        limit: input.limit,
        offset: input.offset,
      },
    },
    DocumentListResponseSchema
  );
}

export async function getDocument(id: string): Promise<DocumentDetail> {
  return ipc("document_get", { input: { id } }, DocumentDetailSchema);
}

export async function renameDocument(id: string, title: string): Promise<DocumentSummary> {
  return ipc("document_rename", { input: { id, title } }, DocumentSummarySchema);
}

export async function archiveDocument(id: string, archived: boolean): Promise<DocumentSummary> {
  return ipc("document_archive", { input: { id, archived } }, DocumentSummarySchema);
}

export async function deleteDocument(id: string): Promise<void> {
  await ipc("document_delete", { input: { id } });
}

export async function touchDocument(id: string): Promise<void> {
  await ipc("document_touch", { input: { id } });
}

export async function getDocumentSections(
  id: string,
  fromIndex?: number,
  count?: number
): Promise<SectionPayload[]> {
  return ipc(
    "document_get_sections",
    { input: { id, fromIndex, count } },
    z.array(SectionPayloadSchema)
  );
}
