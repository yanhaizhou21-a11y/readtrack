use sqlx::sqlite::SqliteRow;
use sqlx::{Row, SqliteConnection, SqlitePool};

use crate::errors::AppError;
use crate::models::{Document, DocumentDetail, DocumentSummary, LogicalPosition};

pub struct DocumentRepo;

impl DocumentRepo {
    pub async fn create(conn: &mut SqliteConnection, doc: &Document) -> Result<(), AppError> {
        sqlx::query(
            r#"
            INSERT INTO documents (
                id, title, author, original_filename, file_path, file_type,
                mime_type, file_size, content_hash, page_count, word_count,
                thumbnail_path, language, parse_status, parse_error,
                parser_version, index_status, created_at, updated_at,
                last_opened_at, is_archived
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&doc.id)
        .bind(&doc.title)
        .bind(&doc.author)
        .bind(&doc.original_filename)
        .bind(&doc.file_path)
        .bind(&doc.file_type)
        .bind(&doc.mime_type)
        .bind(doc.file_size)
        .bind(&doc.content_hash)
        .bind(doc.page_count)
        .bind(doc.word_count)
        .bind(&doc.thumbnail_path)
        .bind(&doc.language)
        .bind(&doc.parse_status)
        .bind(&doc.parse_error)
        .bind(doc.parser_version)
        .bind(&doc.index_status)
        .bind(doc.created_at)
        .bind(doc.updated_at)
        .bind(doc.last_opened_at)
        .bind(if doc.is_archived { 1 } else { 0 })
        .execute(&mut *conn)
        .await
        .map_err(AppError::from)?;

        Ok(())
    }

    pub async fn get_by_id(pool: &SqlitePool, id: &str) -> Result<Option<Document>, AppError> {
        let row = sqlx::query(
            r#"
            SELECT id, title, author, original_filename, file_path, file_type,
                   mime_type, file_size, content_hash, page_count, word_count,
                   thumbnail_path, language, parse_status, parse_error,
                   parser_version, index_status, created_at, updated_at,
                   last_opened_at, is_archived
            FROM documents WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(AppError::from)?;

        row.map(|r| Self::map_row_to_document(&r)).transpose()
    }

    pub async fn get_by_content_hash(
        pool: &SqlitePool,
        hash: &str,
    ) -> Result<Option<Document>, AppError> {
        let row = sqlx::query(
            r#"
            SELECT id, title, author, original_filename, file_path, file_type,
                   mime_type, file_size, content_hash, page_count, word_count,
                   thumbnail_path, language, parse_status, parse_error,
                   parser_version, index_status, created_at, updated_at,
                   last_opened_at, is_archived
            FROM documents WHERE content_hash = ?
            "#,
        )
        .bind(hash)
        .fetch_optional(pool)
        .await
        .map_err(AppError::from)?;

        row.map(|r| Self::map_row_to_document(&r)).transpose()
    }

    pub async fn list(
        pool: &SqlitePool,
        filter: Option<&str>,
        sort: Option<&str>,
        query: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<(Vec<DocumentSummary>, i64), AppError> {
        let mut where_clauses = Vec::new();
        let filter_str = filter.unwrap_or("all");

        match filter_str {
            "in_progress" => {
                where_clauses.push("d.is_archived = 0 AND COALESCE(p.completed, 0) = 0 AND COALESCE(p.progress_percent, 0.0) > 0");
            }
            "completed" => {
                where_clauses.push("d.is_archived = 0 AND COALESCE(p.completed, 0) = 1");
            }
            "archived" => {
                where_clauses.push("d.is_archived = 1");
            }
            "recent_opened" => {
                where_clauses.push("d.is_archived = 0 AND d.last_opened_at IS NOT NULL");
            }
            _ => {
                // "all", "recent_added" or other active filters
                where_clauses.push("d.is_archived = 0");
            }
        }

        let has_query = query.map(|q| !q.trim().is_empty()).unwrap_or(false);
        if has_query {
            where_clauses.push("(d.title LIKE ? OR (d.author IS NOT NULL AND d.author LIKE ?))");
        }

        let where_sql = where_clauses.join(" AND ");

        let order_by_sql = match sort.unwrap_or("recent_opened") {
            "recent_added" => "d.created_at DESC",
            "title" => "d.title COLLATE NOCASE ASC",
            "progress" => "progress DESC, d.created_at DESC",
            _ => "d.last_opened_at DESC NULLS LAST, d.created_at DESC",
        };

        let list_sql = format!(
            r#"
            SELECT d.id, d.title, d.author, d.file_type, d.file_size, d.page_count, d.word_count,
                   (SELECT COUNT(*) FROM document_sections s WHERE s.document_id = d.id) as section_count,
                   COALESCE(p.progress_percent, 0.0) as progress,
                   COALESCE(p.completed, 0) as completed,
                   d.is_archived, d.created_at, d.last_opened_at, d.thumbnail_path, d.parse_status
            FROM documents d
            LEFT JOIN reading_progress p ON p.document_id = d.id
            WHERE {where_sql}
            ORDER BY {order_by_sql}
            LIMIT ? OFFSET ?
            "#
        );

        let count_sql = format!(
            r#"
            SELECT COUNT(*) FROM documents d
            LEFT JOIN reading_progress p ON p.document_id = d.id
            WHERE {where_sql}
            "#
        );

        let query_pattern = query.map(|q| format!("%{}%", q.trim()));

        let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
        if has_query {
            if let Some(ref pat) = query_pattern {
                count_query = count_query.bind(pat).bind(pat);
            }
        }
        let total = count_query.fetch_one(pool).await.map_err(AppError::from)?;

        let mut fetch_query = sqlx::query(&list_sql);
        if has_query {
            if let Some(ref pat) = query_pattern {
                fetch_query = fetch_query.bind(pat).bind(pat);
            }
        }
        fetch_query = fetch_query.bind(limit).bind(offset);

        let rows = fetch_query.fetch_all(pool).await.map_err(AppError::from)?;
        let items = rows
            .into_iter()
            .map(|r| Self::map_row_to_summary(&r))
            .collect::<Result<Vec<_>, _>>()?;

        Ok((items, total))
    }

    pub async fn get_summary(
        pool: &SqlitePool,
        id: &str,
    ) -> Result<Option<DocumentSummary>, AppError> {
        let sql = r#"
            SELECT d.id, d.title, d.author, d.file_type, d.file_size, d.page_count, d.word_count,
                   (SELECT COUNT(*) FROM document_sections s WHERE s.document_id = d.id) as section_count,
                   COALESCE(p.progress_percent, 0.0) as progress,
                   COALESCE(p.completed, 0) as completed,
                   d.is_archived, d.created_at, d.last_opened_at, d.thumbnail_path, d.parse_status
            FROM documents d
            LEFT JOIN reading_progress p ON p.document_id = d.id
            WHERE d.id = ?
        "#;

        let row = sqlx::query(sql)
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(AppError::from)?;

        row.map(|r| Self::map_row_to_summary(&r)).transpose()
    }

    pub async fn get_detail(
        pool: &SqlitePool,
        id: &str,
    ) -> Result<Option<DocumentDetail>, AppError> {
        let sql = r#"
            SELECT d.id, d.title, d.author, d.original_filename, d.file_type, d.mime_type,
                   d.file_size, d.content_hash, d.page_count, d.word_count,
                   (SELECT COUNT(*) FROM document_sections s WHERE s.document_id = d.id) as section_count,
                   COALESCE(p.progress_percent, 0.0) as progress,
                   COALESCE(p.completed, 0) as completed,
                   COALESCE(p.total_read_ms, 0) as total_read_ms,
                   (SELECT COUNT(*) FROM reading_sessions rs WHERE rs.document_id = d.id) as session_count,
                   (SELECT MAX(last_read_at) FROM reading_segments sg WHERE sg.document_id = d.id) as last_read_at,
                   p.current_position as position_json,
                   d.is_archived, d.created_at, d.last_opened_at, d.thumbnail_path, d.parse_status
            FROM documents d
            LEFT JOIN reading_progress p ON p.document_id = d.id
            WHERE d.id = ?
        "#;

        let row = sqlx::query(sql)
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(AppError::from)?;

        row.map(|r| Self::map_row_to_detail(&r)).transpose()
    }

    pub async fn rename(
        pool: &SqlitePool,
        id: &str,
        title: &str,
        updated_at: i64,
    ) -> Result<Option<DocumentSummary>, AppError> {
        let rows_affected = sqlx::query("UPDATE documents SET title = ?, updated_at = ? WHERE id = ?")
            .bind(title)
            .bind(updated_at)
            .bind(id)
            .execute(pool)
            .await
            .map_err(AppError::from)?
            .rows_affected();

        if rows_affected == 0 {
            return Ok(None);
        }

        Self::get_summary(pool, id).await
    }

    pub async fn archive(
        pool: &SqlitePool,
        id: &str,
        is_archived: bool,
        updated_at: i64,
    ) -> Result<Option<DocumentSummary>, AppError> {
        let rows_affected = sqlx::query("UPDATE documents SET is_archived = ?, updated_at = ? WHERE id = ?")
            .bind(if is_archived { 1 } else { 0 })
            .bind(updated_at)
            .bind(id)
            .execute(pool)
            .await
            .map_err(AppError::from)?
            .rows_affected();

        if rows_affected == 0 {
            return Ok(None);
        }

        Self::get_summary(pool, id).await
    }

    pub async fn touch(pool: &SqlitePool, id: &str, timestamp: i64) -> Result<bool, AppError> {
        let rows_affected =
            sqlx::query("UPDATE documents SET last_opened_at = ?, updated_at = ? WHERE id = ?")
                .bind(timestamp)
                .bind(timestamp)
                .bind(id)
                .execute(pool)
                .await
                .map_err(AppError::from)?
                .rows_affected();

        Ok(rows_affected > 0)
    }

    pub async fn delete(conn: &mut SqliteConnection, id: &str) -> Result<Option<Document>, AppError> {
        let doc = sqlx::query(
            r#"
            SELECT id, title, author, original_filename, file_path, file_type,
                   mime_type, file_size, content_hash, page_count, word_count,
                   thumbnail_path, language, parse_status, parse_error,
                   parser_version, index_status, created_at, updated_at,
                   last_opened_at, is_archived
            FROM documents WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(AppError::from)?
        .map(|r| Self::map_row_to_document(&r))
        .transpose()?;

        if doc.is_some() {
            sqlx::query("DELETE FROM documents WHERE id = ?")
                .bind(id)
                .execute(&mut *conn)
                .await
                .map_err(AppError::from)?;
        }

        Ok(doc)
    }

    fn map_row_to_document(r: &SqliteRow) -> Result<Document, AppError> {
        let is_archived_int: i64 = r.get("is_archived");
        Ok(Document {
            id: r.get("id"),
            title: r.get("title"),
            author: r.get("author"),
            original_filename: r.get("original_filename"),
            file_path: r.get("file_path"),
            file_type: r.get("file_type"),
            mime_type: r.get("mime_type"),
            file_size: r.get("file_size"),
            content_hash: r.get("content_hash"),
            page_count: r.get("page_count"),
            word_count: r.get("word_count"),
            thumbnail_path: r.get("thumbnail_path"),
            language: r.get("language"),
            parse_status: r.get("parse_status"),
            parse_error: r.get("parse_error"),
            parser_version: r.get("parser_version"),
            index_status: r.get("index_status"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
            last_opened_at: r.get("last_opened_at"),
            is_archived: is_archived_int != 0,
        })
    }

    fn map_row_to_summary(r: &SqliteRow) -> Result<DocumentSummary, AppError> {
        let is_archived_int: i64 = r.get("is_archived");
        let completed_int: i64 = r.get("completed");
        let doc_id: String = r.get("id");
        let thumb_path: Option<String> = r.get("thumbnail_path");
        let thumbnail_url = thumb_path.map(|_| format!("rt://thumb/{}", doc_id));

        Ok(DocumentSummary {
            id: doc_id,
            title: r.get("title"),
            author: r.get("author"),
            file_type: r.get("file_type"),
            file_size: r.get("file_size"),
            page_count: r.get("page_count"),
            word_count: r.get("word_count"),
            section_count: r.get("section_count"),
            progress: r.get("progress"),
            completed: completed_int != 0,
            is_archived: is_archived_int != 0,
            created_at: r.get("created_at"),
            last_opened_at: r.get("last_opened_at"),
            thumbnail_url,
            parse_status: r.get("parse_status"),
        })
    }

    fn map_row_to_detail(r: &SqliteRow) -> Result<DocumentDetail, AppError> {
        let summary = Self::map_row_to_summary(r)?;
        let pos_str: Option<String> = r.get("position_json");
        let position = pos_str.and_then(|s| serde_json::from_str::<LogicalPosition>(&s).ok());

        Ok(DocumentDetail {
            summary,
            original_filename: r.get("original_filename"),
            mime_type: r.get("mime_type"),
            content_hash: r.get("content_hash"),
            total_read_ms: r.get("total_read_ms"),
            session_count: r.get("session_count"),
            last_read_at: r.get("last_read_at"),
            position,
        })
    }
}
