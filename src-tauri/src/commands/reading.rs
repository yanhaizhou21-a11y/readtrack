use tauri::State;
use crate::errors::{AppError, IpcError};
use crate::models::{LogicalPosition, ResolvedPosition, ReadingProgress};
use crate::AppState;
use crate::repositories::{DocumentRepo, ProgressRepo};
use crate::parsers::registry::ParserRegistry;
use crate::services::position_service::PositionService;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvePositionInput {
    pub position: LogicalPosition,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgressInput {
    pub document_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgressInput {
    pub document_id: String,
    pub position: LogicalPosition,
}

#[tauri::command]
pub async fn document_resolve_position(
    state: State<'_, AppState>,
    input: ResolvePositionInput,
) -> Result<ResolvedPosition, IpcError> {
    let doc_id = &input.position.document_id;
    let doc = DocumentRepo::get_by_id(&state.db, doc_id).await.map_err(AppError::from)?;
    let doc = doc.ok_or(AppError::DocumentNotFound)?;
    
    let file_store = crate::storage::file_store::FileStore::new(state.storage.clone());
    let path = file_store.get_document_path(&doc.id, &doc.file_type).map_err(AppError::from)?;
    
    let registry = ParserRegistry::new();
    let parser = registry.get(&crate::models::FileType::from_ext(&doc.file_type).unwrap_or(crate::models::FileType::Txt)).ok_or_else(|| AppError::UnsupportedFormat { ext: doc.file_type.to_string() })?;
    
    let normalized = parser.parse(&path).map_err(AppError::from)?;
    
    let position_service = PositionService::new();
    let resolved = position_service.resolve(input.position, &normalized).map_err(AppError::from)?;
    
    Ok(resolved)
}

#[tauri::command]
pub async fn reading_get_progress(
    state: State<'_, AppState>,
    input: ReadingProgressInput,
) -> Result<ReadingProgress, IpcError> {
    let progress = ProgressRepo::get_by_document_id(&state.db, &input.document_id)
        .await
        .map_err(AppError::from)?;
        
    if let Some(p) = progress {
        Ok(p)
    } else {
        // Return a default progress if not found
        Ok(ReadingProgress {
            id: uuid::Uuid::new_v4().to_string(),
            document_id: input.document_id.clone(),
            current_page: None,
            current_position: LogicalPosition {
                document_id: input.document_id,
                section_id: None,
                block_id: None,
                offset: None,
                page: None,
                page_offset: None,
                percentage: 0.0,
                parser_version: 1,
            },
            current_pos: 0,
            current_section_id: None,
            progress_percent: 0.0,
            furthest_pos: 0,
            total_read_ms: 0,
            completed: false,
            completed_at: None,
            updated_at: chrono::Utc::now().timestamp_millis(),
        })
    }
}

#[tauri::command]
pub async fn reading_update_progress(
    state: State<'_, AppState>,
    input: UpdateProgressInput,
) -> Result<(), IpcError> {
    let doc = DocumentRepo::get_by_id(&state.db, &input.document_id).await.map_err(AppError::from)?;
    let _doc = doc.ok_or(AppError::DocumentNotFound)?;
    
    let mut tx = state.db.begin().await.map_err(AppError::from)?;
    
    let existing = ProgressRepo::get_by_document_id(&state.db, &input.document_id)
        .await
        .map_err(AppError::from)?;
        
    let now = chrono::Utc::now().timestamp_millis();
    
    let mut new_progress = if let Some(mut e) = existing {
        e.current_position = input.position.clone();
        e.progress_percent = input.position.percentage;
        e.current_page = input.position.page;
        e.current_section_id = input.position.section_id.map(|s| s.to_string());
        e.updated_at = now;
        e
    } else {
        ReadingProgress {
            id: uuid::Uuid::new_v4().to_string(),
            document_id: input.document_id,
            current_page: input.position.page,
            current_position: input.position.clone(),
            current_pos: 0,
            current_section_id: input.position.section_id.map(|s| s.to_string()),
            progress_percent: input.position.percentage,
            furthest_pos: 0,
            total_read_ms: 0,
            completed: false,
            completed_at: None,
            updated_at: now,
        }
    };
    
    if new_progress.progress_percent >= 1.0 && !new_progress.completed {
        new_progress.completed = true;
        new_progress.completed_at = Some(now);
    }
    
    sqlx::query("DELETE FROM reading_progress WHERE document_id = ?")
        .bind(&new_progress.document_id)
        .execute(&mut *tx)
        .await
        .map_err(AppError::from)?;
        
    ProgressRepo::create(&mut tx, &new_progress).await.map_err(AppError::from)?;
    
    tx.commit().await.map_err(AppError::from)?;
    Ok(())
}
