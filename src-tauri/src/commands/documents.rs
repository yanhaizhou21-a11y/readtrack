use tauri::{AppHandle, State};

use crate::errors::IpcError;
use crate::models::{
    DocumentArchiveInput, DocumentDeleteInput, DocumentDetail, DocumentGetInput,
    DocumentGetSectionsInput, DocumentImportBytesInput, DocumentImportInput, DocumentListInput,
    DocumentListResponse, DocumentRenameInput, DocumentSummary, DocumentTouchInput,
    SectionPayload,
};
use crate::AppState;

#[tauri::command]
pub async fn document_import(
    state: State<'_, AppState>,
    app: AppHandle,
    input: DocumentImportInput,
) -> Result<DocumentSummary, IpcError> {
    state
        .import_service
        .import_document(Some(&app), input)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn document_import_bytes(
    state: State<'_, AppState>,
    app: AppHandle,
    input: DocumentImportBytesInput,
) -> Result<DocumentSummary, IpcError> {
    state
        .import_service
        .import_document_bytes(Some(&app), input.file_name, input.data, input.on_duplicate)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn document_list(
    state: State<'_, AppState>,
    input: DocumentListInput,
) -> Result<DocumentListResponse, IpcError> {
    state
        .library_service
        .list(input)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn document_get(
    state: State<'_, AppState>,
    input: DocumentGetInput,
) -> Result<DocumentDetail, IpcError> {
    state
        .library_service
        .get(&input.id)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn document_rename(
    state: State<'_, AppState>,
    app: AppHandle,
    input: DocumentRenameInput,
) -> Result<DocumentSummary, IpcError> {
    state
        .library_service
        .rename(Some(&app), &input.id, &input.title)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn document_archive(
    state: State<'_, AppState>,
    app: AppHandle,
    input: DocumentArchiveInput,
) -> Result<DocumentSummary, IpcError> {
    state
        .library_service
        .archive(Some(&app), &input.id, input.archived)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn document_delete(
    state: State<'_, AppState>,
    app: AppHandle,
    input: DocumentDeleteInput,
) -> Result<(), IpcError> {
    state
        .library_service
        .delete(Some(&app), &input.id)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn document_touch(
    state: State<'_, AppState>,
    input: DocumentTouchInput,
) -> Result<(), IpcError> {
    state
        .library_service
        .touch(&input.id)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn document_get_sections(
    state: State<'_, AppState>,
    input: DocumentGetSectionsInput,
) -> Result<Vec<SectionPayload>, IpcError> {
    state
        .library_service
        .get_sections(&input.id, input.from_index, input.count)
        .await
        .map_err(IpcError::from)
}
