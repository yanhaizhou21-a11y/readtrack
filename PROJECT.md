# Project: ReadTrack (Phase 2 & Phase 3)

## Architecture
ReadTrack is a mobile local-first document reader and reading tracker.
- **Backend (Rust / Tauri 2)**:
  - `storage/`: Sandboxed filesystem operations, streaming copy with BLAKE3 hash computation, safe paths, disk rollbacks.
  - `parsers/`: Normalized AST extraction (`DocumentParser` trait, `ParserRegistry`), zero-dependency TXT and Markdown first, followed by EPUB, PDF metadata, DOCX; segment generation per `TRACKER_SPEC.md §2`.
  - `models/`: Domain entities (`Document`, `Section`, `Segment`, `Progress`, `LogicalPosition`, `NormalizedDocument`).
  - `repositories/`: SQLite data access via `sqlx::SqlitePool` with foreign keys enabled, WAL mode, transaction support, and FTS5 search index management.
  - `services/`: Business logic (`ImportService`, `LibraryService`, `PositionService`).
  - `commands/`: Thin Tauri IPC command handlers with typed input/output and error mapping to `IpcError`.
  - `protocols/`: Custom URI scheme `rt://doc/<id>` with HTTP Range request support for PDF.js and streaming.
- **Frontend (React 18 / TypeScript / Vite / Tailwind)**:
  - `src/lib/ipc.ts`: Generic typed Tauri invoke with Zod validation.
  - `src/features/library/`: Library UI (Grid/List, DocCards, badges, progress bars, sort/filter/search, import sheet, duplicate & delete dialogs).
  - `src/features/reader/`: Document reader (format router, rich text semantic block reader, PDF.js renderer, virtualized viewport, LogicalPosition restoration and debounced tracking).
  - `src/stores/`: Zustand stores for transient UI state (e.g. `ui.store.ts`).

---

## Feature Inventory
Every requirement and surveyed capability is inventoried and assigned to an exact milestone.

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | E2E Test Infrastructure | Requirement-driven opaque-box test runner and test case harness | E2E-Track | Survey / ORIGINAL_REQUEST |
| 2 | Tier 1 Feature Coverage Tests | >=5 test cases per feature verifying baseline happy paths | E2E-Track | Survey / TESTING.md |
| 3 | Tier 2 Boundary & Corner Tests | Edge cases: empty files, zero-size, corrupted headers, max-size (200MB) | E2E-Track | Survey / TESTING.md |
| 4 | Tier 3 Cross-Feature Tests | Ingestion + Deduplication + Deletion + Filtering interactions | E2E-Track | Survey / TESTING.md |
| 5 | Tier 4 Real-World Scenarios | Complete user workflows (multi-document library management & reading) | E2E-Track | Survey / TESTING.md |
| 6 | Sandboxed FileStore Storage | Ingest into `library/documents/` with anti-traversal canonicalization | M1 | ORIGINAL_REQUEST R1 |
| 7 | Streaming Copy with BLAKE3 | Stream file chunks into temp file while computing BLAKE3 hash | M1 | ORIGINAL_REQUEST R1 |
| 8 | File Size & Magic Byte Sniffing | Enforce 200MB limit and validate magic bytes before committing | M1 | Survey / SECURITY.md |
| 9 | Ingestion Failure Rollback | Cleanly unlink temporary files (`tmp-<uuid>`) on any failure | M1 | ORIGINAL_REQUEST R1 |
| 10 | Normalized Document Model AST | `NormalizedDocument`, `DocMetadata`, `Vec<Section>`, `Vec<TocEntry>` | M1 | ORIGINAL_REQUEST R2 |
| 11 | Plain Text Parser (`.txt`) | Zero-dependency parser producing sections, word counts, char counts | M1 | ORIGINAL_REQUEST R2 |
| 12 | Markdown Parser (`.md`) | Structured heading sections, paragraphs, lists, quotes, code, tables | M1 | ORIGINAL_REQUEST R2 |
| 13 | EPUB / PDF / DOCX Extensibility | Parser trait and registry supporting progressive parser rollout | M1 | ORIGINAL_REQUEST R2 |
| 14 | Segment Generator | Generate `reading_segments` (40-220 words target or 1/page for PDF) | M1 | Survey / TRACKER_SPEC §2 |
| 15 | Test Fixtures Creation | `sample.txt`, `sample.md`, `sample.epub`, `sample.pdf` in `tests/fixtures/` | M1 | ORIGINAL_REQUEST AC |
| 16 | Unit Tests for Parsers & Storage | Automated tests for FileStore, BLAKE3 hashing, and TXT/MD parsers | M1 | Survey / TESTING.md |
| 17 | Domain Models Definition | Rust structs for Document, Section, Segment, Progress, Position | M2 | Survey / DATABASE.md |
| 18 | Position Alignment (`Option<f32>`) | Fix `page_offset: Option<f32>` in `models/position.rs` per spec | M2 | Survey / DOCUMENT_MODEL |
| 19 | Document Repository | CRUD for `documents` table, content_hash lookup, status updates | M2 | Survey / DATABASE.md |
| 20 | Section & Segment Repositories | Bulk insert sections and segments, query by document ID | M2 | Survey / DATABASE.md |
| 21 | Progress Repository | Initialize `reading_progress` (0%, unread), query progress | M2 | Survey / DATABASE.md |
| 22 | Search Index Integration | FTS5 insert on import, manual cleanup on delete | M2 | Survey / DATABASE.md |
| 23 | Streaming Duplicate Prevention | Reject duplicate BLAKE3 hash with typed `DOCUMENT_ALREADY_EXISTS` | M2 | ORIGINAL_REQUEST R1 |
| 24 | Atomic Ingestion Transaction | Single SQLite transaction for document + sections + segments + progress | M2 | Survey / ARCHITECTURE |
| 25 | Cascading & Disk File Deletion | Remove FTS5 index, cascade DB child rows, unlink file from filesystem | M2 | ORIGINAL_REQUEST R3 |
| 26 | IPC `document_import` | Command taking file path, streaming into storage, parsing, persisting | M2 | ORIGINAL_REQUEST R3 |
| 27 | IPC `document_list` | Command listing documents with sorting, filtering, and progress | M2 | ORIGINAL_REQUEST R3 |
| 28 | IPC `document_get` | Command returning DocumentDetail with sections and progress | M2 | ORIGINAL_REQUEST R3 |
| 29 | IPC `document_rename` | Command updating document user title | M2 | ORIGINAL_REQUEST R3 |
| 30 | IPC `document_archive` | Command toggling document archive status | M2 | ORIGINAL_REQUEST R3 |
| 31 | IPC `document_delete` | Command deleting document from DB and disk | M2 | ORIGINAL_REQUEST R3 |
| 32 | IPC `document_touch` | Command updating `last_opened_at` timestamp | M2 | ORIGINAL_REQUEST R3 |
| 33 | IPC `document_get_sections` | Command lazily returning sections for reader | M2 | Survey / API_CONTRACT |
| 34 | Backend Integration Tests | Automated tests for import, duplicate rejection, delete, and IPC handlers | M2 | ORIGINAL_REQUEST AC |
| 35 | Frontend Library API & Zod Schemas | Typed IPC client in `src/features/library/api.ts` with Zod validation | M3 | ORIGINAL_REQUEST R4 |
| 36 | Document Card (`DocCard`) | Mobile card with title, author, format badge, and progress bar | M3 | ORIGINAL_REQUEST R4 |
| 37 | Library Grid & List Views | Responsive Grid and List presentations switchable via UI store | M3 | ORIGINAL_REQUEST R4 |
| 38 | Sorting & Format Filtering | Sort (recent, title, progress) and filter (all, txt, md, epub, pdf) | M3 | ORIGINAL_REQUEST R4 |
| 39 | Dynamic Title Search Filter | Live client-side title search filtering library items | M3 | ORIGINAL_REQUEST R4 |
| 40 | Bottom Sheet Import Interaction | Import action sheet triggering file selection and import progress | M3 | ORIGINAL_REQUEST R4 |
| 41 | Duplicate Detection Alert Dialog | Dialog notifying user of duplicate file with option to view existing | M3 | ORIGINAL_REQUEST R4 |
| 42 | Deletion Confirmation Dialog | Destructive action confirmation dialog with clean UI update | M3 | ORIGINAL_REQUEST R4 |
| 43 | Empty, Loading & Error States | Human-friendly states with actionable "Import Document" button | M3 | ORIGINAL_REQUEST R4 |
| 44 | Immediate UI State Sync | Rename, archive, and delete update library without full app reload | M3 | ORIGINAL_REQUEST AC |
| 45 | Frontend Unit & Component Tests | Vitest tests for Library API, DocCard, SortFilterBar, Dialogs | M3 | ORIGINAL_REQUEST AC |
| 46 | Custom URI Protocol `rt://doc/<id>` | Tauri custom protocol handler with HTTP Range request support | M4 | Survey / API_CONTRACT |
| 47 | Rich Text Reader View | Virtualized/paginated semantic block reader for TXT and Markdown | M4 | ORIGINAL_REQUEST R5 |
| 48 | 5-Tier Position Restore Algorithm | `position_service::resolve()` resolving exact LogicalPosition | M4 | Survey / DOCUMENT_MODEL |
| 49 | Reading Position Persistence | Debounced position recording to backend on user scrolling/reading | M4 | ORIGINAL_REQUEST R5 |
| 50 | Reader Shell Integration | Complete ReaderScreen with TOC, appearance toggles, and bookmarks bar | M4 | Survey / DESIGN.md |
| 51 | 100% E2E Test Suite Verification | Verification of all Tier 1-4 tests passing end-to-end | M5 | ORIGINAL_REQUEST AC |
| 52 | Tier 5 Adversarial Hardening | Challenger-driven whitebox stress tests and coverage gap closure | M5 | Orchestration Strategy |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Independent opaque-box test suite (Tiers 1-4) creating `TEST_READY.md` | none | IN_PROGRESS |
| M1 | FileStore & Parsers | Streaming BLAKE3 deduplication, normalized document model, TXT/MD parsers, test fixtures | none | IN_PROGRESS |
| M2 | Database & IPC | SQLite repositories, cascading delete, search index sync, document IPC commands | M1 | PLANNED |
| M3 | Mobile Library UI | Grid/List views, badges, progress, sort/filter, search, import/duplicate/delete dialogs | M2 | PLANNED |
| M4 | Document Reader Engine | Custom `rt://` protocol, rich text reader, LogicalPosition tracking & restore | M2, M3 | PLANNED |
| M5 | Final E2E Pass & Adversarial Hardening | 100% pass on E2E test suite + Challenger adversarial test suite | E2E, M4 | PLANNED |

---

## Interface Contracts

### FileStore ↔ Parsers
- `FileStore::stage_file(source: &Path, max_bytes: u64) -> Result<(TempFileGuard, Blake3Hash, DetectedFormat), AppError>`
- `DocumentParser::parse(path: &Path) -> Result<NormalizedDocument, AppError>`
- `NormalizedDocument` contains `metadata: DocMetadata`, `sections: Vec<Section>`, `toc: Vec<TocEntry>`.
- `SegmentGenerator::generate_segments(doc: &NormalizedDocument) -> Vec<NewReadingSegment>`.

### Services ↔ Repositories
- `DocumentRepo::find_by_hash(pool: &SqlitePool, hash: &str) -> Result<Option<DocumentRecord>, AppError>`
- `DocumentRepo::insert_with_children(tx: &mut Transaction<Sqlite>, doc: &NewDocument, sections: &[NewSection], segments: &[NewReadingSegment]) -> Result<DocumentRecord, AppError>`
- `DocumentRepo::delete_cascade(pool: &SqlitePool, doc_id: &str, file_store: &FileStore) -> Result<(), AppError>`:
  1. `DELETE FROM search_index WHERE document_id = ?` in transaction.
  2. `DELETE FROM documents WHERE id = ?` (cascades via foreign keys to sections, segments, progress, etc.).
  3. `file_store.delete_document_file(doc_id, file_type)` unlinks physical file.

### Tauri Backend ↔ React Frontend (IPC)
- `document_import(path: String) -> Result<DocumentDetail, IpcError>`
- `document_list(filter: Option<DocumentFilter>) -> Result<Vec<DocumentSummary>, IpcError>`
- `document_get(id: String) -> Result<DocumentDetail, IpcError>`
- `document_rename(id: String, new_title: String) -> Result<DocumentSummary, IpcError>`
- `document_archive(id: String, is_archived: bool) -> Result<DocumentSummary, IpcError>`
- `document_delete(id: String) -> Result<(), IpcError>`
- `document_touch(id: String) -> Result<(), IpcError>`
- `document_get_sections(id: String) -> Result<Vec<SectionSummary>, IpcError>`
- Error code mapping: `DOCUMENT_ALREADY_EXISTS` (40901), `DOCUMENT_NOT_FOUND` (40401), `UNSUPPORTED_FORMAT` (40001), `FILE_TOO_LARGE` (41301), `CORRUPT_DOCUMENT` (42201).

### Reader ↔ Position Service
- `LogicalPosition`:
  ```json
  {
    "document_id": "uuid",
    "section_id": 0,
    "block_id": "blk-...",
    "offset": 120,
    "page": null,
    "page_offset": null,
    "percentage": 0.42,
    "parser_version": 1
  }
  ```
- `PositionService::resolve(stored: &LogicalPosition, doc: &NormalizedDocument) -> ResolvedPosition` implementing 5-tier fallback.

---

## Code Layout
- `src-tauri/src/`:
  - `storage/`: `file_store.rs`, `paths.rs`
  - `parsers/`: `mod.rs`, `traits.rs`, `txt.rs`, `markdown.rs`, `segment_generator.rs`
  - `models/`: `document.rs`, `section.rs`, `segment.rs`, `progress.rs`, `position.rs`, `document_model.rs`
  - `repositories/`: `document_repo.rs`, `section_repo.rs`, `segment_repo.rs`, `progress_repo.rs`, `search_repo.rs`
  - `services/`: `import_service.rs`, `library_service.rs`, `position_service.rs`
  - `commands/`: `document.rs`, `settings.rs`
  - `protocols/`: `document_stream.rs`
- `src-tauri/tests/`:
  - `fixtures/`: `sample.txt`, `sample.md`, `sample.epub`, `sample.pdf`
  - `storage_test.rs`, `parser_test.rs`, `document_test.rs`
- `src/features/library/`:
  - `api.ts`, `types.ts`
  - `components/`: `DocCard.tsx`, `DocumentGrid.tsx`, `DocumentList.tsx`, `SortFilterBar.tsx`, `ImportSheet.tsx`, `DuplicateDialog.tsx`, `DeleteConfirmDialog.tsx`
  - `LibraryScreen.tsx`, `DocumentDetailScreen.tsx`
- `src/features/reader/`:
  - `api.ts`
  - `components/`: `RichTextReader.tsx`, `ReaderHeader.tsx`, `ReaderBottomBar.tsx`, `TocSheet.tsx`
  - `ReaderScreen.tsx`
