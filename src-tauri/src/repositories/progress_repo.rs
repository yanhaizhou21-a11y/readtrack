use sqlx::{Row, SqliteConnection, SqlitePool};

use crate::errors::AppError;
use crate::models::{LogicalPosition, ReadingProgress};

pub struct ProgressRepo;

impl ProgressRepo {
    pub async fn create(
        conn: &mut SqliteConnection,
        progress: &ReadingProgress,
    ) -> Result<(), AppError> {
        let position_json = serde_json::to_string(&progress.current_position).map_err(|_| {
            AppError::InvalidDocument {
                reason: "Failed to serialize current position".into(),
            }
        })?;

        sqlx::query(
            r#"
            INSERT INTO reading_progress (
                id, document_id, current_page, current_position, current_pos,
                current_section_id, progress_percent, furthest_pos,
                total_read_ms, completed, completed_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&progress.id)
        .bind(&progress.document_id)
        .bind(progress.current_page)
        .bind(&position_json)
        .bind(progress.current_pos)
        .bind(&progress.current_section_id)
        .bind(progress.progress_percent)
        .bind(progress.furthest_pos)
        .bind(progress.total_read_ms)
        .bind(if progress.completed { 1 } else { 0 })
        .bind(progress.completed_at)
        .bind(progress.updated_at)
        .execute(&mut *conn)
        .await
        .map_err(AppError::from)?;

        Ok(())
    }

    pub async fn upsert(
        conn: &mut SqliteConnection,
        progress: &ReadingProgress,
    ) -> Result<(), AppError> {
        let position_json = serde_json::to_string(&progress.current_position).map_err(|_| {
            AppError::InvalidDocument {
                reason: "Failed to serialize current position".into(),
            }
        })?;

        sqlx::query(
            r#"
            INSERT INTO reading_progress (
                id, document_id, current_page, current_position, current_pos,
                current_section_id, progress_percent, furthest_pos,
                total_read_ms, completed, completed_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(document_id) DO UPDATE SET
                current_page = excluded.current_page,
                current_position = excluded.current_position,
                current_pos = excluded.current_pos,
                current_section_id = excluded.current_section_id,
                progress_percent = excluded.progress_percent,
                furthest_pos = MAX(reading_progress.furthest_pos, excluded.furthest_pos),
                total_read_ms = excluded.total_read_ms,
                completed = excluded.completed,
                completed_at = COALESCE(reading_progress.completed_at, excluded.completed_at),
                updated_at = excluded.updated_at
            "#,
        )
        .bind(&progress.id)
        .bind(&progress.document_id)
        .bind(progress.current_page)
        .bind(&position_json)
        .bind(progress.current_pos)
        .bind(&progress.current_section_id)
        .bind(progress.progress_percent)
        .bind(progress.furthest_pos)
        .bind(progress.total_read_ms)
        .bind(if progress.completed { 1 } else { 0 })
        .bind(progress.completed_at)
        .bind(progress.updated_at)
        .execute(&mut *conn)
        .await
        .map_err(AppError::from)?;

        Ok(())
    }

    pub async fn get_by_document_id(
        pool: &SqlitePool,
        document_id: &str,
    ) -> Result<Option<ReadingProgress>, AppError> {
        let row = sqlx::query(
            r#"
            SELECT id, document_id, current_page, current_position, current_pos,
                   current_section_id, progress_percent, furthest_pos,
                   total_read_ms, completed, completed_at, updated_at
            FROM reading_progress
            WHERE document_id = ?
            "#,
        )
        .bind(document_id)
        .fetch_optional(pool)
        .await
        .map_err(AppError::from)?;

        let Some(r) = row else {
            return Ok(None);
        };

        let pos_str: String = r.get("current_position");
        let position: LogicalPosition =
            serde_json::from_str(&pos_str).map_err(|_| AppError::InvalidDocument {
                reason: "Corrupted position JSON in database".into(),
            })?;

        let completed_int: i64 = r.get("completed");

        Ok(Some(ReadingProgress {
            id: r.get("id"),
            document_id: r.get("document_id"),
            current_page: r.get("current_page"),
            current_position: position,
            current_pos: r.get("current_pos"),
            current_section_id: r.get("current_section_id"),
            progress_percent: r.get("progress_percent"),
            furthest_pos: r.get("furthest_pos"),
            total_read_ms: r.get("total_read_ms"),
            completed: completed_int != 0,
            completed_at: r.get("completed_at"),
            updated_at: r.get("updated_at"),
        }))
    }

    pub async fn mark_completed(
        conn: &mut SqliteConnection,
        document_id: &str,
        now: i64,
    ) -> Result<(), AppError> {
        sqlx::query(
            r#"
            UPDATE reading_progress
            SET progress_percent = 1.0,
                completed = 1,
                completed_at = COALESCE(completed_at, ?),
                updated_at = ?
            WHERE document_id = ?
            "#,
        )
        .bind(now)
        .bind(now)
        .bind(document_id)
        .execute(&mut *conn)
        .await
        .map_err(AppError::from)?;

        Ok(())
    }

    pub async fn mark_unread(
        conn: &mut SqliteConnection,
        document_id: &str,
        now: i64,
    ) -> Result<(), AppError> {
        sqlx::query(
            r#"
            UPDATE reading_progress
            SET progress_percent = 0.0,
                completed = 0,
                completed_at = NULL,
                updated_at = ?
            WHERE document_id = ?
            "#,
        )
        .bind(now)
        .bind(document_id)
        .execute(&mut *conn)
        .await
        .map_err(AppError::from)?;

        Ok(())
    }
}
