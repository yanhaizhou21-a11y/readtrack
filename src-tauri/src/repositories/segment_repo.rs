use sqlx::{Row, SqliteConnection, SqlitePool};

use crate::errors::AppError;
use crate::models::ReadingSegment;

pub struct SegmentRepo;

impl SegmentRepo {
    pub async fn insert_batch(
        conn: &mut SqliteConnection,
        segments: &[ReadingSegment],
    ) -> Result<(), AppError> {
        for seg in segments {
            sqlx::query(
                r#"
                INSERT INTO reading_segments (
                    id, document_id, section_id, segment_type, segment_index,
                    first_block_id, last_block_id, start_position, end_position,
                    word_count, status, dwell_ms, first_read_at, last_read_at,
                    read_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(&seg.id)
            .bind(&seg.document_id)
            .bind(&seg.section_id)
            .bind(&seg.segment_type)
            .bind(seg.segment_index)
            .bind(&seg.first_block_id)
            .bind(&seg.last_block_id)
            .bind(seg.start_position)
            .bind(seg.end_position)
            .bind(seg.word_count)
            .bind(&seg.status)
            .bind(seg.dwell_ms)
            .bind(seg.first_read_at)
            .bind(seg.last_read_at)
            .bind(seg.read_count)
            .execute(&mut *conn)
            .await
            .map_err(AppError::from)?;
        }
        Ok(())
    }

    pub async fn get_by_document_id(
        pool: &SqlitePool,
        document_id: &str,
    ) -> Result<Vec<ReadingSegment>, AppError> {
        let rows = sqlx::query(
            r#"
            SELECT id, document_id, section_id, segment_type, segment_index,
                   first_block_id, last_block_id, start_position, end_position,
                   word_count, status, dwell_ms, first_read_at, last_read_at,
                   read_count
            FROM reading_segments
            WHERE document_id = ?
            ORDER BY segment_index ASC
            "#,
        )
        .bind(document_id)
        .fetch_all(pool)
        .await
        .map_err(AppError::from)?;

        let mut segments = Vec::with_capacity(rows.len());
        for r in rows {
            segments.push(ReadingSegment {
                id: r.get("id"),
                document_id: r.get("document_id"),
                section_id: r.get("section_id"),
                segment_type: r.get("segment_type"),
                segment_index: r.get("segment_index"),
                first_block_id: r.get("first_block_id"),
                last_block_id: r.get("last_block_id"),
                start_position: r.get("start_position"),
                end_position: r.get("end_position"),
                word_count: r.get("word_count"),
                status: r.get("status"),
                dwell_ms: r.get("dwell_ms"),
                first_read_at: r.get("first_read_at"),
                last_read_at: r.get("last_read_at"),
                read_count: r.get("read_count"),
            });
        }
        Ok(segments)
    }

    pub async fn update_batch_state(
        conn: &mut SqliteConnection,
        segments: &[ReadingSegment],
    ) -> Result<(), AppError> {
        for seg in segments {
            sqlx::query(
                r#"
                UPDATE reading_segments
                SET status = ?,
                    dwell_ms = ?,
                    first_read_at = ?,
                    last_read_at = ?,
                    read_count = ?
                WHERE id = ?
                "#,
            )
            .bind(&seg.status)
            .bind(seg.dwell_ms)
            .bind(seg.first_read_at)
            .bind(seg.last_read_at)
            .bind(seg.read_count)
            .bind(&seg.id)
            .execute(&mut *conn)
            .await
            .map_err(AppError::from)?;
        }
        Ok(())
    }

    pub async fn mark_all_as_read(
        conn: &mut SqliteConnection,
        document_id: &str,
        now: i64,
    ) -> Result<(), AppError> {
        sqlx::query(
            r#"
            UPDATE reading_segments
            SET status = 'read',
                last_read_at = ?,
                first_read_at = COALESCE(first_read_at, ?),
                read_count = CASE WHEN read_count = 0 THEN 1 ELSE read_count END
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

    pub async fn reset_all_for_doc(
        conn: &mut SqliteConnection,
        document_id: &str,
    ) -> Result<(), AppError> {
        sqlx::query(
            r#"
            UPDATE reading_segments
            SET status = 'unread',
                dwell_ms = 0,
                first_read_at = NULL,
                last_read_at = NULL,
                read_count = 0
            WHERE document_id = ?
            "#,
        )
        .bind(document_id)
        .execute(&mut *conn)
        .await
        .map_err(AppError::from)?;

        Ok(())
    }
}
