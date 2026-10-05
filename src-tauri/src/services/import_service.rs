use std::path::Path;
use tauri::{AppHandle, Emitter};

use crate::errors::AppError;
use crate::models::document_model::FileType;
use crate::models::{
    Document, DocumentImportInput, DocumentSection, DocumentSummary, LibraryChangedPayload,
    LogicalPosition, ReadingProgress, ReadingSegment,
};
use crate::parsers::registry::ParserRegistry;
use crate::parsers::segment_generator::{GeneratedSegment, SegmentGenerator};
use crate::repositories::{DocumentRepo, ProgressRepo, SearchRepo, SectionRepo, SegmentRepo};
use crate::storage::file_store::{DetectedFormat, FileStore, DEFAULT_MAX_IMPORT_BYTES};
use crate::storage::paths::StoragePaths;

pub struct ImportService {
    db: sqlx::SqlitePool,
    file_store: FileStore,
    parser_registry: ParserRegistry,
}

impl ImportService {
    pub fn new(db: sqlx::SqlitePool, storage: StoragePaths) -> Self {
        let file_store = FileStore::new(storage);
        let parser_registry = ParserRegistry::new();
        Self {
            db,
            file_store,
            parser_registry,
        }
    }

    pub async fn import_document(
        &self,
        app_handle: Option<&AppHandle>,
        input: DocumentImportInput,
    ) -> Result<DocumentSummary, AppError> {
        let source_str = input.source.trim();
        if source_str.is_empty() {
            return Err(AppError::InvalidInput {
                field: "source".to_string(),
            });
        }

        // Path traversal and safety checks (SECURITY.md)
        if source_str.contains("../")
            || source_str.contains("..\\")
            || source_str.contains('\0')
        {
            return Err(AppError::PermissionDenied);
        }

        let source_path = Path::new(source_str);
        if !source_path.exists() {
            return Err(AppError::NotFound {
                entity: format!("Source file: {}", source_str),
            });
        }

        let ext = source_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default();
        if DetectedFormat::from_extension(ext).is_none() {
            return Err(AppError::UnsupportedFormat {
                ext: ext.to_string(),
            });
        }

        let original_filename = source_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        let job_id = uuid::Uuid::new_v4().to_string();

        if let Some(app) = app_handle {
            let _ = app.emit(
                "document_import_progress",
                crate::models::ImportProgressPayload {
                    job_id: job_id.clone(),
                    file_name: original_filename.clone(),
                    percent: 10.0,
                    stage: "copy".to_string(),
                },
            );
        }

        // 1. Stage file streaming with BLAKE3 hashing & magic byte validation
        let staged = self
            .file_store
            .stage_file(source_path, DEFAULT_MAX_IMPORT_BYTES)?;

        if let Some(app) = app_handle {
            let _ = app.emit(
                "document_import_progress",
                crate::models::ImportProgressPayload {
                    job_id: job_id.clone(),
                    file_name: original_filename.clone(),
                    percent: 30.0,
                    stage: "hash".to_string(),
                },
            );
        }

        let content_hash = staged.hash.clone();
        let file_size = staged.size_bytes as i64;
        let detected_format = staged.format;
        let file_ext = detected_format.as_str();

        // 2. Check for duplicate content hash
        let existing = DocumentRepo::get_by_content_hash(&self.db, &content_hash).await?;
        if let Some(existing_doc) = existing {
            match input.on_duplicate.as_deref().unwrap_or("ask") {
                "open_existing" => {
                    let _ = staged.guard.rollback();
                    let summary = DocumentRepo::get_summary(&self.db, &existing_doc.id).await?;
                    return summary.ok_or(AppError::DocumentNotFound);
                }
                "replace" => {
                    self.delete_existing_document(&existing_doc.id, &existing_doc.file_type)
                        .await?;
                }
                _ => {
                    let _ = staged.guard.rollback();
                    return Err(AppError::DuplicateDocument {
                        existing_id: existing_doc.id,
                    });
                }
            }
        }

        if let Some(app) = app_handle {
            let _ = app.emit(
                "document_import_progress",
                crate::models::ImportProgressPayload {
                    job_id: job_id.clone(),
                    file_name: original_filename.clone(),
                    percent: 50.0,
                    stage: "parse".to_string(),
                },
            );
        }

        // 3. Parse document AST via ParserRegistry
        let file_type = FileType::from_ext(file_ext).ok_or_else(|| {
            AppError::UnsupportedFormat {
                ext: file_ext.to_string(),
            }
        })?;
        let parser = self.parser_registry.get(&file_type).ok_or_else(|| {
            AppError::UnsupportedFormat {
                ext: file_ext.to_string(),
            }
        })?;

        let ast = parser.parse(staged.guard.path())?;

        // 4. Generate segments
        let generated_segments = SegmentGenerator::generate_segments(&ast);

        // 5. Atomic SQLite transaction
        let doc_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();

        let title = if !ast.metadata.title.trim().is_empty() {
            ast.metadata.title.clone()
        } else {
            source_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled")
                .to_string()
        };

        let relative_file_path = format!("library/documents/{}.{}", doc_id, file_ext);

        let mut tx = self.db.begin().await.map_err(AppError::from)?;

        let document = Document {
            id: doc_id.clone(),
            title: title.clone(),
            author: ast.metadata.author.clone(),
            original_filename: original_filename.clone(),
            file_path: relative_file_path,
            file_type: file_ext.to_string(),
            mime_type: detected_format.mime_type().to_string(),
            file_size,
            content_hash: content_hash.clone(),
            page_count: ast.metadata.page_count.map(|p| p as i64),
            word_count: Some(ast.metadata.word_count as i64),
            thumbnail_path: None,
            language: ast.metadata.language.clone(),
            parse_status: "ready".to_string(),
            parse_error: None,
            parser_version: ast.metadata.parser_version as i64,
            index_status: "complete".to_string(),
            created_at: now,
            updated_at: now,
            last_opened_at: None,
            is_archived: false,
        };

        DocumentRepo::create(&mut tx, &document).await?;

        // Prepare sections
        let mut sections = Vec::with_capacity(ast.sections.len());
        for s in &ast.sections {
            let sec_id = uuid::Uuid::new_v4().to_string();
            let content_json = serde_json::to_string(&s.blocks).ok();

            let sec_segs: Vec<&GeneratedSegment> = generated_segments
                .iter()
                .filter(|g| g.section_index == s.index)
                .collect();
            let start_pos = sec_segs.first().map(|g| g.start_position).unwrap_or(0);
            let end_pos = sec_segs.last().map(|g| g.end_position).unwrap_or(0);

            sections.push(DocumentSection {
                id: sec_id,
                document_id: doc_id.clone(),
                section_index: s.index as i64,
                section_type: s.kind.as_str().to_string(),
                title: s.title.clone(),
                level: s.level as i64,
                content: content_json,
                word_count: s.word_count as i64,
                start_position: start_pos,
                end_position: end_pos,
                created_at: now,
            });
        }
        SectionRepo::insert_batch(&mut tx, &sections).await?;

        // Prepare reading segments
        let mut db_segments = Vec::with_capacity(generated_segments.len());
        for g in &generated_segments {
            let section_id = sections
                .get(g.section_index as usize)
                .map(|s| s.id.clone())
                .unwrap_or_else(|| doc_id.clone());

            db_segments.push(ReadingSegment {
                id: uuid::Uuid::new_v4().to_string(),
                document_id: doc_id.clone(),
                section_id,
                segment_type: g.segment_type.as_str().to_string(),
                segment_index: g.segment_index as i64,
                first_block_id: g.first_block_id.clone(),
                last_block_id: g.last_block_id.clone(),
                start_position: g.start_position,
                end_position: g.end_position,
                word_count: g.word_count as i64,
                status: "unread".to_string(),
                dwell_ms: 0,
                first_read_at: None,
                last_read_at: None,
                read_count: 0,
            });
        }
        SegmentRepo::insert_batch(&mut tx, &db_segments).await?;

        // Prepare initial reading progress (0%, unread, pointing to section 0)
        let initial_section_idx = sections.first().map(|s| s.section_index);
        let initial_block_id = ast
            .sections
            .first()
            .and_then(|s| s.blocks.first())
            .map(|b| b.id().to_string());

        let initial_position = LogicalPosition {
            document_id: doc_id.clone(),
            section_id: initial_section_idx,
            block_id: initial_block_id,
            offset: Some(0),
            page: if file_ext == "pdf" { Some(1) } else { None },
            page_offset: if file_ext == "pdf" { Some(0.0) } else { None },
            percentage: 0.0,
            parser_version: ast.metadata.parser_version as i64,
        };

        let progress = ReadingProgress {
            id: uuid::Uuid::new_v4().to_string(),
            document_id: doc_id.clone(),
            current_page: if file_ext == "pdf" { Some(1) } else { None },
            current_position: initial_position,
            current_pos: 0,
            current_section_id: sections.first().map(|s| s.id.clone()),
            progress_percent: 0.0,
            furthest_pos: 0,
            total_read_ms: 0,
            completed: false,
            completed_at: None,
            updated_at: now,
        };
        ProgressRepo::create(&mut tx, &progress).await?;

        // Full-Text Search indexing
        SearchRepo::index_document(
            &mut tx,
            &doc_id,
            &title,
            ast.metadata.author.as_deref(),
            &sections,
        )
        .await?;

        if let Some(app) = app_handle {
            let _ = app.emit(
                "document_import_progress",
                crate::models::ImportProgressPayload {
                    job_id: job_id.clone(),
                    file_name: original_filename.clone(),
                    percent: 80.0,
                    stage: "index".to_string(),
                },
            );
        }

        tx.commit().await.map_err(AppError::from)?;

        // 6. Commit staged file on disk to library/documents/<doc_id>.<ext>
        if let Err(err) = self.file_store.commit_file(staged.guard, &doc_id, file_ext) {
            let _ = self.delete_existing_document(&doc_id, file_ext).await;
            return Err(err);
        }

        // 7. Emit done progress and library_changed event
        if let Some(app) = app_handle {
            let _ = app.emit(
                "document_import_progress",
                crate::models::ImportProgressPayload {
                    job_id: job_id.clone(),
                    file_name: original_filename.clone(),
                    percent: 100.0,
                    stage: "done".to_string(),
                },
            );
            let _ = app.emit(
                "library_changed",
                LibraryChangedPayload {
                    reason: "import".to_string(),
                },
            );
        }

        // 8. Return summary
        DocumentRepo::get_summary(&self.db, &doc_id)
            .await?
            .ok_or(AppError::Internal)
    }

    async fn delete_existing_document(&self, doc_id: &str, file_type: &str) -> Result<(), AppError> {
        let mut tx = self.db.begin().await.map_err(AppError::from)?;
        DocumentRepo::delete(&mut tx, doc_id).await?;
        SearchRepo::delete_document(&mut tx, doc_id).await?;
        tx.commit().await.map_err(AppError::from)?;

        let _ = self.file_store.delete_file(doc_id, file_type);
        Ok(())
    }
}
