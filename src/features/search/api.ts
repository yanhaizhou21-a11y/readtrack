import { z } from "zod";
import { ipc } from "@/lib/ipc";
import { DocumentSearchInput, SearchHit, SearchHitSchema } from "@/types";

export async function searchDocuments(input: DocumentSearchInput): Promise<SearchHit[]> {
  return ipc(
    "document_search",
    {
      input: {
        query: input.query,
        scope: input.scope ?? null,
        documentId: input.documentId ?? null,
        limit: input.limit ?? 50,
        offset: input.offset ?? 0,
      },
    },
    z.array(SearchHitSchema)
  );
}
