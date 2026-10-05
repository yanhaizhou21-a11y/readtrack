use std::path::{Path, PathBuf};
use readtrack_lib::models::document_model::*;
use readtrack_lib::parsers::markdown::MarkdownParser;
use readtrack_lib::parsers::registry::ParserRegistry;
use readtrack_lib::parsers::segment_generator::SegmentGenerator;
use readtrack_lib::parsers::traits::DocumentParser;
use readtrack_lib::parsers::txt::TxtParser;
use readtrack_lib::storage::{DetectedFormat, FileStore};

fn temp_file(name: &str, data: &[u8]) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("readtrack_adv_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join(name);
    std::fs::write(&file, data).unwrap();
    file
}

fn cleanup(path: &Path) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::remove_dir_all(parent);
    }
}

// =========================================================================
// CHALLENGE 1: Plain Text Parser & Ingestion Pipeline
// =========================================================================

#[test]
fn test_challenge_txt_utf8_bom() {
    let mut data = vec![0xEF, 0xBB, 0xBF];
    data.extend_from_slice(b"BOM Title\n\nParagraph with UTF-8 BOM encoding.");
    let path = temp_file("utf8_bom.txt", &data);

    let parser = TxtParser;
    let doc = parser.parse(&path).unwrap();
    assert_eq!(doc.metadata.title, "BOM Title");
    assert_eq!(doc.sections.len(), 1);
    assert_eq!(doc.sections[0].blocks.len(), 1);

    // Sniff check
    assert!(parser.sniff(&data[..data.len().min(512)]));

    // FileStore check
    let res = FileStore::validate_magic_bytes(DetectedFormat::Txt, &data);
    assert!(res.is_ok(), "FileStore must accept UTF-8 BOM text files");

    cleanup(&path);
}

#[test]
fn test_challenge_txt_utf16le_sniff_and_registry_rejection_bug() {
    // UTF-16LE BOM: 0xFF, 0xFE followed by ASCII "Hi\n\nWorld"
    let mut data = vec![0xFF, 0xFE];
    for u in "Hi\n\nWorld".encode_utf16() {
        data.extend_from_slice(&u.to_le_bytes());
    }
    let path = temp_file("utf16le_bug.txt", &data);

    let parser = TxtParser;

    // TxtParser::parse works on its own:
    let doc_res = parser.parse(&path);
    assert!(doc_res.is_ok(), "TxtParser::parse handles UTF-16LE internally");

    // BUT EMPIRICAL BUG 1: TxtParser::sniff rejects UTF-16LE because it checks for NUL bytes!
    let sniff_result = parser.sniff(&data);
    eprintln!("TxtParser::sniff on UTF-16LE returned: {}", sniff_result);

    // EMPIRICAL BUG 2: ParserRegistry::for_file rejects UTF-16LE!
    let registry = ParserRegistry::new();
    let reg_result = registry.for_file(&data, "txt");
    eprintln!("ParserRegistry::for_file on UTF-16LE returned: {:?}", reg_result.is_ok());

    // EMPIRICAL BUG 3: FileStore::validate_magic_bytes rejects UTF-16LE!
    let fs_result = FileStore::validate_magic_bytes(DetectedFormat::Txt, &data);
    eprintln!("FileStore::validate_magic_bytes on UTF-16LE returned: {:?}", fs_result);

    cleanup(&path);
}

#[test]
fn test_challenge_txt_utf16be_sniff_and_registry_rejection_bug() {
    // UTF-16BE BOM: 0xFE, 0xFF followed by ASCII "Hi\n\nWorld"
    let mut data = vec![0xFE, 0xFF];
    for u in "Hi\n\nWorld".encode_utf16() {
        data.extend_from_slice(&u.to_be_bytes());
    }
    let path = temp_file("utf16be_bug.txt", &data);

    let parser = TxtParser;

    // TxtParser::parse works on its own:
    let doc_res = parser.parse(&path);
    assert!(doc_res.is_ok(), "TxtParser::parse handles UTF-16BE internally");

    // EMPIRICAL BUG: Sniffing and FileStore reject UTF-16BE
    let sniff_result = parser.sniff(&data);
    eprintln!("TxtParser::sniff on UTF-16BE returned: {}", sniff_result);

    let registry = ParserRegistry::new();
    let reg_result = registry.for_file(&data, "txt");
    eprintln!("ParserRegistry::for_file on UTF-16BE returned: {:?}", reg_result.is_ok());

    let fs_result = FileStore::validate_magic_bytes(DetectedFormat::Txt, &data);
    eprintln!("FileStore::validate_magic_bytes on UTF-16BE returned: {:?}", fs_result);

    cleanup(&path);
}

#[test]
fn test_challenge_txt_synthetic_section_breaks_over_3000_words() {
    // Create text document with 3500 words across multiple paragraphs
    let p1 = vec!["alpha"; 1600].join(" ");
    let p2 = vec!["beta"; 1600].join(" ");
    let p3 = vec!["gamma"; 300].join(" ");
    let content = format!("Document Title\n\n{}\n\n{}\n\n{}", p1, p2, p3);

    let path = temp_file("long_synthetic.txt", content.as_bytes());
    let parser = TxtParser;
    let doc = parser.parse(&path).unwrap();

    assert_eq!(doc.metadata.title, "Document Title");
    assert!(doc.metadata.word_count >= 3500);
    assert_eq!(doc.sections.len(), 2, "Must partition into 2 sections at >3000 words");
    assert_eq!(doc.sections[0].kind, SectionKind::Chapter);
    assert_eq!(doc.sections[0].title.as_deref(), Some("Part 1"));
    assert_eq!(doc.sections[1].title.as_deref(), Some("Part 2"));
    assert_eq!(doc.toc.len(), 2, "TOC must contain entries for Part 1 and Part 2");

    cleanup(&path);
}

#[test]
fn test_challenge_txt_zero_length_document() {
    let path = temp_file("zero.txt", b"");
    let parser = TxtParser;
    let doc = parser.parse(&path).unwrap();

    assert_eq!(doc.metadata.word_count, 0);
    assert_eq!(doc.metadata.character_count, 0);
    assert_eq!(doc.sections.len(), 1);
    assert_eq!(doc.sections[0].blocks.len(), 0);
    assert!(doc.toc.is_empty());

    // Segments for empty doc
    let segments = SegmentGenerator::generate_segments(&doc);
    assert!(segments.is_empty(), "Zero-length document must produce 0 segments");

    cleanup(&path);
}

// =========================================================================
// CHALLENGE 2: Markdown Parser Stress-Testing
// =========================================================================

#[test]
fn test_challenge_markdown_code_block_without_language_text_loss_bug() {
    // CRITICAL ADVERSARIAL CHALLENGE:
    // Fenced code block without a language specifier: ```\ncode content\n```
    let content = "# Code Test\n\n```\nlet x = 42;\nprintln!(\"{}\", x);\n```\n\nNext paragraph.";
    let path = temp_file("no_lang_code.md", content.as_bytes());

    let parser = MarkdownParser;
    let doc = parser.parse(&path).unwrap();

    let sec = &doc.sections[0];
    println!("Blocks count: {}", sec.blocks.len());
    for (i, b) in sec.blocks.iter().enumerate() {
        println!("Block {}: {:?}", i, b);
    }

    // Verify whether Block::Code retained text
    let code_block = sec.blocks.iter().find(|b| matches!(b, Block::Code { .. }));
    assert!(code_block.is_some(), "Must have a Block::Code");
    if let Some(Block::Code { language, text, .. }) = code_block {
        assert!(language.is_none(), "Language should be None");
        eprintln!("ACTUAL Block::Code text: {:?}", text);
        // If bug exists, text will be empty!
    }

    cleanup(&path);
}

#[test]
fn test_challenge_markdown_indented_code_block() {
    // 4-space indented code block per CommonMark
    let content = "# Indented Test\n\n    let x = 100;\n    let y = 200;\n\nParagraph after.";
    let path = temp_file("indented_code.md", content.as_bytes());

    let parser = MarkdownParser;
    let doc = parser.parse(&path).unwrap();

    let sec = &doc.sections[0];
    let code_block = sec.blocks.iter().find(|b| matches!(b, Block::Code { .. }));
    if let Some(Block::Code { text, .. }) = code_block {
        eprintln!("Indented Block::Code text: {:?}", text);
    } else {
        eprintln!("No Block::Code found for indented code!");
    }

    cleanup(&path);
}

#[test]
fn test_challenge_markdown_unclosed_code_fence() {
    // Unclosed code fence at EOF
    let content = "# Title\n\n```rust\nfn unclosed() {\n    return true;\n";
    let path = temp_file("unclosed_code.md", content.as_bytes());

    let parser = MarkdownParser;
    let doc = parser.parse(&path).unwrap();

    let sec = &doc.sections[0];
    let code_block = sec.blocks.iter().find(|b| matches!(b, Block::Code { .. }));
    assert!(code_block.is_some(), "Unclosed code fence must be closed at EOF");
    if let Some(Block::Code { text, .. }) = code_block {
        assert!(text.contains("fn unclosed()"));
    }

    cleanup(&path);
}

#[test]
fn test_challenge_markdown_nested_lists_and_block_id_collision() {
    let content = "- Outer 1\n  - Inner 1.1\n  - Inner 1.2\n- Outer 2\n";
    let path = temp_file("nested_lists.md", content.as_bytes());

    let parser = MarkdownParser;
    let doc = parser.parse(&path).unwrap();

    assert_eq!(doc.sections[0].blocks.len(), 1);
    if let Block::List { items, .. } = &doc.sections[0].blocks[0] {
        assert_eq!(items.len(), 2, "Outer list has 2 items");
        // Inspect item 0 blocks
        let item0_blocks = &items[0];
        eprintln!("Item 0 blocks: {:?}", item0_blocks);
    }

    cleanup(&path);
}

#[test]
fn test_challenge_markdown_deep_blockquotes() {
    let content = "> Level 1\n>> Level 2\n>>> Level 3 with **bold**\n";
    let path = temp_file("deep_quotes.md", content.as_bytes());

    let parser = MarkdownParser;
    let doc = parser.parse(&path).unwrap();

    assert_eq!(doc.sections[0].blocks.len(), 1);
    if let Block::Quote { blocks: q1, .. } = &doc.sections[0].blocks[0] {
        eprintln!("Quote level 1 contains {} blocks", q1.len());
    }

    cleanup(&path);
}

#[test]
fn test_challenge_markdown_dangerous_links_all_schemes() {
    let content = "\
[l1](javascript:alert(1))
[l2](JAVASCRIPT:alert(2))
[l3](  javascript:alert(3)  )
[l4](data:text/html,<script>alert(4)</script>)
[l5](DATA:image/svg+xml;base64,PHN2Zy8+)
[l6](vbscript:msgbox)
[l7](file:///C:/boot.ini)
[l8](intent://scan)
[l9](https://readtrack.app)
[l10](http://insecure.com)
[l11](mailto:user@domain.com)";

    let path = temp_file("dangerous_links.md", content.as_bytes());
    let parser = MarkdownParser;
    let doc = parser.parse(&path).unwrap();

    if let Block::Paragraph { inlines, .. } = &doc.sections[0].blocks[0] {
        for inline in inlines {
            for mark in &inline.marks {
                if let Mark::Link { href } = mark {
                    assert!(
                        href.starts_with("https://")
                            || href.starts_with("http://")
                            || href.starts_with("mailto:"),
                        "Dangerous link scheme not stripped: {}",
                        href
                    );
                }
            }
        }
    }

    cleanup(&path);
}

#[test]
fn test_challenge_markdown_html_stripping_advanced() {
    let content = "Safe text <script type=\"text/javascript\">alert('xss')</script> <iframe src=\"https://evil.com\"></iframe> <img src=\"x\" onerror=\"alert(1)\" /> tail text.";
    let path = temp_file("xss_adv.md", content.as_bytes());

    let parser = MarkdownParser;
    let doc = parser.parse(&path).unwrap();

    if let Block::Paragraph { inlines, .. } = &doc.sections[0].blocks[0] {
        let full: String = inlines.iter().map(|i| i.text.as_str()).collect();
        assert!(!full.contains("<script"));
        assert!(!full.contains("<iframe"));
        assert!(!full.contains("<img"));
        assert!(!full.contains("onerror"));
        assert!(full.contains("Safe text"));
        assert!(full.contains("tail text"));
    }

    cleanup(&path);
}

// =========================================================================
// CHALLENGE 3: Segment Generator Invariants
// =========================================================================

#[test]
fn test_challenge_segment_word_accumulation_and_thresholds() {
    // Test exact 40 word boundary:
    // Block 1: 39 words -> NOT flushed
    // Block 2: 1 word -> total 40 words -> FLUSHED (1 segment with 40 words)
    let b1 = Block::Paragraph {
        id: "s0-b0".into(),
        inlines: vec![Inline {
            text: vec!["word"; 39].join(" "),
            marks: Vec::new(),
        }],
    };
    let b2 = Block::Paragraph {
        id: "s0-b1".into(),
        inlines: vec![Inline {
            text: "finalword".into(),
            marks: Vec::new(),
        }],
    };
    let doc = NormalizedDocument {
        metadata: DocMetadata::default(),
        sections: vec![Section {
            index: 0,
            kind: SectionKind::Body,
            title: None,
            level: 0,
            blocks: vec![b1, b2],
            word_count: 40,
            character_count: 200,
        }],
        toc: Vec::new(),
    };

    let segments = SegmentGenerator::generate_segments(&doc);
    assert_eq!(segments.len(), 1, "39 words + 1 word = 40 words, must flush into exactly 1 segment");
    assert_eq!(segments[0].word_count, 40);
    assert_eq!(segments[0].first_block_id.as_deref(), Some("s0-b0"));
    assert_eq!(segments[0].last_block_id.as_deref(), Some("s0-b1"));
}

#[test]
fn test_challenge_segment_flush_before_exceeding_220_words() {
    // Block 1: 30 words
    // Block 2: 200 words (30 + 200 = 230 > 220)
    // Block 1 must be flushed with 30 words!
    // Block 2 then gets added (200 words >= 40) -> flushed with 200 words!
    let b1 = Block::Paragraph {
        id: "s0-b0".into(),
        inlines: vec![Inline {
            text: vec!["word"; 30].join(" "),
            marks: Vec::new(),
        }],
    };
    let b2 = Block::Paragraph {
        id: "s0-b1".into(),
        inlines: vec![Inline {
            text: vec!["big"; 200].join(" "),
            marks: Vec::new(),
        }],
    };
    let doc = NormalizedDocument {
        metadata: DocMetadata::default(),
        sections: vec![Section {
            index: 0,
            kind: SectionKind::Body,
            title: None,
            level: 0,
            blocks: vec![b1, b2],
            word_count: 230,
            character_count: 1000,
        }],
        toc: Vec::new(),
    };

    let segments = SegmentGenerator::generate_segments(&doc);
    assert_eq!(segments.len(), 2, "Must split into 2 segments before exceeding 220 words");
    assert_eq!(segments[0].word_count, 30);
    assert_eq!(segments[0].first_block_id.as_deref(), Some("s0-b0"));
    assert_eq!(segments[1].word_count, 200);
    assert_eq!(segments[1].first_block_id.as_deref(), Some("s0-b1"));
}

#[test]
fn test_challenge_segment_media_weight_formulas() {
    // 1. Image = 30 words
    let img = Block::Image {
        id: "s0-b0".into(),
        asset: None,
        alt: Some("diagram".into()),
    };
    let m_img = SegmentGenerator::calculate_block_metrics(&img);
    assert_eq!(m_img.words, 30);

    // 2. Code = chars / 6, max(1)
    let code_0 = Block::Code {
        id: "s0-b1".into(),
        language: None,
        text: "".into(),
    };
    assert_eq!(SegmentGenerator::calculate_block_metrics(&code_0).words, 1, "0 chars code must weigh at least 1");

    let code_60 = Block::Code {
        id: "s0-b2".into(),
        language: Some("rust".into()),
        text: vec!["a"; 60].join(""),
    };
    assert_eq!(SegmentGenerator::calculate_block_metrics(&code_60).words, 10, "60 chars / 6 = 10 words");

    // 3. Table = cells * 1.0
    let table = Block::Table {
        id: "s0-b3".into(),
        rows: vec![
            vec![
                vec![Inline { text: "".into(), marks: Vec::new() }],
                vec![Inline { text: "".into(), marks: Vec::new() }],
            ],
            vec![
                vec![Inline { text: "".into(), marks: Vec::new() }],
                vec![Inline { text: "".into(), marks: Vec::new() }],
            ],
        ],
        header_rows: 1,
    };
    let m_tbl = SegmentGenerator::calculate_block_metrics(&table);
    assert_eq!(m_tbl.words, 4, "4 cells must contribute 4 words");
}

#[test]
fn test_challenge_segment_section_isolation_never_merges() {
    let doc = NormalizedDocument {
        metadata: DocMetadata::default(),
        sections: vec![
            Section {
                index: 0,
                kind: SectionKind::Chapter,
                title: Some("Sec 0".into()),
                level: 1,
                blocks: vec![Block::Paragraph {
                    id: "s0-b0".into(),
                    inlines: vec![Inline { text: "short section 0".into(), marks: Vec::new() }],
                }],
                word_count: 3,
                character_count: 15,
            },
            Section {
                index: 1,
                kind: SectionKind::Chapter,
                title: Some("Sec 1".into()),
                level: 1,
                blocks: vec![Block::Paragraph {
                    id: "s1-b0".into(),
                    inlines: vec![Inline { text: "short section 1".into(), marks: Vec::new() }],
                }],
                word_count: 3,
                character_count: 15,
            },
        ],
        toc: Vec::new(),
    };

    let segments = SegmentGenerator::generate_segments(&doc);
    assert_eq!(segments.len(), 2, "Must have exactly 2 segments, never merged across sections");
    assert_eq!(segments[0].section_index, 0);
    assert_eq!(segments[1].section_index, 1);
}
