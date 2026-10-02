# SECURITY — ReadTrack

Local-only bukan berarti aman. Dokumen import = **untrusted input**.

## Threat model
| Ancaman | Vektor | Kontrol |
|---|---|---|
| File berbahaya/korup | PDF/DOCX/EPUB crafted | Validasi magic bytes + ekstensi; parser tanpa panic; batas ukuran, kedalaman, waktu; zip: batasi jumlah entry, ukuran terdekompresi (anti zip-bomb), tolak path `..` di entry |
| XSS via konten dokumen | HTML di EPUB/DOCX/MD | Model dokumen tanpa HTML mentah. Render lewat React node / TipTap schema ketat. Jika HTML tak terhindarkan: `ammonia` di Rust. Tidak ada `dangerouslySetInnerHTML` (lint rule) |
| Path traversal | Nama file, entry zip, id | Path DB relatif; canonicalize + `starts_with(app_data)`; nama file disanitasi; id divalidasi (UUID) |
| IPC abuse | JS memanggil command | Command whitelist, validasi semua parameter, tanpa command generik FS/shell, capability minimal |
| Link berbahaya | Link di dokumen | Hanya `http/https/mailto`; buka lewat konfirmasi + opener eksternal, bukan navigasi WebView |
| Eksekusi | Dokumen jalankan kode | Tidak pernah execute/shell-open dokumen. PDF.js `isEvalSupported:false`, nonaktifkan JS PDF (scripting) |
| Exfiltrasi jaringan | Dokumen/WebView request keluar | CSP: `default-src 'self'; img-src 'self' rt: data: blob:; connect-src ipc: http://ipc.localhost rt:; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-src 'none'`; tidak ada izin HTTP plugin |
| Data bocor via log | Log berisi isi dokumen | Jangan log teks dokumen/highlight/note |
| DoS | File raksasa | Batas ukuran import (default 200 MB), batas memori parser, task di thread pool, timeout |
| SQL injection | Search query | Parameter binding selalu; query FTS di-escape |

## Aturan implementasi
1. Tidak ada `unsafe` tanpa komentar alasan.
2. Tidak ada `Command::new` untuk file dokumen.
3. Semua parameter command lewat `validate()`; string dibatasi panjang; enum via serde.
4. `selectedText`, `note`, `title` diperlakukan teks biasa. Render sebagai teks.
5. Export: nama file dibentuk di Rust, tulis hanya ke `exports/`.
6. Hapus: pastikan path hasil resolve di dalam `library/` sebelum `remove_file`.
7. Dependensi: `cargo audit`, `pnpm audit` di CI. Kunci versi (`Cargo.lock`, `pnpm-lock.yaml`).
8. Data di device: andalkan enkripsi OS. Opsional fase lanjut: app lock (biometrik). Tidak ada telemetri.
