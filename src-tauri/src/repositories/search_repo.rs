use sqlx::SqliteConnection;

use crate::errors::AppError;
use crate::models::document_model::Block;
use crate::models::DocumentSection;
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
