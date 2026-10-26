use crate::errors::AppError;
use crate::models::document_model::{
    Block, DocMetadata, FileType, Inline, NormalizedDocument, Section, SectionKind,
};
use crate::parsers::traits::DocumentParser;
use std::fs::File;
use std::io::Read;
use std::path::Path;

pub struct EpubParser;

impl DocumentParser for EpubParser {
    fn file_type(&self) -> FileType {
        FileType::Epub
    }

    fn sniff(&self, head: &[u8]) -> bool {
        head.len() >= 4 && head[0..4] == [0x50, 0x4B, 0x03, 0x04]
    }

    fn metadata(&self, path: &Path) -> Result<DocMetadata, AppError> {
        let title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled EPUB")
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
            reason: format!("Gagal membuka file EPUB: {}", e),
        })?;

        let mut archive = zip::ZipArchive::new(file).map_err(|e| AppError::ParseFailed {
            reason: format!("Format file EPUB (ZIP) rusak: {}", e),
        })?;

        let mut html_entries = Vec::new();
        for i in 0..archive.len() {
            if let Ok(entry) = archive.by_index(i) {
                let name = entry.name().to_ascii_lowercase();
                if (name.ends_with(".xhtml") || name.ends_with(".html") || name.ends_with(".htm"))
                    && !name.contains("toc")
                    && !name.contains("nav")
                {
                    html_entries.push(i);
                }
            }
        }

        // If filtered list is empty, include all html files
        if html_entries.is_empty() {
            for i in 0..archive.len() {
                if let Ok(entry) = archive.by_index(i) {
                    let name = entry.name().to_ascii_lowercase();
                    if name.ends_with(".xhtml") || name.ends_with(".html") || name.ends_with(".htm")
                    {
                        html_entries.push(i);
                    }
                }
            }
        }

        let title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled EPUB")
            .to_string();

        let mut sections = Vec::new();
        let mut total_words: u32 = 0;
        let mut total_chars: u32 = 0;

        for (sec_idx, entry_idx) in html_entries.iter().enumerate() {
            let mut content = String::new();
            if let Ok(mut entry) = archive.by_index(*entry_idx) {
                let _ = entry.read_to_string(&mut content);
            }

            let text = strip_html_tags(&content);
            let trimmed = text.trim();
            if trimmed.is_empty() {
                continue;
            }

            let paragraphs: Vec<&str> = trimmed
                .split("\n\n")
                .map(|p| p.trim())
                .filter(|p| !p.is_empty())
                .collect();

            let mut blocks = Vec::new();
            for (b_idx, p) in paragraphs.iter().enumerate() {
                blocks.push(Block::Paragraph {
                    id: format!("s{}-b{}", sec_idx, b_idx),
                    inlines: vec![Inline {
                        text: p.to_string(),
                        marks: vec![],
                    }],
                });
            }

            let words = trimmed.split_whitespace().count() as u32;
            let chars = trimmed.chars().count() as u32;
            total_words += words;
            total_chars += chars;

            sections.push(Section {
                index: sec_idx as u32,
                kind: SectionKind::Chapter,
                title: Some(format!("Bab {}", sec_idx + 1)),
                level: 1,
                blocks,
                word_count: words,
                character_count: chars,
            });
        }

        if sections.is_empty() {
            sections.push(Section {
                index: 0,
                kind: SectionKind::Body,
                title: Some(title.clone()),
                level: 0,
                blocks: vec![Block::Paragraph {
                    id: "s0-b0".to_string(),
                    inlines: vec![Inline {
                        text: "(Konten EPUB kosong atau tidak terbaca)".to_string(),
                        marks: vec![],
                    }],
                }],
                word_count: 0,
                character_count: 0,
            });
        }

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
            sections,
            toc: vec![],
        })
    }
}

fn strip_html_tags(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;
    let mut in_script_or_style = false;
    let mut tag_buf = String::new();

    for c in html.chars() {
        if c == '<' {
            in_tag = true;
            tag_buf.clear();
        } else if c == '>' {
            in_tag = false;
            let tag_lower = tag_buf.to_ascii_lowercase();
            if tag_lower.starts_with("script") || tag_lower.starts_with("style") {
                in_script_or_style = true;
            } else if tag_lower.starts_with("/script") || tag_lower.starts_with("/style") {
                in_script_or_style = false;
            } else if tag_lower == "p"
                || tag_lower.starts_with("p ")
                || tag_lower == "/p"
                || tag_lower == "div"
                || tag_lower.starts_with("div ")
                || tag_lower == "/div"
                || tag_lower == "br"
                || tag_lower == "br/"
            {
                result.push('\n');
            }
        } else if in_tag {
            tag_buf.push(c);
        } else if !in_script_or_style {
            result.push(c);
        }
    }

    // Decode basic entities
    result
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}
