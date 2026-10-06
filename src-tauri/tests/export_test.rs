use calamine::{open_workbook_auto, Reader};
use readtrack_lib::db::{create_in_memory_pool, run_migrations};
use readtrack_lib::errors::AppError;
use readtrack_lib::models::{
    BookmarkCreateInput, Document, ExportInput, HighlightCreateInput, LogicalPosition,
    NoteCreateInput,
};
use readtrack_lib::repositories::DocumentRepo;
use readtrack_lib::services::{AnnotationService, ExportService};
use readtrack_lib::storage::StoragePaths;
use std::fs;
use std::path::PathBuf;

struct TestContext {
    pool: sqlx::SqlitePool,
    temp_dir: PathBuf,
    storage: StoragePaths,
    doc_id: String,
}

impl Drop for TestContext {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.temp_dir);
    }
}

async fn setup_test_context() -> TestContext {
    let pool = create_in_memory_pool().await.unwrap();
    run_migrations(&pool).await.unwrap();

    let temp_dir = std::env::temp_dir().join(format!("readtrack_export_test_{}", uuid::Uuid::new_v4()));
    let storage = StoragePaths::new(temp_dir.clone());
    storage.init_dirs().expect("Failed to init test storage dirs");

    let doc_id = "doc-export-test-1".to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let doc = Document {
        id: doc_id.clone(),
        title: "The Editorial Standard of Print".to_string(),
        author: Some("A. Hamilton".to_string()),
        original_filename: "editorial.txt".to_string(),
        file_path: "library/documents/editorial.txt".to_string(),
        file_type: "txt".to_string(),
        mime_type: "text/plain".to_string(),
        file_size: 4096,
        content_hash: "1122334455667788112233445566778811223344556677881122334455667788".to_string(),
        page_count: None,
        word_count: Some(1200),
        thumbnail_path: None,
        language: Some("en".to_string()),
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

    // Populate reading session
    sqlx::query(
        "INSERT INTO reading_sessions (id, document_id, started_at, ended_at, last_heartbeat_at, duration_seconds, active_seconds, pages_read, segments_read)
         VALUES ('sess-1', ?, ?, ?, ?, 150, 120, 5, 12)"
    )
    .bind(&doc_id)
    .bind(now - 150000)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .unwrap();

    // Populate reading progress
    sqlx::query(
        "INSERT INTO reading_progress (id, document_id, progress_percent, completed, updated_at)
         VALUES ('prog-1', ?, 0.45, 0, ?)"
    )
    .bind(&doc_id)
    .bind(now)
    .execute(&pool)
    .await
    .unwrap();

    // Populate document section & segment
    sqlx::query(
        "INSERT INTO document_sections (id, document_id, section_index, section_type, title, start_position, end_position, created_at)
         VALUES ('sec-1', ?, 0, 'chapter', 'Chapter 1: The Principle', 0, 1000, ?)"
    )
    .bind(&doc_id)
    .bind(now)
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO reading_segments (id, document_id, section_id, segment_type, segment_index, start_position, end_position, status, dwell_ms, last_read_at)
         VALUES ('seg-1', ?, 'sec-1', 'block_group', 0, 0, 500, 'read', 60000, ?)"
    )
    .bind(&doc_id)
    .bind(now)
    .execute(&pool)
    .await
    .unwrap();

    // Populate annotations
    let annot_service = AnnotationService::new(pool.clone());
    annot_service
        .create_bookmark(BookmarkCreateInput {
            document_id: doc_id.clone(),
            position: LogicalPosition {
                document_id: doc_id.clone(),
                section_id: Some(0),
                block_id: None,
                offset: Some(10),
                page: None,
                page_offset: None,
                percentage: 0.1,
                parser_version: 1,
            },
            title: Some("Key Exposition".to_string()),
            note: Some("Crucial argument begins here".to_string()),
        })
        .await
        .unwrap();

    let hl_pos_start = LogicalPosition {
        document_id: doc_id.clone(),
        section_id: Some(0),
        block_id: None,
        offset: Some(100),
        page: None,
        page_offset: None,
        percentage: 0.1,
        parser_version: 1,
    };
    let hl_pos_end = LogicalPosition {
        document_id: doc_id.clone(),
        section_id: Some(0),
        block_id: None,
        offset: Some(180),
        page: None,
        page_offset: None,
        percentage: 0.15,
        parser_version: 1,
    };

    annot_service
        .create_highlight(HighlightCreateInput {
            document_id: doc_id.clone(),
            start: hl_pos_start,
            end: hl_pos_end,
            selected_text: "All the News That's Fit to Print.".to_string(),
            color: "yellow".to_string(),
            note: Some("Foundational motto".to_string()),
        })
        .await
        .unwrap();

    annot_service
        .create_note(NoteCreateInput {
            document_id: doc_id.clone(),
            position: LogicalPosition {
                document_id: doc_id.clone(),
                section_id: Some(0),
                block_id: None,
                offset: Some(100),
                page: None,
                page_offset: None,
                percentage: 0.1,
                parser_version: 1,
            },
            content: "Compare this with modern decentralized journalism.".to_string(),
            highlight_id: None,
        })
        .await
        .unwrap();

    TestContext {
        pool,
        temp_dir,
        storage,
        doc_id,
    }
}

#[tokio::test]
async fn test_export_xlsx_all_seven_sheets() {
    let ctx = setup_test_context().await;
    let export_service = ExportService::new(ctx.pool.clone(), ctx.storage.clone());

    let result = export_service
        .export_xlsx(None, ExportInput { document_ids: None })
        .await
        .expect("export_xlsx must succeed");

    assert!(result.file_name.ends_with(".xlsx"));
    let path = PathBuf::from(&result.path);
    assert!(path.exists(), "Generated XLSX file must exist on disk");

    let workbook = open_workbook_auto(&path).expect("calamine must open the generated xlsx file");
    let sheets = workbook.sheet_names();

    let expected_sheets = [
        "Overview",
        "Documents",
        "Reading Sessions",
        "Reading Progress",
        "Bookmarks",
        "Highlights",
        "Notes",
    ];

    for expected in expected_sheets {
        assert!(
            sheets.contains(&expected.to_string()),
            "Sheet '{}' must be present in exported XLSX. Found: {:?}",
            expected,
            sheets
        );
    }
}

#[tokio::test]
async fn test_export_xlsx_filtered_by_document() {
    let ctx = setup_test_context().await;
    let export_service = ExportService::new(ctx.pool.clone(), ctx.storage.clone());

    let result = export_service
        .export_xlsx(
            None,
            ExportInput {
                document_ids: Some(vec![ctx.doc_id.clone()]),
            },
        )
        .await
        .expect("export_xlsx with document filter must succeed");

    let path = PathBuf::from(&result.path);
    assert!(path.exists());
    let workbook = open_workbook_auto(&path).expect("calamine must open filtered xlsx");
    assert_eq!(workbook.sheet_names().len(), 7);
}

#[tokio::test]
async fn test_export_pdf_header_and_structure() {
    let ctx = setup_test_context().await;
    let export_service = ExportService::new(ctx.pool.clone(), ctx.storage.clone());

    let result = export_service
        .export_pdf(None, ExportInput { document_ids: None })
        .await
        .expect("export_pdf must succeed");

    assert!(result.file_name.ends_with(".pdf"));
    let path = PathBuf::from(&result.path);
    assert!(path.exists(), "Generated PDF file must exist on disk");

    let bytes = fs::read(&path).expect("Must read PDF bytes");
    assert!(bytes.len() > 500, "PDF should have substantial byte content");
    assert_eq!(&bytes[..5], b"%PDF-", "PDF file must start with '%PDF-' magic bytes");
}

#[tokio::test]
async fn test_export_share_security_validation() {
    let ctx = setup_test_context().await;
    let export_service = ExportService::new(ctx.pool.clone(), ctx.storage.clone());

    // 1. Missing file returns NotFound
    let missing_path = ctx.storage.exports_dir().join("missing.xlsx");
    let err = export_service.export_share(&missing_path.to_string_lossy()).unwrap_err();
    match err {
        AppError::NotFound { .. } => {}
        other => panic!("Expected NotFound, got {:?}", other),
    }

    // 2. Traversal outside exports_dir returns PermissionDenied
    let outside_file = ctx.temp_dir.join("outside.txt");
    fs::write(&outside_file, "secret").unwrap();

    let err2 = export_service.export_share(&outside_file.to_string_lossy()).unwrap_err();
    match err2 {
        AppError::PermissionDenied => {}
        other => panic!("Expected PermissionDenied, got {:?}", other),
    }
}
