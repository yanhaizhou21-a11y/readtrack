use crate::errors::AppError;
use crate::models::document_model::{DocMetadata, FileType, NormalizedDocument};
use crate::parsers::traits::DocumentParser;
use std::path::Path;

pub struct PdfParser;

impl DocumentParser for PdfParser {
    fn file_type(&self) -> FileType {
        FileType::Pdf
    }

    fn sniff(&self, head: &[u8]) -> bool {
        head.len() >= 5 && &head[0..5] == b"%PDF-"
    }

    fn metadata(&self, _path: &Path) -> Result<DocMetadata, AppError> {
        Err(AppError::UnsupportedFormat {
            ext: "pdf".to_string(),
        })
    }

    fn parse(&self, _path: &Path) -> Result<NormalizedDocument, AppError> {
        Err(AppError::UnsupportedFormat {
            ext: "pdf".to_string(),
        })
    }
}
