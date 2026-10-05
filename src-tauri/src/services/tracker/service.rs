use std::collections::HashMap;
use std::sync::Arc;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::errors::AppError;
use crate::models::{
    ContinueCard, DocumentSummary, HomeDashboard, LogicalPosition,
    ReadingMap, ReadingProgress, ReadingProgressUpdatedPayload, SessionSummary, TrackerOverview,
    ViewportReport,
};
use crate::repositories::{
    DocumentRepo, ProgressRepo, SectionRepo, SegmentRepo, SessionRepo,
};
use super::accumulator::SessionAccumulator;
use super::engine::{build_map_sections, calculate_progress};

pub struct TrackerService {
    pool: SqlitePool,
    active_sessions: Arc<Mutex<HashMap<String, SessionAccumulator>>>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
}

impl TrackerService {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            pool,
            active_sessions: Arc::new(Mutex::new(HashMap::new())),
            app_handle: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn set_app_handle(&self, handle: AppHandle) {
        let mut app_handle_guard = self.app_handle.lock().await;
        *app_handle_guard = Some(handle);
    }

    pub async fn start_session(
        &self,
        document_id: String,
        position: LogicalPosition,
    ) -> Result<String, AppError> {
        let doc = DocumentRepo::get_by_id(&self.pool, &document_id)
            .await?
            .ok_or(AppError::DocumentNotFound)?;

        let session_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();

        let segments = SegmentRepo::get_by_document_id(&self.pool, &doc.id).await?;

        let session_record = crate::models::ReadingSession {
            id: session_id.clone(),
            document_id: doc.id.clone(),
            started_at: now,
            ended_at: None,
            last_heartbeat_at: now,
            duration_seconds: 0,
            active_seconds: 0,
            start_position: Some(position.clone()),
            end_position: Some(position.clone()),
            start_pos: 0,
            end_pos: 0,
            pages_read: 0,
            segments_read: 0,
        };

        let mut tx = self.pool.begin().await?;
        SessionRepo::create(&mut tx, &session_record).await?;
        tx.commit().await?;

        let accumulator = SessionAccumulator::new(
            session_id.clone(),
            doc.id,
            now,
            position,
            segments,
        );

        let mut sessions = self.active_sessions.lock().await;
        sessions.insert(session_id.clone(), accumulator);

        Ok(session_id)
    }

    pub async fn report_viewport(&self, report: ViewportReport) -> Result<(), AppError> {
        let mut sessions = self.active_sessions.lock().await;
        let Some(acc) = sessions.get_mut(&report.session_id) else {
            return Err(AppError::NotFound {
                entity: format!("ReadingSession {}", report.session_id),
            });
        };

        acc.process_report(&report);

        if acc.should_flush(report.ts) {
            Self::flush_accumulator(&self.pool, acc, &self.app_handle).await?;
        }

        Ok(())
    }

    pub async fn end_session(
        &self,
        session_id: &str,
        position: LogicalPosition,
    ) -> Result<Option<SessionSummary>, AppError> {
        let mut sessions = self.active_sessions.lock().await;
        let mut acc = match sessions.remove(session_id) {
            Some(a) => a,
            None => {
                let existing = SessionRepo::get_by_id(&self.pool, session_id).await?;
                return Ok(existing.map(|s| SessionSummary {
                    session_id: s.id,
                    document_id: s.document_id,
                    started_at: s.started_at,
                    ended_at: s.ended_at.unwrap_or(s.last_heartbeat_at),
                    duration_seconds: s.duration_seconds,
                    active_seconds: s.active_seconds,
                    pages_read: s.pages_read,
                    segments_read: s.segments_read,
                }));
            }
        };

        let now = chrono::Utc::now().timestamp_millis();
        acc.end_position = Some(position);
        acc.duration_seconds = ((now - acc.started_at).max(0) / 1000) as i64;

        if acc.is_noise() {
            let mut tx = self.pool.begin().await?;
            SessionRepo::delete(&mut tx, session_id).await?;
            tx.commit().await?;
            return Ok(None);
        }

        Self::flush_accumulator(&self.pool, &mut acc, &self.app_handle).await?;

        let mut tx = self.pool.begin().await?;
        SessionRepo::close_session(
            &mut tx,
            &acc.session_id,
            now,
            acc.duration_seconds,
            acc.active_seconds(),
            acc.end_pos,
            acc.end_position.as_ref(),
            acc.pages_read_this_session.len() as i64,
            acc.segments_read_this_session.len() as i64,
        )
        .await?;
        tx.commit().await?;

        let final_session_id = acc.session_id.clone();
        let final_document_id = acc.document_id.clone();
        let final_started_at = acc.started_at;
        let final_duration = acc.duration_seconds;
        let final_active = acc.active_seconds();
        let final_pages = acc.pages_read_this_session.len() as i64;
        let final_segments = acc.segments_read_this_session.len() as i64;

        Ok(Some(SessionSummary {
            session_id: final_session_id,
            document_id: final_document_id,
            started_at: final_started_at,
            ended_at: now,
            duration_seconds: final_duration,
            active_seconds: final_active,
            pages_read: final_pages,
            segments_read: final_segments,
        }))
    }

    pub async fn flush_all(&self) -> Result<(), AppError> {
        let mut sessions = self.active_sessions.lock().await;
        for acc in sessions.values_mut() {
            if acc.dirty {
                Self::flush_accumulator(&self.pool, acc, &self.app_handle).await?;
            }
        }
        Ok(())
    }

    pub async fn crash_recovery(&self) -> Result<u64, AppError> {
        SessionRepo::recover_orphaned_sessions(&self.pool).await
    }

    pub async fn get_reading_map(&self, document_id: &str) -> Result<ReadingMap, AppError> {
        let _doc = DocumentRepo::get_by_id(&self.pool, document_id)
            .await?
            .ok_or(AppError::DocumentNotFound)?;

        // If there's an active session for this document, flush it first
        {
            let mut sessions = self.active_sessions.lock().await;
            for acc in sessions.values_mut() {
                if acc.document_id == document_id && acc.dirty {
                    Self::flush_accumulator(&self.pool, acc, &self.app_handle).await?;
                }
            }
        }

        let sections = SectionRepo::get_by_document_id(&self.pool, document_id).await?;
        let segments = SegmentRepo::get_by_document_id(&self.pool, document_id).await?;
        let progress = ProgressRepo::get_by_document_id(&self.pool, document_id).await?;
        let session_count = SessionRepo::count_for_doc(&self.pool, document_id).await?;

        let mut section_map = HashMap::new();
        for s in &sections {
            section_map.insert(
                s.id.clone(),
                (s.section_index, s.title.clone().unwrap_or_else(|| format!("Section {}", s.section_index))),
            );
        }

        let current_section_id = progress.as_ref().and_then(|p| p.current_section_id.as_deref());
        let map_sections = build_map_sections(&segments, &section_map, current_section_id);

        let (calc_progress, calc_completed) = calculate_progress(
            &segments,
            progress.as_ref().and_then(|p| p.current_position.section_id),
        );

        let default_pos = LogicalPosition {
            document_id: document_id.to_string(),
            section_id: None,
            block_id: None,
            offset: None,
            page: None,
            page_offset: None,
            percentage: 0.0,
            parser_version: 1,
        };

        let current_pos = progress
            .as_ref()
            .map(|p| p.current_position.clone())
            .unwrap_or(default_pos);

        let total_read_ms = segments.iter().map(|s| s.dwell_ms).sum();
        let last_read_at = segments.iter().filter_map(|s| s.last_read_at).max();

        Ok(ReadingMap {
            document_id: document_id.to_string(),
            progress: progress.as_ref().map(|p| p.progress_percent).unwrap_or(calc_progress),
            completed: progress.as_ref().map(|p| p.completed).unwrap_or(calc_completed),
            total_read_ms,
            sessions: session_count,
            last_read_at,
            sections: map_sections,
            current: current_pos,
        })
    }

    pub async fn get_overview(
        &self,
        now: i64,
        tz_offset_min: i32,
    ) -> Result<TrackerOverview, AppError> {
        let (today_ms, week_ms, activity_by_day) =
            SessionRepo::get_time_stats(&self.pool, now, tz_offset_min).await?;

        let (all_docs, _total) = DocumentRepo::list(
            &self.pool,
            Some("all"),
            Some("recent_opened"),
            None,
            100,
            0,
        )
        .await?;

        let total_documents = all_docs.len() as i64;
        let completed_count = all_docs.iter().filter(|d| d.completed).count() as i64;

        let currently_reading: Vec<DocumentSummary> = all_docs
            .into_iter()
            .filter(|d| d.progress > 0.0 && !d.completed && !d.is_archived)
            .collect();

        Ok(TrackerOverview {
            today_ms,
            week_ms,
            documents: total_documents,
            completed: completed_count,
            currently_reading,
            activity_by_day,
        })
    }

    pub async fn get_home_dashboard(
        &self,
        now: i64,
        tz_offset_min: i32,
    ) -> Result<HomeDashboard, AppError> {
        let (_today_ms, _week_ms, activity) =
            SessionRepo::get_time_stats(&self.pool, now, tz_offset_min).await?;

        let (recent_docs, _total) = DocumentRepo::list(
            &self.pool,
            Some("all"),
            Some("recent_opened"),
            None,
            5,
            0,
        )
        .await?;

        let (_in_prog, currently_reading_count) = DocumentRepo::list(
            &self.pool,
            Some("in_progress"),
            None,
            None,
            100,
            0,
        )
        .await?;

        let (_comp, completed_count) = DocumentRepo::list(
            &self.pool,
            Some("completed"),
            None,
            None,
            100,
            0,
        )
        .await?;

        let continue_reading = if let Some(first) = recent_docs.first() {
            let prog = ProgressRepo::get_by_document_id(&self.pool, &first.id).await?;
            let pos = prog
                .as_ref()
                .map(|p| p.current_position.clone())
                .unwrap_or_else(|| LogicalPosition {
                    document_id: first.id.clone(),
                    section_id: None,
                    block_id: None,
                    offset: None,
                    page: None,
                    page_offset: None,
                    percentage: first.progress,
                    parser_version: 1,
                });

            let sec_title = if let Some(sec_idx) = pos.section_id {
                let sections = SectionRepo::get_by_document_id(&self.pool, &first.id).await?;
                sections
                    .into_iter()
                    .find(|s| s.section_index == sec_idx)
                    .and_then(|s| s.title)
            } else {
                None
            };

            Some(ContinueCard {
                document: first.clone(),
                section_title: sec_title,
                progress: first.progress,
                position: pos,
            })
        } else {
            None
        };

        Ok(HomeDashboard {
            continue_reading,
            recent: recent_docs,
            currently_reading: currently_reading_count,
            completed: completed_count,
            activity,
        })
    }

    pub async fn mark_completed(&self, document_id: &str) -> Result<ReadingProgress, AppError> {
        let now = chrono::Utc::now().timestamp_millis();
        let mut tx = self.pool.begin().await?;

        SegmentRepo::mark_all_as_read(&mut tx, document_id, now).await?;
        ProgressRepo::mark_completed(&mut tx, document_id, now).await?;

        tx.commit().await?;

        let mut sessions = self.active_sessions.lock().await;
        for acc in sessions.values_mut() {
            if acc.document_id == document_id {
                for seg in acc.segments.values_mut() {
                    seg.status = "read".to_string();
                    seg.last_read_at = Some(now);
                }
                acc.dirty = true;
            }
        }

        let updated = ProgressRepo::get_by_document_id(&self.pool, document_id)
            .await?
            .ok_or(AppError::DocumentNotFound)?;

        Self::emit_progress(
            &self.app_handle,
            document_id,
            1.0,
            updated.current_section_id.clone(),
            true,
        )
        .await;

        Ok(updated)
    }

    pub async fn mark_unread(&self, document_id: &str) -> Result<ReadingProgress, AppError> {
        let now = chrono::Utc::now().timestamp_millis();
        let mut tx = self.pool.begin().await?;

        SegmentRepo::reset_all_for_doc(&mut tx, document_id).await?;
        ProgressRepo::mark_unread(&mut tx, document_id, now).await?;

        tx.commit().await?;

        let mut sessions = self.active_sessions.lock().await;
        for acc in sessions.values_mut() {
            if acc.document_id == document_id {
                for seg in acc.segments.values_mut() {
                    seg.status = "unread".to_string();
                    seg.dwell_ms = 0;
                    seg.first_read_at = None;
                    seg.last_read_at = None;
                    seg.read_count = 0;
                }
                acc.session_dwell.clear();
                acc.segments_read_this_session.clear();
                acc.dirty = true;
            }
        }

        let updated = ProgressRepo::get_by_document_id(&self.pool, document_id)
            .await?
            .ok_or(AppError::DocumentNotFound)?;

        Self::emit_progress(
            &self.app_handle,
            document_id,
            0.0,
            updated.current_section_id.clone(),
            false,
        )
        .await;

        Ok(updated)
    }

    async fn flush_accumulator(
        pool: &SqlitePool,
        acc: &mut SessionAccumulator,
        app_handle: &Arc<Mutex<Option<AppHandle>>>,
    ) -> Result<(), AppError> {
        let now = chrono::Utc::now().timestamp_millis();
        acc.last_flush_at = now;
        acc.dirty = false;

        let seg_list: Vec<crate::models::ReadingSegment> = acc.segments.values().cloned().collect();
        let (calc_prog, calc_completed) = calculate_progress(
            &seg_list,
            acc.end_position.as_ref().and_then(|p| p.section_id),
        );

        let mut tx = pool.begin().await?;

        SegmentRepo::update_batch_state(&mut tx, &seg_list).await?;

        SessionRepo::update_heartbeat(
            &mut tx,
            &acc.session_id,
            acc.last_heartbeat_at,
            acc.duration_seconds,
            acc.active_seconds(),
            acc.end_pos,
            acc.end_position.as_ref(),
            acc.pages_read_this_session.len() as i64,
            acc.segments_read_this_session.len() as i64,
        )
        .await?;

        let total_read_ms: i64 = seg_list.iter().map(|s| s.dwell_ms).sum();

        let real_section_id = if let Some(sec_idx) = acc.end_position.as_ref().and_then(|p| p.section_id) {
            sqlx::query_scalar::<_, String>(
                "SELECT id FROM document_sections WHERE document_id = ? AND section_index = ?"
            )
            .bind(&acc.document_id)
            .bind(sec_idx)
            .fetch_optional(&mut *tx)
            .await
            .ok()
            .flatten()
        } else {
            None
        };

        let progress = ReadingProgress {
            id: uuid::Uuid::new_v4().to_string(),
            document_id: acc.document_id.clone(),
            current_page: acc.end_position.as_ref().and_then(|p| p.page),
            current_position: acc.end_position.clone().unwrap_or_else(|| LogicalPosition {
                document_id: acc.document_id.clone(),
                section_id: None,
                block_id: None,
                offset: None,
                page: None,
                page_offset: None,
                percentage: calc_prog,
                parser_version: 1,
            }),
            current_pos: acc.end_pos,
            current_section_id: real_section_id,
            progress_percent: calc_prog,
            furthest_pos: acc.end_pos,
            total_read_ms,
            completed: calc_completed,
            completed_at: if calc_completed { Some(now) } else { None },
            updated_at: now,
        };

        ProgressRepo::upsert(&mut tx, &progress).await?;

        tx.commit().await?;

        Self::emit_progress(
            app_handle,
            &acc.document_id,
            calc_prog,
            progress.current_section_id,
            calc_completed,
        )
        .await;

        Ok(())
    }

    async fn emit_progress(
        app_handle: &Arc<Mutex<Option<AppHandle>>>,
        doc_id: &str,
        progress: f64,
        sec_id: Option<String>,
        completed: bool,
    ) {
        let handle = app_handle.lock().await;
        if let Some(h) = &*handle {
            let payload = ReadingProgressUpdatedPayload {
                document_id: doc_id.to_string(),
                progress,
                current_section_id: sec_id,
                completed,
            };
            let _ = h.emit("reading_progress_updated", payload);
        }
    }
}
