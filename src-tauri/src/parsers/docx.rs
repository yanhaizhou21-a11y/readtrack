use crate::errors::AppError;
use crate::models::document_model::{
    Block, DocMetadata, FileType, Inline, NormalizedDocument, Section, SectionKind,
};
use crate::parsers::traits::DocumentParser;
use std::fs::File;
use std::io::Read;
use std::path::Path;

pub struct DocxParser;

impl DocumentParser for DocxParser {
    fn file_type(&self) -> FileType {
        FileType::Docx
    }

    fn sniff(&self, head: &[u8]) -> bool {
        head.len() >= 4 && head[0..4] == [0x50, 0x4B, 0x03, 0x04]
    }

    fn metadata(&self, path: &Path) -> Result<DocMetadata, AppError> {
        let title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled DOCX")
            .to_string();

        Ok(DocMetadata {
            title,
            author: None,
            language: None,
            page_count: None,
            word_count: 0,
            character_count: 0,
            parser_version: 1,
        })
    }

    fn parse(&self, path: &Path) -> Result<NormalizedDocument, AppError> {
        let file = File::open(path).map_err(|e| AppError::ParseFailed {
            reason: format!("Gagal membuka file DOCX: {}", e),
        })?;

        let mut archive = zip::ZipArchive::new(file).map_err(|e| AppError::ParseFailed {
            reason: format!("Format file DOCX (ZIP) rusak: {}", e),
        })?;

        let mut doc_xml = String::new();
        if let Ok(mut entry) = archive.by_name("word/document.xml") {
            let _ = entry.read_to_string(&mut doc_xml);
        } else {
            return Err(AppError::ParseFailed {
                reason: "Tidak ditemukan word/document.xml di dalam DOCX".to_string(),
            });
        }

        let title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled DOCX")
            .to_string();

        let paragraphs = extract_docx_paragraphs(&doc_xml);
        let mut blocks = Vec::new();
        let mut total_words: u32 = 0;
        let mut total_chars: u32 = 0;

        for (idx, p_text) in paragraphs.iter().enumerate() {
            let trimmed = p_text.trim();
            if trimmed.is_empty() {
                continue;
            }

            let words = trimmed.split_whitespace().count() as u32;
            let chars = trimmed.chars().count() as u32;
            total_words += words;
            total_chars += chars;

            blocks.push(Block::Paragraph {
                id: format!("s0-b{}", idx),
                inlines: vec![Inline {
                    text: trimmed.to_string(),
                    marks: vec![],
                }],
            });
        }

        if blocks.is_empty() {
            blocks.push(Block::Paragraph {
                id: "s0-b0".to_string(),
                inlines: vec![Inline {
                    text: "(Dokumen DOCX kosong)".to_string(),
                    marks: vec![],
                }],
            });
        }

        let section = Section {
            index: 0,
            kind: SectionKind::Body,
            title: Some(title.clone()),
            level: 0,
            blocks,
            word_count: total_words,
            character_count: total_chars,
        };

        let metadata = DocMetadata {
            title,
            author: None,
            language: None,
            page_count: None,
            word_count: total_words,
            character_count: total_chars,
            parser_version: 1,
        };

        Ok(NormalizedDocument {
            metadata,
            sections: vec![section],
            toc: vec![],
        })
    }
}

fn extract_docx_paragraphs(xml: &str) -> Vec<String> {
    let mut paragraphs = Vec::new();
    let mut reader = quick_xml::Reader::from_str(xml);
    reader.trim_text(false);

    let mut in_p = false;
    let mut in_t = false;
    let mut current_p = String::new();

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Start(ref e)) => match e.name().as_ref() {
                b"w:p" => {
                    in_p = true;
                    current_p.clear();
                }
                b"w:t" => {
                    in_t = true;
                }
                _ => {}
            },
            Ok(quick_xml::events::Event::End(ref e)) => match e.name().as_ref() {
                b"w:p" => {
                    in_p = false;
                    let trimmed = current_p.trim();
                    if !trimmed.is_empty() {
                        paragraphs.push(trimmed.to_string());
                    }
                    current_p.clear();
                }
                b"w:t" => {
                    in_t = false;
                }
                _ => {}
            },
            Ok(quick_xml::events::Event::Text(ref e)) => {
                if in_p && in_t {
                    if let Ok(text) = e.unescape() {
                        current_p.push_str(text.as_ref());
                    }
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    paragraphs
}
