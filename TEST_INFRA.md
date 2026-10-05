# TEST_INFRA — ReadTrack E2E Test Infrastructure

## 1. Test Philosophy

ReadTrack is a mobile local-first document reader and interactive reading tracker. Because reading detection, position restoration, and local document ingestion must be 100% reliable without cloud telemetry, the test infrastructure adheres to strict architectural principles:

1. **Independent & Self-Contained:** Every test case sets up its own isolated temporary environment, sandboxed filesystem paths, and database state. Tests do not depend on test execution order or persist mutable state across runs.
2. **Opaque-Box & Requirement-Driven:** Tests interact strictly across public system boundaries (Tauri IPC commands, typed DTOs with Zod validation, the sandboxed filesystem `library/documents/`, and the custom `rt://` protocol). Internal private functions are treated as a black box.
3. **Deterministic & Zero Flakiness:** Non-deterministic properties (timestamps, UUIDs) use bounded regex or deterministic clocks. Asynchronous operations are awaited deterministically without arbitrary `sleep()` calls.
4. **Authoritative Expected Output Derivation:** Every test expectation is derived strictly from `ORIGINAL_REQUEST.md`, `PROJECT.md`, `docs/API_CONTRACT.md`, `docs/DOCUMENT_MODEL.md`, `docs/TRACKER_SPEC.md`, `docs/DATABASE.md`, and `docs/SECURITY.md`.
5. **No Facade Tests:** Every test actively verifies business logic, data invariants, error codes (e.g. 40901 `DuplicateDocument`, 40401 `DocumentNotFound`, 40001 `UnsupportedFormat`), cascading deletion, and dwell calculation algorithms.

---

## 2. Feature Inventory Mapping

ReadTrack's 52 inventoried features from `PROJECT.md` are mapped across the 4 test tiers:

| Feature # | Feature Name | Primary Milestone | Test Tier Coverage | Verification Focus |
|---|---|---|---|---|
| 1 | E2E Test Infrastructure | E2E-Track | All Tiers | Test runner, opaque-box harness, fixture generation |
| 2 | Tier 1 Feature Coverage | E2E-Track | Tier 1 | Happy path operations across all domains (>=5 per domain) |
| 3 | Tier 2 Boundary & Corner Cases | E2E-Track | Tier 2 | Empty, zero-byte, 200MB overflow, path traversal, malformed |
| 4 | Tier 3 Cross-Feature Interactions | E2E-Track | Tier 3 | Pairwise interactions: Ingestion + Dedup + Deletion + Search + Filter |
| 5 | Tier 4 Real-World Scenarios | E2E-Track | Tier 4 | Multi-step end-to-end user workflows and crash recovery |
| 6 | Sandboxed FileStore Storage | M1 | Tier 1, 2, 3 | Safe path canonicalization, storage under `library/documents/` |
| 7 | Streaming Copy with BLAKE3 | M1 | Tier 1, 2 | Streaming hash computation, content-addressable checksum |
| 8 | File Size & Magic Byte Sniffing | M1 | Tier 1, 2 | 200MB limit enforcement, magic byte validation before parsing |
| 9 | Ingestion Failure Rollback | M1 | Tier 2, 3 | Immediate unlinking of temp files (`tmp-*`) on error |
| 10 | Normalized Document Model AST | M1 | Tier 1 | AST metadata, sections, blocks, inlines, deterministic BlockIDs |
| 11 | Plain Text Parser (`.txt`) | M1 | Tier 1, 2 | Word count, char count, sectioning, UTF-8/UTF-16 encoding |
| 12 | Markdown Parser (`.md`) | M1 | Tier 1, 2 | Structured headings, lists, quotes, tables, code blocks |
| 13 | EPUB / PDF / DOCX Extensibility | M1 | Tier 1, 2 | Parser registry, format sniffing, graceful error on unsupported |
| 14 | Segment Generator | M1 | Tier 1, 2 | Rich text 40-220 words target, weights (img=30, table=cells*1.0) |
| 15 | Test Fixtures Creation | M1 | All Tiers | Automated fixtures: `sample.txt`, `sample.md`, `sample.pdf`, edge cases |
| 16 | Unit Tests for Parsers & Storage | M1 | Tier 1 | Parser contract verification and stage file integrity |
| 17 | Domain Models Definition | M2 | Tier 1 | Struct validation for Document, Section, Segment, Progress, Position |
| 18 | Position Alignment (`Option<f32>`) | M2 | Tier 1, 2 | Floating point `pageOffset: Option<f32>` (0.0..1.0) |
| 19 | Document Repository | M2 | Tier 1 | Document CRUD, hash lookup, status transitions |
| 20 | Section & Segment Repositories | M2 | Tier 1 | Bulk insertion, relational integrity, section hierarchy |
| 21 | Progress Repository | M2 | Tier 1, 4 | Initial progress (0%, unread), update debouncing |
| 22 | Search Index Integration | M2 | Tier 1, 3 | FTS5 indexing on import, manual deletion on document removal |
| 23 | Streaming Duplicate Prevention | M2 | Tier 1, 2, 3 | Duplicate hash detection returning typed `DuplicateDocument` (40901) |
| 24 | Atomic Ingestion Transaction | M2 | Tier 2, 3 | All-or-nothing commit across documents, sections, segments |
| 25 | Cascading & Disk File Deletion | M2 | Tier 1, 3, 4 | Removal of DB rows, child entities, FTS index, and disk binary |
| 26 | IPC `document_import` | M2 | Tier 1, 2, 3, 4 | Ingest file, return `DocumentSummary`, emit progress events |
| 27 | IPC `document_list` | M2 | Tier 1, 3 | Query with filter (`all`, `in_progress`, `archived`), sort, pagination |
| 28 | IPC `document_get` | M2 | Tier 1 | Fetch `DocumentDetail` with sessions, metadata, position |
| 29 | IPC `document_rename` | M2 | Tier 1, 2, 3 | Update user title (1-200 characters), validate length |
| 30 | IPC `document_archive` | M2 | Tier 1, 3 | Toggle `isArchived` flag, verify exclusion from active lists |
| 31 | IPC `document_delete` | M2 | Tier 1, 2, 3, 4 | Clean purge of database and filesystem artifacts |
| 32 | IPC `document_touch` | M2 | Tier 1, 4 | Update `last_opened_at` timestamp on reader open |
| 33 | IPC `document_get_sections` | M2 | Tier 1, 2 | Lazy section loader with batch limit (`count <= 20`) |
| 34 | Backend Integration Tests | M2 | Tier 1, 3 | End-to-end repository and service pipeline validation |
| 35 | Frontend Library API & Zod Schemas | M3 | Tier 1, 2 | Runtime type validation for IPC payloads |
| 36 | Document Card (`DocCard`) | M3 | Tier 1 | Title, author, format badge, and progress bar rendering |
| 37 | Library Grid & List Views | M3 | Tier 1 | Layout presentation switching via UI state |
| 38 | Sorting & Format Filtering | M3 | Tier 1, 3 | Sort by recent/title/progress, filter by txt/md/pdf/epub |
| 39 | Dynamic Title Search Filter | M3 | Tier 1, 3 | Dynamic search hit filtering across document collection |
| 40 | Bottom Sheet Import Interaction | M3 | Tier 1, 4 | Import sheet triggering file selection and progress |
| 41 | Duplicate Detection Alert Dialog | M3 | Tier 1, 3, 4 | Dialog offering "Open existing", "Replace", "Cancel" |
| 42 | Deletion Confirmation Dialog | M3 | Tier 1, 4 | Confirmation dialog preventing accidental document removal |
| 43 | Empty, Loading & Error States | M3 | Tier 1, 2 | Friendly states with actionable "Import Document" button |
| 44 | Immediate UI State Sync | M3 | Tier 1, 3, 4 | Reactivity on rename, archive, delete without full reload |
| 45 | Frontend Unit & Component Tests | M3 | Tier 1 | Verification of frontend library components and stores |
| 46 | Custom URI Protocol `rt://doc/<id>` | M4 | Tier 1, 2 | Safe streaming with HTTP Range header support |
| 47 | Rich Text Reader View | M4 | Tier 1, 4 | Virtualized semantic block reader for TXT and Markdown |
| 48 | 5-Tier Position Restore Algorithm | M4 | Tier 1, 2, 4 | Fallback: exact block -> linear pos -> percentage -> start -> clamp |
| 49 | Reading Position Persistence | M4 | Tier 1, 4 | Debounced progress flush to database |
| 50 | Reader Shell Integration | M4 | Tier 1, 4 | Reader navigation, TOC drawer, appearance toggles |
| 51 | 100% E2E Test Suite Verification | M5 | All Tiers | 100% pass across all 4 tiers |
| 52 | Tier 5 Adversarial Hardening | M5 | Tier 2, 3 | Stress testing, concurrency, race conditions, memory limits |

---

## 3. Test Architecture & Runner

### 3.1 Directory Layout
```text
c:\di\readtrack\
├── tests\
│   └── e2e\
│       ├── harness\
│       │   ├── contracts.ts          # Zod schemas & IPC DTO definitions
│       │   ├── fixtures.ts           # Synthetic document generators & edge fixtures
│       │   ├── tracker_oracle.ts     # Reference reading tracker & position resolver oracle
│       │   └── opaque_box_driver.ts  # Isolated driver executing against ReadTrack contracts
│       ├── tier1-features.test.ts    # Tier 1: Feature Coverage (>=5 per feature domain)
│       ├── tier2-boundaries.test.ts  # Tier 2: Boundary & Corner Cases (limits, corrupt, traversal)
│       ├── tier3-interactions.test.ts# Tier 3: Cross-Feature Interactions (pairwise combinations)
│       └── tier4-scenarios.test.ts   # Tier 4: Real-World Application Scenarios (complete workflows)
├── vitest.e2e.config.ts              # Dedicated E2E Vitest runner configuration
├── TEST_INFRA.md                     # This document
└── TEST_READY.md                     # Test execution readiness report
```

### 3.2 Opaque-Box Test Harness
The `OpaqueBoxDriver` simulates the client-side interaction with ReadTrack's backend contracts:
1. **IPC Protocol Simulation:** Dispatches typed commands (`document_import`, `document_list`, `document_get`, `document_rename`, `document_archive`, `document_delete`, `document_touch`, `document_get_sections`, `document_search`, `document_resolve_position`, `reading_start_session`, `reading_report_viewport`, `reading_end_session`, `reading_get_progress`, `settings_get_all`, `settings_set`).
2. **Schema Validation:** Every response is validated using strict Zod schemas matching `docs/API_CONTRACT.md`. Any missing or mis-typed property triggers immediate test failure.
3. **Sandboxed Filesystem Emulation:** Maintains an isolated sandbox directory (`library/documents/`, `library/cache/`, `library/thumbnails/`, `exports/`) with BLAKE3 content hashing, path traversal guards, and file size tracking.
4. **Tracker & Position Oracle:** Implements the reference reading detection state machine (`unread` -> `reading` -> `read` / `skipped`), dwell accumulation formulas (`expected_ms = word_count / max_wpm * 60_000`, `required_ms = max(min_dwell_ms, expected_ms * 0.5)`), and 5-tier position restoration per `docs/TRACKER_SPEC.md` and `docs/DOCUMENT_MODEL.md`.

### 3.3 Test Execution Command
The E2E suite is registered in `package.json` and executed via:
```bash
pnpm test:e2e
```
Or directly:
```bash
pnpm vitest run --config vitest.e2e.config.ts
```

---

## 4. Four-Tier Methodology & Breakdown

### Tier 1: Feature Coverage (Baseline Happy Paths)
- **Target:** >=5 test cases per feature domain covering primary behavior.
- **Domains Covered:**
  1. *FileStore & Ingestion*: Import TXT, import Markdown, verify storage in `library/documents/`, verify BLAKE3 hash computation, verify metadata extraction.
  2. *Document Parsing & AST*: Heading extraction in Markdown, paragraphs and word counts in TXT, segment generation with target word counts (40-220 words), deterministic BlockIDs (`s0-b1`), inline markup preservation.
  3. *Persistence & Query*: Document listing with `all` filter, document retrieval by UUID, pagination limit/offset, last opened timestamp update via `document_touch`, lazy section fetching.
  4. *Library Operations*: Rename document, archive document, unarchive document, soft/hard filter exclusion, list sorting by title, recent, and progress.
  5. *Deletion & Cascading*: Deletion of document removes record, cascades to child sections and segments, purges FTS search index, and deletes filesystem binary.
  6. *Reading Engine & Positions*: LogicalPosition creation, linear position mapping, reading progress initialization (0%, unread), status progression.
  7. *Settings & Preferences*: Get default settings, update valid setting key-value pair, retrieve persisted setting.

### Tier 2: Boundary & Corner Cases (Adversarial Edge Conditions)
- **Target:** >=5 test cases per domain covering limits, corrupted inputs, and failure recovery.
- **Edge Conditions Covered:**
  1. *Zero-byte files*: Empty `.txt` or `.md` files rejected or handled with 0 word count, no orphaned temp files left on disk.
  2. *Max-size & Over-limit files*: Enforce 200MB limit; files exceeding 200MB (209,715,200 bytes) rejected with `FILE_TOO_LARGE` / `InvalidDocument`, temp file rolled back immediately.
  3. *Path Traversal Attacks*: Input paths containing `../`, `..\\`, null bytes, or absolute path escapes outside app data sandboxed root rejected with `PermissionDenied` or path sanitization.
  4. *Magic Byte Mismatch & Spoofing*: File named `fake.pdf` containing plain text or corrupted binary headers rejected during format sniffing.
  5. *Malformed & Corrupted ASTs*: Markdown with unclosed code blocks, deep table nesting, broken UTF-8 encoding, or unsupported control characters handled gracefully without panic.
  6. *String Boundary Violations*: Document rename with empty string (0 chars) or excessive length (>200 chars) rejected with `InvalidInput`.
  7. *Invalid Identifiers*: Commands invoked with malformed UUIDs, nonexistent document IDs, or out-of-range section IDs return typed `DocumentNotFound` / `InvalidInput`.
  8. *Rapid Concurrency & Stress*: Rapid sequential status updates, reading session heartbeat updates under high-frequency viewport reports.

### Tier 3: Cross-Feature Interactions (Pairwise Combinations)
- **Target:** Pairwise combinations across Ingestion, Deduplication, Deletion, Search, and Filtering.
- **Interactions Covered:**
  1. *Ingestion + Deduplication*: Ingest Document A -> ingest identical Document A -> returns `DuplicateDocument` error with existing document ID; storage file is not duplicated.
  2. *Ingestion + Search*: Ingest Document A with unique keywords -> execute `document_search` -> verify search hits match title and snippet.
  3. *Ingestion + Format Filtering*: Ingest mix of TXT, MD, PDF -> filter library by format -> verify exact subset returned.
  4. *Deduplication + Deletion + Re-ingestion*: Ingest Document A -> delete Document A -> re-ingest Document A -> succeeds cleanly without duplicate collision.
  5. *Ingestion + Rename + Search*: Ingest Document A -> rename title to "Advanced Quantum Mechanics" -> search for "Quantum" -> verify hit reflects new title.
  6. *Ingestion + Progress Update + Sorting*: Ingest documents A and B -> mark A 50% read -> sort by `progress` descending -> verify A appears before B.
  7. *Ingestion + Archive + Filtering*: Ingest documents A and B -> archive A -> filter `in_progress` -> verify A is excluded; filter `archived` -> verify A is present.
  8. *Reading Session + Cascading Deletion*: Start reading session for Document A -> delete Document A -> verify active session and all child segments are cleanly removed.
  9. *Ingestion + Section Lazy Loading + TOC*: Ingest multi-heading Markdown document -> query TOC -> fetch sections lazily using `document_get_sections` -> verify matching block counts.
  10. *Duplicate Resolution Action*: Re-ingest with `onDuplicate = "open_existing"` returns existing record; re-ingest with `onDuplicate = "replace"` cleanly replaces file and updates metadata.

### Tier 4: Real-World Application Scenarios (End-to-End User Journeys)
- **Target:** Realistic multi-step end-to-end workflows.
- **Scenarios Covered:**
  1. *Scenario 1: End-to-End Research Scholar Workflow*: A researcher imports an academic paper (`research_paper.md`), views library summary, opens document (touching timestamp), inspects TOC, navigates to Section 2, dwells in reading zone to transition segment from `unread` -> `reading` -> `read`, creates bookmark, and confirms progress increases.
  2. *Scenario 2: Rapid Multi-Format Ingestion & Library Curation*: A user imports multiple books in different formats (TXT, MD), switches between Grid and List views, filters by format, searches by query, updates book titles, and archives completed books.
  3. *Scenario 3: Accidental Duplicate Ingestion & Conflict Resolution*: User downloads a document twice and imports both; ReadTrack triggers duplicate detection alert dialog with existing ID, user inspects existing document, preventing wasted disk space.
  4. *Scenario 4: Interrupted Reading Session & 5-Tier Crash Recovery*: User reads halfway through a chapter, app encounters sudden termination (simulated crash), user relaunches app; reader invokes `document_resolve_position` with 5-tier fallback algorithm to seamlessly restore exact reading block; orphaned session is recovered.
  5. *Scenario 5: Complete Document Lifecycle & Zero Disk Residue Purge*: Import document, read, log sessions, create bookmarks/notes, check storage metrics, perform deletion confirmation -> verify complete removal from database, FTS index, and filesystem (`library/documents/`).
  6. *Scenario 6: Reading Velocity & Anti-Cheating Speed-Reader Validation*: User rapidly flings/scrolls through 10 segments in 2 seconds -> tracker detects excessive speed (`dwell < required_ms`) -> marks segments as `skipped` rather than `read`; user returns to segment and dwells -> segment successfully transitions to `read`.
  7. *Scenario 7: Offline Local-First Reading & Report Export*: User imports documents offline, completes reading sessions, generates summary export report, and validates self-contained metadata without network access.

---

## 5. Coverage Thresholds & Quality Gates

To ensure software delivery integrity, the following thresholds are enforced:
- **Test Pass Rate:** 100% of all implemented tests across Tiers 1–4 must pass.
- **Flakiness Threshold:** 0 flaky tests allowed across 3 consecutive runs.
- **Execution Time:** Full E2E suite completes in < 15 seconds.
- **Zero Orphaned Files:** Test harness teardown verifies zero temporary files leaked in sandbox directories.
- **Contract Strictness:** 100% of IPC responses must pass Zod schema validation.
