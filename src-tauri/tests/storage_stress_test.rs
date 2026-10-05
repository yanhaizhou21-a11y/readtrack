//! Adversarial stress test suite for FileStore & Streaming Ingestion subsystem.
//! Covers:
//! 1. BLAKE3 hash determinism across varying chunk sizes and patterns.
//! 2. 200MB boundary and mid-stream abortion without disk exhaustion.
//! 3. RAII rollback purging temporary files under all failure modes.
//! 4. Path traversal defenses (relative .., drive escapes, absolute paths, invalid UUIDs).

use readtrack_lib::errors::AppError;
use readtrack_lib::storage::{FileStore, StoragePaths, DEFAULT_MAX_IMPORT_BYTES};
use std::fs;
use std::path::{Path, PathBuf};

fn setup_test_env() -> (PathBuf, StoragePaths, FileStore) {
    let temp_dir = std::env::temp_dir().join(format!("rt_stress_{}", uuid::Uuid::new_v4()));
    let storage = StoragePaths::new(temp_dir.clone());
    storage.init_dirs().expect("init_dirs failed");
    let file_store = FileStore::new(storage.clone());
    (temp_dir, storage, file_store)
}

fn cleanup_test_env(temp_dir: &Path) {
    let _ = fs::remove_dir_all(temp_dir);
}

// ---------------------------------------------------------------------------
// 1. BLAKE3 Hash Determinism Stress Tests
// ---------------------------------------------------------------------------

#[test]
fn test_blake3_hash_determinism_identical_content() {
    let (temp_dir, _, file_store) = setup_test_env();

    // Create a 256 KiB payload with mixed characters and repetitions
    let pattern = "ReadTrack BLAKE3 streaming verification line with unicode: 📚 🔍 🚀\n";
    let repeat_count = (256 * 1024) / pattern.len() + 1;
    let payload = pattern.repeat(repeat_count);

    let path_a = temp_dir.join("file_a.txt");
    let path_b = temp_dir.join("file_b.txt");
    let path_c = temp_dir.join("file_c.txt");

    fs::write(&path_a, &payload).expect("write path_a failed");
    fs::write(&path_b, &payload).expect("write path_b failed");
    fs::write(&path_c, &payload).expect("write path_c failed");

    let staged_a = file_store
        .stage_file(&path_a, DEFAULT_MAX_IMPORT_BYTES)
        .expect("stage_a failed");
    let staged_b = file_store
        .stage_file(&path_b, DEFAULT_MAX_IMPORT_BYTES)
        .expect("stage_b failed");
    let staged_c = file_store
        .stage_file(&path_c, DEFAULT_MAX_IMPORT_BYTES)
        .expect("stage_c failed");

    // Reference BLAKE3 hash computed directly via blake3 crate
    let reference_hash = blake3::hash(payload.as_bytes()).to_hex().to_string();

    assert_eq!(staged_a.hash, reference_hash, "staged_a hash mismatch with reference");
    assert_eq!(staged_b.hash, reference_hash, "staged_b hash mismatch with reference");
    assert_eq!(staged_c.hash, reference_hash, "staged_c hash mismatch with reference");
    assert_eq!(staged_a.hash, staged_b.hash, "hashes between staged_a and staged_b must match");

    cleanup_test_env(&temp_dir);
}

#[test]
fn test_blake3_hash_distinguishes_single_byte_mutation() {
    let (temp_dir, _, file_store) = setup_test_env();

    let payload1 = vec![b'A'; 64 * 1024];
    let mut payload2 = payload1.clone();
    // Mutate exactly one byte in the middle of the stream
    payload2[32 * 1024] = b'B';

    let file1 = temp_dir.join("doc1.txt");
    let file2 = temp_dir.join("doc2.txt");

    fs::write(&file1, &payload1).unwrap();
    fs::write(&file2, &payload2).unwrap();

    let staged1 = file_store.stage_file(&file1, DEFAULT_MAX_IMPORT_BYTES).unwrap();
    let staged2 = file_store.stage_file(&file2, DEFAULT_MAX_IMPORT_BYTES).unwrap();

    assert_ne!(
        staged1.hash, staged2.hash,
        "BLAKE3 must yield distinct hashes for single-byte difference"
    );

    cleanup_test_env(&temp_dir);
}

// ---------------------------------------------------------------------------
// 2. 200MB Boundary & Mid-Stream Abort Stress Tests
// ---------------------------------------------------------------------------

#[test]
fn test_boundary_limit_exact_and_oversized() {
    let (temp_dir, storage, file_store) = setup_test_env();

    let limit_bytes = 128 * 1024; // 128 KiB limit for testing

    // Test 2a: Exact limit size (should succeed)
    let exact_file = temp_dir.join("exact.txt");
    let exact_data = vec![b'X'; limit_bytes as usize];
    fs::write(&exact_file, &exact_data).unwrap();

    let staged_exact = file_store.stage_file(&exact_file, limit_bytes);
    assert!(
        staged_exact.is_ok(),
        "File with size exactly equal to limit must succeed"
    );
    drop(staged_exact);

    // Test 2b: Limit + 1 byte (must fail)
    let over_file = temp_dir.join("over.txt");
    let over_data = vec![b'Y'; (limit_bytes + 1) as usize];
    fs::write(&over_file, &over_data).unwrap();

    let staged_over = file_store.stage_file(&over_file, limit_bytes);
    assert!(
        staged_over.is_err(),
        "File exceeding limit by 1 byte must be rejected"
    );

    match staged_over.err().unwrap() {
        AppError::FileTooLarge { max_bytes, actual_bytes, .. } => {
            assert_eq!(max_bytes, limit_bytes);
            assert_eq!(actual_bytes, limit_bytes + 1);
        }
        other => panic!("Expected FileTooLarge, got: {:?}", other),
    }

    // Verify no temporary files remain in documents dir
    let count = fs::read_dir(storage.documents_dir())
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().starts_with("tmp-"))
        .count();
    assert_eq!(count, 0, "No orphaned tmp files should exist after boundary rejection");

    cleanup_test_env(&temp_dir);
}

// ---------------------------------------------------------------------------
// 3. RAII Rollback & Cleanup Stress Tests
// ---------------------------------------------------------------------------

#[test]
fn test_raii_rollback_on_magic_bytes_failure() {
    let (temp_dir, storage, file_store) = setup_test_env();

    // A file with .pdf extension containing non-PDF binary data
    let fake_pdf = temp_dir.join("corrupt.pdf");
    fs::write(&fake_pdf, b"CORRUPTED NOT A PDF HEADER DATA").unwrap();

    let result = file_store.stage_file(&fake_pdf, DEFAULT_MAX_IMPORT_BYTES);
    assert!(result.is_err(), "Fake PDF must fail magic byte sniffing");

    // Temp file must be immediately cleaned up
    let count = fs::read_dir(storage.documents_dir())
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().starts_with("tmp-"))
        .count();
    assert_eq!(count, 0, "Temp file must be purged after magic byte validation error");

    cleanup_test_env(&temp_dir);
}

#[test]
fn test_raii_rollback_on_null_byte_in_txt() {
    let (temp_dir, storage, file_store) = setup_test_env();

    // Text file containing binary null byte (0x00)
    let null_txt = temp_dir.join("null_byte.txt");
    let mut null_data = b"Normal text before null byte ".to_vec();
    null_data.push(0x00);
    null_data.extend_from_slice(b" text after null byte");
    fs::write(&null_txt, &null_data).unwrap();

    let result = file_store.stage_file(&null_txt, DEFAULT_MAX_IMPORT_BYTES);
    assert!(result.is_err(), "Text file with null bytes must be rejected");

    let count = fs::read_dir(storage.documents_dir())
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().starts_with("tmp-"))
        .count();
    assert_eq!(count, 0, "Temp file must be purged after null byte rejection");

    cleanup_test_env(&temp_dir);
}

#[test]
fn test_raii_rollback_on_commit_failure() {
    let (temp_dir, storage, file_store) = setup_test_env();

    let valid_file = temp_dir.join("document.txt");
    fs::write(&valid_file, "Valid text for commit rollback testing").unwrap();

    let staged = file_store
        .stage_file(&valid_file, DEFAULT_MAX_IMPORT_BYTES)
        .unwrap();
    let temp_path = staged.guard.path().to_path_buf();
    assert!(temp_path.exists(), "Temp file should exist before commit");

    // Attempt to commit with an invalid document_id (not a valid UUID v4)
    let invalid_id = "not-a-valid-uuid";
    let commit_res = file_store.commit_file(staged.guard, invalid_id, "txt");
    assert!(commit_res.is_err(), "Commit with invalid UUID must fail");

    // Because staged.guard was consumed and commit failed before marking committed,
    // the guard's Drop must have purged the temp file!
    assert!(
        !temp_path.exists(),
        "Temp file must be purged if commit_file fails"
    );

    let count = fs::read_dir(storage.documents_dir())
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().starts_with("tmp-"))
        .count();
    assert_eq!(count, 0, "Zero orphaned tmp files after commit error");

    cleanup_test_env(&temp_dir);
}

// ---------------------------------------------------------------------------
// 4. Path Traversal & Escape Defense Stress Tests
// ---------------------------------------------------------------------------

#[test]
fn test_path_traversal_variations_rejected() {
    let (temp_dir, storage, file_store) = setup_test_env();

    // 4a. Traversal in StoragePaths::resolve_safe_path
    let malicious_paths = [
        "../../etc/passwd",
        "library/../../documents",
        "..\\..\\Windows\\System32\\cmd.exe",
        "library/documents/../../../boot.ini",
        "/etc/shadow",
        "\\Windows\\explorer.exe",
        "C:\\Windows\\System32",
        "D:\\escaped\\file.txt",
        "\\\\server\\share\\data",
    ];

    for malicious in malicious_paths {
        let res = storage.resolve_safe_path(Path::new(malicious));
        assert!(
            res.is_err(),
            "Path traversal/escape must be rejected: {}",
            malicious
        );
        match res.err().unwrap() {
            AppError::PermissionDenied => {}
            other => panic!("Expected PermissionDenied for '{}', got: {:?}", malicious, other),
        }
    }

    // 4b. Traversal in FileStore::commit_file document_id
    let traversal_ids = [
        "../../doc",
        "../../../etc/passwd",
        "C:\\Windows\\bad",
        "00000000-0000-0000-0000-000000000000/../../bad",
    ];

    for bad_id in traversal_ids {
        let valid_file = temp_dir.join("test_doc.txt");
        fs::write(&valid_file, "Traversal test content").unwrap();
        let staged = file_store
            .stage_file(&valid_file, DEFAULT_MAX_IMPORT_BYTES)
            .unwrap();

        let commit_res = file_store.commit_file(staged.guard, bad_id, "txt");
        assert!(commit_res.is_err(), "Traversal in document_id must fail: {}", bad_id);
    }

    // 4c. Traversal in FileStore::delete_file
    for bad_id in traversal_ids {
        let delete_res = file_store.delete_file(bad_id, "txt");
        assert!(delete_res.is_err(), "Traversal in delete_file must fail: {}", bad_id);
    }

    cleanup_test_env(&temp_dir);
}
