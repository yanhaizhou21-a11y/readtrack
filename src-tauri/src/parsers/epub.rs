use std::path::Path;
use crate::errors::AppError;
use crate::models::document_model::{DocMetadata, FileType, NormalizedDocument};
use crate::parsers::traits::DocumentParser;

pub struct EpubParser;

impl DocumentParser for EpubParser {
    fn file_type(&self) -> FileType {
        FileType::Epub
    }

    fn sniff(&self, head: &[u8]) -> bool {
        head.len() >= 4 && head[0..4] == [0x50, 0x4B, 0x03, 0x04]
    }

    fn metadata(&self, _path: &Path) -> Result<DocMetadata, AppError> {
        Err(AppError::UnsupportedFormat {
            ext: "epub".to_string(),
        })
    }

    fn parse(&self, _path: &Path) -> Result<NormalizedDocument, AppError> {
        Err(AppError::UnsupportedFormat {
            ext: "epub".to_string(),
        })
    }
}
