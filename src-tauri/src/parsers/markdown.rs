use std::fs::File;
use std::io::Read;
use std::path::Path;

use pulldown_cmark::{CodeBlockKind, Event, HeadingLevel, Options, Parser, Tag, TagEnd};

use crate::errors::AppError;
use crate::models::document_model::{
    Block, BlockId, DocMetadata, FileType, Inline, Mark, NormalizedDocument, Section, SectionKind,
    TocEntry,
};
use crate::parsers::traits::DocumentParser;
use crate::utils::text::{count_chars, count_words, is_safe_link_url};

pub struct MarkdownParser;

impl DocumentParser for MarkdownParser {
    fn file_type(&self) -> FileType {
        FileType::Md
    }

    fn sniff(&self, head: &[u8]) -> bool {
        // Markdown text: reject if binary NUL bytes are present in initial slice
        !head.iter().take(512).any(|&b| b == 0)
    }

    fn metadata(&self, path: &Path) -> Result<DocMetadata, AppError> {
        let doc = self.parse(path)?;
        Ok(doc.metadata)
    }

    fn parse(&self, path: &Path) -> Result<NormalizedDocument, AppError> {
        let fallback_title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string();

        let mut file = File::open(path).map_err(AppError::from)?;
        let mut content = String::new();
        file.read_to_string(&mut content).map_err(AppError::from)?;

        let content_str = content.trim_start_matches('\u{FEFF}');
        if content_str.trim().is_empty() {
            return Ok(NormalizedDocument::empty(fallback_title));
        }

        let mut options = Options::empty();
        options.insert(Options::ENABLE_TABLES);
        options.insert(Options::ENABLE_STRIKETHROUGH);
        options.insert(Options::ENABLE_TASKLISTS);
        options.insert(Options::ENABLE_HEADING_ATTRIBUTES);

        let parser = Parser::new_ext(content_str, options);
        let mut builder = MarkdownAstBuilder::new(fallback_title);
        builder.process_events(parser);
        Ok(builder.build())
    }
}

struct MarkdownAstBuilder {
    fallback_title: String,
    doc_title: Option<String>,
    sections: Vec<SectionBuilder>,
    active_section: SectionBuilder,
    toc: Vec<TocEntry>,
    current_marks: Vec<Mark>,
    current_inlines: Vec<Inline>,
    // State machines for containers
    container_stack: Vec<ContainerState>,
    table_state: Option<TableState>,
}

enum ContainerState {
    Quote { blocks: Vec<Block> },
    List { ordered: bool, items: Vec<Vec<Block>>, current_item: Vec<Block> },
}

struct TableState {
    rows: Vec<Vec<Vec<Inline>>>,
    current_row: Vec<Vec<Inline>>,
    in_header: bool,
}

struct SectionBuilder {
    index: u32,
    kind: SectionKind,
    title: Option<String>,
    level: u8,
    blocks: Vec<Block>,
    block_counter: u32,
}

impl SectionBuilder {
    fn new(index: u32, kind: SectionKind, title: Option<String>, level: u8) -> Self {
        Self {
            index,
            kind,
            title,
            level,
            blocks: Vec::new(),
            block_counter: 0,
        }
    }

    fn next_block_id(&mut self) -> BlockId {
        let id = format!("s{}-b{}", self.index, self.block_counter);
        self.block_counter += 1;
        id
    }
}

impl MarkdownAstBuilder {
    fn new(fallback_title: String) -> Self {
        Self {
            fallback_title,
            doc_title: None,
            sections: Vec::new(),
            active_section: SectionBuilder::new(0, SectionKind::Body, None, 0),
            toc: Vec::new(),
            current_marks: Vec::new(),
            current_inlines: Vec::new(),
            container_stack: Vec::new(),
            table_state: None,
        }
    }

    fn push_block(&mut self, block: Block) {
        if let Some(container) = self.container_stack.last_mut() {
            match container {
                ContainerState::Quote { blocks } => blocks.push(block),
                ContainerState::List { current_item, .. } => current_item.push(block),
            }
        } else {
            self.active_section.blocks.push(block);
        }
    }

    fn flush_inlines(&mut self) -> Vec<Inline> {
        std::mem::take(&mut self.current_inlines)
    }

    fn process_events<'a>(&mut self, parser: impl Iterator<Item = Event<'a>>) {
        let mut active_heading_level: Option<HeadingLevel> = None;
        let mut in_code_block = false;
        let mut active_code_lang: Option<String> = None;
        let mut active_code_text = String::new();

        for event in parser {
            match event {
                Event::Start(tag) => match tag {
                    Tag::Paragraph => {
                        self.current_inlines.clear();
                    }
                    Tag::Heading { level, .. } => {
                        active_heading_level = Some(level);
                        self.current_inlines.clear();
                    }
                    Tag::BlockQuote(_) => {
                        self.container_stack.push(ContainerState::Quote { blocks: Vec::new() });
                    }
                    Tag::CodeBlock(kind) => {
                        in_code_block = true;
                        active_code_text.clear();
                        active_code_lang = match kind {
                            CodeBlockKind::Fenced(lang) => {
                                let l = lang.trim();
                                if l.is_empty() { None } else { Some(l.to_string()) }
                            }
                            CodeBlockKind::Indented => None,
                        };
                    }
                    Tag::List(ordered_start) => {
                        self.container_stack.push(ContainerState::List {
                            ordered: ordered_start.is_some(),
                            items: Vec::new(),
                            current_item: Vec::new(),
                        });
                    }
                    Tag::Item => {}
                    Tag::Table(_) => {
                        self.table_state = Some(TableState {
                            rows: Vec::new(),
                            current_row: Vec::new(),
                            in_header: false,
                        });
                    }
                    Tag::TableHead => {
                        if let Some(t) = &mut self.table_state {
                            t.in_header = true;
                        }
                    }
                    Tag::TableRow => {
                        if let Some(t) = &mut self.table_state {
                            t.current_row.clear();
                        }
                    }
                    Tag::TableCell => {
                        self.current_inlines.clear();
                    }
                    Tag::Emphasis => self.current_marks.push(Mark::Italic),
                    Tag::Strong => self.current_marks.push(Mark::Bold),
                    Tag::Strikethrough => self.current_marks.push(Mark::Strikethrough),
                    Tag::Link { dest_url, .. } if is_safe_link_url(&dest_url) => {
                        self.current_marks.push(Mark::Link { href: dest_url.to_string() });
                    }
                    _ => {}
                },
                Event::End(tag_end) => match tag_end {
                    TagEnd::Paragraph => {
                        let inlines = self.flush_inlines();
                        if !inlines.is_empty() {
                            let block_id = self.active_section.next_block_id();
                            self.push_block(Block::Paragraph { id: block_id, inlines });
                        }
                    }
                    TagEnd::Heading(_) => {
                        let level = active_heading_level.take().unwrap_or(HeadingLevel::H1);
                        let inlines = self.flush_inlines();
                        let heading_text: String = inlines.iter().map(|i| i.text.as_str()).collect();
                        let level_u8 = heading_level_to_u8(level);

                        if self.doc_title.is_none() || (level_u8 == 1 && self.doc_title.as_ref() == Some(&self.fallback_title)) {
                            self.doc_title = Some(heading_text.clone());
                        }

                        if level_u8 <= 2 {
                            let new_sec_index = if self.active_section.blocks.is_empty() && self.sections.is_empty() {
                                0
                            } else {
                                self.sections.len() as u32 + 1
                            };

                            if !self.active_section.blocks.is_empty() || !self.sections.is_empty() {
                                let old_sec = std::mem::replace(
                                    &mut self.active_section,
                                    SectionBuilder::new(
                                        new_sec_index,
                                        if level_u8 == 1 { SectionKind::Chapter } else { SectionKind::Heading },
                                        Some(heading_text.clone()),
                                        level_u8,
                                    ),
                                );
                                self.sections.push(old_sec);
                            } else {
                                self.active_section.kind = if level_u8 == 1 { SectionKind::Chapter } else { SectionKind::Heading };
                                self.active_section.title = Some(heading_text.clone());
                                self.active_section.level = level_u8;
                            }

                            let block_id = self.active_section.next_block_id();
                            self.toc.push(TocEntry {
                                title: heading_text,
                                section_index: self.active_section.index,
                                block_id: Some(block_id.clone()),
                                page: None,
                                level: level_u8,
                                children: Vec::new(),
                            });
                            self.push_block(Block::Heading { id: block_id, level: level_u8, inlines });
                        } else {
                            let block_id = self.active_section.next_block_id();
                            self.toc.push(TocEntry {
                                title: heading_text,
                                section_index: self.active_section.index,
                                block_id: Some(block_id.clone()),
                                page: None,
                                level: level_u8,
                                children: Vec::new(),
                            });
                            self.push_block(Block::Heading { id: block_id, level: level_u8, inlines });
                        }
                    }
                    TagEnd::BlockQuote(_) => {
                        if let Some(ContainerState::Quote { blocks }) = self.container_stack.pop() {
                            let block_id = self.active_section.next_block_id();
                            self.push_block(Block::Quote { id: block_id, blocks });
                        }
                    }
                    TagEnd::CodeBlock => {
                        in_code_block = false;
                        let block_id = self.active_section.next_block_id();
                        self.push_block(Block::Code {
                            id: block_id,
                            language: active_code_lang.take(),
                            text: std::mem::take(&mut active_code_text),
                        });
                    }
                    TagEnd::Item => {
                        if let Some(ContainerState::List { items, current_item, .. }) = self.container_stack.last_mut() {
                            items.push(std::mem::take(current_item));
                        }
                    }
                    TagEnd::List(_) => {
                        if let Some(ContainerState::List { ordered, items, .. }) = self.container_stack.pop() {
                            let block_id = self.active_section.next_block_id();
                            self.push_block(Block::List { id: block_id, ordered, items });
                        }
                    }
                    TagEnd::TableCell => {
                        let cell_inlines = self.flush_inlines();
                        if let Some(t) = &mut self.table_state {
                            t.current_row.push(cell_inlines);
                        }
                    }
                    TagEnd::TableRow => {
                        if let Some(t) = &mut self.table_state {
                            let row = std::mem::take(&mut t.current_row);
                            t.rows.push(row);
                        }
                    }
                    TagEnd::TableHead => {
                        if let Some(t) = &mut self.table_state {
                            let row = std::mem::take(&mut t.current_row);
                            if !row.is_empty() {
                                t.rows.push(row);
                            }
                            t.in_header = false;
                        }
                    }
                    TagEnd::Table => {
                        if let Some(t) = self.table_state.take() {
                            let block_id = self.active_section.next_block_id();
                            self.push_block(Block::Table {
                                id: block_id,
                                rows: t.rows,
                                header_rows: 1,
                            });
                        }
                    }
                    TagEnd::Emphasis => {
                        self.pop_mark(|m| matches!(m, Mark::Italic));
                    }
                    TagEnd::Strong => {
                        self.pop_mark(|m| matches!(m, Mark::Bold));
                    }
                    TagEnd::Strikethrough => {
                        self.pop_mark(|m| matches!(m, Mark::Strikethrough));
                    }
                    TagEnd::Link => {
                        self.pop_mark(|m| matches!(m, Mark::Link { .. }));
                    }
                    _ => {}
                },
                Event::Text(t) => {
                    if in_code_block {
                        active_code_text.push_str(&t);
                    } else {
                        self.current_inlines.push(Inline {
                            text: t.to_string(),
                            marks: self.current_marks.clone(),
                        });
                    }
                }
                Event::Code(c) => {
                    let mut marks = self.current_marks.clone();
                    marks.push(Mark::Code);
                    self.current_inlines.push(Inline {
                        text: c.to_string(),
                        marks,
                    });
                }
                Event::Rule => {
                    let block_id = self.active_section.next_block_id();
                    self.push_block(Block::Separator { id: block_id });
                }
                Event::SoftBreak | Event::HardBreak => {
                    if in_code_block {
                        active_code_text.push('\n');
                    } else {
                        self.current_inlines.push(Inline {
                            text: "\n".to_string(),
                            marks: self.current_marks.clone(),
                        });
                    }
                }
                Event::Html(_) => {
                    // Security requirement: Discard raw HTML to prevent XSS
                }
                _ => {}
            }
        }
    }

    fn pop_mark<F>(&mut self, predicate: F)
    where
        F: Fn(&Mark) -> bool,
    {
        if let Some(pos) = self.current_marks.iter().rposition(predicate) {
            self.current_marks.remove(pos);
        }
    }

    fn build(mut self) -> NormalizedDocument {
        self.sections.push(self.active_section);

        let mut final_sections = Vec::new();
        let mut total_words: u32 = 0;
        let mut total_chars: u32 = 0;

        for (idx, mut s) in self.sections.into_iter().enumerate() {
            if s.blocks.is_empty() && final_sections.is_empty() {
                // Skip empty leading section
                continue;
            }
            s.index = idx as u32;

            let sec_words = s.blocks.iter().map(calculate_block_words).sum::<u32>();
            let sec_chars = s.blocks.iter().map(calculate_block_chars).sum::<u32>();
            total_words += sec_words;
            total_chars += sec_chars;

            final_sections.push(Section {
                index: s.index,
                kind: s.kind,
                title: s.title,
                level: s.level,
                blocks: s.blocks,
                word_count: sec_words,
                character_count: sec_chars,
            });
        }

        if final_sections.is_empty() {
            final_sections.push(Section {
                index: 0,
                kind: SectionKind::Body,
                title: None,
                level: 0,
                blocks: Vec::new(),
                word_count: 0,
                character_count: 0,
            });
        }

        let title = self.doc_title.unwrap_or(self.fallback_title);

        NormalizedDocument {
            metadata: DocMetadata {
                title,
                author: None,
                language: None,
                page_count: None,
                word_count: total_words,
                character_count: total_chars,
                parser_version: 1,
            },
            sections: final_sections,
            toc: self.toc,
        }
    }
}


fn heading_level_to_u8(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

fn calculate_block_words(block: &Block) -> u32 {
    match block {
        Block::Heading { inlines, .. } | Block::Paragraph { inlines, .. } => {
            inlines.iter().map(|i| count_words(&i.text)).sum()
        }
        Block::List { items, .. } => items
            .iter()
            .flat_map(|item| item.iter())
            .map(calculate_block_words)
            .sum(),
        Block::Quote { blocks, .. } => blocks.iter().map(calculate_block_words).sum(),
        Block::Code { text, .. } => (count_chars(text) / 6).max(1),
        Block::Image { .. } => 30,
        Block::Table { rows, .. } => {
            let cells = rows.iter().map(|r| r.len() as u32).sum::<u32>();
            let text_words = rows
                .iter()
                .flat_map(|r| r.iter())
                .flat_map(|c| c.iter())
                .map(|i| count_words(&i.text))
                .sum::<u32>();
            cells.max(text_words)
        }
        Block::Separator { .. } => 0,
    }
}

fn calculate_block_chars(block: &Block) -> u32 {
    match block {
        Block::Heading { inlines, .. } | Block::Paragraph { inlines, .. } => {
            inlines.iter().map(|i| count_chars(&i.text)).sum()
        }
        Block::List { items, .. } => items
            .iter()
            .flat_map(|item| item.iter())
            .map(calculate_block_chars)
            .sum(),
        Block::Quote { blocks, .. } => blocks.iter().map(calculate_block_chars).sum(),
        Block::Code { text, .. } => count_chars(text),
        Block::Image { alt, .. } => alt.as_ref().map(|s| count_chars(s)).unwrap_or(0),
        Block::Table { rows, .. } => rows
            .iter()
            .flat_map(|r| r.iter())
            .flat_map(|c| c.iter())
            .map(|i| count_chars(&i.text))
            .sum(),
        Block::Separator { .. } => 0,
    }
}
