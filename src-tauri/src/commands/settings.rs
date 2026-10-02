use crate::errors::IpcError;
use crate::AppState;
use serde_json::Value;
use std::collections::HashMap;
use tauri::State;

#[tauri::command]
pub async fn settings_get_all(
    state: State<'_, AppState>,
) -> Result<HashMap<String, Value>, IpcError> {
    state
        .settings_service
        .get_all(&state.db)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn settings_set(
    state: State<'_, AppState>,
    key: String,
    value: Value,
) -> Result<(), IpcError> {
    state
        .settings_service
        .set(&state.db, &key, value)
        .await
        .map_err(Into::into)
}
