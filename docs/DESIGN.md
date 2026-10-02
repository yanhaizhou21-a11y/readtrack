# DESIGN — ReadTrack

Arah: **Editorial Reader + Modern Productivity + Native Mobile Utility.** Tenang, premium, minimal, content-first, taktil, keterbacaan tinggi.

Hindari: dashboard SaaS generik, gradient raksasa, glassmorphism berlebih, kartu bulat acak, bayangan tebal, terlalu banyak warna, dekorasi tanpa fungsi.

## 1. Prinsip
1. Konten membaca > dashboard. Reader adalah layar utama.
2. Satu aksen warna. Status pakai warna fungsional hemat.
3. Hierarki dari tipografi & spasi, bukan kotak dan bayangan.
4. Taktil: feedback haptic ringan di aksi penting (bookmark, highlight, selesai bab).
5. Native: safe area, back behavior, sheet dari bawah, touch target ≥ 44px.

## 2. Design tokens
Definisikan sebagai CSS variables di `src/app/tokens.css`, dipetakan ke Tailwind theme. Semua komponen memakai token, bukan hex langsung.

### Warna — app (UI)
| Token | Light | Dark |
|---|---|---|
| `--background` | `#FAF8F4` | `#121211` |
| `--foreground` | `#1C1B19` | `#E8E4DC` |
| `--muted` | `#6B665D` | `#9A958B` |
| `--surface` | `#FFFFFF` | `#1B1A18` |
| `--surface-2` | `#F3F0E9` | `#242321` |
| `--border` | `#E6E1D8` | `#2C2A27` |
| `--accent` | `#2B5F55` | `#7FB5A6` |
| `--accent-foreground` | `#FFFFFF` | `#0F1F1B` |
| `--success` | `#3F7D4E` | `#7FC08F` |
| `--warning` | `#B7791F` | `#E0B260` |
| `--danger` | `#B3382C` | `#E58A80` |

Kontras teks vs latar ≥ 4.5:1 (cek). Tema app mengikuti sistem, bisa dipaksa light/dark.

### Reading themes (area baca saja)
| Tema | Latar | Teks | Link | Catatan |
|---|---|---|---|---|
| Light (Paper) | `#FBF9F4` | `#26231F` | `#2B5F55` | |
| Sepia | `#F2E8D5` | `#3B3024` | `#7A4B1E` | |
| Dark | `#1A1917` | `#CFC9BE` | `#7FB5A6` | Bukan hitam murni, bukan putih murni. Teks ~ 11:1 maks. |

PDF dark mode: filter pada canvas (`invert(0.88) hue-rotate(180deg)` lalu `brightness(0.92)`), gambar/gambar-in-PDF opsional tidak di-invert (setting). Sepia PDF: `sepia(0.35)` + latar sepia.

### Warna status tracker
| Status | Token | Visual |
|---|---|---|
| unread | `--border` / `--surface-2` | blok kosong |
| reading | `--accent` opacity 45% | blok setengah isi / tekstur diagonal halus |
| read | `--accent` penuh | blok solid |
| skipped | `--muted` opacity 35% | garis putus / hatch tipis |
Status tidak boleh hanya warna: tambahkan pola/ikon untuk aksesibilitas.

### Warna highlight
`yellow #F6D860` `green #A9D8A0` `blue #A5C8E8` `pink #F0B0C8` `orange #F4BE8A` — di dark reading theme turunkan opasitas ke 35% di atas teks.

## 3. Tipografi
Font **dibundel lokal** (offline), format woff2, subset Latin + Latin Extended.
| Peran | Font | Pemakaian |
|---|---|---|
| Reading serif | `Newsreader` (atau `Source Serif 4`) | Isi dokumen rich-text, judul besar editorial |
| UI sans | `Inter` | UI, label, tombol |
| Mono | `JetBrains Mono` | Metadata teknis: hash, ukuran, posisi, waktu |
Reader memberi opsi serif/sans; PDF mengikuti font dokumen.

| Level | Ukuran / line-height | Berat |
|---|---|---|
| Display | 32/38 | 600 (serif) |
| Heading | 22/28 | 600 |
| Subheading | 17/24 | 600 |
| Body (UI) | 16/24 | 400 |
| Reading body | 18/30 default (rentang 14–28, lh 1.4–2.0) | 400 |
| Caption | 13/18 | 400 |
| Metadata (mono) | 12/16 | 500, `--muted` |
Lebar baris baca ideal 55–70 karakter; atur margin horizontal adaptif. `text-wrap: pretty`, hyphenation sesuai `lang`. Hormati font scaling OS.

## 4. Spasi, bentuk, elevasi, motion
- Skala 4px: 4, 8, 12, 16, 20, 24, 32, 48.
- Radius: `8` (kontrol, chip), `12` (kartu, sheet atas), `full` (pill, avatar). Tidak ada radius lain.
- Elevasi: default flat dengan border 1px. Sheet/modal saja boleh bayangan lembut (`0 8px 24px rgb(0 0 0 / .08)`).
- Ikon: Lucide, stroke 1.75, ukuran 20/24.
- Motion: 120–200 ms, `ease-out`. Transisi: sheet slide-up, toolbar fade, progress animasi halus. Hormati `prefers-reduced-motion` (matikan non-esensial).
- Haptic: aksi sukses ringan (jika tersedia).

## 5. Layout mobile
- Safe area: `env(safe-area-inset-*)` pada header, bottom nav, reader toolbar.
- Bottom nav 4 tab (**Home, Library, Tracker, Settings**), tinggi 56 + inset, label selalu tampil. Disembunyikan di Reader.
- Konten scroll di antara; header besar collapsing (judul besar → kecil).
- Keyboard: input naik di atas keyboard; sheet menyesuaikan.
- Orientasi: portrait utama, landscape didukung reader (PDF fit-width, rich 2 kolom opsional di tablet — fase polish).

## 6. Spesifikasi layar

### 6.1 Home
```text
[Greeting kecil, tanggal]                        
┌ Continue Reading ───────────────────────────┐
│ [cover]  Atomic Habits                       │
│          Chapter 2 · 72%                     │
│          ▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯  (reading spine)   │
│                         [ Continue ]         │
└──────────────────────────────────────────────┘
Currently Reading   (carousel horizontal, kartu kecil + progress)
Recently Added      (carousel)
Reading Activity    Today 42m · This week 4h 32m · Documents 12 · Completed 4
                    (mini bar 7 hari, tap → Tracker)
Completed           (carousel, bila ada)
```
Hero hanya muncul bila ada dokumen in-progress. Tidak ramai: maks 4 bagian di bawah hero.

### 6.2 Library
Header: judul besar, search field, toggle list/grid, tombol `+ Import`. Chip filter: All · In progress · Completed · Archived. Sort via sheet. Kartu: judul (serif), tipe (mono chip), progress tipis, "last opened", halaman/section. Aksi (long-press / ⋯): Open · Rename · Archive · Delete (modal konfirmasi) · Export · Details. FAB tidak dipakai; tombol Import di header + empty state.

### 6.3 Reader — rich text
Chrome minimal. Tap tengah toggle chrome.
```text
Top:    ← Back | Judul dokumen (ellipsis) | progress 72% | ⋯
Body:   konten, margin nyaman
Bottom: Contents | Search | Bookmark | Appearance | More
```
Seleksi teks → toolbar mengambang: `Highlight (pilih warna) · Add Note · Copy`. Appearance sheet: tema, ukuran font, line height, margin, font family. Progress tipis (2px) di tepi atas saat chrome tersembunyi.

### 6.4 Reader — PDF
Scroll vertikal virtual. Indikator halaman `12 / 240` (tap → jump). Pinch zoom, double-tap fit width ↔ 100%. Toolbar: Contents (TOC) · Search · Bookmark · Appearance (tema/filter, fit mode) · More (fullscreen, go to page). Pencarian: bar atas dengan next/prev dan hitungan.

### 6.5 Tracker
- **Tracker tab:** ringkasan (reading time minggu ini, grafik batang 7/30 hari), daftar dokumen dengan **document spine** (strip segmen berwarna), urut berdasar aktivitas terakhir.
- **Reading map (per dokumen):**
  - Header: judul, progress melingkar (ring) + total waktu + sesi.
  - **Chapter heatmap/timeline:** daftar bab; tiap bab = bar tersegmentasi (1 sel per segmen, status berwarna). Bab saat ini ditandai penanda posisi.
  - Tap bab → kartu info (bottom sheet kecil):
    ```text
    Chapter 02
    Position: 72%
    Last read: Today, 09:42
    Reading time: 32m
    Sessions: 4
    [ Continue Reading ]
    ```
  - Tap kedua / tombol → buka reader di posisi itu.
  - Tab sekunder: **Sessions** (riwayat) · **Activity** (kalender heat 12 minggu).
- Visual spine: lebar penuh, tinggi 8–12px, sel proporsional kata; animasi isi saat data berubah.

### 6.6 Search
Field besar autofocus. Hasil dikelompokkan per dokumen; baris: judul dokumen, bab/halaman, snippet dengan `<mark>`-style span. Filter chip: All · Documents · Content · Notes · Highlights · Bookmarks. Klik → reader lompat + sorot.

### 6.7 Annotations
Tab: Bookmarks · Highlights · Notes. Filter per dokumen. Kartu bookmark: `Chapter 03 · Page 81`, kutipan, waktu relatif; tap → lompat; swipe kiri hapus (dengan undo snackbar); ketuk ⋯ edit judul/catatan.

### 6.8 Document detail
Cover, judul/penulis, metadata mono (tipe, ukuran, halaman, kata, hash pendek, ditambahkan), progress, tombol Continue/Read, aksi (Rename, Archive, Export, Delete), ringkasan anotasi.

### 6.9 Settings
Appearance (tema app, bahasa), Reader defaults, Tracker (ambang sensitivitas: Santai/Normal/Ketat memetakan ke `tracker.*`), Reminders, Storage (usage, clear cache), Export, About. Tidak ada akun.

### 6.10 Import
Sheet progres: nama file, stage ("Copying…", "Analyzing…", "Indexing…"), bar. Duplikat: dialog `Open existing / Replace / Cancel`. Error: lihat §8.

## 7. Empty states
Komponen `<EmptyState illustration title body primaryAction secondary? hint? />`. Ilustrasi garis halus (SVG inline, 1.5px, `--muted`, tumpukan dokumen/peta) — subtle, bukan ramai. Copy (en; sediakan `id`):

| Layar | Judul | Isi | Aksi |
|---|---|---|---|
| Library kosong | Your reading library is empty. | Bring your first document here and start tracking your reading journey. | **Import Document** · hint mono: `PDF · DOCX · EPUB · RTF · TXT · Markdown` |
| Library filter kosong | Nothing here yet | Try another filter or import a document. | Clear filter |
| Tracker kosong | Your reading map is waiting. | Open a document and your reading progress will appear here automatically. | **Open Library** |
| Bookmarks kosong | Nothing bookmarked yet. | Save important pages or passages while reading. | **Start Reading** |
| Highlights kosong | No highlights yet. | Select text while reading to highlight it. | Start Reading |
| Notes kosong | No notes yet. | Long-press a passage and choose Add Note. | Start Reading |
| Search awal | Search your library | Find documents, notes, highlights, or passages instantly. | — |
| Search tanpa hasil | No matches for "{q}" | Check the spelling or try fewer words. | Clear |
| Home tanpa dokumen | Welcome to ReadTrack | Import a document to begin. Everything stays on your device. | **Import Document** |

Empty state boleh memuat langkah singkat 3 poin (Import → Read → Track) pada Home pertama kali (`onboarding.done`).

## 8. Error & loading states
- Error komponen `<ErrorState code message actions />` dari `AppErrorDto`. Contoh:
  ```text
  We couldn't open this document.
  The file may be corrupted or unsupported.
  [ Try Again ]  [ Remove Document ]
  ```
- Loading: skeleton untuk list/kartu; spinner kecil untuk aksi; progress bar untuk import/export. Tidak ada layar kosong tanpa penjelasan.
- Toast/snackbar untuk aksi ringan (bookmark ditambah, dengan Undo).
- Jangan tampilkan teks Rust/panic/stack trace.

## 9. Interaksi & gesture
| Konteks | Gesture | Aksi |
|---|---|---|
| PDF | pinch | zoom |
| PDF | scroll | pindah halaman |
| PDF | tap | toggle toolbar |
| PDF | double-tap | fit width ↔ 100% |
| Rich | scroll | posisi membaca |
| Rich | tap | toggle toolbar |
| Rich | long-press / select | toolbar anotasi |
| Library | long-press | menu aksi |
| Daftar anotasi | swipe | hapus (undo) |
| Android | back | tutup sheet/panel → keluar reader → tab sebelumnya |
Gesture tidak boleh konflik: seleksi teks menonaktifkan tap-toggle; pinch menonaktifkan scroll sementara. Uji di perangkat nyata.

## 10. Aksesibilitas
Touch target ≥ 44×44. Label aksesibel (`aria-label`) di semua tombol ikon. Fokus terlihat. Kontras AA. Status tracker tidak hanya warna. Dukung font scaling. Reduce motion. Urutan baca screen reader logis di reader (blok berurutan).

## 11. Komponen (shadcn/ui, disesuaikan token)
Button, Card (flat), Sheet (bottom), Dialog/AlertDialog, Tabs, Chip/Badge, Input, Slider (font size), Switch, Progress (custom ring + spine), Toast, Skeleton, DropdownMenu. Custom: `ReadingSpine`, `ChapterBar`, `ProgressRing`, `ActivityHeat`, `EmptyState`, `ErrorState`, `DocCard`, `ReaderToolbar`, `SelectionToolbar`.
