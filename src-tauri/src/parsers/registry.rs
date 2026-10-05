use std::collections::HashMap;
use crate::errors::AppError;
use crate::models::document_model::FileType;
use crate::parsers::docx::DocxParser;
use crate::parsers::epub::EpubParser;
use crate::parsers::markdown::MarkdownParser;
use crate::parsers::pdf::PdfParser;
use crate::parsers::traits::DocumentParser;
use crate::parsers::txt::TxtParser;

pub struct ParserRegistry {
    parsers: HashMap<FileType, Box<dyn DocumentParser>>,
}

impl Default for ParserRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ParserRegistry {
    pub fn new() -> Self {
        let mut registry = Self {
            parsers: HashMap::new(),
        };
        registry.register(Box::new(TxtParser));
        registry.register(Box::new(MarkdownParser));
        registry.register(Box::new(EpubParser));
        registry.register(Box::new(PdfParser));
        registry.register(Box::new(DocxParser));
        registry
    }

    pub fn register(&mut self, parser: Box<dyn DocumentParser>) {
        self.parsers.insert(parser.file_type(), parser);
    }

    pub fn get(&self, file_type: &FileType) -> Option<&dyn DocumentParser> {
        self.parsers.get(file_type).map(|b| b.as_ref())
    }

    pub fn for_file(&self, head: &[u8], ext: &str) -> Result<&dyn DocumentParser, AppError> {
        let file_type = FileType::from_ext(ext).ok_or_else(|| AppError::UnsupportedFormat {
            ext: ext.to_string(),
        })?;

        let parser = self.get(&file_type).ok_or_else(|| AppError::UnsupportedFormat {
            ext: ext.to_string(),
        })?;

        if !head.is_empty() && !parser.sniff(head) {
            tracing::warn!(
                "Magic byte verification failed for extension .{}: head len={}",
                ext,
                head.len()
            );
            return Err(AppError::InvalidDocument {
                reason: format!("File content does not match expected .{} format", ext),
            });
        }

        Ok(parser)
    }
}
