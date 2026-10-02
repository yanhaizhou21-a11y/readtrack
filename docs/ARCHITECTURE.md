# ARCHITECTURE — ReadTrack

## 1. Diagram layer
```text
┌─────────────────────────── WebView (React + TS) ───────────────────────────┐
│ routes · features/* · components · Zustand (UI state only)                  │
│ PDF.js (render) · TipTap read-only (rich render) · Zod (validate IPC)       │
└───────────────┬─────────────────────────────────────┬──────────────────────┘
        invoke() │ typed commands            events ▲  │ custom protocol rt://
┌───────────────▼─────────────────────────────────────┴──────────────────────┐
│ Rust (Tauri 2)                                                              │
│ commands  → thin: validate input, call service, map error                   │
│ services  → business rules (import, tracker, export, search, reminder)      │
│ repositories → SQL via sqlx (only layer that touches DB)                    │
│ parsers · exporters · storage · models · errors · utils                     │
└───────────────┬──────────────────────────────┬─────────────────────────────┘
                │                              │
        SQLite (database.sqlite)       Filesystem (library/, exports/)
```

## 2. Struktur folder
```text
readtrack/
├── AGENTS.md
├── docs/
├── public/                   # font (self-hosted), ikon, ilustrasi
├── src/
│   ├── app/                  # providers, router, bootstrap, error boundary
│   ├── components/           # ui/ (shadcn), layout/, feedback/ (Empty, Error, Loading)
│   ├── features/
│   │   ├── home/ library/ reader/ tracker/ bookmarks/ notes/ search/ export/ settings/
│   │   └── <feature>/{components,hooks,api.ts,store.ts,types.ts}
│   ├── hooks/
│   ├── stores/               # ui.store, reader.store (ephemeral)
│   ├── lib/                  # ipc.ts (invoke wrapper+zod), pdf/, format.ts, i18n/
│   ├── types/                # DTO TS (cocok API_CONTRACT)
│   └── routes/
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/         # permission minimal
    ├── migrations/           # 0001_init.sql, ...
    └── src/
        ├── lib.rs            # setup, plugin, state, register commands (only wiring)
        ├── commands/         # document.rs reading.rs bookmark.rs highlight.rs note.rs
        │                     # search.rs export.rs reminder.rs settings.rs
        ├── services/         # import_service, library_service, tracker_service,
        │                     # position_service, search_service, export_service, reminder_service
        ├── repositories/     # document_repo, section_repo, segment_repo, progress_repo,
        │                     # session_repo, bookmark_repo, highlight_repo, note_repo,
        │                     # reminder_repo, settings_repo, search_repo
        ├── models/           # entity + dto + position
        ├── parsers/          # mod.rs(trait+registry) pdf docx rtf txt markdown epub
        ├── exporters/        # xlsx/ pdf/
        ├── storage/          # paths, file_store (copy+hash stream), protocol handler
        ├── db/               # pool, migrate, tx helper
        ├── errors/           # AppError + IPC serialization
        └── utils/            # time, hash, text (word count), sanitize
```

## 3. Keputusan teknis (ADR ringkas)

| ID | Keputusan | Alasan |
|---|---|---|
| A1 | Rust pegang semua logika bisnis, termasuk tracker | Testable, aman, UI tipis |
| A2 | `sqlx` + SQLite, WAL, `foreign_keys=ON`, migrasi `sqlx::migrate!` | Kompatibel mobile, tipe kuat |
| A3 | ID UUID v4 TEXT; waktu INTEGER ms UTC | Portabel, mudah diurut |
| A4 | File asli di `library/documents/<id>.<ext>` | Hindari BLOB besar |
| A5 | Hash BLAKE3 (stream) untuk duplicate detection; simpan sebagai hex | Cepat di mobile |
| A6 | Dokumen dilayani ke WebView via custom URI scheme `rt://doc/<document_id>` dengan HTTP Range | PDF.js baca per-range, tanpa base64, tanpa akses FS bebas. Handler cari path dari DB berdasar id |
| A7 | Rich-text diparse di Rust → `NormalizedDocument` JSON → disimpan per section → React render via TipTap read-only schema | Semantic terjaga, posisi stabil, format-agnostik |
| A8 | PDF: Rust ekstrak metadata (`lopdf`: page count, title, author). Teks per halaman untuk FTS diindeks oleh PDF.js di web worker lalu dikirim batch ke `document_index_pages` | Hindari engine PDF native berat di mobile. Rust validasi + simpan |
| A9 | Satu abstraksi `DocumentModel` + `LogicalPosition` untuk semua format | Tracker & anotasi seragam |
| A10 | Tracker hitung di Rust; React kirim *viewport events* ringkas (batched ≥1 dtk) | Tidak ada write per scroll |
| A11 | Search: SQLite FTS5 satu tabel virtual untuk semua jenis | Sederhana, cepat, snippet native |
| A12 | Export dijalankan di `tokio::task::spawn_blocking`, progres via event | UI tidak blok |
| A13 | Reminder pakai `tauri-plugin-notification` (schedule lokal) | Native, offline |
| A14 | Tidak ada network. CSP ketat, `connect-src 'none'` kecuali `ipc:` dan `rt:` | Jaminan offline & aman |

## 4. Alur data

### 4.1 Import
```text
UI: dialog.open() → file URI
 → command document_import(source)
   → ImportService:
     1 validate ext + magic bytes (jangan percaya ekstensi saja)
     2 stream copy ke library/documents/tmp-<uuid> sambil hitung BLAKE3 + size   [emit 0–25%]
     3 cek duplikat by hash → jika ada & !on_duplicate: return DuplicateDocument{existing_id}
     4 parser = registry.for(file_type); parser.metadata()                        [emit 25–40%]
     5 parser.parse() → NormalizedDocument (sections + blocks) / PDF: page stubs  [emit 40–80%]
     6 tx: insert document, sections, segments(unread), progress(init), FTS rows  [emit 80–95%]
     7 rename tmp → <id>.<ext>; thumbnail (PDF hlm 1 oleh frontend → document_save_thumbnail; rich: cover EPUB / tanpa)
     8 emit 100% → return DocumentSummary
 gagal di langkah mana pun → rollback tx + hapus file tmp
```
Resolusi duplikat: `Open existing` (navigasi), `Replace` (hapus dokumen lama beserta data → import ulang; progres lama hilang, konfirmasi di UI), `Cancel` (hapus tmp).

### 4.2 Buka dokumen & resume
```text
document_get(id) → metadata + progress
PDF:  PDF.js getDocument({url:'rt://doc/<id>'}) → goto progress.page + offset
Rich: document_get_sections(id, range) lazy → render → resolve LogicalPosition (section→block→offset)
      fallback: nearest valid (lihat DOCUMENT_MODEL.md §4)
reading_start_session(id) → session_id
```

### 4.3 Tracking
```text
Reader (tiap ~1s batch) → reading_report_viewport({session_id, visible:[{segment_index,visible_ratio}], position, ts})
 → TrackerService (in-memory accumulator per session)
 → flush ke DB tiap 5 dtk, saat pause/background, saat tutup reader, dan end_session
 → emit reading_progress_updated
```
Detail algoritma: `TRACKER_SPEC.md`.

### 4.4 Export
`export_xlsx` / `export_pdf` → service kumpulkan data via repo → exporter tulis ke `exports/` → emit progress → return path → UI buka share/save.

## 5. Storage layout (app data dir)
```text
<app_data>/
├── database.sqlite (+ -wal, -shm)
├── library/
│   ├── documents/<document_id>.<ext>
│   ├── thumbnails/<document_id>.webp
│   └── cache/                  # boleh dihapus kapan saja (setting "Clear cache")
└── exports/
```
Path di DB disimpan **relatif** terhadap `<app_data>`. Resolve + canonicalize + pastikan tetap di bawah root (anti path traversal).

## 6. Frontend state
- Zustand: `ui.store` (theme, reader chrome visible, zoom, modal aktif, filter, sort, view mode), `reader.store` (ephemeral: posisi live, toolbar). Tidak ada data entitas penuh.
- Data entitas: ambil via command, cache ringan dengan TanStack Query (opsional) atau hook sederhana; invalidasi dari event `reading_progress_updated`.
- Setting persist ke `app_settings` via command, bukan localStorage.

## 7. Routing (React Router)
```text
/                    Home
/library             Library
/library/:id         Document detail
/read/:id            Reader (PDF/Rich dipilih dari file_type)
/tracker             Tracker overview
/tracker/:id         Reading map dokumen
/search              Search global
/annotations         Bookmarks | Highlights | Notes (tab)
/settings            Settings (+ /settings/reminders, /settings/export)
```
Android back: stack-aware; di Reader tutup panel/sheet dulu, baru keluar. Gunakan hardware back event Tauri.

## 8. Tauri plugin yang dipakai
`dialog` (file picker), `fs` (hanya untuk baca source URI saat import, scope minimal), `notification`, `opener`/share (export), `log`. Capability file di `src-tauri/capabilities/` — izinkan minimum. Frontend **tidak** diberi `fs:*` luas.

## 9. Native exceptions (isi bila perlu)
Catat di sini setiap kode Kotlin/Swift yang terpaksa ditambah: alasan, API, batas. Kandidat: share sheet file hasil export, open-with/share intent (import dari app lain), URI permission persist.

## 10. Observability
`tracing` + `tauri-plugin-log` ke file rotasi di app data. Level `info` rilis, `debug` dev. Jangan log isi dokumen atau teks highlight.
