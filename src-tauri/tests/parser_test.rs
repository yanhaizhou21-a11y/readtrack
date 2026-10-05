use std::path::PathBuf;
use readtrack_lib::errors::AppError;
use readtrack_lib::models::{
    Block, DocMetadata, FileType, Inline, Mark, NormalizedDocument, Section, SectionKind,
};
use readtrack_lib::parsers::{
    DocumentParser, MarkdownParser, ParserRegistry, TxtParser,
};

fn temp_file(name: &str, content: &[u8]) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("readtrack_p_test_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join(name);
    std::fs::write(&file, content).unwrap();
    file
}

#[test]
fn test_txt_parser_simple() {
    let content = "My Book Title\n\nFirst paragraph content here.\n\nSecond paragraph content here.";
    let path = temp_file("simple.txt", content.as_bytes());

    let parser = TxtParser;
    let doc = parser.parse(&path).expect("parse should succeed");

    assert_eq!(doc.metadata.title, "My Book Title");
    assert_eq!(doc.sections.len(), 1);
    assert_eq!(doc.sections[0].blocks.len(), 2);
    assert_eq!(doc.sections[0].blocks[0].id(), "s0-b0");
    assert_eq!(doc.sections[0].blocks[1].id(), "s0-b1");
    assert_eq!(doc.metadata.word_count, 8); // 4 + 4

    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}

#[test]
fn test_txt_parser_utf8_bom() {
    let mut data = vec![0xEF, 0xBB, 0xBF];
    data.extend_from_slice(b"BOM Title\n\nParagraph text after BOM.");
    let path = temp_file("bom.txt", &data);

    let parser = TxtParser;
    let doc = parser.parse(&path).unwrap();

    assert_eq!(doc.metadata.title, "BOM Title");
    assert_eq!(doc.sections[0].blocks.len(), 1);

    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}

#[test]
fn test_txt_parser_utf16le_bom() {
    let mut data = vec![0xFF, 0xFE];
    let utf16_chars: Vec<u16> = "UTF-16 Title\n\nBody text"
        .encode_utf16()
        .collect();
    for u in utf16_chars {
        data.extend_from_slice(&u.to_le_bytes());
    }
    let path = temp_file("utf16le.txt", &data);

    let parser = TxtParser;
    let doc = parser.parse(&path).unwrap();

    assert_eq!(doc.metadata.title, "UTF-16 Title");
    assert_eq!(doc.sections[0].blocks.len(), 1);

    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}

#[test]
fn test_txt_parser_empty_file() {
    let path = temp_file("empty.txt", b"");

    let parser = TxtParser;
    let doc = parser.parse(&path).unwrap();

    assert_eq!(doc.metadata.word_count, 0);
    assert_eq!(doc.sections.len(), 1);
    assert!(doc.sections[0].blocks.is_empty());

    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}

#[test]
fn test_txt_parser_synthetic_sections() {
    // Generate text with > 3000 words across multiple paragraphs
    let mut paras = Vec::new();
    for i in 0..45 {
        paras.push(format!("Paragraph {} {}", i, vec!["lorem ipsum dolor sit amet"; 15].join(" ")));
    }
    let full_text = format!("Synthetic Book\n\n{}", paras.join("\n\n"));
    let path = temp_file("large.txt", full_text.as_bytes());

    let parser = TxtParser;
    let doc = parser.parse(&path).unwrap();

    assert!(doc.sections.len() > 1, "Should generate synthetic sections for > 3000 words");
    assert_eq!(doc.sections[0].kind, SectionKind::Chapter);
    assert_eq!(doc.sections[0].title, Some("Part 1".to_string()));
    assert!(!doc.toc.is_empty());
    assert_eq!(doc.toc[0].title, "Part 1");

    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}

#[test]
fn test_markdown_parser_headings_sections() {
    let content = "# Master Title\n\nIntro paragraph.\n\n## Section One\n\nSection one content.\n\n## Section Two\n\nSection two content.";
    let path = temp_file("headings.md", content.as_bytes());

    let parser = MarkdownParser;
    let doc = parser.parse(&path).unwrap();

    assert_eq!(doc.metadata.title, "Master Title");
    assert_eq!(doc.sections.len(), 3);
    assert_eq!(doc.sections[0].kind, SectionKind::Chapter);
    assert_eq!(doc.sections[0].title, Some("Master Title".to_string()));
    assert_eq!(doc.sections[1].kind, SectionKind::Heading);
    assert_eq!(doc.sections[1].title, Some("Section One".to_string()));
    assert_eq!(doc.sections[2].kind, SectionKind::Heading);
    assert_eq!(doc.sections[2].title, Some("Section Two".to_string()));

    // Check TOC entries
    assert_eq!(doc.toc.len(), 3);
    assert_eq!(doc.toc[0].title, "Master Title");
    assert_eq!(doc.toc[0].level, 1);
    assert_eq!(doc.toc[1].title, "Section One");
    assert_eq!(doc.toc[1].level, 2);

    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}

#[test]
fn test_markdown_parser_subheadings() {
    let content = "## Chapter One\n\n### Subheading A\n\nContent A.\n\n#### Deep Heading\n\nDeep content.";
    let path = temp_file("subheadings.md", content.as_bytes());

    let parser = MarkdownParser;
    let doc = parser.parse(&path).unwrap();

    // H3 and H4 do not split sections: single section
    assert_eq!(doc.sections.len(), 1);
    assert_eq!(doc.toc.len(), 3);
    assert_eq!(doc.toc[1].title, "Subheading A");
    assert_eq!(doc.toc[1].level, 3);
    assert_eq!(doc.toc[2].title, "Deep Heading");
    assert_eq!(doc.toc[2].level, 4);

    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}

#[test]
fn test_markdown_parser_inline_formatting() {
    let content = "**Bold text** and *italic text* and ~~strikethrough~~ and `inline code`.";
    let path = temp_file("inlines.md", content.as_bytes());

    let parser = MarkdownParser;
    let doc = parser.parse(&path).unwrap();

    let block = &doc.sections[0].blocks[0];
    if let Block::Paragraph { inlines, .. } = block {
        let has_bold = inlines.iter().any(|i| i.marks.contains(&Mark::Bold));
        let has_italic = inlines.iter().any(|i| i.marks.contains(&Mark::Italic));
        let has_strike = inlines.iter().any(|i| i.marks.contains(&Mark::Strikethrough));
        let has_code = inlines.iter().any(|i| i.marks.contains(&Mark::Code));

        assert!(has_bold, "Must contain bold mark");
        assert!(has_italic, "Must contain italic mark");
        assert!(has_strike, "Must contain strikethrough mark");
        assert!(has_code, "Must contain code mark");
    } else {
        panic!("Expected paragraph block");
    }

    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}

#[test]
fn test_markdown_parser_safe_and_unsafe_links() {
    let content = "[Safe Link](https://readtrack.app) and [Unsafe Link](javascript:alert(1)) and [Mail](mailto:info@readtrack.app).";
    let path = temp_file("links.md", content.as_bytes());

    let parser = MarkdownParser;
    let doc = parser.parse(&path).unwrap();

    if let Block::Paragraph { inlines, .. } = &doc.sections[0].blocks[0] {
        let safe_link = inlines.iter().find(|i| i.text.contains("Safe Link")).unwrap();
        assert!(
            safe_link.marks.iter().any(|m| matches!(m, Mark::Link { href } if href == "https://readtrack.app")),
            "Safe link must retain Mark::Link"
        );

        let unsafe_link = inlines.iter().find(|i| i.text.contains("Unsafe Link")).unwrap();
        assert!(
            !unsafe_link.marks.iter().any(|m| matches!(m, Mark::Link { .. })),
            "Unsafe javascript: link must have Mark::Link stripped"
        );

        let mail_link = inlines.iter().find(|i| i.text.contains("Mail")).unwrap();
        assert!(
            mail_link.marks.iter().any(|m| matches!(m, Mark::Link { href } if href == "mailto:info@readtrack.app")),
            "Mailto link must retain Mark::Link"
        );
    } else {
        panic!("Expected paragraph");
    }

    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}

#[test]
fn test_markdown_parser_html_stripping() {
    let content = "Text with <script>alert('xss')</script> and <div class=\"danger\">inline div</div> retained.";
    let path = temp_file("xss.md", content.as_bytes());

    let parser = MarkdownParser;
    let doc = parser.parse(&path).unwrap();

    if let Block::Paragraph { inlines, .. } = &doc.sections[0].blocks[0] {
        let full_text: String = inlines.iter().map(|i| i.text.as_str()).collect();
        assert!(!full_text.contains("<script>"), "Raw HTML <script> must be stripped");
        assert!(!full_text.contains("<div"), "Raw HTML <div> must be stripped");
        assert!(full_text.contains("Text with"));
    } else {
        panic!("Expected paragraph");
    }

    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}

#[test]
fn test_markdown_parser_code_blocks() {
    let content = "```rust\nfn main() {\n    println!(\"Hello\");\n}\n```";
    let path = temp_file("code.md", content.as_bytes());

    let parser = MarkdownParser;
    let doc = parser.parse(&path).unwrap();

    assert_eq!(doc.sections[0].blocks.len(), 1);
    match &doc.sections[0].blocks[0] {
        Block::Code { language, text, .. } => {
            assert_eq!(language.as_deref(), Some("rust"));
            assert!(text.contains("fn main()"));
        }
        other => panic!("Expected Block::Code, got {:?}", other),
    }

    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}

#[test]
fn test_markdown_parser_lists() {
    let content = "- Bullet 1\n- Bullet 2\n\n1. Numbered 1\n2. Numbered 2";
    let path = temp_file("lists.md", content.as_bytes());

    let parser = MarkdownParser;
    let doc = parser.parse(&path).unwrap();

    assert_eq!(doc.sections[0].blocks.len(), 2);
    match &doc.sections[0].blocks[0] {
        Block::List { ordered, items, .. } => {
            assert!(!ordered);
            assert_eq!(items.len(), 2);
        }
        other => panic!("Expected unordered list, got {:?}", other),
    }
    match &doc.sections[0].blocks[1] {
        Block::List { ordered, items, .. } => {
            assert!(ordered);
            assert_eq!(items.len(), 2);
        }
        other => panic!("Expected ordered list, got {:?}", other),
    }

    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}

#[test]
fn test_markdown_parser_tables() {
    let content = "| Col 1 | Col 2 |\n| --- | --- |\n| Cell A | Cell B |\n| Cell C | Cell D |";
    let path = temp_file("table.md", content.as_bytes());

    let parser = MarkdownParser;
    let doc = parser.parse(&path).unwrap();

    assert_eq!(doc.sections[0].blocks.len(), 1);
    match &doc.sections[0].blocks[0] {
        Block::Table { rows, header_rows, .. } => {
            assert_eq!(*header_rows, 1);
            assert_eq!(rows.len(), 3); // Header + 2 data rows
            assert_eq!(rows[0].len(), 2);
        }
        other => panic!("Expected Block::Table, got {:?}", other),
    }

    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}

#[test]
fn test_registry_format_dispatch() {
    let registry = ParserRegistry::new();

    let txt_parser = registry.for_file(b"some text", "txt").unwrap();
    assert_eq!(txt_parser.file_type(), FileType::Txt);

    let md_parser = registry.for_file(b"# heading", "md").unwrap();
    assert_eq!(md_parser.file_type(), FileType::Md);

    let pdf_head = b"%PDF-1.4\n";
    let pdf_parser = registry.for_file(pdf_head, "pdf").unwrap();
    assert_eq!(pdf_parser.file_type(), FileType::Pdf);

    let epub_head = [0x50, 0x4B, 0x03, 0x04];
    let epub_parser = registry.for_file(&epub_head, "epub").unwrap();
    assert_eq!(epub_parser.file_type(), FileType::Epub);

    let docx_head = [0x50, 0x4B, 0x03, 0x04];
    let docx_parser = registry.for_file(&docx_head, "docx").unwrap();
    assert_eq!(docx_parser.file_type(), FileType::Docx);

    let unknown = registry.for_file(b"data", "xyz");
    assert!(matches!(unknown, Err(AppError::UnsupportedFormat { .. })));
}

#[test]
fn test_registry_magic_byte_sniffing() {
    let registry = ParserRegistry::new();

    // Fake PDF with plain text content
    let fake_pdf = b"This is plain text without pdf header";
    let res = registry.for_file(fake_pdf, "pdf");
    assert!(matches!(res, Err(AppError::InvalidDocument { .. })));
}

#[test]
fn test_normalized_document_serde_roundtrip() {
    let doc = NormalizedDocument {
        metadata: DocMetadata {
            title: "Test Title".to_string(),
            author: Some("Author".to_string()),
            language: Some("en".to_string()),
            page_count: None,
            word_count: 42,
            character_count: 250,
            parser_version: 1,
        },
        sections: vec![Section {
            index: 0,
            kind: SectionKind::Chapter,
            title: Some("Chapter 1".to_string()),
            level: 1,
            blocks: vec![Block::Paragraph {
                id: "s0-b0".to_string(),
                inlines: vec![Inline {
                    text: "Hello".to_string(),
                    marks: vec![Mark::Bold],
                }],
            }],
            word_count: 42,
            character_count: 250,
        }],
        toc: vec![],
    };

    let json = serde_json::to_string(&doc).expect("Serialization failed");
    assert!(json.contains("\"title\":\"Test Title\""));
    assert!(json.contains("\"wordCount\":42"));
    assert!(json.contains("\"type\":\"paragraph\""));

    let deserialized: NormalizedDocument = serde_json::from_str(&json).expect("Deserialization failed");
    assert_eq!(doc, deserialized);
}
