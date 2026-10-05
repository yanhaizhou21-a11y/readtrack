use crate::errors::AppError;
use crate::models::{LogicalPosition, Note};
use sqlx::{Row, SqliteConnection, SqlitePool};

pub struct NoteRepo;

impl NoteRepo {
    pub async fn create(conn: &mut SqliteConnection, note: &Note) -> Result<(), AppError> {
        let pos_json =
            serde_json::to_string(&note.position).map_err(|_| AppError::InvalidInput {
                field: "position".to_string(),
            })?;

        sqlx::query(
            r#"
            INSERT INTO notes (
                id, document_id, highlight_id, position, pos, page,
                content, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&note.id)
        .bind(&note.document_id)
        .bind(&note.highlight_id)
        .bind(pos_json)
        .bind(note.pos)
        .bind(note.page)
        .bind(&note.content)
        .bind(note.created_at)
        .bind(note.updated_at)
        .execute(&mut *conn)
        .await
        .map_err(AppError::from)?;

        Ok(())
    }

    pub async fn get_by_id(pool: &SqlitePool, id: &str) -> Result<Option<Note>, AppError> {
        let row = sqlx::query(
            r#"
            SELECT id, document_id, highlight_id, position, pos, page,
                   content, created_at, updated_at
            FROM notes
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
        content: &str,
        updated_at: i64,
    ) -> Result<Option<Note>, AppError> {
        sqlx::query(
            r#"
            UPDATE notes
            SET content = ?,
                updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(content)
        .bind(updated_at)
        .bind(id)
        .execute(pool)
        .await
        .map_err(AppError::from)?;

        Self::get_by_id(pool, id).await
    }

    pub async fn delete(conn: &mut SqliteConnection, id: &str) -> Result<bool, AppError> {
        let result = sqlx::query("DELETE FROM notes WHERE id = ?")
            .bind(id)
            .execute(&mut *conn)
            .await
            .map_err(AppError::from)?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn list(pool: &SqlitePool, document_id: Option<&str>) -> Result<Vec<Note>, AppError> {
        let rows = match document_id {
            Some(doc_id) => sqlx::query(
                r#"
                    SELECT id, document_id, highlight_id, position, pos, page,
                           content, created_at, updated_at
                    FROM notes
                    WHERE document_id = ?
                    ORDER BY pos ASC, created_at DESC
                    "#,
            )
            .bind(doc_id)
            .fetch_all(pool)
            .await
            .map_err(AppError::from)?,
            None => sqlx::query(
                r#"
                    SELECT id, document_id, highlight_id, position, pos, page,
                           content, created_at, updated_at
                    FROM notes
                    ORDER BY created_at DESC
                    "#,
            )
            .fetch_all(pool)
            .await
            .map_err(AppError::from)?,
        };

        let mut notes = Vec::with_capacity(rows.len());
        for r in &rows {
            notes.push(Self::from_row(r)?);
        }
        Ok(notes)
    }

    fn from_row(row: &sqlx::sqlite::SqliteRow) -> Result<Note, AppError> {
        let pos_str: String = row.get("position");
        let position: LogicalPosition =
            serde_json::from_str(&pos_str).map_err(|_| AppError::Internal)?;

        Ok(Note {
            id: row.get("id"),
            document_id: row.get("document_id"),
            highlight_id: row.get("highlight_id"),
            position,
            pos: row.get("pos"),
            page: row.get("page"),
            content: row.get("content"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        })
    }
}
