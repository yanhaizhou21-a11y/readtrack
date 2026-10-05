use serde::{Deserialize, Serialize};

use crate::models::document_model::{Block, Inline, NormalizedDocument, SectionKind};

pub const MIN_WORDS_PER_SEGMENT: usize = 40;
pub const MAX_WORDS_PER_SEGMENT: usize = 220;
pub const IMAGE_EQUIVALENT_WORDS: usize = 30;
pub const CODE_CHARS_PER_WORD: usize = 6;
pub const PDF_ESTIMATED_WORDS_PER_PAGE: usize = 250;
pub const AVERAGE_READING_WPM: u64 = 220;
pub const FAST_READING_MAX_WPM: f64 = 700.0;
pub const MIN_REQUIRED_DWELL_MS: u64 = 1200;
pub const READ_RATIO: f64 = 0.5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SegmentType {
    Page,
    BlockGroup,
}

impl SegmentType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Page => "page",
            Self::BlockGroup => "block_group",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedSegment {
    pub segment_index: u32,
    pub section_index: u32,
    pub section_id: Option<String>,
    pub segment_type: SegmentType,
    #[serde(alias = "start_block_id")]
    pub first_block_id: Option<String>,
    #[serde(alias = "end_block_id")]
    pub last_block_id: Option<String>,
    pub start_position: i64,
    pub end_position: i64,
    pub word_count: u32,
    pub char_count: u32,
    pub estimated_dwell_ms: u64,
    pub required_dwell_ms: u64,
    pub status: String,
}

impl GeneratedSegment {
    pub fn start_block_id(&self) -> Option<&str> {
        self.first_block_id.as_deref()
    }

    pub fn end_block_id(&self) -> Option<&str> {
        self.last_block_id.as_deref()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NewReadingSegment {
    pub id: String,
    pub document_id: String,
    pub section_id: String,
    pub segment_type: String,
    pub segment_index: i64,
    pub first_block_id: Option<String>,
    pub last_block_id: Option<String>,
    pub start_position: i64,
    pub end_position: i64,
    pub word_count: i64,
    pub status: String,
    pub dwell_ms: i64,
    pub first_read_at: Option<i64>,
    pub last_read_at: Option<i64>,
    pub read_count: i64,
}

#[derive(Debug, Clone)]
pub struct BlockMetrics {
    pub words: usize,
    pub chars: usize,
    pub is_heading: bool,
}

pub struct SegmentGenerator;

impl SegmentGenerator {
    pub fn calculate_block_metrics(block: &Block) -> BlockMetrics {
        match block {
            Block::Heading { inlines, .. } => {
                let text = Self::extract_inlines_text(inlines);
                let words = Self::count_words(&text);
                let chars = text.chars().count();
                BlockMetrics {
                    words,
                    chars,
                    is_heading: true,
                }
            }
            Block::Paragraph { inlines, .. } => {
                let text = Self::extract_inlines_text(inlines);
                let words = Self::count_words(&text);
                let chars = text.chars().count();
                BlockMetrics {
                    words,
                    chars,
                    is_heading: false,
                }
            }
            Block::List { items, .. } => {
                let mut words = 0;
                let mut chars = 0;
                for item_blocks in items {
                    for b in item_blocks {
                        let m = Self::calculate_block_metrics(b);
                        words += m.words;
                        chars += m.chars;
                    }
                }
                BlockMetrics {
                    words,
                    chars,
                    is_heading: false,
                }
            }
            Block::Quote { blocks, .. } => {
                let mut words = 0;
                let mut chars = 0;
                for b in blocks {
                    let m = Self::calculate_block_metrics(b);
                    words += m.words;
                    chars += m.chars;
                }
                BlockMetrics {
                    words,
                    chars,
                    is_heading: false,
                }
            }
            Block::Image { alt, .. } => {
                let chars = alt.as_ref().map(|s| s.chars().count()).unwrap_or(0);
                BlockMetrics {
                    words: IMAGE_EQUIVALENT_WORDS,
                    chars,
                    is_heading: false,
                }
            }
            Block::Table { rows, .. } => {
                let total_cells: usize = rows.iter().map(|r| r.len()).sum();
                let mut text_words = 0;
                let mut chars = 0;
                for row in rows {
                    for cell in row {
                        let t = Self::extract_inlines_text(cell);
                        text_words += Self::count_words(&t);
                        chars += t.chars().count();
                    }
                }
                let words = total_cells.max(text_words);
                BlockMetrics {
                    words,
                    chars,
                    is_heading: false,
                }
            }
            Block::Code { text, .. } => {
                let chars = text.chars().count();
                let words = (chars / CODE_CHARS_PER_WORD).max(1);
                BlockMetrics {
                    words,
                    chars,
                    is_heading: false,
                }
            }
            Block::Separator { .. } => BlockMetrics {
                words: 0,
                chars: 0,
                is_heading: false,
            },
        }
    }

    pub fn extract_inlines_text(inlines: &[Inline]) -> String {
        inlines.iter().map(|i| i.text.as_str()).collect()
    }

    pub fn count_words(text: &str) -> usize {
        text.split_whitespace().count()
    }

    pub fn calculate_estimated_dwell_ms(word_count: usize) -> u64 {
        if word_count == 0 {
            return 0;
        }
        (word_count as u64 * 60_000) / AVERAGE_READING_WPM
    }

    pub fn calculate_required_dwell_ms(word_count: usize) -> u64 {
        let expected_ms = (word_count as f64 / FAST_READING_MAX_WPM) * 60_000.0;
        let required_ms = (expected_ms * READ_RATIO) as u64;
        required_ms.max(MIN_REQUIRED_DWELL_MS)
    }

    pub fn generate_segments(doc: &NormalizedDocument) -> Vec<GeneratedSegment> {
        let mut segments = Vec::new();
        let mut global_segment_index: u32 = 0;
        let mut cumulative_char_offset: i64 = 0;

        for (sec_idx, section) in doc.sections.iter().enumerate() {
            let section_index = section.index;

            // Handle PDF page sections
            if section.kind == SectionKind::Page {
                let start_pos = (sec_idx as i64) * 1_000_000;
                let end_pos = ((sec_idx + 1) as i64) * 1_000_000;
                let words = if section.word_count > 0 {
                    section.word_count as usize
                } else {
                    PDF_ESTIMATED_WORDS_PER_PAGE
                };
                let chars: usize = section
                    .blocks
                    .iter()
                    .map(|b| Self::calculate_block_metrics(b).chars)
                    .sum();

                segments.push(GeneratedSegment {
                    segment_index: global_segment_index,
                    section_index,
                    section_id: None,
                    segment_type: SegmentType::Page,
                    first_block_id: None,
                    last_block_id: None,
                    start_position: start_pos,
                    end_position: end_pos,
                    word_count: words as u32,
                    char_count: chars as u32,
                    estimated_dwell_ms: Self::calculate_estimated_dwell_ms(words),
                    required_dwell_ms: Self::calculate_required_dwell_ms(words),
                    status: "unread".to_string(),
                });
                global_segment_index += 1;
                continue;
            }

            // Rich Text Grouping
            let blocks = &section.blocks;
            if blocks.is_empty() {
                continue;
            }

            struct BlockSpan<'a> {
                block: &'a Block,
                metrics: BlockMetrics,
                start_pos: i64,
                end_pos: i64,
            }

            let mut spans = Vec::with_capacity(blocks.len());
            for b in blocks {
                let metrics = Self::calculate_block_metrics(b);
                let start_pos = cumulative_char_offset;
                cumulative_char_offset += metrics.chars as i64;
                let end_pos = cumulative_char_offset;
                spans.push(BlockSpan {
                    block: b,
                    metrics,
                    start_pos,
                    end_pos,
                });
            }

            let mut current_group: Vec<&BlockSpan> = Vec::new();
            let mut current_words: usize = 0;
            let mut current_chars: usize = 0;

            let flush_group = |group: &mut Vec<&BlockSpan>,
                               words: &mut usize,
                               chars: &mut usize,
                               out: &mut Vec<GeneratedSegment>,
                               idx: &mut u32| {
                if group.is_empty() {
                    return;
                }
                let first = group.first().unwrap();
                let last = group.last().unwrap();
                out.push(GeneratedSegment {
                    segment_index: *idx,
                    section_index,
                    section_id: None,
                    segment_type: SegmentType::BlockGroup,
                    first_block_id: Some(first.block.id().to_string()),
                    last_block_id: Some(last.block.id().to_string()),
                    start_position: first.start_pos,
                    end_position: last.end_pos,
                    word_count: *words as u32,
                    char_count: *chars as u32,
                    estimated_dwell_ms: Self::calculate_estimated_dwell_ms(*words),
                    required_dwell_ms: Self::calculate_required_dwell_ms(*words),
                    status: "unread".to_string(),
                });
                *idx += 1;
                group.clear();
                *words = 0;
                *chars = 0;
            };

            for span in &spans {
                // Rule 1: Break on headings
                if span.metrics.is_heading {
                    flush_group(
                        &mut current_group,
                        &mut current_words,
                        &mut current_chars,
                        &mut segments,
                        &mut global_segment_index,
                    );
                    current_group.push(span);
                    current_words += span.metrics.words;
                    current_chars += span.metrics.chars;

                    if current_words >= MIN_WORDS_PER_SEGMENT {
                        flush_group(
                            &mut current_group,
                            &mut current_words,
                            &mut current_chars,
                            &mut segments,
                            &mut global_segment_index,
                        );
                    }
                    continue;
                }

                // Rule 3: Single block > 220 words becomes its own segment
                if span.metrics.words > MAX_WORDS_PER_SEGMENT {
                    flush_group(
                        &mut current_group,
                        &mut current_words,
                        &mut current_chars,
                        &mut segments,
                        &mut global_segment_index,
                    );
                    current_group.push(span);
                    current_words = span.metrics.words;
                    current_chars = span.metrics.chars;
                    flush_group(
                        &mut current_group,
                        &mut current_words,
                        &mut current_chars,
                        &mut segments,
                        &mut global_segment_index,
                    );
                    continue;
                }

                // Rule 2: Flush if next block would exceed 220 words
                if !current_group.is_empty()
                    && (current_words + span.metrics.words > MAX_WORDS_PER_SEGMENT)
                {
                    flush_group(
                        &mut current_group,
                        &mut current_words,
                        &mut current_chars,
                        &mut segments,
                        &mut global_segment_index,
                    );
                }

                current_group.push(span);
                current_words += span.metrics.words;
                current_chars += span.metrics.chars;

                if current_words >= MIN_WORDS_PER_SEGMENT {
                    flush_group(
                        &mut current_group,
                        &mut current_words,
                        &mut current_chars,
                        &mut segments,
                        &mut global_segment_index,
                    );
                }
            }

            // Flush remaining blocks at section boundary
            flush_group(
                &mut current_group,
                &mut current_words,
                &mut current_chars,
                &mut segments,
                &mut global_segment_index,
            );
        }

        segments
    }

    pub fn to_db_records(
        generated: &[GeneratedSegment],
        document_id: &str,
        section_id_map: &[String],
    ) -> Vec<NewReadingSegment> {
        generated
            .iter()
            .map(|g| {
                let sec_id = section_id_map
                    .get(g.section_index as usize)
                    .cloned()
                    .unwrap_or_else(|| g.section_id.clone().unwrap_or_default());

                NewReadingSegment {
                    id: uuid::Uuid::new_v4().to_string(),
                    document_id: document_id.to_string(),
                    section_id: sec_id,
                    segment_type: g.segment_type.as_str().to_string(),
                    segment_index: g.segment_index as i64,
                    first_block_id: g.first_block_id.clone(),
                    last_block_id: g.last_block_id.clone(),
                    start_position: g.start_position,
                    end_position: g.end_position,
                    word_count: g.word_count as i64,
                    status: g.status.clone(),
                    dwell_ms: 0,
                    first_read_at: None,
                    last_read_at: None,
                    read_count: 0,
                }
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::document_model::*;

    fn make_test_paragraph(id: &str, words: usize) -> Block {
        let text = vec!["word"; words].join(" ");
        Block::Paragraph {
            id: id.to_string(),
            inlines: vec![Inline {
                text,
                marks: Vec::new(),
            }],
        }
    }

    fn make_test_heading(id: &str, words: usize) -> Block {
        let text = vec!["heading"; words].join(" ");
        Block::Heading {
            id: id.to_string(),
            level: 1,
            inlines: vec![Inline {
                text,
                marks: Vec::new(),
            }],
        }
    }

    #[test]
    fn test_empty_document_produces_zero_segments() {
        let doc = NormalizedDocument {
            metadata: DocMetadata::default(),
            sections: Vec::new(),
            toc: Vec::new(),
        };
        let segments = SegmentGenerator::generate_segments(&doc);
        assert!(segments.is_empty());
    }

    #[test]
    fn test_never_cross_section_boundaries() {
        let doc = NormalizedDocument {
            metadata: DocMetadata::default(),
            sections: vec![
                Section {
                    index: 0,
                    kind: SectionKind::Chapter,
                    title: Some("Ch 1".into()),
                    level: 1,
                    blocks: vec![make_test_paragraph("s0-b0", 25)],
                    word_count: 25,
                    character_count: 125,
                },
                Section {
                    index: 1,
                    kind: SectionKind::Chapter,
                    title: Some("Ch 2".into()),
                    level: 1,
                    blocks: vec![make_test_paragraph("s1-b0", 25)],
                    word_count: 25,
                    character_count: 125,
                },
            ],
            toc: Vec::new(),
        };

        let segments = SegmentGenerator::generate_segments(&doc);
        assert_eq!(segments.len(), 2, "Must not merge blocks across sections");
        assert_eq!(segments[0].section_index, 0);
        assert_eq!(segments[1].section_index, 1);
        assert_eq!(segments[0].word_count, 25);
        assert_eq!(segments[1].word_count, 25);
    }

    #[test]
    fn test_breaks_on_heading() {
        let doc = NormalizedDocument {
            metadata: DocMetadata::default(),
            sections: vec![Section {
                index: 0,
                kind: SectionKind::Chapter,
                title: None,
                level: 1,
                blocks: vec![
                    make_test_paragraph("s0-b0", 30),
                    make_test_heading("s0-b1", 5),
                    make_test_paragraph("s0-b2", 45),
                ],
                word_count: 80,
                character_count: 400,
            }],
            toc: Vec::new(),
        };

        let segments = SegmentGenerator::generate_segments(&doc);
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].last_block_id.as_deref(), Some("s0-b0"));
        assert_eq!(segments[1].first_block_id.as_deref(), Some("s0-b1"));
    }

    #[test]
    fn test_single_oversized_block_creates_standalone_segment() {
        let doc = NormalizedDocument {
            metadata: DocMetadata::default(),
            sections: vec![Section {
                index: 0,
                kind: SectionKind::Chapter,
                title: None,
                level: 1,
                blocks: vec![
                    make_test_paragraph("s0-b0", 20),
                    make_test_paragraph("s0-b1", 300), // > 220 words
                    make_test_paragraph("s0-b2", 20),
                ],
                word_count: 340,
                character_count: 1700,
            }],
            toc: Vec::new(),
        };

        let segments = SegmentGenerator::generate_segments(&doc);
        assert_eq!(segments.len(), 3);
        assert_eq!(segments[1].word_count, 300);
        assert_eq!(segments[1].first_block_id.as_deref(), Some("s0-b1"));
        assert_eq!(segments[1].last_block_id.as_deref(), Some("s0-b1"));
    }

    #[test]
    fn test_media_weight_contributions() {
        let img = Block::Image {
            id: "s0-b0".into(),
            asset: None,
            alt: Some("diagram".into()),
        };
        let m = SegmentGenerator::calculate_block_metrics(&img);
        assert_eq!(m.words, 30, "Images must weigh 30 words");

        let code = Block::Code {
            id: "s0-b1".into(),
            language: Some("rust".into()),
            text: "123456789012345678".into(), // 18 chars
        };
        let mc = SegmentGenerator::calculate_block_metrics(&code);
        assert_eq!(mc.words, 3, "18 chars / 6 = 3 words");
    }

    #[test]
    fn test_pdf_page_segment_generation() {
        let doc = NormalizedDocument {
            metadata: DocMetadata {
                ..Default::default()
            },
            sections: vec![
                Section {
                    index: 0,
                    kind: SectionKind::Page,
                    title: None,
                    level: 0,
                    blocks: Vec::new(),
                    word_count: 0,
                    character_count: 0,
                },
                Section {
                    index: 1,
                    kind: SectionKind::Page,
                    title: None,
                    level: 0,
                    blocks: Vec::new(),
                    word_count: 0,
                    character_count: 0,
                },
            ],
            toc: Vec::new(),
        };

        let segments = SegmentGenerator::generate_segments(&doc);
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].segment_type, SegmentType::Page);
        assert_eq!(segments[0].start_position, 0);
        assert_eq!(segments[0].end_position, 1_000_000);
        assert_eq!(segments[0].word_count, 250);
        assert_eq!(segments[1].start_position, 1_000_000);
        assert_eq!(segments[1].end_position, 2_000_000);
    }
}
