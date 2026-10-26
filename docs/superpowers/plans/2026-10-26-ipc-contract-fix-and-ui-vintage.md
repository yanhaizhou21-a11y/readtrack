# IPC Contract Standardization, Library Fault-Tolerance, Vintage UI & GitHub Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the document import and library loading failures caused by Rust `Option::None` -> `null` vs Zod `.optional()` mismatches across all IPC contracts, make document list parsing fault-tolerant per item, revise the UI to a calm vintage book aesthetic, and provide a GitHub Release workflow for APKs.

**Architecture:** Enforce a single source of truth for IPC serialization: Rust backend omits empty fields via `#[serde(skip_serializing_if = "Option::is_none")]`; frontend uses a universal `opt()` helper in `src/types/zod-helpers.ts` transforming `.nullish()` to `T | undefined`; list parsing validates each item individually so bad rows don't crash the library; CSS theme tokens adopt a warm antique paper & terracotta editorial palette; and GitHub Actions manages APK releases.

**Tech Stack:** Tauri 2 (Rust), React 18, TypeScript, Zod 3, Vite, Tailwind CSS, SQLite (sqlx), GitHub Actions.

**Spec:** [docs/API_CONTRACT.md](file:///c:/Codes/readtrack/docs/API_CONTRACT.md), [docs/DESIGN.md](file:///c:/Codes/readtrack/docs/DESIGN.md).

## Global Constraints

- Business logic resides in Rust; React handles presentation, gesture, and UI state.
- No `any`, no disabling validation, no dummy/mock data replacing real endpoints.
- Single source of truth for IPC contract: empty fields from Rust are omitted (`skip_serializing_if`), and frontend schemas accept both `null` and `undefined` via `opt()` without leaking `null` to UI components.
- Per-item parsing in library list: a corrupted row must log a warning and let the rest of the library render.
- In dev mode, `src/lib/ipc.ts` logs command name, Zod issues, and raw payload on validation failures.

## Review Focus

1. **New document imported without author, thumbnail, or pages (e.g. TXT/MD):** `DocumentSummary` has `author: None`, `page_count: None`, `thumbnail_url: None`, `last_opened_at: None`. Must deserialize without error.
2. **Corrupted or incomplete single row in library list:** `DocumentListResponse` with 1 valid and 1 malformed document returns the valid document without throwing an error.
3. **Desktop vs Mobile import path:** Desktop uses file path; mobile uses raw bytes array. Both must pass contract validation seamlessly.
4. **Theme contrast in Vintage mode:** Warm parchment background and terracotta accent must maintain WCAG AA contrast for readability.
5. **Release workflow reproducibility:** GitHub Actions workflow must successfully package/release or accept extracted APK files cleanly.

---

### Task 1: Contract Audit & Data Mismatch Mapping

**Files:**
- Output: Documented in plan and [docs/API_CONTRACT.md](file:///c:/Codes/readtrack/docs/API_CONTRACT.md)

**Interfaces:**
- Consumes: All 44 commands in `src-tauri/src/lib.rs` and models in `src-tauri/src/models/*.rs`
- Produces: Audit table of all IPC types and their serialization status

- [ ] **Step 1: Document all commands in `tauri::generate_handler!` and response types**
- [ ] **Step 2: Map Rust struct fields vs Zod schemas to identify every `Option<T>` missing `skip_serializing_if` and every Zod `.optional()` missing `.nullable()`**
- [ ] **Step 3: Document relaxed constraints (e.g., `positive()` -> `nonnegative()` for page/pos fields)**

---

### Task 2: Create Zod Contract Helper & Fix TypeScript Schemas

**Files:**
- Create: `src/types/zod-helpers.ts`
- Modify: `src/types/document.ts`
- Modify: `src/types/tracker.ts`
- Modify: `src/types/annotations.ts`
- Modify: `src/types/search.ts`
- Modify: `src/types/reminder.ts`
- Modify: `src/types/index.ts`
- Modify: `tests/e2e/harness/contracts.ts`

**Interfaces:**
- Produces: `export const opt = <T extends z.ZodTypeAny>(s: T) => s.nullish().transform(v => v ?? undefined)`
- Updates: `DocumentSummarySchema`, `DocumentDetailSchema`, `LogicalPositionSchema`, `SectionPayloadSchema`, `BlockSchema`, etc.

- [ ] **Step 1: Create `src/types/zod-helpers.ts` with `opt()` helper**
- [ ] **Step 2: Update `src/types/document.ts` using `opt()` for all optional fields**
- [ ] **Step 3: Update `src/types/tracker.ts`, `annotations.ts`, `search.ts`, `reminder.ts`, `index.ts`**
- [ ] **Step 4: Update `tests/e2e/harness/contracts.ts` to maintain identical schema definitions**
- [ ] **Step 5: Run `pnpm typecheck` to verify zero TypeScript errors**

---

### Task 3: Update Rust Models with `skip_serializing_if`

**Files:**
- Modify: `src-tauri/src/models/document.rs`
- Modify: `src-tauri/src/models/tracker.rs`
- Modify: `src-tauri/src/models/annotations.rs`
- Modify: `src-tauri/src/models/reminder.rs`
- Modify: `src-tauri/src/models/search.rs`

**Interfaces:**
- Produces: JSON serialization where `Option::None` is omitted instead of emitted as `null`.

- [ ] **Step 1: Add `#[serde(skip_serializing_if = "Option::is_none")]` to all `Option` fields in `DocumentSummary`, `DocumentDetail`, `SectionPayload`, `ReadingProgress`, and `ReadingSegment` in `src-tauri/src/models/document.rs`**
- [ ] **Step 2: Add `skip_serializing_if` to `src-tauri/src/models/tracker.rs` (`ReadingSession`, `MapSection`, `ReadingMap`, `ContinueCard`, `HomeDashboard`, `ReadingProgressUpdatedPayload`)**
- [ ] **Step 3: Add `skip_serializing_if` to `src-tauri/src/models/annotations.rs` (`Bookmark`, `Highlight`, `Note`)**
- [ ] **Step 4: Add `skip_serializing_if` to `src-tauri/src/models/reminder.rs` (`Reminder`, `ReminderUpsertInput`)**
- [ ] **Step 5: Add `skip_serializing_if` to `src-tauri/src/models/search.rs` (`SearchHit`)**
- [ ] **Step 6: Run `cargo check --manifest-path src-tauri/Cargo.toml` to verify backend compiles**

---

### Task 4: Library Robustness & IPC Logging

**Files:**
- Modify: `src/lib/ipc.ts`
- Modify: `src/types/document.ts` (`DocumentListResponseSchema`)
- Modify: `src/features/library/components/ImportDialog.tsx`

**Interfaces:**
- Produces: Resilient per-item parsing for library list, detailed dev logging in `ipc.ts`, and clean error handling in `ImportDialog`.

- [ ] **Step 1: Update `DocumentListResponseSchema` in `src/types/document.ts` to parse items array with a fault-tolerant transform that skips and logs malformed items instead of failing the entire array**
- [ ] **Step 2: Update `src/lib/ipc.ts` to print `command`, `issues`, and `rawPayload` in dev mode on schema mismatch**
- [ ] **Step 3: Ensure `ImportDialog.tsx` handles errors gracefully without showing false error states**
- [ ] **Step 4: Run `pnpm vitest run src/lib/ipc.test.ts` to verify IPC tests pass**

---

### Task 5: Contract Tests & Format Ingestion Tests

**Files:**
- Create: `src/lib/contract.test.ts`
- Modify: `tests/e2e/tier1-features.test.ts`

**Interfaces:**
- Consumes: `DocumentSummarySchema`, `DocumentDetailSchema`, sample JSON payloads with `null`, `undefined`, and populated values.

- [ ] **Step 1: Write contract tests in `src/lib/contract.test.ts` testing `DocumentSummarySchema` against:**
  - Complete Rust payload (with all fields populated)
  - Minimal Rust payload (with all `Option` fields omitted)
  - Legacy/raw payload with `null` fields (ensuring `opt()` transforms `null` to `undefined`)
  - Invalid types (ensuring strict validation is preserved)
- [ ] **Step 2: Run `pnpm vitest run src/lib/contract.test.ts`**
- [ ] **Step 3: Run existing unit and e2e test suite: `pnpm vitest run`**

---

### Task 6: Vintage & Calm UI Palette Revision

**Files:**
- Modify: `src/app/tokens.css`

**Interfaces:**
- Produces: Warm antique paper / parchment aesthetic with calm terracotta / bronze accents and soft borders.

- [ ] **Step 1: Update Light Mode CSS variables in `src/app/tokens.css`:**
  - Background: Warm parchment paper `#F6F3EC`
  - Foreground: Warm ink charcoal `#24211E`
  - Surface: Antique cream `#FCFAF6`, `#F0EAE1`, `#EAE2D7`
  - Border: Soft bookbinder bronze `#38332E`
  - Border-muted: Antique paper line `#E2D9CC`
  - Accent: Calm terracotta `#9E4734`
  - Danger: Deep brick red `#A8382B`
  - Divider: `#E4DDD2`
- [ ] **Step 2: Update Dark Mode CSS variables in `src/app/tokens.css`:**
  - Background: Warm dark espresso `#181614`
  - Foreground: Warm antique cream `#EDE8DF`
  - Surface: Warm charcoal leather `#201E1B`, `#282522`, `#322E2A`
  - Border: Soft bronze `#3D3833`
  - Border-muted: `#2A2622`
  - Accent: Calm warm terracotta `#C65D47`
  - Danger: Deep brick `#B84334`
- [ ] **Step 3: Verify visual contrast and component rendering**

---

### Task 7: GitHub Release Workflow & APK Release Setup

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `docs/RELEASE_GUIDE.md`

**Interfaces:**
- Produces: Automated GitHub Action that triggers on tag push (`v*`) or manual `workflow_dispatch`, drafts a GitHub Release, and provides clear steps for extracting and uploading the `.apk`.

- [ ] **Step 1: Create `.github/workflows/release.yml` with workflow_dispatch and tag trigger, building APK and drafting a release with attached artifacts**
- [ ] **Step 2: Create `docs/RELEASE_GUIDE.md` explaining how to run the workflow or manually attach the extracted `.apk` to the GitHub release page**

---

### Task 8: Verification & Final Report

- [ ] **Step 1: Run `pnpm typecheck`**
- [ ] **Step 2: Run `pnpm vitest run`**
- [ ] **Step 3: Run `cargo check --manifest-path src-tauri/Cargo.toml`**
- [ ] **Step 4: Prepare final report with root cause, modified files, verification output, remaining risks, and next-step recommendations**
