# Test Fixtures — ReadTrack

This directory contains deterministic test fixtures for ReadTrack's ingestion pipeline, parser engine, segment generator, and reading tracker.

| Fixture | Format | Size | Description & Verification Targets |
|---|---|---|---|
| `sample.txt` | UTF-8 Plain Text | ~2 KB | 4 paragraphs, 300 words. Verifies synthetic title, paragraph splitting, character counting, and segment generation. |
| `sample.md` | CommonMark | ~1.5 KB | 4 sections, 240 words. Verifies H1/H2 sectioning, lists, blockquote, code blocks, tables, and weight multipliers. |
| `sample.epub` | EPUB 3 / OCF | ~1 KB | Minimal valid 2-chapter EPUB. Verifies ZIP container extraction, OPF manifest/spine parsing, and NCX TOC mapping. |
| `sample.pdf` | PDF 1.4 | ~1 KB | Valid 2-page PDF document. Verifies magic byte sniffing (`%PDF-`), page count extraction, and 1-segment-per-page generation. |

All fixtures are checked in as real, non-mocked files to maintain 100% fidelity with production reader engines.
