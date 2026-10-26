use crate::errors::AppError;
use crate::models::document_model::{
    Block, DocMetadata, FileType, Inline, NormalizedDocument, Section, SectionKind,
};
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

    fn metadata(&self, path: &Path) -> Result<DocMetadata, AppError> {
        let doc = lopdf::Document::load(path).map_err(|e| AppError::ParseFailed {
            reason: format!("Gagal membaca metadata PDF: {}", e),
        })?;

        let page_count = doc.get_pages().len().max(1) as u32;
        let (title, author) = extract_doc_info(&doc);
        let title = title
            .filter(|t| !t.trim().is_empty())
            .unwrap_or_else(|| {
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Untitled PDF")
                    .to_string()
            });

        Ok(DocMetadata {
            title,
            author,
            language: None,
            page_count: Some(page_count),
            word_count: page_count * 250,
            character_count: page_count * 1500,
            parser_version: 1,
        })
    }

    fn parse(&self, path: &Path) -> Result<NormalizedDocument, AppError> {
        let doc = lopdf::Document::load(path).map_err(|e| AppError::ParseFailed {
            reason: format!("Gagal memproses dokumen PDF: {}", e),
        })?;

        let pages = doc.get_pages();
        let page_count = pages.len().max(1) as u32;

        let (title, author) = extract_doc_info(&doc);
        let title = title
            .filter(|t| !t.trim().is_empty())
            .unwrap_or_else(|| {
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Untitled PDF")
                    .to_string()
            });

        let mut sections = Vec::with_capacity(page_count as usize);
        let mut total_words: u32 = 0;
        let mut total_chars: u32 = 0;

        for (idx, &page_num) in pages.keys().enumerate() {
            let section_idx = idx as u32;

            // Extract page text using lopdf
            let page_text = doc.extract_text(&[page_num]).unwrap_or_default();
            let trimmed = page_text.trim();

            let blocks = if !trimmed.is_empty() {
                let paragraphs: Vec<&str> = trimmed
                    .split("\n\n")
                    .filter(|p| !p.trim().is_empty())
                    .collect();

                let mut blks = Vec::new();
                for (b_idx, p_text) in paragraphs.iter().enumerate() {
                    blks.push(Block::Paragraph {
                        id: format!("s{}-b{}", section_idx, b_idx),
                        inlines: vec![Inline {
                            text: p_text.trim().to_string(),
                            marks: vec![],
                        }],
                    });
                }
                blks
            } else {
                vec![Block::Paragraph {
                    id: format!("s{}-b0", section_idx),
                    inlines: vec![Inline {
                        text: format!("(Halaman {})", page_num),
                        marks: vec![],
                    }],
                }]
            };

            let words = if trimmed.is_empty() {
                250
            } else {
                trimmed.split_whitespace().count() as u32
            };
            let chars = if trimmed.is_empty() {
                1500
            } else {
                trimmed.chars().count() as u32
            };

            total_words += words;
            total_chars += chars;

            sections.push(Section {
                index: section_idx,
                kind: SectionKind::Page,
                title: Some(format!("Halaman {}", page_num)),
                level: 0,
                blocks,
                word_count: words,
                character_count: chars,
            });
        }

        if sections.is_empty() {
            sections.push(Section {
                index: 0,
                kind: SectionKind::Page,
                title: Some("Halaman 1".to_string()),
                level: 0,
                blocks: vec![Block::Paragraph {
                    id: "s0-b0".to_string(),
                    inlines: vec![Inline {
                        text: "(Halaman 1)".to_string(),
                        marks: vec![],
                    }],
                }],
                word_count: 250,
                character_count: 1500,
            });
            total_words = 250;
            total_chars = 1500;
        }

        let metadata = DocMetadata {
            title,
            author,
            language: None,
            page_count: Some(page_count),
            word_count: total_words,
            character_count: total_chars,
            parser_version: 1,
        };

        Ok(NormalizedDocument {
            metadata,
            sections,
            toc: vec![],
        })
    }
}

fn extract_doc_info(doc: &lopdf::Document) -> (Option<String>, Option<String>) {
    if let Ok(info_obj) = doc.trailer.get(b"Info") {
        let dict = match info_obj {
            lopdf::Object::Dictionary(ref d) => Some(d),
            lopdf::Object::Reference(id) => doc.get_dictionary(*id).ok(),
            _ => None,
        };
        if let Some(d) = dict {
            let title = d.get(b"Title").ok().and_then(clean_pdf_string);
            let author = d.get(b"Author").ok().and_then(clean_pdf_string);
            return (title, author);
        }
    }
    (None, None)
}

fn clean_pdf_string(obj: &lopdf::Object) -> Option<String> {
    match obj {
        lopdf::Object::String(bytes, _) => {
            let s = String::from_utf8_lossy(bytes).trim().to_string();
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        }
        _ => None,
    }
}
