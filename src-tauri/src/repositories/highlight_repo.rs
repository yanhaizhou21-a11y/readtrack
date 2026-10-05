use sqlx::{Row, SqliteConnection, SqlitePool};
use crate::errors::AppError;
use crate::models::{Highlight, LogicalPosition};

pub struct HighlightRepo;

impl HighlightRepo {
    pub async fn create(
        conn: &mut SqliteConnection,
        highlight: &Highlight,
    ) -> Result<(), AppError> {
        let pos_start_json = serde_json::to_string(&highlight.position_start).map_err(|_| {
            AppError::InvalidInput {
                field: "position_start".to_string(),
            }
        })?;

        let pos_end_json = serde_json::to_string(&highlight.position_end).map_err(|_| {
            AppError::InvalidInput {
                field: "position_end".to_string(),
            }
        })?;

        sqlx::query(
            r#"
            INSERT INTO highlights (
                id, document_id, position_start, position_end, start_pos, end_pos,
                page, selected_text, color, note, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&highlight.id)
        .bind(&highlight.document_id)
        .bind(pos_start_json)
        .bind(pos_end_json)
        .bind(highlight.start_pos)
        .bind(highlight.end_pos)
        .bind(highlight.page)
        .bind(&highlight.selected_text)
        .bind(&highlight.color)
        .bind(&highlight.note)
        .bind(highlight.created_at)
        .bind(highlight.updated_at)
        .execute(&mut *conn)
        .await
        .map_err(AppError::from)?;

        Ok(())
    }

    pub async fn get_by_id(
        pool: &SqlitePool,
        id: &str,
    ) -> Result<Option<Highlight>, AppError> {
        let row = sqlx::query(
            r#"
            SELECT id, document_id, position_start, position_end, start_pos, end_pos,
                   page, selected_text, color, note, created_at, updated_at
            FROM highlights
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(AppError::from)?;

        match row {
            Some(r) => Ok(Some(Self::from_row(&r)?)),
            None => Ok(None),
        }
    }

    pub async fn update(
        pool: &SqlitePool,
        id: &str,
        color: Option<&str>,
        note: Option<&str>,
        updated_at: i64,
    ) -> Result<Option<Highlight>, AppError> {
        sqlx::query(
            r#"
            UPDATE highlights
            SET color = COALESCE(?, color),
                note = COALESCE(?, note),
                updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(color)
        .bind(note)
        .bind(updated_at)
        .bind(id)
        .execute(pool)
        .await
        .map_err(AppError::from)?;

        Self::get_by_id(pool, id).await
    }

    pub async fn delete(
        conn: &mut SqliteConnection,
        id: &str,
    ) -> Result<bool, AppError> {
        let result = sqlx::query("DELETE FROM highlights WHERE id = ?")
            .bind(id)
            .execute(&mut *conn)
            .await
            .map_err(AppError::from)?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn list(
        pool: &SqlitePool,
        document_id: Option<&str>,
    ) -> Result<Vec<Highlight>, AppError> {
        let rows = match document_id {
            Some(doc_id) => {
                sqlx::query(
                    r#"
                    SELECT id, document_id, position_start, position_end, start_pos, end_pos,
                           page, selected_text, color, note, created_at, updated_at
                    FROM highlights
                    WHERE document_id = ?
                    ORDER BY start_pos ASC, created_at DESC
                    "#,
                )
                .bind(doc_id)
                .fetch_all(pool)
                .await
                .map_err(AppError::from)?
            }
            None => {
                sqlx::query(
                    r#"
                    SELECT id, document_id, position_start, position_end, start_pos, end_pos,
                           page, selected_text, color, note, created_at, updated_at
                    FROM highlights
                    ORDER BY created_at DESC
                    "#,
                )
                .fetch_all(pool)
                .await
                .map_err(AppError::from)?
            }
        };

        let mut highlights = Vec::with_capacity(rows.len());
        for r in &rows {
            highlights.push(Self::from_row(r)?);
        }
        Ok(highlights)
    }

    fn from_row(row: &sqlx::sqlite::SqliteRow) -> Result<Highlight, AppError> {
        let start_str: String = row.get("position_start");
        let position_start: LogicalPosition =
            serde_json::from_str(&start_str).map_err(|_| AppError::Internal)?;

        let end_str: String = row.get("position_end");
        let position_end: LogicalPosition =
            serde_json::from_str(&end_str).map_err(|_| AppError::Internal)?;

        Ok(Highlight {
            id: row.get("id"),
            document_id: row.get("document_id"),
            position_start,
            position_end,
            start_pos: row.get("start_pos"),
            end_pos: row.get("end_pos"),
            page: row.get("page"),
            selected_text: row.get("selected_text"),
            color: row.get("color"),
            note: row.get("note"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        })
    }
}
