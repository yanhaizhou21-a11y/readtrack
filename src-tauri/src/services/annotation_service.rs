use sqlx::SqlitePool;
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::{
    Bookmark, BookmarkCreateInput, BookmarkUpdateInput, Highlight, HighlightCreateInput,
    HighlightUpdateInput, Note, NoteCreateInput, NoteUpdateInput,
};
use crate::repositories::{BookmarkRepo, HighlightRepo, NoteRepo, SearchRepo};

pub struct AnnotationService {
    db: SqlitePool,
}

impl AnnotationService {
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
    }

    // ---------------- BOOKMARKS ----------------

    pub async fn create_bookmark(&self, input: BookmarkCreateInput) -> Result<Bookmark, AppError> {
        let now = chrono::Utc::now().timestamp_millis();
        let id = Uuid::new_v4().to_string();

        let pos = input.position.offset.unwrap_or(0);
        let page = input.position.page;

        let section_id = if let Some(sec_idx) = input.position.section_id {
            sqlx::query_scalar::<_, String>(
                "SELECT id FROM document_sections WHERE document_id = ? AND section_index = ? LIMIT 1",
            )
            .bind(&input.document_id)
            .bind(sec_idx)
            .fetch_optional(&self.db)
            .await
            .unwrap_or(None)
        } else {
            None
        };

        let excerpt = input.title.clone().unwrap_or_else(|| {
            if let Some(pg) = page {
                format!("Page {}", pg)
            } else {
                format!("{:.0}% through document", input.position.percentage * 100.0)
            }
        });

        let bookmark = Bookmark {
            id: id.clone(),
            document_id: input.document_id.clone(),
            position: input.position,
            pos,
            page,
            section_id,
            title: input.title,
            excerpt: Some(excerpt.clone()),
            note: input.note.clone(),
            created_at: now,
            updated_at: now,
        };

        let mut tx = self.db.begin().await.map_err(AppError::from)?;
        BookmarkRepo::create(&mut tx, &bookmark).await?;

        // Index in FTS5
        let index_text = format!(
            "{} {} {}",
            bookmark.title.as_deref().unwrap_or_default(),
            excerpt,
            bookmark.note.as_deref().unwrap_or_default()
        );
        SearchRepo::index_annotation(
            &mut tx,
            &bookmark.document_id,
            "bookmark",
            &bookmark.id,
            &index_text,
            bookmark.page,
            bookmark.pos,
        )
        .await?;

        tx.commit().await.map_err(AppError::from)?;
        Ok(bookmark)
    }

    pub async fn update_bookmark(&self, input: BookmarkUpdateInput) -> Result<Bookmark, AppError> {
        let now = chrono::Utc::now().timestamp_millis();
        let updated = BookmarkRepo::update(
            &self.db,
            &input.id,
            input.title.as_deref(),
            input.note.as_deref(),
            now,
        )
        .await?
        .ok_or(AppError::NotFound {
            entity: format!("Bookmark: {}", input.id),
        })?;

        // Update FTS5 index
        let mut conn = self.db.acquire().await.map_err(AppError::from)?;
        let index_text = format!(
            "{} {} {}",
            updated.title.as_deref().unwrap_or_default(),
            updated.excerpt.as_deref().unwrap_or_default(),
            updated.note.as_deref().unwrap_or_default()
        );
        SearchRepo::index_annotation(
            &mut conn,
            &updated.document_id,
            "bookmark",
            &updated.id,
            &index_text,
            updated.page,
            updated.pos,
        )
        .await?;

        Ok(updated)
    }

    pub async fn delete_bookmark(&self, id: &str) -> Result<(), AppError> {
        let mut tx = self.db.begin().await.map_err(AppError::from)?;
        BookmarkRepo::delete(&mut tx, id).await?;
        SearchRepo::delete_annotation(&mut tx, id).await?;
        tx.commit().await.map_err(AppError::from)?;
        Ok(())
    }

    pub async fn list_bookmarks(
        &self,
        document_id: Option<&str>,
    ) -> Result<Vec<Bookmark>, AppError> {
        BookmarkRepo::list(&self.db, document_id).await
    }

    // ---------------- HIGHLIGHTS ----------------

    pub async fn create_highlight(
        &self,
        input: HighlightCreateInput,
    ) -> Result<Highlight, AppError> {
        let trimmed_text = input.selected_text.trim();
        if trimmed_text.is_empty() {
            return Err(AppError::InvalidInput {
                field: "selected_text".to_string(),
            });
        }
        if trimmed_text.len() > 5000 {
            return Err(AppError::InvalidInput {
                field: "selected_text (must be <= 5000 chars)".to_string(),
            });
        }

        let valid_colors = ["yellow", "green", "blue", "pink", "orange"];
        if !valid_colors.contains(&input.color.to_lowercase().as_str()) {
            return Err(AppError::InvalidInput {
                field: format!("color (valid: {})", valid_colors.join(", ")),
            });
        }

        let now = chrono::Utc::now().timestamp_millis();
        let id = Uuid::new_v4().to_string();

        let start_pos = input.start.offset.unwrap_or(0);
        let end_pos = input
            .end
            .offset
            .unwrap_or(start_pos + trimmed_text.len() as i64)
            .max(start_pos);

        let page = input.start.page;

        let highlight = Highlight {
            id: id.clone(),
            document_id: input.document_id.clone(),
            position_start: input.start,
            position_end: input.end,
            start_pos,
            end_pos,
            page,
            selected_text: trimmed_text.to_string(),
            color: input.color.to_lowercase(),
            note: input.note.clone(),
            created_at: now,
            updated_at: now,
        };

        let mut tx = self.db.begin().await.map_err(AppError::from)?;
        HighlightRepo::create(&mut tx, &highlight).await?;

        // Index in FTS5
        let index_text = format!(
            "{} {}",
            highlight.selected_text,
            highlight.note.as_deref().unwrap_or_default()
        );
        SearchRepo::index_annotation(
            &mut tx,
            &highlight.document_id,
            "highlight",
            &highlight.id,
            &index_text,
            highlight.page,
            highlight.start_pos,
        )
        .await?;

        tx.commit().await.map_err(AppError::from)?;
        Ok(highlight)
    }

    pub async fn update_highlight(
        &self,
        input: HighlightUpdateInput,
    ) -> Result<Highlight, AppError> {
        if let Some(ref c) = input.color {
            let valid_colors = ["yellow", "green", "blue", "pink", "orange"];
            if !valid_colors.contains(&c.to_lowercase().as_str()) {
                return Err(AppError::InvalidInput {
                    field: "color".to_string(),
                });
            }
        }

        let now = chrono::Utc::now().timestamp_millis();
        let updated = HighlightRepo::update(
            &self.db,
            &input.id,
            input.color.as_deref(),
            input.note.as_deref(),
            now,
        )
        .await?
        .ok_or(AppError::NotFound {
            entity: format!("Highlight: {}", input.id),
        })?;

        // Update FTS5 index
        let mut conn = self.db.acquire().await.map_err(AppError::from)?;
        let index_text = format!(
            "{} {}",
            updated.selected_text,
            updated.note.as_deref().unwrap_or_default()
        );
        SearchRepo::index_annotation(
            &mut conn,
            &updated.document_id,
            "highlight",
            &updated.id,
            &index_text,
            updated.page,
            updated.start_pos,
        )
        .await?;

        Ok(updated)
    }

    pub async fn delete_highlight(&self, id: &str) -> Result<(), AppError> {
        let mut tx = self.db.begin().await.map_err(AppError::from)?;
        HighlightRepo::delete(&mut tx, id).await?;
        SearchRepo::delete_annotation(&mut tx, id).await?;
        tx.commit().await.map_err(AppError::from)?;
        Ok(())
    }

    pub async fn list_highlights(
        &self,
        document_id: Option<&str>,
    ) -> Result<Vec<Highlight>, AppError> {
        HighlightRepo::list(&self.db, document_id).await
    }

    // ---------------- NOTES ----------------

    pub async fn create_note(&self, input: NoteCreateInput) -> Result<Note, AppError> {
        let clean_content = input.content.trim();
        if clean_content.is_empty() {
            return Err(AppError::InvalidInput {
                field: "content".to_string(),
            });
        }

        let now = chrono::Utc::now().timestamp_millis();
        let id = Uuid::new_v4().to_string();

        let pos = input.position.offset.unwrap_or(0);
        let page = input.position.page;

        let note = Note {
            id: id.clone(),
            document_id: input.document_id.clone(),
            highlight_id: input.highlight_id,
            position: input.position,
            pos,
            page,
            content: clean_content.to_string(),
            created_at: now,
            updated_at: now,
        };

        let mut tx = self.db.begin().await.map_err(AppError::from)?;
        NoteRepo::create(&mut tx, &note).await?;

        // Index in FTS5
        SearchRepo::index_annotation(
            &mut tx,
            &note.document_id,
            "note",
            &note.id,
            &note.content,
            note.page,
            note.pos,
        )
        .await?;

        tx.commit().await.map_err(AppError::from)?;
        Ok(note)
    }

    pub async fn update_note(&self, input: NoteUpdateInput) -> Result<Note, AppError> {
        let clean_content = input.content.trim();
        if clean_content.is_empty() {
            return Err(AppError::InvalidInput {
                field: "content".to_string(),
            });
        }

        let now = chrono::Utc::now().timestamp_millis();
        let updated = NoteRepo::update(&self.db, &input.id, clean_content, now)
            .await?
            .ok_or(AppError::NotFound {
                entity: format!("Note: {}", input.id),
            })?;

        // Update FTS5 index
        let mut conn = self.db.acquire().await.map_err(AppError::from)?;
        SearchRepo::index_annotation(
            &mut conn,
            &updated.document_id,
            "note",
            &updated.id,
            &updated.content,
            updated.page,
            updated.pos,
        )
        .await?;

        Ok(updated)
    }

    pub async fn delete_note(&self, id: &str) -> Result<(), AppError> {
        let mut tx = self.db.begin().await.map_err(AppError::from)?;
        NoteRepo::delete(&mut tx, id).await?;
        SearchRepo::delete_annotation(&mut tx, id).await?;
        tx.commit().await.map_err(AppError::from)?;
        Ok(())
    }

    pub async fn list_notes(&self, document_id: Option<&str>) -> Result<Vec<Note>, AppError> {
        NoteRepo::list(&self.db, document_id).await
    }
}
