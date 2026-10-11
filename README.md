# ReadTrack

ReadTrack is a mobile-first, local-first document reader and reading tracker built for Android and desktop. It runs completely offline with zero cloud dependencies, zero external analytics, and no mandatory user accounts.

All document binaries, reading logs, annotations, and statistics remain strictly on your local device.

---

## Key Capabilities

### Multi-Format Reader
- **PDF**: Page navigation, zoom controls, outline navigation, bookmarking, and text highlights powered by PDF.js.
- **EPUB**: Clean chapter rendering, spine navigation, font customization, and word-weighted progress calculation.
- **Markdown**: Formatted rendering with TipTap and CommonMark parsing, supporting headings, lists, code blocks, and blockquotes.
- **Plain Text**: Chunked paragraph rendering with character offset tracking and reading time estimation.

### Reading Telemetry Engine
- **Active vs Idle Detection**: Built-in state machine that measures active reading while filtering out idle pauses (45-second inactivity timeout, 10-second minimum reading segment).
- **Normalized Position**: A unified `LogicalPosition` format across all file types (percentage, chapter index, inner offset).
- **Reading Velocity**: Calculates real-time and aggregate reading speeds in words per minute (WPM).
- **Reading Map**: Calendar heatmap and chapter timeline visualizing daily reading duration and completed sessions.
- **Throttled Persistence**: Telemetry is buffered in memory and written to SQLite in debounced batches to prevent disk saturation during continuous scrolling.

### Offline Reminders & Habits
- **Local Scheduling**: Habit alerts calculated directly in Rust with timezone and Daylight Saving Time (DST) awareness.
- **Quiet Hours**: Automatically suppresses notifications during configured rest periods.
- **Contextual Notifications**: Alerts include details about the last active book, current chapter, and overall progress percentage.
- **Native Delivery**: Uses system notification channels via Tauri plugins without third-party push services.

### Reports & Data Portability
- **Excel Workbooks**: Multi-sheet spreadsheets generated natively in Rust with `rust_xlsxwriter` (no CSV files renamed as `.xlsx`). Sheets include summary metrics, book catalogs, and raw session logs.
- **PDF Reports**: Clean, printable summary reports generated with `printpdf`.
- **JSON Backup**: Full database export and import for complete data ownership.

### Accessible, Human-Centered Interface
- **Bilingual Support**: Instant switching between English (`en`) and Bahasa Indonesia (`id`) with a zero-dependency translation dictionary.
- **Tactile Haptics**: Subtle vibrations for bookmark toggles, highlights, and chapter completions via the Web Vibration API.
- **Virtualization**: Custom windowed grid (`VirtualGrid`) capping active DOM nodes under 30 even with libraries exceeding 1,000 items.
- **Accessibility Standards**: Minimum 44x44px touch targets, WCAG AA color contrast ratios, full keyboard navigation, and reduced-motion support.

---

## Architecture & Principles

ReadTrack strictly separates UI presentation from core business logic:

```
[ React 18 / Tailwind / Zustand ] (UI Presentation & Gesture Layer)
               |
         Tauri 2 IPC (Type-safe commands & events)
               |
       [ Rust Application ] (Security boundary, Parsers, State Machines)
         /           \
   [ SQLite / WAL ]   [ Local Filesystem ]
  (Persistent Data)   (Document Binaries)
```

1. **Rust as the Security Boundary**: Untrusted input (external files, user documents, deep links) is validated, hashed, and processed in Rust before reaching the webview.
2. **SQLite as the Single Source of Truth**: All persistent state resides in an embedded SQLite database configured with Write-Ahead Logging (WAL) and foreign keys enabled. State libraries in React (Zustand) manage only ephemeral UI state.
3. **Filesystem Document Storage**: Document files are stored in the application data directory referenced by Blake3 content hashes. Files are never stored as database BLOBs.
4. **No Artificial Delays or Mock Data**: All operations read from and write to real local storage with real parsers and real calculations.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend Framework** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| **Reader Engines** | PDF.js (PDF), TipTap / ProseMirror (Markdown & Text) |
| **Desktop / Mobile Shell** | Tauri 2 |
| **Backend & Core Logic** | Rust 2021, Tokio, Serde, Thiserror, Tracing |
| **Database** | SQLite via SQLx (migrations, WAL mode, foreign keys) |
| **Document Processing** | Blake3, Quick-XML, Pulldown-Cmark |
| **Report Generation** | `rust_xlsxwriter` (Excel), `printpdf` (PDF) |
| **Testing** | Vitest, React Testing Library, Cargo Test, Clippy |

---

## Getting Started

### Prerequisites

- **Node.js**: Version 20 or higher
- **pnpm**: Version 9 or higher
- **Rust**: Stable toolchain (`rustup default stable`)
- **System Webview**:
  - Windows: WebView2 (installed by default on Windows 10/11)
  - Linux: `webkit2gtk-4.1` and build essentials
  - macOS: Xcode Command Line Tools

For Android development:
- **Android Studio** with Android SDK Platform 34 and NDK
- **Java Development Kit (JDK)** 17

---

### Running on Desktop

1. Clone the repository and install frontend dependencies:
   ```bash
   pnpm install
   ```

2. Run the desktop application in development mode:
   ```bash
   pnpm tauri dev
   ```

---

### Installing on Android

#### Option A: Installing the Prebuilt APK

If you have an Android device or emulator running with USB debugging enabled:

```bash
adb install -r dist-apk/readtrack-arm64-debug.apk
```

#### Option B: Running Android Development Loop

```bash
pnpm tauri android dev
```

#### Option C: Building Android APK from Source

```bash
pnpm tauri android build --apk
```

The output APK will be placed in `src-tauri/gen/android/app/build/outputs/apk/`.

---

## Testing & Code Quality

ReadTrack maintains strict verification standards across both frontend and backend codebases.

### Frontend Verification

Run type checking, linter, and unit test suites (172 Vitest tests):

```bash
pnpm typecheck
pnpm lint
pnpm test
```

### Rust Verification

Run unit tests, clippy checks, and formatting checks (87 Rust tests):

```bash
cd src-tauri
cargo test
cargo clippy -- -D warnings
cargo fmt --check
```

---

## Project Structure

```
readtrack/
├── docs/                       # Technical architecture and feature specifications
│   ├── ARCHITECTURE.md         # Layering, security boundaries, and decisions
│   ├── DATABASE.md             # SQLite schema, indices, and migration history
│   ├── DOCUMENT_MODEL.md       # LogicalPosition, normalization, and parsers
│   ├── TRACKER_SPEC.md         # Active reading state machine and velocity rules
│   ├── API_CONTRACT.md         # IPC commands, payloads, and DTO contracts
│   ├── DESIGN.md               # Design tokens, screen specifications, and typography
│   ├── SECURITY.md             # Threat model and input sanitation policies
│   ├── TESTING.md              # Test matrix, fixtures, and verification requirements
│   └── ROADMAP.md              # Implementation phase checklists (Phases 1 to 8)
├── dist-apk/                   # Built Android packages
│   └── readtrack-arm64-debug.apk
├── src/                        # React frontend
│   ├── app/                    # Application root and route configuration
│   ├── components/             # Reusable UI primitives, dialogs, and VirtualGrid
│   ├── features/               # Domain screens (library, reader, tracker, export, settings)
│   ├── hooks/                  # Custom React hooks (reading tracker, debounce, gestures)
│   ├── i18n/                   # Bilingual dictionary (English and Indonesian)
│   ├── lib/                    # Haptics, date formatting, and utilities
│   ├── stores/                 # Ephemeral UI state (navigation, reader theme, active tool)
│   └── types/                  # TypeScript interfaces and Zod validation schemas
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── commands/           # Thin Tauri IPC command handlers
│   │   ├── services/           # Core business logic (tracker, reminders, import, export)
│   │   ├── repositories/       # SQLite query abstractions and SQLx operations
│   │   ├── models/             # Rust data structures and DTOs
│   │   └── lib.rs              # Tauri builder initialization and plugin setup
│   ├── migrations/             # Incremental SQL migration scripts
│   └── Cargo.toml              # Rust crate dependencies
├── package.json
└── README.md
```

---

## Technical Specifications

Detailed design documents are available in the `docs/` directory:

- [Product Requirements](docs/PRD.md)
- [Architecture & Layering](docs/ARCHITECTURE.md)
- [Database Schema & Migrations](docs/DATABASE.md)
- [Document Model & Parsers](docs/DOCUMENT_MODEL.md)
- [Reading Tracker Specification](docs/TRACKER_SPEC.md)
- [IPC API Contract](docs/API_CONTRACT.md)
- [Design Tokens & UI Guidelines](docs/DESIGN.md)
- [Security & Threat Model](docs/SECURITY.md)
- [Test Strategy & Test Matrix](docs/TESTING.md)
- [Implementation Roadmap](docs/ROADMAP.md)

---

## License

This project is open-source under the MIT License.
