# AGENTS.md — ReadTrack

Entry point untuk AI coding agent. Baca file ini dulu, lalu dokumen di `docs/` sesuai task.

## Produk singkat
ReadTrack = mobile local-first document reader + interactive reading tracker. Android + iOS. Tanpa cloud, tanpa akun, tanpa internet wajib.
Stack: Tauri 2 · React · TypeScript · Vite · Tailwind · shadcn/ui · Zustand · PDF.js · TipTap · Zod · Rust (sqlx/SQLite, tokio, serde, rust_xlsxwriter, printpdf).

## Peta dokumen
| File | Isi | Baca saat |
|---|---|---|
| `docs/PRD.md` | Tujuan, user stories, scope, acceptance criteria | Mulai fitur baru |
| `docs/ARCHITECTURE.md` | Layer, struktur folder, keputusan teknis, alur data | Hampir semua task |
| `docs/DATABASE.md` | Schema SQLite, migration SQL, index, FTS5, query penting | Task DB / repository |
| `docs/DOCUMENT_MODEL.md` | Normalized document model, LogicalPosition, parser trait | Parser / reader |
| `docs/TRACKER_SPEC.md` | Algoritma reading detection, state machine segment, sesi | Fitur tracker |
| `docs/API_CONTRACT.md` | Tauri commands, events, error types, DTO Rust+TS | Task IPC |
| `docs/DESIGN.md` | Design tokens, tipografi, screen spec, empty state, gesture | Task UI |
| `docs/SECURITY.md` | Threat model, aturan input untrusted | Import, render, IPC |
| `docs/TESTING.md` | Strategi test, fixture, minimal test per fitur | Sebelum selesai task |
| `docs/ROADMAP.md` | 8 fase + checklist task + exit criteria | Planning / urutan kerja |

## Aturan keras (jangan dilanggar)
1. Business logic di Rust. React hanya UI, presentasi state, gesture, visualisasi.
2. SQLite = sumber kebenaran data persisten. Zustand hanya UI state. Jangan mirror DB ke Zustand.
3. Dilarang: mock backend, fake API, dummy data sebagai implementasi inti, fake progress, fake parser, tombol tanpa fungsi, localStorage sebagai DB, CSV sebagai "Excel", placeholder `TODO` di jalur utama.
4. Frontend tidak boleh akses filesystem sembarang. Semua lewat Tauri command bertipe. Rust = security boundary.
5. Dokumen import = untrusted input. Lihat `docs/SECURITY.md`.
6. Binary dokumen disimpan di filesystem, bukan BLOB SQLite.
7. Tidak ada file Rust/TS raksasa. Batas lunak: 300 baris/file, 50 baris/fungsi.
8. Tulis tracker ke DB secara throttled/debounced. Tidak ada write per scroll event.
9. Mobile-first. Jangan desktop UI yang dikecilkan.
10. Semua teks user-facing lewat error/empty state yang manusiawi. Jangan bocorkan panic Rust / stack trace.
11. Tidak ada native Android/iOS code kecuali terbukti perlu (catat alasan di `docs/ARCHITECTURE.md` bagian "Native exceptions").

## Konvensi
- Rust: edition 2021, `cargo fmt`, `cargo clippy -- -D warnings`. Error: `thiserror` di lib, `anyhow` hanya di boundary startup. Logging: `tracing`.
- Layering Rust: `commands -> services -> repositories -> db`. Command tipis (validasi + delegasi). Service pegang aturan bisnis. Repository pegang SQL.
- TS: strict mode, no `any`. Zod untuk validasi respons IPC. Tipe di `src/types` harus cocok `docs/API_CONTRACT.md`.
- ID: UUID v4 string. Timestamp: INTEGER unix epoch milidetik UTC. Persen: REAL 0.0–1.0 di DB, tampil 0–100 di UI.
- Nama command: `snake_case` `<domain>_<verb>`.
- Commit kecil per sub-task. Pesan: `phase1: add sqlite migrations`.

## Definition of Done (per task)
- [ ] Kode jalan di Android emulator atau minimal `tauri dev` desktop untuk logika non-native
- [ ] `cargo test`, `cargo clippy`, `pnpm typecheck`, `pnpm test`, `pnpm lint` hijau
- [ ] Test sesuai `docs/TESTING.md` ditambah
- [ ] Error path ditangani (typed error, UI state)
- [ ] Loading / empty / error state ada
- [ ] Tidak ada tombol mati, tidak ada data palsu
- [ ] Checklist `docs/ROADMAP.md` diperbarui

## Command
```bash
pnpm install
pnpm tauri dev                 # desktop dev loop
pnpm tauri android dev         # Android
pnpm tauri ios dev             # iOS (macOS)
pnpm typecheck && pnpm lint && pnpm test
cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check
```

## Cara kerja agent
1. Ambil fase aktif dari `docs/ROADMAP.md`. Kerjakan urut, jangan loncat fase.
2. Sebelum coding, baca dokumen terkait. Jika spec ambigu, pilih opsi paling aman, tulis keputusan di `docs/DECISIONS.md` (buat jika belum ada), lanjut.
3. Selesaikan end-to-end per fitur (DB -> Rust -> command -> TS API -> UI -> test) sebelum fitur berikut.
4. Jangan berhenti setelah UI. Build + test + fix semua error.
