<div align="center">

**English** · [Bahasa Indonesia](README_id.md)

# ReadTrack

### Mobile-first, local-first document reader and interactive reading tracker.

**Read your documents privately. Measure your actual reading time without cloud surveillance.**

[![License: MIT](https://img.shields.io/badge/License-MIT-f4c430?style=flat-square)](LICENSE)
[![Tauri 2](https://img.shields.io/badge/Tauri-v2-24c8db?style=flat-square&logo=tauri&logoColor=white)](https://v2.tauri.app)
[![Rust 2021](https://img.shields.io/badge/Rust-2021-e43716?style=flat-square&logo=rust&logoColor=white)](src-tauri/)
[![SQLite WAL](https://img.shields.io/badge/SQLite-WAL_Mode-003b57?style=flat-square&logo=sqlite&logoColor=white)](docs/DATABASE.md)
[![React 18](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=black)](src/)
[![Tests Passing](https://img.shields.io/badge/Tests-259_passing-10b981?style=flat-square)](docs/TESTING.md)
[![Local-First](https://img.shields.io/badge/Privacy-100%25_Offline-8b5cf6?style=flat-square)](#local-first-guarantees)

**[Quick start](#quick-start) · [How ReadTrack works](#how-readtrack-works) · [What you can read](#what-you-can-read) · [Showcases](#showcases) · [FAQ](#faq) · [Documentation](#documentation)**

<code>pnpm tauri dev</code> &nbsp;&nbsp;|&nbsp;&nbsp; <code>adb install -r dist-apk/readtrack-arm64-debug.apk</code>

<br /><br />

<img src="docs/assets/readtrack-architecture.svg" alt="ReadTrack architecture overview" width="100%" />

<br /><br />

<table aria-label="ReadTrack core pledge">
<tr>
<td align="center" width="800">
  <strong>The 100% Local-First Promise</strong><br />
  <sub>Zero accounts · Zero analytics · Zero telemetry telemetry uploads · 100% offline persistence on your device</sub>
</td>
</tr>
</table>

<br />

</div>

---

Reading apps frequently demand cloud accounts, track every page turn on external analytics servers, and fail when your device loses internet connectivity.

ReadTrack runs completely on your own device. It combines a multi-format document reader with an active reading telemetry engine that measures your real reading velocity while filtering out idle pauses. All book files, reading logs, highlights, and reminder configurations are stored in an embedded SQLite database and local application storage.

## Quick start

### Prerequisites

- Node.js 20 or higher, with pnpm installed
- Rust stable toolchain (`rustup default stable`)
- Platform webview: WebView2 (Windows default), WebKitGTK (Linux), or Xcode CLI (macOS)
- Android Studio with SDK Platform 34 and NDK (optional, for Android development)

### Run on Desktop

Install frontend dependencies and launch the desktop development shell:

```bash
pnpm install
pnpm tauri dev
```

### Install on Android

#### Option A: Install the prebuilt APK

If you have an Android device or emulator with USB debugging enabled:

```bash
adb install -r dist-apk/readtrack-arm64-debug.apk
```

#### Option B: Run the Android dev loop

```bash
pnpm tauri android dev
```

### Verify test suites

ReadTrack contains 259 automated tests covering both frontend UI and Rust engine:

```bash
# Frontend checks (172 Vitest tests, ESLint, TypeScript)
pnpm typecheck
pnpm lint
pnpm test

# Backend checks (87 Rust tests, Clippy linting, formatting)
cd src-tauri
cargo test
cargo clippy -- -D warnings
cargo fmt --check
```

---

## How ReadTrack works

ReadTrack separates UI rendering from core business logic using Tauri 2 IPC boundaries. The React frontend handles user interactions and view rendering, while the Rust engine acts as the security boundary, handles parsing, runs the reading state machine, and persists data.

<img src="docs/assets/readtrack-telemetry-flow.svg" alt="ReadTrack reading telemetry state flow" width="100%" />

### The Reading Detection Pipeline

1. **User Interaction**: When you scroll, turn a page, or interact with a book, the reader emits lightweight viewport events (visible page index, character offsets).
2. **Idle Filtering Guard**: The tracker monitors active duration. If you leave the screen open without interaction for longer than 45 seconds, the engine automatically pauses the active session so idle time is never counted as reading time.
3. **Velocity Calculation**: Pure reading time is combined with word counts to calculate your genuine reading speed in words per minute (WPM).
4. **Debounced Persistence**: Telemetry updates are buffered in memory and written to SQLite in throttled batches, eliminating disk thrash and battery drain during fast reading.

---

## What you can read

ReadTrack standardizes all supported formats into a unified `LogicalPosition` representation:

| Format | Parsing Engine | Progress Measurement | Key Capabilities |
|---|---|---|---|
| **PDF** | PDF.js | Page index, scroll offset | Text selection, canvas rendering, zoom controls, outline navigation, highlights |
| **EPUB** | Quick-XML + Custom Rust Spine | Word-weighted chapter progress | Normalized chapters, font scaling, table of contents, bookmarks |
| **Markdown** | Pulldown-Cmark + TipTap | Heading anchors, block offsets | Structured headings, code blocks, blockquotes, reading time estimates |
| **Plain Text** | Native Rust Chunk Parser | Character and paragraph offsets | Chunked paragraph view, word count estimation, fast offset indexing |

---

## Local-first guarantees

- **Binary storage**: Imported files are verified, hashed with Blake3 for deduplication, and stored in the local application data directory. Files are never stored as database BLOBs.
- **Persistent single source of truth**: SQLite with Write-Ahead Logging (WAL) and foreign keys enabled handles all persistent data. Ephemeral UI state (Zustand) is never mirrored as persistent storage.
- **No artificial delays or fake progress**: All stats and reading velocity calculations reflect real database timestamps and word count metrics.

---

## Showcases

### 1. Active Reading Telemetry vs Screen Idling

Most reading apps track simple timers: if you leave a document open while taking a phone call, your reading stats show hours of fake reading. 

ReadTrack implements a dual-timer state machine. Segments shorter than 10 seconds are treated as transient glances, while periods of inactivity exceeding 45 seconds pause the active session. When you return, the session resumes cleanly, ensuring your calculated Words Per Minute (WPM) and daily reading totals reflect actual focused reading.

### 2. Battery-Friendly SQLite Batching

Frequent database writes on every pixel of a scroll gesture can cause UI stutter and drain mobile batteries. 

ReadTrack buffers telemetry events in an in-memory ring buffer. Updates are flushed to SQLite in debounced batches during natural pauses or chapter transitions. This keeps disk writes throttled while guaranteeing zero telemetry loss on sudden application exit.

### 3. Native Multi-Sheet Excel Reports from Rust

Many applications export data as comma-separated values (CSV) and rename the file extension to `.xlsx`. 

ReadTrack generates genuine binary Excel workbooks directly from Rust using `rust_xlsxwriter`. The exported workbook contains multiple structured sheets:
- **Overview Sheet**: Key reading statistics, total reading time, and reading streak count.
- **Library Catalog**: Complete book list, file sizes, format types, and completion percentages.
- **Reading Sessions Log**: Raw session timestamps, word counts, and calculated velocity metrics.

---

## FAQ

<details>
<summary><strong>Does ReadTrack connect to any external server or API?</strong></summary>

No. ReadTrack makes zero network requests. There are no remote API endpoints, no third-party telemetry collectors, and no account servers. It functions with complete capability in airplane mode.

</details>

<details>
<summary><strong>Where are my book files and annotations stored?</strong></summary>

All book files are stored in your device's standard application data directory, referenced by their Blake3 content hash. All reading logs, bookmarks, highlights, and reminder settings are stored locally in an embedded SQLite database (`readtrack.db`).

</details>

<details>
<summary><strong>How do habit reminders work without cloud push notifications?</strong></summary>

ReadTrack schedules reminder alerts locally using the native OS notification system through Tauri plugins. The schedule calculation runs in Rust, handling local timezone shifts, Daylight Saving Time (DST), and quiet-hour suppression entirely on device.

</details>

<details>
<summary><strong>How do I install ReadTrack on my Android device?</strong></summary>

You can install the ready-to-use debug package using Android Debug Bridge (ADB):

```bash
adb install -r dist-apk/readtrack-arm64-debug.apk
```

Alternatively, you can build an release APK from source using `pnpm tauri android build --apk`.

</details>

<details>
<summary><strong>Why does ReadTrack use Rust for core logic instead of TypeScript?</strong></summary>

Rust serves as the security boundary for processing untrusted documents (PDF, EPUB, Markdown). Performing parsing, hashing, state machine transitions, and database operations in native Rust ensures high performance, memory safety, and minimal battery consumption on mobile hardware.

</details>

<details>
<summary><strong>Can I export or backup my reading data?</strong></summary>

Yes. ReadTrack provides two export methods:
1. **Spreadsheet & PDF Export**: Native multi-sheet Excel workbooks (`.xlsx`) and printable summary reports (`.pdf`).
2. **Raw Database Backup**: Complete JSON export of all database tables for personal backup or migration.

</details>

---

## Documentation

Full architectural specifications and implementation guides are available in the `docs/` directory:

- [Product Requirements (PRD)](docs/PRD.md): Goals, user stories, and acceptance criteria.
- [Architecture](docs/ARCHITECTURE.md): System layers, IPC contracts, and security boundaries.
- [Database Schema](docs/DATABASE.md): SQLite table definitions, indices, and migration history.
- [Document Model](docs/DOCUMENT_MODEL.md): `LogicalPosition` normalization and parser traits.
- [Reading Tracker Specification](docs/TRACKER_SPEC.md): Active vs idle detection algorithms.
- [API Contract](docs/API_CONTRACT.md): Tauri commands, events, and typed DTO schemas.
- [Design Tokens](docs/DESIGN.md): Typography, color palettes, and mobile gesture rules.
- [Security Model](docs/SECURITY.md): Threat vectors and untrusted input guidelines.
- [Test Strategy](docs/TESTING.md): Test matrices, test fixtures, and verification requirements.
- [Roadmap](docs/ROADMAP.md): Implementation checklist across all 8 development phases.

---

## Contributing

Contributions are welcome. Before submitting changes, please verify that your code adheres to project standards:

```bash
# Frontend validation
pnpm typecheck && pnpm lint && pnpm test

# Rust backend validation
cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check
```

---

## License

ReadTrack is open-source software licensed under the [MIT License](LICENSE).
