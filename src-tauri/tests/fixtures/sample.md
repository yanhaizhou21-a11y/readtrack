# ReadTrack User Guide

Welcome to ReadTrack, an interactive reading tracker and local-first document reader designed for mobile platforms.

## Getting Started

To begin reading, import your files using the library sheet. ReadTrack supports multiple document formats:

- Plain Text files with automatic paragraph splitting
- Markdown documents with structured heading outlines
- EPUB digital books with complete chapter navigation
- PDF documents with page streaming and zoom control

Follow these three simple steps to read your first book:

1. Tap the plus button to open the import sheet.
2. Select a supported document from your device storage.
3. Tap on the document card to launch the reader.

## Reading Methodology

The reading tracker measures active reading dwell time instead of simple scrolling. As Mortimer Adler famously observed:

> In the case of good books, the point is not how many of them you can get through, but rather how many can get through to you.

## Technical Specifications

The core engine tracks reading segments using weighted heuristics:

```rust
pub fn calculate_dwell(words: usize) -> u64 {
    (words as u64 * 60_000) / 220
}
```

| Format | Extension | Parser Type |
| --- | --- | --- |
| Text | .txt | Zero-dependency line splitter |
| Markdown | .md | CommonMark AST parser |
| EPUB | .epub | Open Container Format ZIP |
| PDF | .pdf | Native PDF.js viewport engine |

---

Thank you for choosing ReadTrack for your focused daily reading sessions.
