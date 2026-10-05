use std::fs;
use std::path::PathBuf;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
}

#[test]
fn test_all_fixtures_exist_and_non_empty() {
    let dir = fixtures_dir();
    let expected = ["sample.txt", "sample.md", "sample.epub", "sample.pdf"];

    for name in &expected {
        let path = dir.join(name);
        assert!(path.exists(), "Fixture missing: {}", path.display());
        let meta = fs::metadata(&path).expect("Failed to read metadata");
        assert!(meta.len() > 0, "Fixture is empty: {}", path.display());
    }
}

#[test]
fn test_sample_txt_content_and_metrics() {
    let path = fixtures_dir().join("sample.txt");
    let content = fs::read_to_string(&path).expect("sample.txt must be valid UTF-8");

    assert!(content.starts_with("ReadTrack Architecture and Core Principles"));

    let paragraphs: Vec<&str> = content
        .split("\n\n")
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();
    assert_eq!(paragraphs.len(), 4, "sample.txt must have exactly 4 paragraphs");

    let word_count = content.split_whitespace().count();
    assert_eq!(word_count, 300, "sample.txt must have exactly 300 words");
}

#[test]
fn test_sample_md_structural_elements() {
    let path = fixtures_dir().join("sample.md");
    let content = fs::read_to_string(&path).expect("sample.md must be valid UTF-8");

    assert!(content.contains("# ReadTrack User Guide"));
    assert!(content.contains("## Getting Started"));
    assert!(content.contains("## Reading Methodology"));
    assert!(content.contains("## Technical Specifications"));
    assert!(content.contains("- Plain Text files"));
    assert!(content.contains("1. Tap the plus button"));
    assert!(content.contains("> In the case of good books"));
    assert!(content.contains("```rust"));
    assert!(content.contains("| Format | Extension | Parser Type |"));
    assert!(content.contains("---"));

    let word_count = content.split_whitespace().count();
    assert!(
        (200..=260).contains(&word_count),
        "sample.md words within expected range, got {}",
        word_count
    );
}

#[test]
fn test_sample_pdf_binary_header_and_structure() {
    let path = fixtures_dir().join("sample.pdf");
    let bytes = fs::read(&path).expect("Failed to read sample.pdf");

    assert!(bytes.starts_with(b"%PDF-"), "Must start with %PDF-");
    let text = String::from_utf8_lossy(&bytes);
    assert!(text.contains("/Type /Catalog"), "PDF must contain catalog");
    assert!(text.contains("/Count 2"), "PDF must declare 2 pages");
    assert!(text.contains("%%EOF"), "PDF must end with %%EOF");
}

#[test]
fn test_sample_epub_zip_magic_and_entries() {
    let path = fixtures_dir().join("sample.epub");
    let bytes = fs::read(&path).expect("Failed to read sample.epub");

    assert!(
        bytes.starts_with(&[0x50, 0x4b, 0x03, 0x04]),
        "Must be valid ZIP archive"
    );

    let text = String::from_utf8_lossy(&bytes);
    assert!(
        text.contains("application/epub+zip"),
        "Must declare epub mimetype"
    );
    assert!(
        text.contains("META-INF/container.xml"),
        "Must contain container.xml"
    );
    assert!(
        text.contains("OEBPS/content.opf"),
        "Must contain content.opf"
    );
}
