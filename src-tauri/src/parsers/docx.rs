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

        let items = extract_docx_items(&doc_xml);
        let mut blocks = Vec::new();
        let mut total_words: u32 = 0;
        let mut total_chars: u32 = 0;

        for (idx, item) in items.into_iter().enumerate() {
            match item {
                DocxItem::Paragraph(text) => {
                    let trimmed = text.trim();
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
                DocxItem::Table(rows) => {
                    if rows.is_empty() {
                        continue;
                    }

                    let mut table_rows = Vec::new();
                    for row in rows {
                        let mut row_cells = Vec::new();
                        for cell_text in row {
                            let trimmed = cell_text.trim();
                            let words = trimmed.split_whitespace().count() as u32;
                            let chars = trimmed.chars().count() as u32;
                            total_words += words;
                            total_chars += chars;

                            row_cells.push(vec![Inline {
                                text: trimmed.to_string(),
                                marks: vec![],
                            }]);
                        }
                        table_rows.push(row_cells);
                    }

                    blocks.push(Block::Table {
                        id: format!("s0-b{}", idx),
                        rows: table_rows,
                        header_rows: 1,
                    });
                }
            }
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

enum DocxItem {
    Paragraph(String),
    Table(Vec<Vec<String>>),
}

fn extract_docx_items(xml: &str) -> Vec<DocxItem> {
    let mut items = Vec::new();
    let mut reader = quick_xml::Reader::from_str(xml);
    reader.trim_text(false);

    let mut in_p = false;
    let mut in_t = false;
    let mut in_tbl = false;
    let mut in_tr = false;
    let mut in_tc = false;

    let mut current_p = String::new();
    let mut current_cell = String::new();
    let mut current_row: Vec<String> = Vec::new();
    let mut current_table: Vec<Vec<String>> = Vec::new();

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Start(ref e)) => match e.name().as_ref() {
                b"w:tbl" => {
                    in_tbl = true;
                    current_table.clear();
                }
                b"w:tr" => {
                    in_tr = true;
                    current_row.clear();
                }
                b"w:tc" => {
                    in_tc = true;
                    current_cell.clear();
                }
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
                b"w:tbl" => {
                    in_tbl = false;
                    if !current_table.is_empty() {
                        items.push(DocxItem::Table(std::mem::take(&mut current_table)));
                    }
                }
                b"w:tr" => {
                    in_tr = false;
                    if in_tbl && !current_row.is_empty() {
                        current_table.push(std::mem::take(&mut current_row));
                    }
                }
                b"w:tc" => {
                    in_tc = false;
                    if in_tr {
                        current_row.push(std::mem::take(&mut current_cell));
                    }
                }
                b"w:p" => {
                    in_p = false;
                    let trimmed = current_p.trim();
                    if in_tc {
                        if !trimmed.is_empty() {
                            if !current_cell.is_empty() {
                                current_cell.push(' ');
                            }
                            current_cell.push_str(trimmed);
                        }
                    } else if !in_tbl && !trimmed.is_empty() {
                        items.push(DocxItem::Paragraph(trimmed.to_string()));
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

    items
}
