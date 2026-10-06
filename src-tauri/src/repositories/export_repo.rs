use crate::errors::AppError;
use crate::models::{
    ExportBookmarkRow, ExportData, ExportDocumentRow, ExportHighlightRow, ExportNoteRow,
    ExportProgressRow, ExportSessionRow,
};
use sqlx::{Row, SqlitePool};

pub struct ExportRepo;

impl ExportRepo {
    pub async fn fetch_export_data(
        db: &SqlitePool,
        document_ids: Option<&[String]>,
    ) -> Result<ExportData, AppError> {
        let (filter_clause, doc_ids) = match document_ids {
            Some(ids) if !ids.is_empty() => {
                let placeholders = vec!["?"; ids.len()].join(", ");
                (format!(" AND d.id IN ({})", placeholders), ids.to_vec())
            }
            _ => (String::new(), Vec::new()),
        };

        // 1. Documents
        let docs_query = format!(
            r#"
            SELECT d.id, d.title, d.author, d.file_type, d.file_size, d.word_count, d.page_count,
                   COALESCE(p.progress_percent, 0.0) as progress_percent,
                   COALESCE(p.completed, 0) as completed,
                   d.created_at, d.last_opened_at
            FROM documents d
            LEFT JOIN reading_progress p ON p.document_id = d.id
            WHERE d.is_archived = 0 {}
            ORDER BY d.created_at DESC
            "#,
            filter_clause
        );

        let mut q = sqlx::query(&docs_query);
        for id in &doc_ids {
            q = q.bind(id);
        }
        let doc_rows = q.fetch_all(db).await.map_err(AppError::from)?;

        let mut documents = Vec::with_capacity(doc_rows.len());
        for r in doc_rows {
            documents.push(ExportDocumentRow {
                id: r.get("id"),
                title: r.get("title"),
                author: r.get("author"),
                file_type: r.get("file_type"),
                file_size: r.get("file_size"),
                word_count: r.get("word_count"),
                page_count: r.get("page_count"),
                progress_percent: r.get("progress_percent"),
                completed: r.get::<i64, _>("completed") == 1,
                created_at: r.get("created_at"),
                last_opened_at: r.get("last_opened_at"),
            });
        }

        // 2. Reading Sessions
        let sessions_query = format!(
            r#"
            SELECT s.id, s.document_id, d.title as document_title, s.started_at, s.ended_at,
                   s.duration_seconds, s.active_seconds, s.pages_read, s.segments_read
            FROM reading_sessions s
            JOIN documents d ON d.id = s.document_id
            WHERE 1=1 {}
            ORDER BY s.started_at DESC
            "#,
            filter_clause
        );

        let mut q = sqlx::query(&sessions_query);
        for id in &doc_ids {
            q = q.bind(id);
        }
        let session_rows = q.fetch_all(db).await.map_err(AppError::from)?;

        let mut sessions = Vec::with_capacity(session_rows.len());
        for r in session_rows {
            sessions.push(ExportSessionRow {
                id: r.get("id"),
                document_id: r.get("document_id"),
                document_title: r.get("document_title"),
                started_at: r.get("started_at"),
                ended_at: r.get("ended_at"),
                duration_seconds: r.get("duration_seconds"),
                active_seconds: r.get("active_seconds"),
                pages_read: r.get("pages_read"),
                segments_read: r.get("segments_read"),
            });
        }

        // 3. Reading Segments & Progress
        let progress_query = format!(
            r#"
            SELECT d.title as document_title, sec.section_index,
                   COALESCE(sec.title, 'Section ' || sec.section_index) as section_title,
                   seg.segment_index, seg.status, seg.dwell_ms, seg.last_read_at
            FROM reading_segments seg
            JOIN document_sections sec ON sec.id = seg.section_id
            JOIN documents d ON d.id = seg.document_id
            WHERE 1=1 {}
            ORDER BY d.title, sec.section_index, seg.segment_index
            "#,
            filter_clause
        );

        let mut q = sqlx::query(&progress_query);
        for id in &doc_ids {
            q = q.bind(id);
        }
        let progress_rows = q.fetch_all(db).await.map_err(AppError::from)?;

        let mut progress_segments = Vec::with_capacity(progress_rows.len());
        for r in progress_rows {
            progress_segments.push(ExportProgressRow {
                document_title: r.get("document_title"),
                section_index: r.get("section_index"),
                section_title: r.get("section_title"),
                segment_index: r.get("segment_index"),
                status: r.get("status"),
                dwell_ms: r.get("dwell_ms"),
                last_read_at: r.get("last_read_at"),
            });
        }

        // 4. Bookmarks
        let bookmarks_query = format!(
            r#"
            SELECT b.id, d.title as document_title, b.page, sec.title as section_title,
                   b.title, b.excerpt, b.note, b.created_at
            FROM bookmarks b
            JOIN documents d ON d.id = b.document_id
            LEFT JOIN document_sections sec ON sec.id = b.section_id
            WHERE 1=1 {}
            ORDER BY d.title, b.pos
            "#,
            filter_clause
        );

        let mut q = sqlx::query(&bookmarks_query);
        for id in &doc_ids {
            q = q.bind(id);
        }
        let bookmark_rows = q.fetch_all(db).await.map_err(AppError::from)?;

        let mut bookmarks = Vec::with_capacity(bookmark_rows.len());
        for r in bookmark_rows {
            bookmarks.push(ExportBookmarkRow {
                id: r.get("id"),
                document_title: r.get("document_title"),
                page: r.get("page"),
                section_title: r.get("section_title"),
                title: r.get("title"),
                excerpt: r.get("excerpt"),
                note: r.get("note"),
                created_at: r.get("created_at"),
            });
        }

        // 5. Highlights
        let highlights_query = format!(
            r#"
            SELECT h.id, d.title as document_title, h.color, h.selected_text,
                   h.note, h.start_pos, h.end_pos, h.created_at
            FROM highlights h
            JOIN documents d ON d.id = h.document_id
            WHERE 1=1 {}
            ORDER BY d.title, h.start_pos
            "#,
            filter_clause
        );

        let mut q = sqlx::query(&highlights_query);
        for id in &doc_ids {
            q = q.bind(id);
        }
        let highlight_rows = q.fetch_all(db).await.map_err(AppError::from)?;

        let mut highlights = Vec::with_capacity(highlight_rows.len());
        for r in highlight_rows {
            highlights.push(ExportHighlightRow {
                id: r.get("id"),
                document_title: r.get("document_title"),
                color: r.get("color"),
                selected_text: r.get("selected_text"),
                note: r.get("note"),
                start_pos: r.get("start_pos"),
                end_pos: r.get("end_pos"),
                created_at: r.get("created_at"),
            });
        }

        // 6. Notes
        let notes_query = format!(
            r#"
            SELECT n.id, d.title as document_title, n.content, n.created_at
            FROM notes n
            JOIN documents d ON d.id = n.document_id
            WHERE 1=1 {}
            ORDER BY d.title, n.pos
            "#,
            filter_clause
        );

        let mut q = sqlx::query(&notes_query);
        for id in &doc_ids {
            q = q.bind(id);
        }
        let note_rows = q.fetch_all(db).await.map_err(AppError::from)?;

        let mut notes = Vec::with_capacity(note_rows.len());
        for r in note_rows {
            notes.push(ExportNoteRow {
                id: r.get("id"),
                document_title: r.get("document_title"),
                content: r.get("content"),
                created_at: r.get("created_at"),
            });
        }

        Ok(ExportData {
            documents,
            sessions,
            progress_segments,
            bookmarks,
            highlights,
            notes,
        })
    }
}
