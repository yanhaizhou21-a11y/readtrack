use readtrack_lib::storage::StoragePaths;
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
