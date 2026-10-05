use std::path::Path;
use crate::errors::AppError;
use crate::models::document_model::{DocMetadata, FileType, NormalizedDocument};

pub trait DocumentParser: Send + Sync {
    /// Return the canonical file type handled by this parser
    fn file_type(&self) -> FileType;

    /// Inspect initial byte stream (magic bytes) to verify file validity
    fn sniff(&self, head: &[u8]) -> bool;

    /// Fast path to extract basic document metadata without deep parsing
    fn metadata(&self, path: &Path) -> Result<DocMetadata, AppError>;

    /// Parse complete document into NormalizedDocument AST
    fn parse(&self, path: &Path) -> Result<NormalizedDocument, AppError>;

    /// Progress-reporting parse variant (default implementation delegates to parse)
    fn parse_with_progress(
        &self,
        path: &Path,
        progress: &dyn Fn(f32),
    ) -> Result<NormalizedDocument, AppError> {
        let doc = self.parse(path)?;
        progress(1.0);
        Ok(doc)
    }
}
