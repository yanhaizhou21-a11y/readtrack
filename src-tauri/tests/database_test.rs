use readtrack_lib::db::{create_in_memory_pool, run_migrations, verify_fts5_available};
use sqlx::Row;

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
