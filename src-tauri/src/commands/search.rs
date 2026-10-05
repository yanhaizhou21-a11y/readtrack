use tauri::State;

use crate::errors::IpcError;
use crate::models::{DocumentSearchInput, SearchHit};
use crate::AppState;

#[tauri::command]
pub async fn document_search(
    state: State<'_, AppState>,
    input: DocumentSearchInput,
) -> Result<Vec<SearchHit>, IpcError> {
    state
        .search_service
        .search(input)
        .await
        .map_err(IpcError::from)
}
