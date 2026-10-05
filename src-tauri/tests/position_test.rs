use readtrack_lib::models::{Block, DocMetadata, Inline, LogicalPosition, NormalizedDocument, Section, SectionKind};
use readtrack_lib::services::position_service::PositionService;

#[test]
fn test_position_resolve_tier4_empty() {
    let doc = NormalizedDocument::empty("Test".to_string());
    let pos = LogicalPosition {
        document_id: "test".to_string(),
        section_id: Some(0),
        block_id: None,
        offset: Some(0),
        page: None,
        page_offset: None,
        percentage: 0.0,
        parser_version: 1,
    };

    let service = PositionService::new();
    let res = service.resolve(pos, &doc).unwrap();
    assert_eq!(res.fallback_tier, "Tier 4: Empty Document");
    assert_eq!(res.section_index, 0);
}

#[test]
fn test_position_resolve_tier5_pdf() {
    let mut doc = NormalizedDocument::empty("PDF Test".to_string());
    doc.metadata.page_count = Some(10);

    let pos = LogicalPosition {
        document_id: "test-pdf".to_string(),
        section_id: None,
        block_id: None,
        offset: None,
        page: Some(3),
        page_offset: Some(0.5),
        percentage: 0.25,
        parser_version: 1,
    };

    let service = PositionService::new();
    let res = service.resolve(pos, &doc).unwrap();
    assert_eq!(res.fallback_tier, "Tier 5: PDF Page");
    assert_eq!(res.page, Some(3));
    assert_eq!(res.page_offset, Some(0.5));
}

#[test]
fn test_position_resolve_tier1_exact_and_tier2_nearest() {
    let doc = NormalizedDocument {
        metadata: DocMetadata {
            title: "Rich Test".to_string(),
            author: None,
            language: None,
            page_count: None,
            word_count: 50,
            character_count: 250,
            parser_version: 1,
        },
        sections: vec![Section {
            index: 0,
            kind: SectionKind::Body,
            title: Some("Chapter 1".to_string()),
            level: 1,
            word_count: 50,
            character_count: 250,
            blocks: vec![
                Block::Paragraph {
                    id: "s0-b0".to_string(),
                    inlines: vec![Inline {
                        text: "First block content".to_string(),
                        marks: vec![],
                    }],
                },
                Block::Paragraph {
                    id: "s0-b1".to_string(),
                    inlines: vec![Inline {
                        text: "Second block content".to_string(),
                        marks: vec![],
                    }],
                },
            ],
        }],
        toc: vec![],
    };

    let service = PositionService::new();

    // Tier 1: exact match
    let pos_exact = LogicalPosition {
        document_id: "test-rich".to_string(),
        section_id: Some(0),
        block_id: Some("s0-b1".to_string()),
        offset: Some(5),
        page: None,
        page_offset: None,
        percentage: 0.5,
        parser_version: 1,
    };
    let res_exact = service.resolve(pos_exact, &doc).unwrap();
    assert_eq!(res_exact.fallback_tier, "Tier 1: Exact Match");
    assert_eq!(res_exact.block_id, Some("s0-b1".to_string()));

    // Tier 2: block not found in section -> nearest
    let pos_tier2 = LogicalPosition {
        document_id: "test-rich".to_string(),
        section_id: Some(0),
        block_id: Some("s0-nonexistent".to_string()),
        offset: Some(0),
        page: None,
        page_offset: None,
        percentage: 0.5,
        parser_version: 1,
    };
    let res_tier2 = service.resolve(pos_tier2, &doc).unwrap();
    assert_eq!(res_tier2.fallback_tier, "Tier 2: Nearest in Section");
    assert_eq!(res_tier2.block_id, Some("s0-b0".to_string()));
}
