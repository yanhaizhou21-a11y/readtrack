use tauri::{AppHandle, Emitter};

use crate::errors::AppError;
use crate::models::{
    DocumentDetail, DocumentListInput, DocumentListResponse, DocumentSummary,
    LibraryChangedPayload, SectionPayload,
};
use crate::repositories::{DocumentRepo, SearchRepo, SectionRepo};
use crate::storage::file_store::FileStore;
use crate::storage::paths::StoragePaths;

pub struct LibraryService {
    db: sqlx::SqlitePool,
    file_store: FileStore,
    paths: StoragePaths,
}

impl LibraryService {
    pub fn new(db: sqlx::SqlitePool, paths: StoragePaths) -> Self {
        let file_store = FileStore::new(paths.clone());
        Self {
            db,
            file_store,
            paths,
        }
    }

    pub async fn list(&self, input: DocumentListInput) -> Result<DocumentListResponse, AppError> {
        let limit = input.limit.unwrap_or(50).clamp(1, 100);
        let offset = input.offset.unwrap_or(0).max(0);

        let (items, total) = DocumentRepo::list(
            &self.db,
            input.filter.as_deref(),
            input.sort.as_deref(),
            input.query.as_deref(),
            limit,
            offset,
        )
        .await?;

        Ok(DocumentListResponse { items, total })
    }

    pub async fn get(&self, id: &str) -> Result<DocumentDetail, AppError> {
        self.validate_uuid(id)?;

        let detail = DocumentRepo::get_detail(&self.db, id).await?;
        detail.ok_or(AppError::DocumentNotFound)
    }

    pub async fn rename(
        &self,
        app_handle: Option<&AppHandle>,
        id: &str,
        title: &str,
    ) -> Result<DocumentSummary, AppError> {
        self.validate_uuid(id)?;

        let trimmed = title.trim();
        if trimmed.is_empty() || trimmed.chars().count() > 200 {
            return Err(AppError::InvalidInput {
                field: "title (must be 1-200 characters)".to_string(),
            });
        }

        let now = chrono::Utc::now().timestamp_millis();
        let summary = DocumentRepo::rename(&self.db, id, trimmed, now)
            .await?
            .ok_or(AppError::DocumentNotFound)?;

        // Update search index title
        let mut tx = self.db.begin().await.map_err(AppError::from)?;
        SearchRepo::update_title(&mut tx, id, trimmed).await?;
        tx.commit().await.map_err(AppError::from)?;

        if let Some(app) = app_handle {
            let _ = app.emit(
                "library_changed",
                LibraryChangedPayload {
                    reason: "rename".to_string(),
                },
            );
        }

        Ok(summary)
    }

    pub async fn archive(
        &self,
        app_handle: Option<&AppHandle>,
        id: &str,
        is_archived: bool,
    ) -> Result<DocumentSummary, AppError> {
        self.validate_uuid(id)?;

        let now = chrono::Utc::now().timestamp_millis();
        let summary = DocumentRepo::archive(&self.db, id, is_archived, now)
            .await?
            .ok_or(AppError::DocumentNotFound)?;

        if let Some(app) = app_handle {
            let _ = app.emit(
                "library_changed",
                LibraryChangedPayload {
                    reason: "archive".to_string(),
                },
            );
        }

        Ok(summary)
    }

    pub async fn touch(&self, id: &str) -> Result<(), AppError> {
        self.validate_uuid(id)?;

        let now = chrono::Utc::now().timestamp_millis();
        let touched = DocumentRepo::touch(&self.db, id, now).await?;
        if !touched {
            return Err(AppError::DocumentNotFound);
        }
        Ok(())
    }

    pub async fn delete(
        &self,
        app_handle: Option<&AppHandle>,
        id: &str,
    ) -> Result<(), AppError> {
        self.validate_uuid(id)?;

        let mut tx = self.db.begin().await.map_err(AppError::from)?;
        let deleted = DocumentRepo::delete(&mut tx, id).await?;
        let Some(doc) = deleted else {
            return Err(AppError::DocumentNotFound);
        };

        SearchRepo::delete_document(&mut tx, id).await?;
        tx.commit().await.map_err(AppError::from)?;

        // Cleanup physical files after DB transaction commit
        let _ = self.file_store.delete_file(id, &doc.file_type);

        let thumb = self.paths.thumbnails_dir().join(format!("{}.webp", id));
        if thumb.exists() {
            let _ = std::fs::remove_file(thumb);
        }

        if let Some(app) = app_handle {
            let _ = app.emit(
                "library_changed",
                LibraryChangedPayload {
                    reason: "delete".to_string(),
                },
            );
        }

        Ok(())
    }

    pub async fn get_sections(
        &self,
        id: &str,
        from_index: Option<i64>,
        count: Option<i64>,
    ) -> Result<Vec<SectionPayload>, AppError> {
        self.validate_uuid(id)?;

        let doc = DocumentRepo::get_by_id(&self.db, id).await?;
        if doc.is_none() {
            return Err(AppError::DocumentNotFound);
        }

        let from = from_index.unwrap_or(0).max(0);
        let count_val = count.unwrap_or(20).clamp(1, 20);

        SectionRepo::get_sections_slice(&self.db, id, from, count_val).await
    }

    fn validate_uuid(&self, id: &str) -> Result<(), AppError> {
        uuid::Uuid::parse_str(id).map_err(|_| AppError::DocumentNotFound)?;
        Ok(())
    }
}
