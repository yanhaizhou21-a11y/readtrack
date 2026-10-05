use tauri::State;

use crate::errors::IpcError;
use crate::models::{
    Bookmark, BookmarkCreateInput, BookmarkDeleteInput, BookmarkListInput, BookmarkUpdateInput,
    Highlight, HighlightCreateInput, HighlightDeleteInput, HighlightListInput,
    HighlightUpdateInput, Note, NoteCreateInput, NoteDeleteInput, NoteListInput, NoteUpdateInput,
};
use crate::AppState;

// ---------------- BOOKMARKS ----------------

#[tauri::command]
pub async fn bookmark_create(
    state: State<'_, AppState>,
    input: BookmarkCreateInput,
) -> Result<Bookmark, IpcError> {
    state
        .annotation_service
        .create_bookmark(input)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn bookmark_update(
    state: State<'_, AppState>,
    input: BookmarkUpdateInput,
) -> Result<Bookmark, IpcError> {
    state
        .annotation_service
        .update_bookmark(input)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn bookmark_delete(
    state: State<'_, AppState>,
    input: BookmarkDeleteInput,
) -> Result<(), IpcError> {
    state
        .annotation_service
        .delete_bookmark(&input.id)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn bookmark_list(
    state: State<'_, AppState>,
    input: BookmarkListInput,
) -> Result<Vec<Bookmark>, IpcError> {
    state
        .annotation_service
        .list_bookmarks(input.document_id.as_deref())
        .await
        .map_err(IpcError::from)
}

// ---------------- HIGHLIGHTS ----------------

#[tauri::command]
pub async fn highlight_create(
    state: State<'_, AppState>,
    input: HighlightCreateInput,
) -> Result<Highlight, IpcError> {
    state
        .annotation_service
        .create_highlight(input)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn highlight_update(
    state: State<'_, AppState>,
    input: HighlightUpdateInput,
) -> Result<Highlight, IpcError> {
    state
        .annotation_service
        .update_highlight(input)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn highlight_delete(
    state: State<'_, AppState>,
    input: HighlightDeleteInput,
) -> Result<(), IpcError> {
    state
        .annotation_service
        .delete_highlight(&input.id)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn highlight_list(
    state: State<'_, AppState>,
    input: HighlightListInput,
) -> Result<Vec<Highlight>, IpcError> {
    state
        .annotation_service
        .list_highlights(input.document_id.as_deref())
        .await
        .map_err(IpcError::from)
}

// ---------------- NOTES ----------------

#[tauri::command]
pub async fn note_create(
    state: State<'_, AppState>,
    input: NoteCreateInput,
) -> Result<Note, IpcError> {
    state
        .annotation_service
        .create_note(input)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn note_update(
    state: State<'_, AppState>,
    input: NoteUpdateInput,
) -> Result<Note, IpcError> {
    state
        .annotation_service
        .update_note(input)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn note_delete(
    state: State<'_, AppState>,
    input: NoteDeleteInput,
) -> Result<(), IpcError> {
    state
        .annotation_service
        .delete_note(&input.id)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn note_list(
    state: State<'_, AppState>,
    input: NoteListInput,
) -> Result<Vec<Note>, IpcError> {
    state
        .annotation_service
        .list_notes(input.document_id.as_deref())
        .await
        .map_err(IpcError::from)
}
