use crate::errors::IpcError;
use crate::models::{ExportInput, ExportResult, ExportShareInput};
use crate::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn export_xlsx(
    state: State<'_, AppState>,
    app: AppHandle,
    input: ExportInput,
) -> Result<ExportResult, IpcError> {
    state
        .export_service
        .export_xlsx(Some(&app), input)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn export_pdf(
    state: State<'_, AppState>,
    app: AppHandle,
    input: ExportInput,
) -> Result<ExportResult, IpcError> {
    state
        .export_service
        .export_pdf(Some(&app), input)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn export_share(
    state: State<'_, AppState>,
    input: ExportShareInput,
) -> Result<(), IpcError> {
    state
        .export_service
        .export_share(&input.path)
        .map_err(Into::into)
}
