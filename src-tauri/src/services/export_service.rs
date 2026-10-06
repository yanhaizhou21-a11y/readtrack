use crate::errors::AppError;
use crate::exporters::{PdfExporter, XlsxExporter};
use crate::models::{ExportInput, ExportProgressPayload, ExportResult};
use crate::repositories::ExportRepo;
use crate::storage::paths::StoragePaths;
use chrono::Utc;
use sqlx::SqlitePool;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

pub struct ExportService {
    db: SqlitePool,
    storage: StoragePaths,
}

impl ExportService {
    pub fn new(db: SqlitePool, storage: StoragePaths) -> Self {
        Self { db, storage }
    }

    pub async fn export_xlsx(
        &self,
        app: Option<&AppHandle>,
        input: ExportInput,
    ) -> Result<ExportResult, AppError> {
        let job_id = uuid::Uuid::new_v4().to_string();

        self.emit_progress(app, &job_id, "xlsx", 10, "querying");

        let data = ExportRepo::fetch_export_data(&self.db, input.document_ids.as_deref()).await?;

        self.emit_progress(app, &job_id, "xlsx", 40, "rendering");

        let exports_dir = self.storage.exports_dir();
        if !exports_dir.exists() {
            std::fs::create_dir_all(&exports_dir).map_err(AppError::from)?;
        }

        let date_stamp = Utc::now().format("%Y-%m-%d").to_string();
        let base_name = format!("ReadTrack-Report-{}", date_stamp);
        let file_name = format!("{}.xlsx", base_name);
        let mut target_path = exports_dir.join(&file_name);

        if target_path.exists() {
            let timestamp = Utc::now().timestamp_millis();
            let unique_file_name = format!("{}-{}.xlsx", base_name, timestamp);
            target_path = exports_dir.join(&unique_file_name);
        }

        self.emit_progress(app, &job_id, "xlsx", 70, "saving");

        let out_path_clone = target_path.clone();
        tokio::task::spawn_blocking(move || XlsxExporter::export(&data, &out_path_clone))
            .await
            .map_err(|e| AppError::ExportFailed {
                reason: e.to_string(),
            })??;

        self.emit_progress(app, &job_id, "xlsx", 100, "done");

        let final_file_name = target_path
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("ReadTrack-Report.xlsx")
            .to_string();

        Ok(ExportResult {
            path: target_path.to_string_lossy().to_string(),
            file_name: final_file_name,
        })
    }

    pub async fn export_pdf(
        &self,
        app: Option<&AppHandle>,
        input: ExportInput,
    ) -> Result<ExportResult, AppError> {
        let job_id = uuid::Uuid::new_v4().to_string();

        self.emit_progress(app, &job_id, "pdf", 10, "querying");

        let data = ExportRepo::fetch_export_data(&self.db, input.document_ids.as_deref()).await?;

        self.emit_progress(app, &job_id, "pdf", 40, "rendering");

        let exports_dir = self.storage.exports_dir();
        if !exports_dir.exists() {
            std::fs::create_dir_all(&exports_dir).map_err(AppError::from)?;
        }

        let date_stamp = Utc::now().format("%Y-%m-%d").to_string();
        let base_name = format!("ReadTrack-Reading-Report-{}", date_stamp);
        let file_name = format!("{}.pdf", base_name);
        let mut target_path = exports_dir.join(&file_name);

        if target_path.exists() {
            let timestamp = Utc::now().timestamp_millis();
            let unique_file_name = format!("{}-{}.pdf", base_name, timestamp);
            target_path = exports_dir.join(&unique_file_name);
        }

        self.emit_progress(app, &job_id, "pdf", 70, "saving");

        let out_path_clone = target_path.clone();
        tokio::task::spawn_blocking(move || PdfExporter::export(&data, &out_path_clone))
            .await
            .map_err(|e| AppError::ExportFailed {
                reason: e.to_string(),
            })??;

        self.emit_progress(app, &job_id, "pdf", 100, "done");

        let final_file_name = target_path
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("ReadTrack-Reading-Report.pdf")
            .to_string();

        Ok(ExportResult {
            path: target_path.to_string_lossy().to_string(),
            file_name: final_file_name,
        })
    }

    pub fn export_share(&self, target_path_str: &str) -> Result<(), AppError> {
        let candidate = PathBuf::from(target_path_str);
        if !candidate.exists() {
            return Err(AppError::NotFound {
                entity: format!("Export file: {}", target_path_str),
            });
        }

        let exports_dir = self.storage.exports_dir();
        if !exports_dir.exists() {
            return Err(AppError::PermissionDenied);
        }

        let canonical_exports = exports_dir.canonicalize().map_err(AppError::from)?;
        let canonical_candidate = candidate.canonicalize().map_err(AppError::from)?;

        if !canonical_candidate.starts_with(&canonical_exports) {
            tracing::warn!(
                "Blocked illegal share attempt outside exports directory: {:?}",
                canonical_candidate
            );
            return Err(AppError::PermissionDenied);
        }

        open::that(&canonical_candidate).map_err(|e| AppError::ExportFailed {
            reason: e.to_string(),
        })?;

        Ok(())
    }

    fn emit_progress(
        &self,
        app: Option<&AppHandle>,
        job_id: &str,
        kind: &str,
        percent: u32,
        stage: &str,
    ) {
        if let Some(handle) = app {
            let payload = ExportProgressPayload {
                job_id: job_id.to_string(),
                kind: kind.to_string(),
                percent,
                stage: stage.to_string(),
            };
            let _ = handle.emit("export_progress", payload);
        }
    }
}
