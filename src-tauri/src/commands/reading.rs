use tauri::State;
use serde::Deserialize;

use crate::AppState;
use crate::errors::{AppError, IpcError};
use crate::models::{
    EndSessionInput, GetSessionsInput, HomeDashboard, HomeDashboardInput, LogicalPosition,
    ReadingMap, ReadingProgress, ReadingSession, ResolvedPosition, SessionSummary,
    StartSessionInput, StartSessionResponse, TrackerOverview, TrackerOverviewInput,
    ViewportReport,
};
use crate::parsers::registry::ParserRegistry;
use crate::repositories::{DocumentRepo, ProgressRepo, SessionRepo};
use crate::services::position_service::PositionService;

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
    let doc = DocumentRepo::get_by_id(&state.db, doc_id)
        .await?
        .ok_or(AppError::DocumentNotFound)?;

    let file_store = crate::storage::file_store::FileStore::new(state.storage.clone());
    let path = file_store
        .get_document_path(&doc.id, &doc.file_type)?;

    let registry = ParserRegistry::new();
    let parser = registry
        .get(&crate::models::FileType::from_ext(&doc.file_type).unwrap_or(crate::models::FileType::Txt))
        .ok_or_else(|| AppError::UnsupportedFormat { ext: doc.file_type.to_string() })?;

    let normalized = parser.parse(&path)?;
    let position_service = PositionService::new();
    let resolved = position_service
        .resolve(input.position, &normalized)?;

    Ok(resolved)
}

#[tauri::command]
pub async fn reading_get_progress(
    state: State<'_, AppState>,
    input: ReadingProgressInput,
) -> Result<ReadingProgress, IpcError> {
    let progress = ProgressRepo::get_by_document_id(&state.db, &input.document_id)
        .await?;

    if let Some(p) = progress {
        Ok(p)
    } else {
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
    let _doc = DocumentRepo::get_by_id(&state.db, &input.document_id)
        .await?
        .ok_or(AppError::DocumentNotFound)?;

    let now = chrono::Utc::now().timestamp_millis();
    let existing = ProgressRepo::get_by_document_id(&state.db, &input.document_id)
        .await?;

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

    let mut tx = state.db.begin().await?;
    ProgressRepo::upsert(&mut tx, &new_progress).await?;
    tx.commit().await?;

    Ok(())
}

#[tauri::command]
pub async fn reading_start_session(
    state: State<'_, AppState>,
    input: StartSessionInput,
) -> Result<StartSessionResponse, IpcError> {
    let session_id = state
        .tracker_service
        .start_session(input.document_id, input.position)
        .await?;

    Ok(StartSessionResponse { session_id })
}

#[tauri::command]
pub async fn reading_report_viewport(
    state: State<'_, AppState>,
    input: ViewportReport,
) -> Result<(), IpcError> {
    state
        .tracker_service
        .report_viewport(input)
        .await?;

    Ok(())
}

#[tauri::command]
pub async fn reading_end_session(
    state: State<'_, AppState>,
    input: EndSessionInput,
) -> Result<Option<SessionSummary>, IpcError> {
    let summary = state
        .tracker_service
        .end_session(&input.session_id, input.position)
        .await?;

    Ok(summary)
}

#[tauri::command]
pub async fn reading_get_sessions(
    state: State<'_, AppState>,
    input: GetSessionsInput,
) -> Result<Vec<ReadingSession>, IpcError> {
    let sessions = SessionRepo::list_sessions(
        &state.db,
        input.document_id.as_deref(),
        input.from,
        input.to,
        input.limit.unwrap_or(50),
        input.offset.unwrap_or(0),
    )
    .await?;

    Ok(sessions)
}

#[tauri::command]
pub async fn tracker_get_map(
    state: State<'_, AppState>,
    input: ReadingProgressInput,
) -> Result<ReadingMap, IpcError> {
    let map = state
        .tracker_service
        .get_reading_map(&input.document_id)
        .await?;

    Ok(map)
}

#[tauri::command]
pub async fn tracker_get_overview(
    state: State<'_, AppState>,
    input: TrackerOverviewInput,
) -> Result<TrackerOverview, IpcError> {
    let overview = state
        .tracker_service
        .get_overview(input.now, input.tz_offset_min)
        .await?;

    Ok(overview)
}

#[tauri::command]
pub async fn home_get_dashboard(
    state: State<'_, AppState>,
    input: HomeDashboardInput,
) -> Result<HomeDashboard, IpcError> {
    let dashboard = state
        .tracker_service
        .get_home_dashboard(input.now, input.tz_offset_min)
        .await?;

    Ok(dashboard)
}

#[tauri::command]
pub async fn reading_mark_completed(
    state: State<'_, AppState>,
    input: ReadingProgressInput,
) -> Result<ReadingProgress, IpcError> {
    let progress = state
        .tracker_service
        .mark_completed(&input.document_id)
        .await?;

    Ok(progress)
}

#[tauri::command]
pub async fn reading_mark_unread(
    state: State<'_, AppState>,
    input: ReadingProgressInput,
) -> Result<ReadingProgress, IpcError> {
    let progress = state
        .tracker_service
        .mark_unread(&input.document_id)
        .await?;

    Ok(progress)
}
