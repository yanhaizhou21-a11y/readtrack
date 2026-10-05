use readtrack_lib::errors::AppError;
use readtrack_lib::storage::{DetectedFormat, FileStore, StoragePaths, DEFAULT_MAX_IMPORT_BYTES};
use std::path::Path;

#[test]
fn test_storage_init_dirs() {
    let temp_dir = std::env::temp_dir().join(format!("readtrack_test_{}", uuid::Uuid::new_v4()));
    let storage = StoragePaths::new(temp_dir.clone());

    storage.init_dirs().expect("init_dirs should succeed");

    assert!(storage.root.exists());
    assert!(storage.documents_dir().exists());
    assert!(storage.thumbnails_dir().exists());
    assert!(storage.cache_dir().exists());
    assert!(storage.exports_dir().exists());

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_safe_path_resolution_and_traversal_prevention() {
    let temp_dir = std::env::temp_dir().join(format!("readtrack_test_{}", uuid::Uuid::new_v4()));
    let storage = StoragePaths::new(temp_dir.clone());
    storage.init_dirs().expect("init_dirs failed");

    // Valid relative path
    let safe_rel = Path::new("library/documents/book.pdf");
    let resolved = storage.resolve_safe_path(safe_rel);
    assert!(resolved.is_ok());

    // Path traversal attempt with ..
    let traversal_rel = Path::new("library/documents/../../etc/passwd");
    let traversal_res = storage.resolve_safe_path(traversal_rel);
    assert!(
        traversal_res.is_err(),
        "Directory traversal with .. must be rejected"
    );

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_stage_and_commit_valid_text_file() {
    let temp_dir = std::env::temp_dir().join(format!("readtrack_test_{}", uuid::Uuid::new_v4()));
    let storage = StoragePaths::new(temp_dir.clone());
    storage.init_dirs().expect("init_dirs failed");
    let file_store = FileStore::new(storage.clone());

    let source_path = temp_dir.join("sample.txt");
    let content = "Hello ReadTrack! Testing file store staging and commit.";
    std::fs::write(&source_path, content).expect("write failed");

    let staged = file_store
        .stage_file(&source_path, DEFAULT_MAX_IMPORT_BYTES)
        .expect("stage failed");
    let expected_hash = blake3::hash(content.as_bytes()).to_hex().to_string();
    assert_eq!(staged.hash, expected_hash);
    assert_eq!(staged.format, DetectedFormat::Txt);
    assert_eq!(staged.size_bytes, content.len() as u64);
    assert!(staged.guard.path().exists());

    let doc_id = uuid::Uuid::new_v4().to_string();
    let committed_path = file_store
        .commit_file(staged.guard, &doc_id, "txt")
        .expect("commit failed");
    assert!(committed_path.exists());
    assert_eq!(std::fs::read_to_string(&committed_path).unwrap(), content);

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_stage_valid_pdf_and_epub_signatures() {
    let temp_dir = std::env::temp_dir().join(format!("readtrack_test_{}", uuid::Uuid::new_v4()));
    let storage = StoragePaths::new(temp_dir.clone());
    storage.init_dirs().unwrap();
    let file_store = FileStore::new(storage);

    // PDF
    let pdf_source = temp_dir.join("test.pdf");
    let pdf_data = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF".to_vec();
    std::fs::write(&pdf_source, &pdf_data).unwrap();
    let staged_pdf = file_store
        .stage_file(&pdf_source, DEFAULT_MAX_IMPORT_BYTES)
        .unwrap();
    assert_eq!(staged_pdf.format, DetectedFormat::Pdf);

    // EPUB
    let epub_source = temp_dir.join("test.epub");
    let mut epub_data = b"PK\x03\x04".to_vec();
    epub_data.extend_from_slice(&[0u8; 26]); // padding to offset 30
    epub_data.extend_from_slice(b"mimetypeapplication/epub+zip");
    std::fs::write(&epub_source, &epub_data).unwrap();
    let staged_epub = file_store
        .stage_file(&epub_source, DEFAULT_MAX_IMPORT_BYTES)
        .unwrap();
    assert_eq!(staged_epub.format, DetectedFormat::Epub);

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_duplicate_hash_computation_deterministic() {
    let temp_dir = std::env::temp_dir().join(format!("readtrack_test_{}", uuid::Uuid::new_v4()));
    let storage = StoragePaths::new(temp_dir.clone());
    storage.init_dirs().unwrap();
    let file_store = FileStore::new(storage);

    let file_a = temp_dir.join("file_a.txt");
    let file_b = temp_dir.join("file_b.txt");
    let file_c = temp_dir.join("file_c.txt");

    let same_content = "Exact duplicate content across different file paths";
    let different_content = "Different content";

    std::fs::write(&file_a, same_content).unwrap();
    std::fs::write(&file_b, same_content).unwrap();
    std::fs::write(&file_c, different_content).unwrap();

    let staged_a = file_store
        .stage_file(&file_a, DEFAULT_MAX_IMPORT_BYTES)
        .unwrap();
    let staged_b = file_store
        .stage_file(&file_b, DEFAULT_MAX_IMPORT_BYTES)
        .unwrap();
    let staged_c = file_store
        .stage_file(&file_c, DEFAULT_MAX_IMPORT_BYTES)
        .unwrap();

    assert_eq!(
        staged_a.hash, staged_b.hash,
        "Identical content must yield identical BLAKE3 hashes"
    );
    assert_ne!(
        staged_a.hash, staged_c.hash,
        "Different content must yield distinct hashes"
    );

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_reject_file_exceeding_size_limit_mid_stream() {
    let temp_dir = std::env::temp_dir().join(format!("readtrack_test_{}", uuid::Uuid::new_v4()));
    let storage = StoragePaths::new(temp_dir.clone());
    storage.init_dirs().unwrap();
    let file_store = FileStore::new(storage.clone());

    let test_file = temp_dir.join("oversize.txt");
    let large_data = vec![b'A'; 150 * 1024];
    std::fs::write(&test_file, &large_data).unwrap();

    let limit_bytes = 100 * 1024;
    let result = file_store.stage_file(&test_file, limit_bytes);

    assert!(result.is_err(), "Files exceeding limit must be rejected");
    match result.err().unwrap() {
        AppError::FileTooLarge {
            max_bytes,
            actual_bytes,
            ..
        } => {
            assert_eq!(max_bytes, limit_bytes);
            assert!(actual_bytes > limit_bytes);
        }
        other => panic!("Expected FileTooLarge, got: {:?}", other),
    }

    let tmp_files = std::fs::read_dir(storage.documents_dir()).unwrap();
    let tmp_count = tmp_files
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().starts_with("tmp-"))
        .count();
    assert_eq!(
        tmp_count, 0,
        "No temporary files should be orphaned on size limit error"
    );

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_reject_fake_pdf_with_text_content() {
    let temp_dir = std::env::temp_dir().join(format!("readtrack_test_{}", uuid::Uuid::new_v4()));
    let storage = StoragePaths::new(temp_dir.clone());
    storage.init_dirs().unwrap();
    let file_store = FileStore::new(storage.clone());

    let fake_pdf = temp_dir.join("fake.pdf");
    std::fs::write(&fake_pdf, "This is plain text pretending to be a PDF").unwrap();

    let result = file_store.stage_file(&fake_pdf, DEFAULT_MAX_IMPORT_BYTES);
    assert!(result.is_err());
    match result.err().unwrap() {
        AppError::InvalidDocument { reason } => {
            assert!(reason.contains("%PDF-"));
        }
        other => panic!("Expected InvalidDocument, got: {:?}", other),
    }

    let tmp_count = std::fs::read_dir(storage.documents_dir())
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().starts_with("tmp-"))
        .count();
    assert_eq!(
        tmp_count, 0,
        "Temp file must be unlinked after magic byte failure"
    );

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_path_traversal_defense_in_commit_and_delete() {
    let temp_dir = std::env::temp_dir().join(format!("readtrack_test_{}", uuid::Uuid::new_v4()));
    let storage = StoragePaths::new(temp_dir.clone());
    storage.init_dirs().unwrap();
    let file_store = FileStore::new(storage);

    let test_file = temp_dir.join("test.txt");
    std::fs::write(&test_file, "Traversal test content").unwrap();
    let staged = file_store
        .stage_file(&test_file, DEFAULT_MAX_IMPORT_BYTES)
        .unwrap();

    // Traversal document_id injection attempt
    let invalid_id = "../../../etc/passwd";
    let commit_res = file_store.commit_file(staged.guard, invalid_id, "txt");
    assert!(commit_res.is_err());
    match commit_res.err().unwrap() {
        AppError::InvalidInput { field } => {
            assert!(field.contains("document_id"));
        }
        other => panic!("Expected InvalidInput, got {:?}", other),
    }

    // Traversal delete attempt
    let delete_res = file_store.delete_file("../../../etc/passwd", "txt");
    assert!(delete_res.is_err());

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_delete_file_and_cleanup() {
    let temp_dir = std::env::temp_dir().join(format!("readtrack_test_{}", uuid::Uuid::new_v4()));
    let storage = StoragePaths::new(temp_dir.clone());
    storage.init_dirs().unwrap();
    let file_store = FileStore::new(storage);

    let test_file = temp_dir.join("to_delete.txt");
    std::fs::write(&test_file, "Content to be deleted").unwrap();
    let staged = file_store
        .stage_file(&test_file, DEFAULT_MAX_IMPORT_BYTES)
        .unwrap();

    let doc_id = uuid::Uuid::new_v4().to_string();
    let committed_path = file_store
        .commit_file(staged.guard, &doc_id, "txt")
        .unwrap();
    assert!(committed_path.exists());

    file_store.delete_file(&doc_id, "txt").unwrap();
    assert!(!committed_path.exists());

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_raii_guard_unlinks_on_early_drop() {
    let temp_dir = std::env::temp_dir().join(format!("readtrack_test_{}", uuid::Uuid::new_v4()));
    let storage = StoragePaths::new(temp_dir.clone());
    storage.init_dirs().unwrap();
    let file_store = FileStore::new(storage.clone());

    let test_file = temp_dir.join("abort.txt");
    std::fs::write(&test_file, "This file will not be committed").unwrap();

    let staged = file_store
        .stage_file(&test_file, DEFAULT_MAX_IMPORT_BYTES)
        .unwrap();
    let temp_path = staged.guard.path().to_path_buf();
    assert!(temp_path.exists());

    // Drop staged without committing
    drop(staged);

    assert!(
        !temp_path.exists(),
        "Temp file must be unlinked when TempFileGuard is dropped"
    );

    let _ = std::fs::remove_dir_all(&temp_dir);
}
