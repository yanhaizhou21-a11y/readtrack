# TESTING — ReadTrack

Alat: Rust `cargo test` (+ `tokio::test`, DB in-memory `sqlite::memory:`), frontend Vitest + React Testing Library. E2E manual checklist di §5 (opsional automasi Tauri WebDriver desktop).

## 1. Fixture (`src-tauri/tests/fixtures/`)
Buat file nyata kecil (jangan mock parser):
`valid.pdf` (3 hlm, ada outline) · `big.pdf` (generate ≥ 300 hlm) · `corrupt.pdf` · `sample.docx` (heading, list, tabel, gambar, bold/italic) · `sample.rtf` · `sample.txt` (UTF-8 + UTF-16) · `sample.md` · `sample.epub` (3 bab, NCX) · `fake.pdf` (ekstensi pdf, isi bukan pdf) · `unsupported.xyz` · `zipbomb.docx` (mini). Dokumentasikan asal di `fixtures/README.md`.

## 2. Rust
### Database
- Migrasi: DB kosong → latest; idempoten; versi tercatat.
- `foreign_keys` aktif; hapus dokumen → cascade ke sections/segments/progress/sessions/bookmarks/highlights/notes.
- Insert/update/delete tiap repo; transaksi rollback saat error di tengah import.
- FTS5 tersedia; index + query + snippet; hapus dokumen membersihkan index.
- Unique `content_hash`.

### Import
- PDF valid → dokumen + sections + segments unread + progress init.
- PDF korup → `InvalidDocument`/`ParseFailed`, tidak ada sisa file/baris.
- `fake.pdf` → ditolak (magic bytes).
- Format tak didukung → `UnsupportedFormat`.
- Duplikat → `DuplicateDocument{existing_id}`; `replace` menghapus lama lalu impor baru; `open_existing` tidak membuat baris baru.
- Zip bomb / entry `../` ditolak.
- Event progres naik monoton 0→100.

### Parser (per format)
Struktur benar (heading level, list, tabel, marks), word_count > 0, TOC terbentuk, link berbahaya (`javascript:`) dibuang, gambar diekstrak/di-skip aman, encoding TXT.

### Position / Reader
- `resolve()` untuk semua cabang fallback (§DOCUMENT_MODEL 4).
- Roundtrip: simpan → restart (reopen pool) → pulihkan posisi sama.
- `linear_pos` PDF & rich benar dan monoton.

### Tracker (lihat `TRACKER_SPEC §11`)
Scroll cepat ≠ read · threshold dwell · idle tidak dihitung · jump TOC tidak skipped · skipped→read · progress berbobot kata (ch1=100%, ch2=63%, ch3=0%) · completed ≥ 0.98 · sesi: durasi/aktif/posisi, noise dibuang, crash recovery · flush throttle (≤2 tx per 100 laporan/5 s) · `reading_mark_unread` reset.

### Export
- XLSX: file valid dibuka ulang (`calamine` di dev-dependency) → sheet persis: Overview, Documents, Reading Sessions, Reading Progress, Bookmarks, Highlights, Notes; header, tipe tanggal/persen, freeze pane, autofilter ada; formula ringkasan benar; nama file `ReadTrack-Report-YYYY-MM-DD.xlsx`.
- PDF: file diawali `%PDF-`, jumlah halaman > 0, teks kunci hadir (cek via `lopdf`/ekstraksi), tidak crash pada 0 dokumen & 500 dokumen.
- Export tidak menulis di luar `exports/`.

### Keamanan
Path traversal id/protocol · validasi input command (batas panjang/enum) · `rt://` hanya melayani id valid.

## 3. Frontend
- `ipc.ts`: Zod menolak respons salah bentuk; error dipetakan.
- Komponen: `EmptyState` (tiap varian + aksi), `ErrorState`, `DocCard`, `ReadingSpine` (status → kelas), `ChapterBar`, dialog duplikat, modal hapus (tidak menghapus tanpa konfirmasi).
- Hook tracker: throttle laporan viewport (≥1 s), tidak kirim saat tidak berubah.
- Store: Zustand hanya UI state (tidak berisi entitas penuh).
- Restore position hook memakai `ResolvedPosition` dari Rust.
- Aksesibilitas dasar: tombol ikon punya label.

## 4. Gerbang CI
```bash
cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
pnpm typecheck && pnpm lint && pnpm test --run
cargo audit && pnpm audit --prod
```

## 5. Checklist manual (perangkat nyata, tiap rilis fase)
- [ ] Import PDF/DOCX/RTF/TXT/MD/EPUB dari picker Android dan iOS
- [ ] Duplikat → dialog; Replace/Open/Cancel benar
- [ ] PDF 500+ halaman: scroll mulus, memori stabil
- [ ] Baca 2 bab → tracker menunjukkan read/reading/unread benar
- [ ] Scroll cepat → tidak ada read
- [ ] Tutup paksa app → buka → Continue Reading ke posisi terakhir; sesi yatim dipulihkan
- [ ] Bookmark, highlight, note → muncul setelah restart
- [ ] Search → klik hasil lompat tepat + sorot
- [ ] Export XLSX dibuka di Excel/Sheets; PDF dibuka di viewer; bisa dibagikan
- [ ] Mode pesawat: semua fitur jalan
- [ ] Notifikasi reminder muncul sesuai jadwal
- [ ] Back Android, safe area/notch, rotasi, dark mode, font scaling besar
