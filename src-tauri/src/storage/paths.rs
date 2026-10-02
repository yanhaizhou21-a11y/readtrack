use crate::errors::AppError;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone)]
pub struct StoragePaths {
    pub root: PathBuf,
}

impl StoragePaths {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn init_dirs(&self) -> Result<(), AppError> {
        let dirs = [
            &self.root,
            &self.documents_dir(),
            &self.thumbnails_dir(),
            &self.cache_dir(),
            &self.exports_dir(),
        ];

        for dir in dirs {
            if !dir.exists() {
                std::fs::create_dir_all(dir).map_err(AppError::from)?;
            }
        }
        Ok(())
    }

    pub fn db_path(&self) -> PathBuf {
        self.root.join("database.sqlite")
    }

    pub fn documents_dir(&self) -> PathBuf {
        self.root.join("library").join("documents")
    }

    pub fn thumbnails_dir(&self) -> PathBuf {
        self.root.join("library").join("thumbnails")
    }

    pub fn cache_dir(&self) -> PathBuf {
        self.root.join("library").join("cache")
    }

    pub fn exports_dir(&self) -> PathBuf {
        self.root.join("exports")
    }

    /// Resolves a relative path safely within the app data root, preventing directory traversal.
    pub fn resolve_safe_path(&self, relative: &Path) -> Result<PathBuf, AppError> {
        for component in relative.components() {
            match component {
                Component::ParentDir => {
                    tracing::warn!("Path traversal attempt detected: {:?}", relative);
                    return Err(AppError::PermissionDenied);
                }
                Component::RootDir | Component::Prefix(_) => {
                    tracing::warn!(
                        "Absolute path rejected in safe path resolution: {:?}",
                        relative
                    );
                    return Err(AppError::PermissionDenied);
                }
                _ => {}
            }
        }

        let combined = self.root.join(relative);

        // If file exists, check canonicalized path
        if combined.exists() {
            let canonical_root = self.root.canonicalize().map_err(AppError::from)?;
            let canonical_combined = combined.canonicalize().map_err(AppError::from)?;
            if !canonical_combined.starts_with(&canonical_root) {
                tracing::warn!(
                    "Path escaped root after canonicalization: {:?}",
                    canonical_combined
                );
                return Err(AppError::PermissionDenied);
            }
        }

        Ok(combined)
    }
}
