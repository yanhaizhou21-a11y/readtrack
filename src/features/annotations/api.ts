import { z } from "zod";
import { ipc } from "@/lib/ipc";
import {
  Bookmark,
  BookmarkCreateInput,
  BookmarkSchema,
  BookmarkUpdateInput,
  Highlight,
  HighlightCreateInput,
  HighlightSchema,
  HighlightUpdateInput,
  Note,
  NoteCreateInput,
  NoteSchema,
  NoteUpdateInput,
} from "@/types";

// --- Bookmarks ---

export async function createBookmark(input: BookmarkCreateInput): Promise<Bookmark> {
  return ipc("bookmark_create", { input }, BookmarkSchema);
}

export async function updateBookmark(input: BookmarkUpdateInput): Promise<Bookmark> {
  return ipc("bookmark_update", { input }, BookmarkSchema);
}

export async function deleteBookmark(id: string): Promise<void> {
  await ipc("bookmark_delete", { input: { id } }, z.void().or(z.null()).or(z.undefined()));
}

export async function listBookmarks(documentId?: string): Promise<Bookmark[]> {
  return ipc(
    "bookmark_list",
    { input: { documentId: documentId ?? null } },
    z.array(BookmarkSchema)
  );
}

// --- Highlights ---

export async function createHighlight(input: HighlightCreateInput): Promise<Highlight> {
  return ipc("highlight_create", { input }, HighlightSchema);
}

export async function updateHighlight(input: HighlightUpdateInput): Promise<Highlight> {
  return ipc("highlight_update", { input }, HighlightSchema);
}

export async function deleteHighlight(id: string): Promise<void> {
  await ipc("highlight_delete", { input: { id } }, z.void().or(z.null()).or(z.undefined()));
}

export async function listHighlights(documentId?: string): Promise<Highlight[]> {
  return ipc(
    "highlight_list",
    { input: { documentId: documentId ?? null } },
    z.array(HighlightSchema)
  );
}

// --- Notes ---

export async function createNote(input: NoteCreateInput): Promise<Note> {
  return ipc("note_create", { input }, NoteSchema);
}

export async function updateNote(input: NoteUpdateInput): Promise<Note> {
  return ipc("note_update", { input }, NoteSchema);
}

export async function deleteNote(id: string): Promise<void> {
  await ipc("note_delete", { input: { id } }, z.void().or(z.null()).or(z.undefined()));
}

export async function listNotes(documentId?: string): Promise<Note[]> {
  return ipc(
    "note_list",
    { input: { documentId: documentId ?? null } },
    z.array(NoteSchema)
  );
}
