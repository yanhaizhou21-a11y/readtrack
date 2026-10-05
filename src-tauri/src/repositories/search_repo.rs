use sqlx::{Row, SqliteConnection, SqlitePool};

use crate::errors::AppError;
use crate::models::document_model::Block;
use crate::models::{DocumentSection, LogicalPosition, SearchHit, SnippetPart};
use crate::parsers::segment_generator::SegmentGenerator;

pub struct SearchRepo;

impl SearchRepo {
    pub async fn index_document(
        conn: &mut SqliteConnection,
        document_id: &str,
        title: &str,
        author: Option<&str>,
        sections: &[DocumentSection],
    ) -> Result<(), AppError> {
        // Index title
        sqlx::query(
            "INSERT INTO search_index (text, document_id, kind, ref_id, page, pos) VALUES (?, ?, 'title', ?, NULL, 0)",
        )
        .bind(title)
        .bind(document_id)
        .bind(document_id)
        .execute(&mut *conn)
        .await
        .map_err(AppError::from)?;

        // Index author if present
        if let Some(auth) = author {
            if !auth.trim().is_empty() {
                sqlx::query(
                    "INSERT INTO search_index (text, document_id, kind, ref_id, page, pos) VALUES (?, ?, 'author', ?, NULL, 0)",
                )
                .bind(auth)
                .bind(document_id)
                .bind(document_id)
                .execute(&mut *conn)
                .await
                .map_err(AppError::from)?;
            }
        }

        // Index sections content
        for sec in sections {
            let mut text = String::new();
            if let Some(ref t) = sec.title {
                text.push_str(t);
                text.push(' ');
            }
            if let Some(ref c) = sec.content {
                if let Ok(blocks) = serde_json::from_str::<Vec<Block>>(c) {
                    for b in &blocks {
                        Self::extract_block_text(b, &mut text);
                        text.push(' ');
                    }
                } else {
                    text.push_str(c);
                }
            }

            let trimmed = text.trim();
            if !trimmed.is_empty() {
                sqlx::query(
                    "INSERT INTO search_index (text, document_id, kind, ref_id, page, pos) VALUES (?, ?, 'content', ?, NULL, ?)",
                )
                .bind(trimmed)
                .bind(document_id)
                .bind(&sec.id)
                .bind(sec.start_position)
                .execute(&mut *conn)
                .await
                .map_err(AppError::from)?;
            }
        }

        Ok(())
    }

    pub async fn update_title(
        conn: &mut SqliteConnection,
        document_id: &str,
        new_title: &str,
    ) -> Result<(), AppError> {
        sqlx::query("DELETE FROM search_index WHERE document_id = ? AND kind = 'title'")
            .bind(document_id)
            .execute(&mut *conn)
            .await
            .map_err(AppError::from)?;

        sqlx::query(
            "INSERT INTO search_index (text, document_id, kind, ref_id, page, pos) VALUES (?, ?, 'title', ?, NULL, 0)",
        )
        .bind(new_title)
        .bind(document_id)
        .bind(document_id)
        .execute(&mut *conn)
        .await
        .map_err(AppError::from)?;

        Ok(())
    }

    pub async fn delete_document(
        conn: &mut SqliteConnection,
        document_id: &str,
    ) -> Result<(), AppError> {
        sqlx::query("DELETE FROM search_index WHERE document_id = ?")
            .bind(document_id)
            .execute(&mut *conn)
            .await
            .map_err(AppError::from)?;

        Ok(())
    }

    pub async fn index_annotation(
        conn: &mut SqliteConnection,
        document_id: &str,
        kind: &str,
        ref_id: &str,
        text: &str,
        page: Option<i64>,
        pos: i64,
    ) -> Result<(), AppError> {
        sqlx::query("DELETE FROM search_index WHERE ref_id = ? AND kind = ?")
            .bind(ref_id)
            .bind(kind)
            .execute(&mut *conn)
            .await
            .map_err(AppError::from)?;

        let trimmed = text.trim();
        if !trimmed.is_empty() {
            sqlx::query(
                "INSERT INTO search_index (text, document_id, kind, ref_id, page, pos) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(trimmed)
            .bind(document_id)
            .bind(kind)
            .bind(ref_id)
            .bind(page)
            .bind(pos)
            .execute(&mut *conn)
            .await
            .map_err(AppError::from)?;
        }
        Ok(())
    }

    pub async fn delete_annotation(
        conn: &mut SqliteConnection,
        ref_id: &str,
    ) -> Result<(), AppError> {
        sqlx::query("DELETE FROM search_index WHERE ref_id = ?")
            .bind(ref_id)
            .execute(&mut *conn)
            .await
            .map_err(AppError::from)?;
        Ok(())
    }

    pub async fn search(
        pool: &SqlitePool,
        query_str: &str,
        scope: Option<&[String]>,
        document_id: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<SearchHit>, AppError> {
        let clean = query_str.trim();
        if clean.is_empty() {
            return Ok(Vec::new());
        }

        let fts_query = clean
            .replace('"', "\"\"")
            .split_whitespace()
            .map(|word| format!("\"{}\"*", word))
            .collect::<Vec<_>>()
            .join(" ");

        let mut sql = String::from(
            r#"
            SELECT s.text, s.document_id, s.kind, s.ref_id, s.page, s.pos,
                   d.title as doc_title
            FROM search_index s
            JOIN documents d ON d.id = s.document_id
            WHERE search_index MATCH ?
            "#,
        );

        if document_id.is_some() {
            sql.push_str(" AND s.document_id = ?");
        }

        if let Some(kinds) = scope {
            if !kinds.is_empty() {
                let placeholders = kinds.iter().map(|_| "?").collect::<Vec<_>>().join(",");
                sql.push_str(&format!(" AND s.kind IN ({})", placeholders));
            }
        }

        sql.push_str(" ORDER BY rank LIMIT ? OFFSET ?");

        let mut q = sqlx::query(&sql).bind(&fts_query);

        if let Some(doc_id) = document_id {
            q = q.bind(doc_id);
        }

        if let Some(kinds) = scope {
            for k in kinds {
                q = q.bind(k);
            }
        }

        q = q.bind(limit).bind(offset);

        let rows = q.fetch_all(pool).await.map_err(AppError::from)?;
        let mut hits = Vec::with_capacity(rows.len());

        for r in rows {
            let text: String = r.get("text");
            let doc_id: String = r.get("document_id");
            let kind: String = r.get("kind");
            let ref_id: Option<String> = r.get("ref_id");
            let page: Option<i64> = r.get("page");
            let pos: i64 = r.get("pos");
            let doc_title: String = r.get("doc_title");

            let snippet = Self::build_snippet(&text, clean);

            hits.push(SearchHit {
                kind,
                document_id: doc_id.clone(),
                document_title: doc_title,
                section_title: None,
                page,
                snippet,
                position: LogicalPosition {
                    document_id: doc_id,
                    section_id: None,
                    block_id: None,
                    offset: Some(pos),
                    page,
                    page_offset: None,
                    percentage: 0.0,
                    parser_version: 1,
                },
                ref_id,
            });
        }

        Ok(hits)
    }

    fn build_snippet(text: &str, query: &str) -> Vec<SnippetPart> {
        let q_lower = query.to_lowercase();
        let t_lower = text.to_lowercase();
        if let Some(idx) = t_lower.find(&q_lower) {
            let start = idx.saturating_sub(40);
            let end = (idx + query.len() + 60).min(text.len());
            let prefix = &text[start..idx];
            let matched = &text[idx..idx + query.len()];
            let suffix = &text[idx + query.len()..end];

            vec![
                SnippetPart {
                    text: if start > 0 {
                        format!("…{}", prefix)
                    } else {
                        prefix.to_string()
                    },
                    is_match: false,
                },
                SnippetPart {
                    text: matched.to_string(),
                    is_match: true,
                },
                SnippetPart {
                    text: if end < text.len() {
                        format!("{}…", suffix)
                    } else {
                        suffix.to_string()
                    },
                    is_match: false,
                },
            ]
        } else {
            let truncated = if text.len() > 100 {
                format!("{}…", &text[..100])
            } else {
                text.to_string()
            };
            vec![SnippetPart {
                text: truncated,
                is_match: false,
            }]
        }
    }

    fn extract_block_text(b: &Block, out: &mut String) {
        match b {
            Block::Heading { inlines, .. } | Block::Paragraph { inlines, .. } => {
                out.push_str(&SegmentGenerator::extract_inlines_text(inlines));
            }
            Block::List { items, .. } => {
                for item_blocks in items {
                    for ib in item_blocks {
                        Self::extract_block_text(ib, out);
                    }
                }
            }
            Block::Quote { blocks, .. } => {
                for qb in blocks {
                    Self::extract_block_text(qb, out);
                }
            }
            Block::Image { alt, .. } => {
                if let Some(a) = alt {
                    out.push_str(a);
                }
            }
            Block::Table { rows, .. } => {
                for row in rows {
                    for cell in row {
                        out.push_str(&SegmentGenerator::extract_inlines_text(cell));
                        out.push(' ');
                    }
                }
            }
            Block::Code { text, .. } => {
                out.push_str(text);
            }
            Block::Separator { .. } => {}
        }
    }
}
