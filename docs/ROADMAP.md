# ROADMAP — ReadTrack (urutan eksekusi agent)

Kerjakan urut. Centang `[x]` saat selesai **dan** lolos Definition of Done (`AGENTS.md`). Jangan mulai fase berikut sebelum exit criteria fase ini terpenuhi.

## Phase 1 — Foundation
- [ ] Scaffold Tauri 2 + React + TS + Vite (`pnpm create tauri-app`), pnpm, strict TS, ESLint, Prettier
- [ ] Tailwind + shadcn/ui + Lucide; `tokens.css` sesuai `DESIGN.md`; font lokal
- [ ] Zustand `ui.store`; React Router; layout bottom nav + safe area; halaman placeholder *yang berfungsi sebagai shell* (bukan data palsu)
- [ ] Inisialisasi Android (`pnpm tauri android init`) dan iOS (di macOS); jalan di emulator
- [ ] Rust skeleton folder (commands/services/repositories/models/parsers/exporters/storage/db/errors/utils)
- [ ] `AppError` + `IpcError` + serialisasi; `tracing` + log plugin
- [ ] `db::pool` (WAL, FK), `sqlx::migrate!`, `0001_init.sql`, `0002_search.sql` dari `DATABASE.md`
- [ ] `storage::paths` (app data dir, buat `library/*`, `exports/`), canonicalize helper
- [ ] `lib/ipc.ts` wrapper + Zod; command `settings_get_all`/`settings_set` end-to-end (bukti jalur penuh)
- [ ] CSP ketat + capability minimal
- [ ] Test: migrasi, FK cascade, settings
**Exit:** app jalan di Android emulator, settings tersimpan di SQLite, semua gerbang CI hijau.

## Phase 2 — Library
- [ ] `FileStore`: stream copy + BLAKE3 + validasi magic bytes + batas ukuran
- [ ] `ParserRegistry` + parser TXT & Markdown dulu (cepat) → `NormalizedDocument`
- [ ] `ImportService` (§ARCHITECTURE 4.1) + event progres + rollback
- [ ] Segment generator (`TRACKER_SPEC §2`) + insert sections/segments/progress + FTS content
- [ ] `document_import/list/get/rename/archive/delete/touch` + `rt://thumb`
- [ ] UI: Library (list/grid, sort, filter, search judul), Import sheet, dialog duplikat, modal hapus, Document detail
- [ ] Empty/error/loading states Library
- [ ] Parser PDF metadata (`lopdf`), DOCX, RTF, EPUB (masing-masing + fixture + test)
- [ ] File picker Android (`content://`) & iOS terbukti; catat "Native exceptions" bila perlu
- [ ] Test import (valid/korup/unsupported/duplikat), parser per format
**Exit:** import 6 format dari device nyata, duplikat ditangani, hapus bersih (DB+file).

## Phase 3 — Reader
- [ ] `rt://doc/<id>` dengan Range
- [ ] PDF reader: PDF.js worker, render lazy + virtualisasi (≤ ±3 halaman aktif), zoom, fit width/page, jump page, indikator, TOC, search teks, dark/sepia, fullscreen, tap toggle toolbar
- [ ] PDF indexing: worker ekstrak teks → `document_index_pages` batch; `index_status`
- [ ] Rich reader: `document_get_sections` lazy, render TipTap read-only schema, virtualisasi section, Appearance sheet, reading themes
- [ ] Posisi: `LogicalPosition`, `reading_update_progress` (debounce), `document_resolve_position`, restore + fallback
- [ ] TOC UI, Continue Reading dari Home (versi awal)
- [ ] Back handling Android, gesture tanpa konflik
- [ ] Test: resolve position (semua cabang), restore roundtrip, hook restore
**Exit:** buka tiap format, baca nyaman, tutup/buka → posisi pulih. PDF 500 hlm mulus.

## Phase 4 — Tracker
- [ ] `TrackerService` murni + state machine + akumulator (`TRACKER_SPEC §4–9`)
- [ ] `reading_start_session/report_viewport/end_session`, flush throttled, crash recovery
- [ ] Hook `useViewportReporter` (reading zone, IntersectionObserver / PDF page visibility), idle & foreground detection
- [ ] `tracker_get_map`, `tracker_get_overview`, `home_get_dashboard`, event `reading_progress_updated`
- [ ] UI: Home dashboard, Tracker tab, Reading map (spine, ChapterBar, ring), kartu info segmen, Continue Reading dari map, Sessions & Activity
- [ ] `reading_mark_completed/unread`
- [ ] Empty states Tracker/Home
- [ ] Test semua butir `TRACKER_SPEC §11`
**Exit:** scroll cepat ≠ read; ch1=100% / ch2=63% / ch3=0% tampil nyata di dashboard; sesi tercatat.

## Phase 5 — Annotations
- [ ] Repo + service + command bookmark/highlight/note (CRUD penuh) + excerpt generator
- [ ] Rich: seleksi teks → `SelectionToolbar` (Highlight, Add Note, Copy), render highlight overlay dari posisi
- [ ] PDF: seleksi dari text layer → posisi (page + offset teks) → highlight overlay
- [ ] Bookmark UI (tombol toolbar, daftar, edit, swipe delete+undo)
- [ ] Search global lengkap (FTS5: dokumen, konten, notes, highlights, bookmarks), UI hasil + lompat + sorot
- [ ] Empty states anotasi & search
- [ ] Test CRUD, FTS update saat anotasi berubah, lompat posisi
**Exit:** anotasi persisten setelah restart; search klik → posisi tepat + sorot.

## Phase 6 — Export
- [ ] `export_xlsx` (`rust_xlsxwriter`): 7 sheet, format header/lebar/tanggal/persen/tabel/freeze/autofilter, formula ringkasan
- [ ] `export_pdf` (`printpdf`): layout helper (halaman, heading, tabel sederhana, bar progres), embed font, ringkasan + per dokumen + chapter progress + activity + bookmarks/highlights/notes
- [ ] `spawn_blocking` + event `export_progress`
- [ ] `export_share` (share sheet/save dialog); tulis plugin native kecil bila diperlukan
- [ ] UI Export (pilih semua/dokumen), progres, hasil + bagikan
- [ ] Test: buka ulang XLSX, struktur PDF, 0 & banyak dokumen
**Exit:** file `.xlsx` valid di Excel/Sheets, PDF profesional dan terbaca, bisa dibagikan dari device.

## Phase 7 — Reminders
- [ ] `reminder_*` CRUD + service jadwal (daily/weekdays/custom/once)
- [ ] `tauri-plugin-notification` jadwal lokal; izin runtime; `reminder_sync_notifications` saat start/ubah
- [ ] Isi notifikasi: dokumen terakhir + bab + persen; tap → buka reader di posisi
- [ ] UI Reminder settings
- [ ] Test hitung waktu jadwal (zona waktu/DST)
**Exit:** notifikasi lokal muncul sesuai jadwal tanpa internet.

## Phase 8 — Polish
- [ ] Performa: profil startup (<2 dtk), list virtual, memoization, bundle size, PDF memori
- [ ] Animasi & haptic sesuai `DESIGN.md`; reduce motion
- [ ] Aksesibilitas (label, target, kontras, font scaling)
- [ ] i18n `en` + `id` lengkap
- [ ] Share/open-with import dari app lain (jika layak)
- [ ] Review semua error/empty/loading state
- [ ] Hardening keamanan (`SECURITY.md`), `cargo audit`
- [ ] Jalankan checklist manual `TESTING.md §5` di Android & iOS
- [ ] Build rilis (APK/AAB, IPA), ikon & splash, nama bundle
**Exit:** seluruh Acceptance Criteria PRD lolos; alur `install → import → read → track → close → reopen → resume → export XLSX → export PDF` mulus di Android & iOS.

## Backlog pasca-MVP
ODT, HTML, DOC, XLSX, PPTX · app lock biometrik · backup/restore lokal (zip) · statistik lanjut/goal harian · tablet 2 kolom · OCR PDF scan.
