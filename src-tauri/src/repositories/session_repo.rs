use sqlx::{Row, SqliteConnection, SqlitePool};
use crate::errors::AppError;
use crate::models::{DayActivity, LogicalPosition, ReadingSession};

pub struct SessionRepo;

impl SessionRepo {
    pub async fn create(
        conn: &mut SqliteConnection,
        session: &ReadingSession,
    ) -> Result<(), AppError> {
        let start_pos_json = match &session.start_position {
            Some(pos) => Some(serde_json::to_string(pos).map_err(|_| AppError::InvalidInput {
                field: "start_position".to_string(),
            })?),
            None => None,
        };

        let end_pos_json = match &session.end_position {
            Some(pos) => Some(serde_json::to_string(pos).map_err(|_| AppError::InvalidInput {
                field: "end_position".to_string(),
            })?),
            None => None,
        };

        sqlx::query(
            r#"
            INSERT INTO reading_sessions (
                id, document_id, started_at, ended_at, last_heartbeat_at,
                duration_seconds, active_seconds, start_position, end_position,
                start_pos, end_pos, pages_read, segments_read
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&session.id)
        .bind(&session.document_id)
        .bind(session.started_at)
        .bind(session.ended_at)
        .bind(session.last_heartbeat_at)
        .bind(session.duration_seconds)
        .bind(session.active_seconds)
        .bind(start_pos_json)
        .bind(end_pos_json)
        .bind(session.start_pos)
        .bind(session.end_pos)
        .bind(session.pages_read)
        .bind(session.segments_read)
        .execute(&mut *conn)
        .await
        .map_err(AppError::from)?;

        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn update_heartbeat(
        conn: &mut SqliteConnection,
        session_id: &str,
        now: i64,
        duration_seconds: i64,
        active_seconds: i64,
        end_pos: i64,
        end_position: Option<&LogicalPosition>,
        pages_read: i64,
        segments_read: i64,
    ) -> Result<(), AppError> {
        let end_pos_json = match end_position {
            Some(pos) => Some(serde_json::to_string(pos).map_err(|_| AppError::InvalidInput {
                field: "end_position".to_string(),
            })?),
            None => None,
        };

        sqlx::query(
            r#"
            UPDATE reading_sessions
            SET last_heartbeat_at = ?,
                duration_seconds = ?,
                active_seconds = ?,
                end_pos = ?,
                end_position = ?,
                pages_read = ?,
                segments_read = ?
            WHERE id = ?
            "#,
        )
        .bind(now)
        .bind(duration_seconds)
        .bind(active_seconds)
        .bind(end_pos)
        .bind(end_pos_json)
        .bind(pages_read)
        .bind(segments_read)
        .bind(session_id)
        .execute(&mut *conn)
        .await
        .map_err(AppError::from)?;

        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn close_session(
        conn: &mut SqliteConnection,
        session_id: &str,
        ended_at: i64,
        duration_seconds: i64,
        active_seconds: i64,
        end_pos: i64,
        end_position: Option<&LogicalPosition>,
        pages_read: i64,
        segments_read: i64,
    ) -> Result<(), AppError> {
        let end_pos_json = match end_position {
            Some(pos) => Some(serde_json::to_string(pos).map_err(|_| AppError::InvalidInput {
                field: "end_position".to_string(),
            })?),
            None => None,
        };

        sqlx::query(
            r#"
            UPDATE reading_sessions
            SET ended_at = ?,
                last_heartbeat_at = ?,
                duration_seconds = ?,
                active_seconds = ?,
                end_pos = ?,
                end_position = ?,
                pages_read = ?,
                segments_read = ?
            WHERE id = ?
            "#,
        )
        .bind(ended_at)
        .bind(ended_at)
        .bind(duration_seconds)
        .bind(active_seconds)
        .bind(end_pos)
        .bind(end_pos_json)
        .bind(pages_read)
        .bind(segments_read)
        .bind(session_id)
        .execute(&mut *conn)
        .await
        .map_err(AppError::from)?;

        Ok(())
    }

    pub async fn delete(
        conn: &mut SqliteConnection,
        session_id: &str,
    ) -> Result<(), AppError> {
        sqlx::query("DELETE FROM reading_sessions WHERE id = ?")
            .bind(session_id)
            .execute(&mut *conn)
            .await
            .map_err(AppError::from)?;

        Ok(())
    }

    pub async fn get_by_id(
        pool: &SqlitePool,
        session_id: &str,
    ) -> Result<Option<ReadingSession>, AppError> {
        let row = sqlx::query(
            r#"
            SELECT id, document_id, started_at, ended_at, last_heartbeat_at,
                   duration_seconds, active_seconds, start_position, end_position,
                   start_pos, end_pos, pages_read, segments_read
            FROM reading_sessions
            WHERE id = ?
            "#,
        )
        .bind(session_id)
        .fetch_optional(pool)
        .await
        .map_err(AppError::from)?;

        let Some(r) = row else {
            return Ok(None);
        };

        Ok(Some(Self::row_to_session(&r)?))
    }

    pub async fn recover_orphaned_sessions(pool: &SqlitePool) -> Result<u64, AppError> {
        let res = sqlx::query(
            r#"
            UPDATE reading_sessions
            SET ended_at = last_heartbeat_at
            WHERE ended_at IS NULL
            "#,
        )
        .execute(pool)
        .await
        .map_err(AppError::from)?;

        Ok(res.rows_affected())
    }

    pub async fn list_sessions(
        pool: &SqlitePool,
        doc_id: Option<&str>,
        from: Option<i64>,
        to: Option<i64>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ReadingSession>, AppError> {
        let mut q = String::from(
            r#"
            SELECT id, document_id, started_at, ended_at, last_heartbeat_at,
                   duration_seconds, active_seconds, start_position, end_position,
                   start_pos, end_pos, pages_read, segments_read
            FROM reading_sessions
            WHERE 1=1
            "#,
        );

        if doc_id.is_some() {
            q.push_str(" AND document_id = ?");
        }
        if from.is_some() {
            q.push_str(" AND started_at >= ?");
        }
        if to.is_some() {
            q.push_str(" AND started_at <= ?");
        }

        q.push_str(" ORDER BY started_at DESC LIMIT ? OFFSET ?");

        let mut query = sqlx::query(&q);
        if let Some(id) = doc_id {
            query = query.bind(id);
        }
        if let Some(f) = from {
            query = query.bind(f);
        }
        if let Some(t) = to {
            query = query.bind(t);
        }
        query = query.bind(limit).bind(offset);

        let rows = query.fetch_all(pool).await.map_err(AppError::from)?;
        let mut results = Vec::with_capacity(rows.len());
        for r in rows {
            results.push(Self::row_to_session(&r)?);
        }

        Ok(results)
    }

    pub async fn count_for_doc(pool: &SqlitePool, doc_id: &str) -> Result<i64, AppError> {
        let row = sqlx::query("SELECT COUNT(*) as cnt FROM reading_sessions WHERE document_id = ?")
            .bind(doc_id)
            .fetch_one(pool)
            .await
            .map_err(AppError::from)?;

        let cnt: i64 = row.get("cnt");
        Ok(cnt)
    }

    pub async fn get_time_stats(
        pool: &SqlitePool,
        now: i64,
        tz_offset_min: i32,
    ) -> Result<(i64, i64, Vec<DayActivity>), AppError> {
        // Calculate start of day (midnight) in local time
        // Note: tz_offset_min is minutes offset from UTC (positive = east of UTC)
        let offset_ms = (tz_offset_min as i64) * 60_000;
        let local_now = now + offset_ms;
        let day_ms = 86_400_000i64;
        let local_midnight = (local_now / day_ms) * day_ms;
        let today_start_utc = local_midnight - offset_ms;
        let week_start_utc = today_start_utc - (6 * day_ms);

        // Query today's active seconds
        let today_row = sqlx::query(
            "SELECT COALESCE(SUM(active_seconds), 0) as sec FROM reading_sessions WHERE started_at >= ?",
        )
        .bind(today_start_utc)
        .fetch_one(pool)
        .await
        .map_err(AppError::from)?;
        let today_sec: i64 = today_row.get("sec");
        let today_ms = today_sec * 1000;

        // Query week's active seconds
        let week_row = sqlx::query(
            "SELECT COALESCE(SUM(active_seconds), 0) as sec FROM reading_sessions WHERE started_at >= ?",
        )
        .bind(week_start_utc)
        .fetch_one(pool)
        .await
        .map_err(AppError::from)?;
        let week_sec: i64 = week_row.get("sec");
        let week_ms = week_sec * 1000;

        // Query last 7 days breakdown
        let sessions = sqlx::query(
            r#"
            SELECT started_at, active_seconds
            FROM reading_sessions
            WHERE started_at >= ?
            ORDER BY started_at ASC
            "#,
        )
        .bind(week_start_utc)
        .fetch_all(pool)
        .await
        .map_err(AppError::from)?;

        let mut daily_ms_map = std::collections::BTreeMap::<String, i64>::new();
        // Initialize 7 days
        for day_idx in 0..7 {
            let day_local_ms = local_midnight - (6 - day_idx) * day_ms;
            let date_str = chrono::DateTime::from_timestamp_millis(day_local_ms)
                .map(|dt| dt.format("%Y-%m-%d").to_string())
                .unwrap_or_else(|| "1970-01-01".to_string());
            daily_ms_map.insert(date_str, 0);
        }

        for r in sessions {
            let started_at: i64 = r.get("started_at");
            let active_sec: i64 = r.get("active_seconds");
            let local_session = started_at + offset_ms;
            if let Some(dt) = chrono::DateTime::from_timestamp_millis(local_session) {
                let date_str = dt.format("%Y-%m-%d").to_string();
                if let Some(entry) = daily_ms_map.get_mut(&date_str) {
                    *entry += active_sec * 1000;
                }
            }
        }

        let activity_by_day = daily_ms_map
            .into_iter()
            .map(|(date, ms)| DayActivity { date, ms })
            .collect();

        Ok((today_ms, week_ms, activity_by_day))
    }

    fn row_to_session(r: &sqlx::sqlite::SqliteRow) -> Result<ReadingSession, AppError> {
        let start_pos_str: Option<String> = r.get("start_position");
        let end_pos_str: Option<String> = r.get("end_position");

        let start_position = match start_pos_str {
            Some(s) => serde_json::from_str(&s).ok(),
            None => None,
        };

        let end_position = match end_pos_str {
            Some(s) => serde_json::from_str(&s).ok(),
            None => None,
        };

        Ok(ReadingSession {
            id: r.get("id"),
            document_id: r.get("document_id"),
            started_at: r.get("started_at"),
            ended_at: r.get("ended_at"),
            last_heartbeat_at: r.get("last_heartbeat_at"),
            duration_seconds: r.get("duration_seconds"),
            active_seconds: r.get("active_seconds"),
            start_position,
            end_position,
            start_pos: r.get("start_pos"),
            end_pos: r.get("end_pos"),
            pages_read: r.get("pages_read"),
            segments_read: r.get("segments_read"),
        })
    }
}
