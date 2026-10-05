use std::fs::File;
use std::io::Read;
use std::path::Path;

use crate::errors::AppError;
use crate::models::document_model::{
    Block, DocMetadata, FileType, Inline, NormalizedDocument, Section, SectionKind, TocEntry,
};
use crate::parsers::traits::DocumentParser;
use crate::utils::text::{count_chars, count_words};

const MAX_TXT_SIZE: u64 = 200 * 1024 * 1024; // 200 MB limit
const SECTION_WORD_THRESHOLD: u32 = 3000;

pub struct TxtParser;

impl DocumentParser for TxtParser {
    fn file_type(&self) -> FileType {
        FileType::Txt
    }

    fn sniff(&self, head: &[u8]) -> bool {
        // Recognize UTF-16LE and UTF-16BE BOM signatures first.
        // UTF-16 text contains interleaved null bytes (0x00) for all ASCII code units.
        if head.starts_with(b"\xFF\xFE") || head.starts_with(b"\xFE\xFF") {
            return true;
        }

        // Plain text without UTF-16 BOM: reject if binary NUL bytes are present in initial slice
        !head.iter().take(512).any(|&b| b == 0)
    }

    fn metadata(&self, path: &Path) -> Result<DocMetadata, AppError> {
        let doc = self.parse(path)?;
        Ok(doc.metadata)
    }

    fn parse(&self, path: &Path) -> Result<NormalizedDocument, AppError> {
        let meta = std::fs::metadata(path).map_err(AppError::from)?;
        if meta.len() > MAX_TXT_SIZE {
            return Err(AppError::FileTooLarge {
                max_bytes: MAX_TXT_SIZE,
                actual_bytes: meta.len(),
                max_mb: MAX_TXT_SIZE / (1024 * 1024),
            });
        }

        let fallback_title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string();

        if meta.len() == 0 {
            return Ok(NormalizedDocument::empty(fallback_title));
        }

        let mut file = File::open(path).map_err(AppError::from)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer).map_err(AppError::from)?;

        let text = decode_text(&buffer);
        if text.trim().is_empty() {
            return Ok(NormalizedDocument::empty(fallback_title));
        }

        let (title, paragraphs) = extract_title_and_paragraphs(&text, &fallback_title);
        let (sections, toc) = build_sections(paragraphs);

        let total_words: u32 = sections.iter().map(|s| s.word_count).sum();
        let total_chars: u32 = sections.iter().map(|s| s.character_count).sum();

        Ok(NormalizedDocument {
            metadata: DocMetadata {
                title,
                author: None,
                language: None,
                page_count: None,
                word_count: total_words,
                character_count: total_chars,
                parser_version: 1,
            },
            sections,
            toc,
        })
    }
}

fn decode_text(bytes: &[u8]) -> String {
    if bytes.len() >= 3 && bytes[0..3] == [0xEF, 0xBB, 0xBF] {
        return String::from_utf8_lossy(&bytes[3..]).into_owned();
    }
    if bytes.len() >= 2 && bytes[0..2] == [0xFF, 0xFE] {
        let u16s: Vec<u16> = bytes[2..]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|&c| u16::from_le_bytes(c))
            .collect();
        return char::decode_utf16(u16s)
            .map(|r| r.unwrap_or('\u{FFFD}'))
            .collect();
    }
    if bytes.len() >= 2 && bytes[0..2] == [0xFE, 0xFF] {
        let u16s: Vec<u16> = bytes[2..]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|&c| u16::from_be_bytes(c))
            .collect();
        return char::decode_utf16(u16s)
            .map(|r| r.unwrap_or('\u{FFFD}'))
            .collect();
    }
    String::from_utf8_lossy(bytes).into_owned()
}

fn extract_title_and_paragraphs(text: &str, fallback_title: &str) -> (String, Vec<String>) {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let raw_paragraphs: Vec<&str> = normalized
        .split("\n\n")
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();

    if raw_paragraphs.is_empty() {
        return (fallback_title.to_string(), Vec::new());
    }

    let first_p = raw_paragraphs[0];

    // Check if the first paragraph contains multiple lines
    if let Some((first_line_raw, remaining_raw)) = first_p.split_once('\n') {
        let first_line = first_line_raw.trim();
        if !first_line.is_empty() && first_line.chars().count() <= 80 {
            let title = first_line.to_string();
            let mut paragraphs = Vec::new();
            let remaining_first_p = remaining_raw.trim();
            if !remaining_first_p.is_empty() {
                paragraphs.push(remaining_first_p.to_string());
            }
            for p in &raw_paragraphs[1..] {
                paragraphs.push(p.to_string());
            }
            return (title, paragraphs);
        }
    } else {
        // First paragraph is a single line
        let first_line = first_p.trim();
        if !first_line.is_empty() && first_line.chars().count() <= 80 && raw_paragraphs.len() > 1 {
            let title = first_line.to_string();
            let paragraphs = raw_paragraphs[1..].iter().map(|s| s.to_string()).collect();
            return (title, paragraphs);
        }
    }

    let paragraphs = raw_paragraphs.iter().map(|s| s.to_string()).collect();
    (fallback_title.to_string(), paragraphs)
}

fn build_sections(paragraphs: Vec<String>) -> (Vec<Section>, Vec<TocEntry>) {
    if paragraphs.is_empty() {
        return (
            vec![Section {
                index: 0,
                kind: SectionKind::Body,
                title: None,
                level: 0,
                blocks: Vec::new(),
                word_count: 0,
                character_count: 0,
            }],
            Vec::new(),
        );
    }

    let total_words: u32 = paragraphs.iter().map(|p| count_words(p)).sum();

    if total_words <= SECTION_WORD_THRESHOLD {
        let mut blocks = Vec::with_capacity(paragraphs.len());
        let mut sec_words: u32 = 0;
        let mut sec_chars: u32 = 0;

        for (b_idx, p) in paragraphs.into_iter().enumerate() {
            let words = count_words(&p);
            let chars = count_chars(&p);
            sec_words += words;
            sec_chars += chars;
            blocks.push(Block::Paragraph {
                id: format!("s0-b{}", b_idx),
                inlines: vec![Inline {
                    text: p,
                    marks: Vec::new(),
                }],
            });
        }

        let section = Section {
            index: 0,
            kind: SectionKind::Body,
            title: None,
            level: 0,
            blocks,
            word_count: sec_words,
            character_count: sec_chars,
        };

        return (vec![section], Vec::new());
    }

    // Multi-section partitioning (> 3000 words)
    let mut sections = Vec::new();
    let mut toc = Vec::new();
    let mut current_blocks = Vec::new();
    let mut current_words: u32 = 0;
    let mut current_chars: u32 = 0;
    let mut sec_idx: u32 = 0;
    let mut block_idx: u32 = 0;

    for p in paragraphs {
        let words = count_words(&p);
        let chars = count_chars(&p);

        if current_words >= SECTION_WORD_THRESHOLD && !current_blocks.is_empty() {
            let part_title = format!("Part {}", sec_idx + 1);
            let first_block_id = format!("s{}-b0", sec_idx);

            toc.push(TocEntry {
                title: part_title.clone(),
                section_index: sec_idx,
                block_id: Some(first_block_id),
                page: None,
                level: 1,
                children: Vec::new(),
            });

            sections.push(Section {
                index: sec_idx,
                kind: SectionKind::Chapter,
                title: Some(part_title),
                level: 1,
                blocks: std::mem::take(&mut current_blocks),
                word_count: current_words,
                character_count: current_chars,
            });

            sec_idx += 1;
            block_idx = 0;
            current_words = 0;
            current_chars = 0;
        }

        current_words += words;
        current_chars += chars;
        current_blocks.push(Block::Paragraph {
            id: format!("s{}-b{}", sec_idx, block_idx),
            inlines: vec![Inline {
                text: p,
                marks: Vec::new(),
            }],
        });
        block_idx += 1;
    }

    if !current_blocks.is_empty() {
        let part_title = format!("Part {}", sec_idx + 1);
        let first_block_id = format!("s{}-b0", sec_idx);

        toc.push(TocEntry {
            title: part_title.clone(),
            section_index: sec_idx,
            block_id: Some(first_block_id),
            page: None,
            level: 1,
            children: Vec::new(),
        });

        sections.push(Section {
            index: sec_idx,
            kind: SectionKind::Chapter,
            title: Some(part_title),
            level: 1,
            blocks: current_blocks,
            word_count: current_words,
            character_count: current_chars,
        });
    }

    (sections, toc)
}
