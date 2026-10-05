use readtrack_lib::db::{create_in_memory_pool, run_migrations, verify_fts5_available};

#[tokio::test]
async fn test_migrations_and_fts5_support() {
    let pool = create_in_memory_pool()
        .await
        .expect("Failed to create in-memory pool");

    // Run migrations first time
    run_migrations(&pool)
        .await
        .expect("First migration run failed");

    // Idempotency: run migrations second time
    run_migrations(&pool)
        .await
        .expect("Second migration run (idempotent) failed");

    // Verify FTS5 virtual table
    verify_fts5_available(&pool)
        .await
        .expect("FTS5 table search_index should exist");

    // Test inserting and querying FTS5
    sqlx::query(
        "INSERT INTO search_index (text, document_id, kind, ref_id, page, pos)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind("The quick brown fox jumps over the lazy dog")
    .bind("doc-1")
    .bind("content")
    .bind("sec-1")
    .bind(1)
    .bind(0)
    .execute(&pool)
    .await
    .expect("FTS5 insert failed");

    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM search_index WHERE search_index MATCH 'fox'")
            .fetch_one(&pool)
            .await
            .expect("FTS5 query failed");

    assert_eq!(count, 1, "Expected 1 search match for term 'fox'");
}

#[tokio::test]
async fn test_foreign_key_cascade_deletion() {
    let pool = create_in_memory_pool()
        .await
        .expect("Failed to create in-memory pool");

    run_migrations(&pool).await.expect("Migration failed");

    let now = chrono::Utc::now().timestamp_millis();

    // Insert a parent document
    sqlx::query(
        "INSERT INTO documents (
            id, title, original_filename, file_path, file_type, mime_type,
            file_size, content_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("doc-uuid-1")
    .bind("Test Book")
    .bind("book.pdf")
    .bind("library/documents/book.pdf")
    .bind("pdf")
    .bind("application/pdf")
    .bind(1024)
    .bind("hash123")
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .expect("Insert document failed");

    // Insert a child section
    sqlx::query(
        "INSERT INTO document_sections (
            id, document_id, section_index, section_type, title,
            level, start_position, end_position, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("sec-uuid-1")
    .bind("doc-uuid-1")
    .bind(0)
    .bind("chapter")
    .bind("Chapter 1")
    .bind(1)
    .bind(0)
    .bind(100)
    .bind(now)
    .execute(&pool)
    .await
    .expect("Insert section failed");

    // Insert a child segment
    sqlx::query(
        "INSERT INTO reading_segments (
            id, document_id, section_id, segment_type, segment_index,
            start_position, end_position, word_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("seg-uuid-1")
    .bind("doc-uuid-1")
    .bind("sec-uuid-1")
    .bind("page")
    .bind(0)
    .bind(0)
    .bind(100)
    .bind(50)
    .execute(&pool)
    .await
    .expect("Insert segment failed");

    // Insert child progress
    sqlx::query(
        "INSERT INTO reading_progress (
            id, document_id, progress_percent, updated_at
        ) VALUES (?, ?, ?, ?)",
    )
    .bind("prog-uuid-1")
    .bind("doc-uuid-1")
    .bind(0.25)
    .bind(now)
    .execute(&pool)
    .await
    .expect("Insert progress failed");

    // Insert child bookmark
    sqlx::query(
        "INSERT INTO bookmarks (
            id, document_id, position, pos, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind("bm-uuid-1")
    .bind("doc-uuid-1")
    .bind("{\"documentId\":\"doc-uuid-1\",\"percentage\":0.25,\"parserVersion\":1}")
    .bind(25)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .expect("Insert bookmark failed");

    // Delete parent document
    sqlx::query("DELETE FROM documents WHERE id = ?")
        .bind("doc-uuid-1")
        .execute(&pool)
        .await
        .expect("Delete document failed");

    // Assert cascading delete on child tables
    let sections_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM document_sections WHERE document_id = ?")
            .bind("doc-uuid-1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        sections_count, 0,
        "Sections must be cascaded on document deletion"
    );

    let segments_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM reading_segments WHERE document_id = ?")
            .bind("doc-uuid-1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        segments_count, 0,
        "Segments must be cascaded on document deletion"
    );

    let progress_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM reading_progress WHERE document_id = ?")
            .bind("doc-uuid-1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        progress_count, 0,
        "Progress must be cascaded on document deletion"
    );

    let bookmarks_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM bookmarks WHERE document_id = ?")
            .bind("doc-uuid-1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        bookmarks_count, 0,
        "Bookmarks must be cascaded on document deletion"
    );
}

#[tokio::test]
async fn test_unique_content_hash() {
    let pool = create_in_memory_pool()
        .await
        .expect("Failed to create in-memory pool");

    run_migrations(&pool).await.expect("Migration failed");

    let now = chrono::Utc::now().timestamp_millis();

    let insert_query = "INSERT INTO documents (
        id, title, original_filename, file_path, file_type, mime_type,
        file_size, content_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    sqlx::query(insert_query)
        .bind("doc-1")
        .bind("Book 1")
        .bind("book1.pdf")
        .bind("library/documents/book1.pdf")
        .bind("pdf")
        .bind("application/pdf")
        .bind(1024)
        .bind("duplicate-hash-value")
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .expect("First insert should succeed");

    let duplicate_result = sqlx::query(insert_query)
        .bind("doc-2")
        .bind("Book 2")
        .bind("book2.pdf")
        .bind("library/documents/book2.pdf")
        .bind("pdf")
        .bind("application/pdf")
        .bind(2048)
        .bind("duplicate-hash-value")
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await;

    assert!(
        duplicate_result.is_err(),
        "Inserting duplicate content_hash must violate unique constraint"
    );
}

#[tokio::test]
async fn test_document_repositories_and_lifecycle() {
    let pool = create_in_memory_pool().await.unwrap();
    run_migrations(&pool).await.unwrap();
    verify_fts5_available(&pool).await.unwrap();

    let now = chrono::Utc::now().timestamp_millis();
    let doc_id = uuid::Uuid::new_v4().to_string();

    let doc = readtrack_lib::models::Document {
        id: doc_id.clone(),
        title: "Rust Async Programming".into(),
        author: Some("Jane Doe".into()),
        original_filename: "async_rust.md".into(),
        file_path: format!("library/documents/{}.md", doc_id),
        file_type: "md".into(),
        mime_type: "text/markdown".into(),
        file_size: 2048,
        content_hash: "hash_rust_async_1234567890".into(),
        page_count: None,
        word_count: Some(500),
        thumbnail_path: None,
        language: Some("en".into()),
        parse_status: "ready".into(),
        parse_error: None,
        parser_version: 1,
        index_status: "complete".into(),
        created_at: now,
        updated_at: now,
        last_opened_at: None,
        is_archived: false,
    };

    let mut tx = pool.begin().await.unwrap();
    readtrack_lib::repositories::DocumentRepo::create(&mut tx, &doc)
        .await
        .unwrap();

    let sec_id = uuid::Uuid::new_v4().to_string();
    let section = readtrack_lib::models::DocumentSection {
        id: sec_id.clone(),
        document_id: doc_id.clone(),
        section_index: 0,
        section_type: "chapter".into(),
        title: Some("Introduction".into()),
        level: 1,
        content: Some("[]".into()),
        word_count: 500,
        start_position: 0,
        end_position: 500,
        created_at: now,
    };
    readtrack_lib::repositories::SectionRepo::insert_batch(&mut tx, &[section])
        .await
        .unwrap();

    let seg_id = uuid::Uuid::new_v4().to_string();
    let segment = readtrack_lib::models::ReadingSegment {
        id: seg_id,
        document_id: doc_id.clone(),
        section_id: sec_id.clone(),
        segment_type: "block_group".into(),
        segment_index: 0,
        first_block_id: Some("s0-b0".into()),
        last_block_id: Some("s0-b5".into()),
        start_position: 0,
        end_position: 500,
        word_count: 500,
        status: "unread".into(),
        dwell_ms: 0,
        first_read_at: None,
        last_read_at: None,
        read_count: 0,
    };
    readtrack_lib::repositories::SegmentRepo::insert_batch(&mut tx, &[segment])
        .await
        .unwrap();

    let progress = readtrack_lib::models::ReadingProgress {
        id: uuid::Uuid::new_v4().to_string(),
        document_id: doc_id.clone(),
        current_page: None,
        current_position: readtrack_lib::models::LogicalPosition {
            document_id: doc_id.clone(),
            section_id: Some(0),
            block_id: Some("s0-b0".into()),
            offset: Some(0),
            page: None,
            page_offset: None,
            percentage: 0.0,
            parser_version: 1,
        },
        current_pos: 0,
        current_section_id: Some(sec_id),
        progress_percent: 0.0,
        furthest_pos: 0,
        total_read_ms: 0,
        completed: false,
        completed_at: None,
        updated_at: now,
    };
    readtrack_lib::repositories::ProgressRepo::create(&mut tx, &progress)
        .await
        .unwrap();

    readtrack_lib::repositories::SearchRepo::index_document(
        &mut tx,
        &doc_id,
        &doc.title,
        doc.author.as_deref(),
        &[],
    )
    .await
    .unwrap();

    tx.commit().await.unwrap();

    // Verify retrieval
    let fetched = readtrack_lib::repositories::DocumentRepo::get_by_id(&pool, &doc_id)
        .await
        .unwrap();
    assert!(fetched.is_some());
    assert_eq!(fetched.unwrap().title, "Rust Async Programming");

    // Verify list
    let (list, total) = readtrack_lib::repositories::DocumentRepo::list(
        &pool,
        Some("all"),
        Some("title"),
        None,
        10,
        0,
    )
    .await
    .unwrap();
    assert_eq!(total, 1);
    assert_eq!(list[0].title, "Rust Async Programming");

    // Verify rename
    let renamed = readtrack_lib::repositories::DocumentRepo::rename(
        &pool,
        &doc_id,
        "Advanced Async Rust",
        now + 1000,
    )
    .await
    .unwrap();
    assert_eq!(renamed.unwrap().title, "Advanced Async Rust");

    // Verify archive
    let archived =
        readtrack_lib::repositories::DocumentRepo::archive(&pool, &doc_id, true, now + 2000)
            .await
            .unwrap();
    assert!(archived.unwrap().is_archived);

    // Verify touch
    let touched = readtrack_lib::repositories::DocumentRepo::touch(&pool, &doc_id, now + 3000)
        .await
        .unwrap();
    assert!(touched);

    // Verify delete with cascade
    let mut del_tx = pool.begin().await.unwrap();
    let deleted = readtrack_lib::repositories::DocumentRepo::delete(&mut del_tx, &doc_id)
        .await
        .unwrap();
    assert!(deleted.is_some());
    readtrack_lib::repositories::SearchRepo::delete_document(&mut del_tx, &doc_id)
        .await
        .unwrap();
    del_tx.commit().await.unwrap();

    let post_delete = readtrack_lib::repositories::DocumentRepo::get_by_id(&pool, &doc_id)
        .await
        .unwrap();
    assert!(post_delete.is_none());
}

#[tokio::test]
async fn test_document_import_service_duplicate_rejection_and_deletion() {
    let pool = create_in_memory_pool().await.unwrap();
    run_migrations(&pool).await.unwrap();
    verify_fts5_available(&pool).await.unwrap();

    let temp_dir = std::env::temp_dir().join(format!("rt_import_test_{}", uuid::Uuid::new_v4()));
    let storage = readtrack_lib::storage::StoragePaths::new(temp_dir.clone());
    storage.init_dirs().unwrap();

    let import_service = readtrack_lib::services::ImportService::new(pool.clone(), storage.clone());
    let library_service =
        readtrack_lib::services::LibraryService::new(pool.clone(), storage.clone());

    // 1. Create a valid test markdown file
    let source_file = temp_dir.join("sample_doc.md");
    let content = "# Complete Guide to ReadTrack\n\nReadTrack is a mobile local-first reader.\n\n## Chapter 1\n\nHere is chapter one with deep content.";
    std::fs::write(&source_file, content).unwrap();

    // 2. Import document
    let import_input = readtrack_lib::models::DocumentImportInput {
        source: source_file.to_str().unwrap().to_string(),
        on_duplicate: None,
    };
    let doc_summary = import_service
        .import_document(None, import_input)
        .await
        .expect("Import must succeed");

    let doc_id = doc_summary.id.clone();
    assert_eq!(doc_summary.title, "Complete Guide to ReadTrack");
    assert_eq!(doc_summary.file_type, "md");
    assert_eq!(doc_summary.progress, 0.0);
    assert!(!doc_summary.completed);
    assert!(doc_summary.word_count.unwrap_or(0) > 0);

    // Verify physical file was committed to library/documents/<doc_id>.md
    let committed_file = storage.documents_dir().join(format!("{}.md", doc_id));
    assert!(
        committed_file.exists(),
        "Committed physical file must exist on disk"
    );

    // Verify detail retrieval through LibraryService
    let detail = library_service
        .get(&doc_id)
        .await
        .expect("LibraryService::get must find doc");
    assert_eq!(detail.summary.id, doc_id);
    assert!(detail.position.is_some(), "Initial position must be set");

    // Verify sections slice through LibraryService
    let sections = library_service
        .get_sections(&doc_id, Some(0), Some(10))
        .await
        .unwrap();
    assert!(!sections.is_empty(), "Must return parsed sections");

    // 3. Attempt duplicate import with default / "ask" -> must be rejected
    let dup_input_ask = readtrack_lib::models::DocumentImportInput {
        source: source_file.to_str().unwrap().to_string(),
        on_duplicate: Some("ask".to_string()),
    };
    let dup_err = import_service
        .import_document(None, dup_input_ask)
        .await
        .expect_err("Duplicate with 'ask' must fail");

    match dup_err {
        readtrack_lib::errors::AppError::DuplicateDocument { existing_id } => {
            assert_eq!(existing_id, doc_id);
        }
        other => panic!("Expected DuplicateDocument error, got: {:?}", other),
    }

    // Verify no orphaned temp files left in documents_dir
    let tmp_count = std::fs::read_dir(storage.documents_dir())
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().starts_with("tmp-"))
        .count();
    assert_eq!(
        tmp_count, 0,
        "No orphaned tmp files after duplicate rejection"
    );

    // 4. Duplicate import with "open_existing" -> must return existing summary
    let dup_input_open = readtrack_lib::models::DocumentImportInput {
        source: source_file.to_str().unwrap().to_string(),
        on_duplicate: Some("open_existing".to_string()),
    };
    let open_res = import_service
        .import_document(None, dup_input_open)
        .await
        .expect("open_existing must return existing doc");
    assert_eq!(open_res.id, doc_id);

    // 5. Duplicate import with "replace" -> deletes old document, creates new
    let dup_input_replace = readtrack_lib::models::DocumentImportInput {
        source: source_file.to_str().unwrap().to_string(),
        on_duplicate: Some("replace".to_string()),
    };
    let replace_res = import_service
        .import_document(None, dup_input_replace)
        .await
        .expect("replace must succeed");
    let new_doc_id = replace_res.id;
    assert_ne!(new_doc_id, doc_id, "Replaced document must have new ID");

    // Old physical file must be purged, new physical file must exist
    assert!(
        !committed_file.exists(),
        "Old physical file must be removed"
    );
    let new_committed_file = storage.documents_dir().join(format!("{}.md", new_doc_id));
    assert!(new_committed_file.exists(), "New physical file must exist");

    // 6. Delete document through LibraryService
    library_service
        .delete(None, &new_doc_id)
        .await
        .expect("LibraryService::delete must succeed");

    assert!(
        !new_committed_file.exists(),
        "Physical file must be deleted on LibraryService::delete"
    );
    let get_after_del = library_service.get(&new_doc_id).await;
    assert!(matches!(
        get_after_del,
        Err(readtrack_lib::errors::AppError::DocumentNotFound)
    ));

    let _ = std::fs::remove_dir_all(&temp_dir);
}
