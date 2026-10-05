use crate::errors::AppError;
use crate::models::{Bookmark, LogicalPosition};
use sqlx::{Row, SqliteConnection, SqlitePool};

pub struct BookmarkRepo;

impl BookmarkRepo {
    pub async fn create(conn: &mut SqliteConnection, bookmark: &Bookmark) -> Result<(), AppError> {
        let pos_json =
            serde_json::to_string(&bookmark.position).map_err(|_| AppError::InvalidInput {
                field: "position".to_string(),
            })?;

        sqlx::query(
            r#"
            INSERT INTO bookmarks (
                id, document_id, position, pos, page, section_id,
                title, excerpt, note, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&bookmark.id)
        .bind(&bookmark.document_id)
        .bind(pos_json)
        .bind(bookmark.pos)
        .bind(bookmark.page)
        .bind(&bookmark.section_id)
        .bind(&bookmark.title)
        .bind(&bookmark.excerpt)
        .bind(&bookmark.note)
        .bind(bookmark.created_at)
        .bind(bookmark.updated_at)
        .execute(&mut *conn)
        .await
        .map_err(AppError::from)?;

        Ok(())
    }

    pub async fn get_by_id(pool: &SqlitePool, id: &str) -> Result<Option<Bookmark>, AppError> {
        let row = sqlx::query(
            r#"
            SELECT id, document_id, position, pos, page, section_id,
                   title, excerpt, note, created_at, updated_at
            FROM bookmarks
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
        title: Option<&str>,
        note: Option<&str>,
        updated_at: i64,
    ) -> Result<Option<Bookmark>, AppError> {
        sqlx::query(
            r#"
            UPDATE bookmarks
            SET title = COALESCE(?, title),
                note = COALESCE(?, note),
                updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(title)
        .bind(note)
        .bind(updated_at)
        .bind(id)
        .execute(pool)
        .await
        .map_err(AppError::from)?;

        Self::get_by_id(pool, id).await
    }

    pub async fn delete(conn: &mut SqliteConnection, id: &str) -> Result<bool, AppError> {
        let result = sqlx::query("DELETE FROM bookmarks WHERE id = ?")
            .bind(id)
            .execute(&mut *conn)
            .await
            .map_err(AppError::from)?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn list(
        pool: &SqlitePool,
        document_id: Option<&str>,
    ) -> Result<Vec<Bookmark>, AppError> {
        let rows = match document_id {
            Some(doc_id) => sqlx::query(
                r#"
                    SELECT id, document_id, position, pos, page, section_id,
                           title, excerpt, note, created_at, updated_at
                    FROM bookmarks
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
                    SELECT id, document_id, position, pos, page, section_id,
                           title, excerpt, note, created_at, updated_at
                    FROM bookmarks
                    ORDER BY created_at DESC
                    "#,
            )
            .fetch_all(pool)
            .await
            .map_err(AppError::from)?,
        };

        let mut bookmarks = Vec::with_capacity(rows.len());
        for r in &rows {
            bookmarks.push(Self::from_row(r)?);
        }
        Ok(bookmarks)
    }

    fn from_row(row: &sqlx::sqlite::SqliteRow) -> Result<Bookmark, AppError> {
        let pos_str: String = row.get("position");
        let position: LogicalPosition =
            serde_json::from_str(&pos_str).map_err(|_| AppError::Internal)?;

        Ok(Bookmark {
            id: row.get("id"),
            document_id: row.get("document_id"),
            position,
            pos: row.get("pos"),
            page: row.get("page"),
            section_id: row.get("section_id"),
            title: row.get("title"),
            excerpt: row.get("excerpt"),
            note: row.get("note"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        })
    }
}
