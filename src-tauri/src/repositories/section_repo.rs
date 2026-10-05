use sqlx::{Row, SqliteConnection, SqlitePool};

use crate::errors::AppError;
use crate::models::document_model::Block;
use crate::models::{BlockPayload, DocumentSection, SectionPayload};
use crate::parsers::segment_generator::SegmentGenerator;

pub struct SectionRepo;

impl SectionRepo {
    pub async fn insert_batch(
        conn: &mut SqliteConnection,
        sections: &[DocumentSection],
    ) -> Result<(), AppError> {
        for sec in sections {
            sqlx::query(
                r#"
                INSERT INTO document_sections (
                    id, document_id, section_index, section_type, title,
                    level, content, word_count, start_position, end_position,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(&sec.id)
            .bind(&sec.document_id)
            .bind(sec.section_index)
            .bind(&sec.section_type)
            .bind(&sec.title)
            .bind(sec.level)
            .bind(&sec.content)
            .bind(sec.word_count)
            .bind(sec.start_position)
            .bind(sec.end_position)
            .bind(sec.created_at)
            .execute(&mut *conn)
            .await
            .map_err(AppError::from)?;
        }
        Ok(())
    }

    pub async fn get_by_document_id(
        pool: &SqlitePool,
        document_id: &str,
    ) -> Result<Vec<DocumentSection>, AppError> {
        let rows = sqlx::query(
            r#"
            SELECT id, document_id, section_index, section_type, title,
                   level, content, word_count, start_position, end_position,
                   created_at
            FROM document_sections
            WHERE document_id = ?
            ORDER BY section_index ASC
            "#,
        )
        .bind(document_id)
        .fetch_all(pool)
        .await
        .map_err(AppError::from)?;

        let mut sections = Vec::new();
        for r in rows {
            sections.push(DocumentSection {
                id: r.get("id"),
                document_id: r.get("document_id"),
                section_index: r.get("section_index"),
                section_type: r.get("section_type"),
                title: r.get("title"),
                level: r.get("level"),
                content: r.get("content"),
                word_count: r.get("word_count"),
                start_position: r.get("start_position"),
                end_position: r.get("end_position"),
                created_at: r.get("created_at"),
            });
        }
        Ok(sections)
    }

    pub async fn get_sections_slice(
        pool: &SqlitePool,
        document_id: &str,
        from_index: i64,
        count: i64,
    ) -> Result<Vec<SectionPayload>, AppError> {
        let clamped_count = count.clamp(1, 20);

        let rows = sqlx::query(
            r#"
            SELECT id, section_index, title, level, word_count, content
            FROM document_sections
            WHERE document_id = ? AND section_index >= ?
            ORDER BY section_index ASC
            LIMIT ?
            "#,
        )
        .bind(document_id)
        .bind(from_index)
        .bind(clamped_count)
        .fetch_all(pool)
        .await
        .map_err(AppError::from)?;

        let mut payloads = Vec::with_capacity(rows.len());

        for r in rows {
            let id: String = r.get("id");
            let index: i64 = r.get("section_index");
            let title: Option<String> = r.get("title");
            let level: i64 = r.get("level");
            let word_count: i64 = r.get("word_count");
            let content_str: Option<String> = r.get("content");

            let blocks = Self::parse_content_to_blocks(index, content_str.as_deref(), word_count);

            payloads.push(SectionPayload {
                id,
                index,
                title,
                level,
                word_count,
                blocks,
            });
        }

        Ok(payloads)
    }

    fn parse_content_to_blocks(
        section_index: i64,
        content: Option<&str>,
        word_count: i64,
    ) -> Vec<BlockPayload> {
        let Some(c) = content else {
            return Vec::new();
        };

        if let Ok(blocks) = serde_json::from_str::<Vec<Block>>(c) {
            return blocks.iter().map(Self::map_block_to_payload).collect();
        }

        // Fallback for plain text content
        vec![BlockPayload {
            id: format!("s{}-b0", section_index),
            block_type: "paragraph".to_string(),
            text: c.to_string(),
            word_count,
            level: None,
        }]
    }

    fn map_block_to_payload(b: &Block) -> BlockPayload {
        let metrics = SegmentGenerator::calculate_block_metrics(b);
        let id = b.id().to_string();
        let words = metrics.words as i64;

        match b {
            Block::Heading { level, inlines, .. } => BlockPayload {
                id,
                block_type: "heading".to_string(),
                text: SegmentGenerator::extract_inlines_text(inlines),
                word_count: words,
                level: Some(*level as i64),
            },
            Block::Paragraph { inlines, .. } => BlockPayload {
                id,
                block_type: "paragraph".to_string(),
                text: SegmentGenerator::extract_inlines_text(inlines),
                word_count: words,
                level: None,
            },
            Block::List { items, .. } => {
                let mut text = String::new();
                for item_blocks in items {
                    for ib in item_blocks {
                        if let Block::Paragraph { inlines, .. } = ib {
                            text.push_str(&SegmentGenerator::extract_inlines_text(inlines));
                            text.push('\n');
                        }
                    }
                }
                BlockPayload {
                    id,
                    block_type: "list".to_string(),
                    text: text.trim_end().to_string(),
                    word_count: words,
                    level: None,
                }
            }
            Block::Quote { blocks, .. } => {
                let mut text = String::new();
                for qb in blocks {
                    if let Block::Paragraph { inlines, .. } = qb {
                        text.push_str(&SegmentGenerator::extract_inlines_text(inlines));
                        text.push('\n');
                    }
                }
                BlockPayload {
                    id,
                    block_type: "quote".to_string(),
                    text: text.trim_end().to_string(),
                    word_count: words,
                    level: None,
                }
            }
            Block::Image { alt, .. } => BlockPayload {
                id,
                block_type: "image".to_string(),
                text: alt.clone().unwrap_or_default(),
                word_count: words,
                level: None,
            },
            Block::Table { rows, .. } => {
                let mut text = String::new();
                for row in rows {
                    for cell in row {
                        text.push_str(&SegmentGenerator::extract_inlines_text(cell));
                        text.push(' ');
                    }
                    text.push('\n');
                }
                BlockPayload {
                    id,
                    block_type: "table".to_string(),
                    text: text.trim_end().to_string(),
                    word_count: words,
                    level: None,
                }
            }
            Block::Code { text, .. } => BlockPayload {
                id,
                block_type: "code".to_string(),
                text: text.clone(),
                word_count: words,
                level: None,
            },
            Block::Separator { .. } => BlockPayload {
                id,
                block_type: "separator".to_string(),
                text: String::new(),
                word_count: 0,
                level: None,
            },
        }
    }
}
