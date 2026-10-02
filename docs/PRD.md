# PRD — ReadTrack

Versi 1.0 · 2 Okt 2026 · Status: siap implementasi

## 1. Ringkasan
ReadTrack adalah aplikasi mobile local-first untuk membaca PDF dan dokumen rich-text, dengan **interactive reading tracker** yang tahu bagian mana yang sudah, sedang, dan belum dibaca. Semua data tersimpan lokal (SQLite + filesystem). Berguna penuh tanpa internet.

Analogi: Kindle (membaca) + Readwise Reader (anotasi) + Obsidian (lokal, milik user) + utilitas native mobile.

## 2. Masalah
- Reader biasa hanya simpan "halaman terakhir". User tidak tahu bagian mana yang benar-benar dibaca, kapan, berapa lama.
- Reader PDF dan reader rich-text dipisah, tracking tidak konsisten antar format.
- Banyak reader butuh akun / cloud. User ingin dokumen dan data tetap di device.

## 3. Target user
- Pelajar/mahasiswa: jurnal, modul, e-book, catatan kuliah.
- Profesional: laporan, spesifikasi, dokumen teknis panjang.
- Pembaca rutin yang ingin lihat kebiasaan baca dan progres.

## 4. Goals
| # | Goal | Metrik |
|---|---|---|
| G1 | Import dan baca 6 format tanpa internet | Semua format MVP terbuka tanpa error pada fixture |
| G2 | Resume tepat ke posisi terakhir | Posisi pulih dalam toleransi ≤1 blok setelah restart |
| G3 | Tracker granular otomatis | Status segment benar sesuai `TRACKER_SPEC.md` |
| G4 | Anotasi (bookmark/highlight/note) persisten | CRUD terhubung SQLite |
| G5 | Export laporan XLSX + PDF | File valid, dibuka di Excel/Sheets dan PDF viewer |
| G6 | Performa mulus di PDF besar | PDF 1000 halaman tidak render semua sekaligus; scroll tanpa jank |

## 5. Non-goals (MVP)
Cloud sync, akun, kolaborasi, DRM, OCR, TTS, annotasi tulis tangan, edit dokumen asli, desktop-optimized UI, format ODT/HTML/DOC/XLSX/PPTX (arsitektur siap, implementasi nanti).

## 6. User stories & acceptance

### Library & Import
- US-1: Sebagai user, saya import dokumen dari file picker. **AC:** pilih file → progress tampil → dokumen muncul di library dan terbuka.
- US-2: Saya diberi tahu bila dokumen sudah ada. **AC:** dialog `Open existing / Replace / Cancel`. Tidak ada duplikasi diam-diam. Deteksi via hash.
- US-3: Saya melihat library list/grid, sort, filter, cari. **AC:** filter All/In progress/Completed/Archived; sort Recent opened/Recent added/Title/Progress.
- US-4: Saya rename, arsip, hapus, lihat detail, export per dokumen. **AC:** hapus pakai modal konfirmasi; hapus juga file di filesystem dan semua data terkait.
- US-5: File tidak didukung/korup → pesan jelas dengan aksi.

### Reader
- US-6: Baca PDF dengan zoom, fit width/page, jump page, search, TOC, dark mode, fullscreen. **AC:** halaman di-render lazy; memori terbatas.
- US-7: Baca DOCX/RTF/MD/EPUB/TXT dengan struktur semantik terjaga (heading, list, tabel, quote, code, link, gambar jika bisa). **AC:** tidak diratakan jadi plain text.
- US-8: Atur tampilan: tema Light/Sepia/Dark, ukuran font, line height, margin, font family (reflow saja).
- US-9: Resume. **AC:** tutup app, buka lagi, `Continue Reading` membawa ke posisi terakhir.

### Tracker
- US-10: Progress terisi otomatis dari perilaku membaca nyata. **AC:** scroll sangat cepat tidak menandai `read`.
- US-11: Lihat reading map per dokumen (segmen/bab). **AC:** tap segmen → info (posisi, terakhir dibaca, durasi, jumlah sesi); tap lagi → `Continue Reading` lompat ke posisi itu.
- US-12: Riwayat sesi. **AC:** tiap sesi simpan start, end, durasi, posisi awal/akhir, halaman terbaca.
- US-13: Dashboard: Continue Reading, Recently Added, Currently Reading, Completed, Reading Activity (hari ini, minggu ini, jumlah dokumen, selesai).

### Anotasi
- US-14: Bookmark posisi, edit judul/catatan, tap → lompat.
- US-15: Pilih teks → toolbar `Highlight / Add Note / Copy`. Highlight simpan teks, posisi awal/akhir, warna.
- US-16: Note terikat posisi. File asli tidak pernah diubah.

### Search
- US-17: Search global: dokumen, judul, penulis, isi, notes, highlights, bookmarks. **AC:** hasil dengan konteks; klik → buka dokumen, lompat ke posisi tepat, sorot teks cocok.

### Export
- US-18: Export `ReadTrack-Report-YYYY-MM-DD.xlsx` dengan sheet Overview, Documents, Reading Sessions, Reading Progress, Bookmarks, Highlights, Notes. Format Excel proper.
- US-19: Export `ReadTrack-Reading-Report.pdf` profesional dan terbaca.

### Reminder
- US-20: Reminder lokal opsional: Daily / Weekdays / Custom. Notifikasi native, tanpa internet.

## 7. Requirement non-fungsional
- **Offline total.** Tidak ada request jaringan. Font dan aset dibundel.
- **Performa:** cold start <2 dtk perangkat menengah; scroll 60fps; parsing & import di background; UI tidak blok.
- **Memori:** tidak baca file besar penuh ke memori; tidak simpan PDF base64 di state; PDF dilayani via custom protocol dengan range request.
- **Keamanan:** lihat `SECURITY.md`.
- **Aksesibilitas:** touch target ≥44px, kontras AA, dukung font scaling OS, label aksesibel, reduce-motion.
- **i18n:** string UI di file terpisah. Default Bahasa Inggris, siap Bahasa Indonesia (`en`, `id`). Mode bahasa mengikuti setting.
- **Reliabilitas:** sesi yatim (crash) dipulihkan saat start. Migrasi DB berversi, tidak destruktif.

## 8. Scope MVP (format)
PDF, DOCX, RTF, TXT, Markdown, EPUB. Extensible: ODT, HTML, DOC, XLSX, PPTX lewat trait `DocumentParser`.

## 9. Layar
Home · Library · Tracker · Settings (bottom nav) · Reader (PDF & Rich) · Document Detail · Search · Bookmarks/Notes/Highlights list · Import progress · Export · Reminder settings. Detail: `DESIGN.md`.

## 10. Risiko & mitigasi
| Risiko | Mitigasi |
|---|---|
| Parser DOCX/RTF/EPUB di Rust belum matang | Parser sendiri berbasis `zip` + `quick-xml`; fallback ke paragraf+heading jika elemen tidak dikenal; fixture + test per format |
| File picker Android mengembalikan `content://` URI | Baca stream via plugin fs/dialog, salin ke app dir sambil hash (stream) |
| Share/save export di mobile | Simpan ke `exports/`, lalu share sheet / save dialog; jika plugin kurang, tulis plugin Tauri kecil (catat di "Native exceptions") |
| PDF.js berat di WebView mobile | Lazy render, virtualisasi, batasi canvas aktif (±3 halaman), worker, turunkan scale pada layar besar DPR |
| Tracker tidak akurat | Algoritma deterministik di Rust, unit test; parameter di `app_settings` |
| Posisi rusak saat parser berubah | `parser_version` + fallback nearest-valid position |
| `printpdf` terbatas layout | Bangun layout helper sendiri (halaman, tabel sederhana, bar) dan embed font TTF |

## 11. Definisi sukses
Seluruh Acceptance Criteria bagian 34 spec asli lolos, plus alur end-to-end:
`install → run → import → read → track → close → reopen → resume → export XLSX → export PDF`.
