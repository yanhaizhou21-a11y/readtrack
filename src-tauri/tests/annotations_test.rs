use readtrack_lib::db::{create_in_memory_pool, run_migrations};
use readtrack_lib::models::{
    BookmarkCreateInput, BookmarkUpdateInput, Document, DocumentSearchInput, HighlightCreateInput,
    HighlightUpdateInput, LogicalPosition, NoteCreateInput, NoteUpdateInput,
};
use readtrack_lib::repositories::DocumentRepo;
use readtrack_lib::services::{AnnotationService, SearchService};

async fn setup_test_db() -> (sqlx::SqlitePool, String) {
    let pool = create_in_memory_pool().await.unwrap();
    run_migrations(&pool).await.unwrap();

    let doc_id = "doc-test-1".to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let doc = Document {
        id: doc_id.clone(),
        title: "The Art of Computer Systems".to_string(),
        author: Some("Donald Knuth".to_string()),
        original_filename: "knuth.txt".to_string(),
        file_path: "library/documents/knuth.txt".to_string(),
        file_type: "txt".to_string(),
        mime_type: "text/plain".to_string(),
        file_size: 2048,
        content_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string(),
        page_count: None,
        word_count: Some(500),
        thumbnail_path: None,
        language: None,
        parse_status: "ready".to_string(),
        parse_error: None,
        parser_version: 1,
        index_status: "complete".to_string(),
        created_at: now,
        updated_at: now,
        last_opened_at: Some(now),
        is_archived: false,
    };

    let mut tx = pool.begin().await.unwrap();
    DocumentRepo::create(&mut tx, &doc).await.unwrap();
    tx.commit().await.unwrap();

    (pool, doc_id)
}

#[tokio::test]
async fn test_bookmark_lifecycle() {
    let (pool, doc_id) = setup_test_db().await;
    let service = AnnotationService::new(pool.clone());

    // 1. Create bookmark
    let created = service
        .create_bookmark(BookmarkCreateInput {
            document_id: doc_id.clone(),
            position: LogicalPosition {
                document_id: doc_id.clone(),
                section_id: Some(0),
                block_id: None,
                offset: Some(120),
                page: Some(1),
                page_offset: None,
                percentage: 0.25,
                parser_version: 1,
            },
            title: Some("Important Theorem".to_string()),
            note: Some("Review this proof before finals".to_string()),
        })
        .await
        .unwrap();

    assert_eq!(created.document_id, doc_id);
    assert_eq!(created.title.as_deref(), Some("Important Theorem"));
    assert_eq!(created.pos, 120);

    // 2. List bookmarks
    let list = service.list_bookmarks(Some(&doc_id)).await.unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, created.id);

    // 3. Update bookmark
    let updated = service
        .update_bookmark(BookmarkUpdateInput {
            id: created.id.clone(),
            title: Some("Revised Theorem 4.2".to_string()),
            note: Some("Proof verified!".to_string()),
        })
        .await
        .unwrap();

    assert_eq!(updated.title.as_deref(), Some("Revised Theorem 4.2"));
    assert_eq!(updated.note.as_deref(), Some("Proof verified!"));

    // 4. Delete bookmark
    service.delete_bookmark(&created.id).await.unwrap();
    let after_delete = service.list_bookmarks(Some(&doc_id)).await.unwrap();
    assert_eq!(after_delete.len(), 0);
}

#[tokio::test]
async fn test_highlight_lifecycle_and_validation() {
    let (pool, doc_id) = setup_test_db().await;
    let service = AnnotationService::new(pool.clone());

    let pos_start = LogicalPosition {
        document_id: doc_id.clone(),
        section_id: Some(0),
        block_id: None,
        offset: Some(50),
        page: Some(1),
        page_offset: None,
        percentage: 0.1,
        parser_version: 1,
    };
    let pos_end = LogicalPosition {
        document_id: doc_id.clone(),
        section_id: Some(0),
        block_id: None,
        offset: Some(95),
        page: Some(1),
        page_offset: None,
        percentage: 0.15,
        parser_version: 1,
    };

    // 1. Validation: invalid color rejected
    let bad_color_err = service
        .create_highlight(HighlightCreateInput {
            document_id: doc_id.clone(),
            start: pos_start.clone(),
            end: pos_end.clone(),
            selected_text: "Premature optimization is the root of all evil".to_string(),
            color: "neon-cyan".to_string(),
            note: None,
        })
        .await;
    assert!(bad_color_err.is_err());

    // 2. Validation: text exceeding 5000 chars rejected
    let too_long_text = "a".repeat(5001);
    let too_long_err = service
        .create_highlight(HighlightCreateInput {
            document_id: doc_id.clone(),
            start: pos_start.clone(),
            end: pos_end.clone(),
            selected_text: too_long_text,
            color: "yellow".to_string(),
            note: None,
        })
        .await;
    assert!(too_long_err.is_err());

    // 3. Valid highlight creation
    let highlight = service
        .create_highlight(HighlightCreateInput {
            document_id: doc_id.clone(),
            start: pos_start,
            end: pos_end,
            selected_text: "Premature optimization is the root of all evil".to_string(),
            color: "yellow".to_string(),
            note: Some("Classic quote".to_string()),
        })
        .await
        .unwrap();

    assert_eq!(highlight.color, "yellow");
    assert_eq!(highlight.start_pos, 50);
    assert_eq!(highlight.end_pos, 95);

    // 4. Update highlight
    let updated = service
        .update_highlight(HighlightUpdateInput {
            id: highlight.id.clone(),
            color: Some("green".to_string()),
            note: Some("Updated note".to_string()),
        })
        .await
        .unwrap();
    assert_eq!(updated.color, "green");

    // 5. Delete highlight
    service.delete_highlight(&highlight.id).await.unwrap();
    let remaining = service.list_highlights(Some(&doc_id)).await.unwrap();
    assert_eq!(remaining.len(), 0);
}

#[tokio::test]
async fn test_note_lifecycle() {
    let (pool, doc_id) = setup_test_db().await;
    let service = AnnotationService::new(pool.clone());

    // 1. Create note
    let note = service
        .create_note(NoteCreateInput {
            document_id: doc_id.clone(),
            position: LogicalPosition {
                document_id: doc_id.clone(),
                section_id: Some(1),
                block_id: None,
                offset: Some(200),
                page: None,
                page_offset: None,
                percentage: 0.4,
                parser_version: 1,
            },
            content: "Remember to check Big-O complexity for QuickSort".to_string(),
            highlight_id: None,
        })
        .await
        .unwrap();

    assert_eq!(note.pos, 200);
    assert_eq!(note.content, "Remember to check Big-O complexity for QuickSort");

    // 2. Update note
    let updated = service
        .update_note(NoteUpdateInput {
            id: note.id.clone(),
            content: "QuickSort worst case is O(n^2), average is O(n log n)".to_string(),
        })
        .await
        .unwrap();
    assert_eq!(
        updated.content,
        "QuickSort worst case is O(n^2), average is O(n log n)"
    );

    // 3. Delete note
    service.delete_note(&note.id).await.unwrap();
    let list = service.list_notes(Some(&doc_id)).await.unwrap();
    assert_eq!(list.len(), 0);
}

#[tokio::test]
async fn test_global_fts5_search() {
    let (pool, doc_id) = setup_test_db().await;
    let annotation_service = AnnotationService::new(pool.clone());
    let search_service = SearchService::new(pool.clone());

    // Create a note with specific keyword "Dijkstra"
    let _note = annotation_service
        .create_note(NoteCreateInput {
            document_id: doc_id.clone(),
            position: LogicalPosition {
                document_id: doc_id.clone(),
                section_id: Some(0),
                block_id: None,
                offset: Some(150),
                page: None,
                page_offset: None,
                percentage: 0.3,
                parser_version: 1,
            },
            content: "Dijkstra shortest path algorithm requires non-negative edge weights".to_string(),
            highlight_id: None,
        })
        .await
        .unwrap();

    // Search for "Dijkstra"
    let results = search_service
        .search(DocumentSearchInput {
            query: "Dijkstra".to_string(),
            scope: None,
            document_id: None,
            limit: Some(10),
            offset: None,
        })
        .await
        .unwrap();

    assert!(!results.is_empty());
    let hit = &results[0];
    assert_eq!(hit.kind, "note");
    assert_eq!(hit.document_id, doc_id);
    assert_eq!(hit.document_title, "The Art of Computer Systems");

    // Verify snippet match
    let has_match = hit.snippet.iter().any(|part| part.is_match && part.text.contains("Dijkstra"));
    assert!(has_match);
}
