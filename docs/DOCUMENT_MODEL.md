# DOCUMENT_MODEL — ReadTrack

Satu representasi internal untuk semua format. Reader, tracker, anotasi, dan search hanya bergantung pada model ini.

## 1. Konsep
```text
NormalizedDocument
 ├── metadata  { title, author?, language?, page_count?, word_count, parser_version }
 ├── sections[]   (bab / heading level atas / halaman PDF)
 │    └── blocks[]   (heading, paragraph, list, quote, image, table, code, separator)
 └── toc[]      (hirarki: title, section_index, block_id, page?)
```
PDF: section = satu halaman (`section_type = "page"`), blok tidak dipecah (konten halaman dirender PDF.js). Teks halaman hanya untuk search & snippet.

## 2. Tipe (Rust, serde → JSON; TS cermin di `src/types/document.ts`)
```rust
pub struct NormalizedDocument { pub metadata: DocMetadata, pub sections: Vec<Section>, pub toc: Vec<TocEntry> }

pub struct Section {
    pub index: u32,
    pub kind: SectionKind,          // Chapter | Heading | Page | Body
    pub title: Option<String>,
    pub level: u8,                  // 1..6, 0 = tanpa level
    pub blocks: Vec<Block>,
}

#[serde(tag = "type", rename_all = "snake_case")]
pub enum Block {
    Heading   { id: BlockId, level: u8, inlines: Vec<Inline> },
    Paragraph { id: BlockId, inlines: Vec<Inline> },
    List      { id: BlockId, ordered: bool, items: Vec<Vec<Block>> },
    Quote     { id: BlockId, blocks: Vec<Block> },
    Image     { id: BlockId, asset: Option<AssetRef>, alt: Option<String> },
    Table     { id: BlockId, rows: Vec<Vec<Vec<Inline>>>, header_rows: u8 },
    Code      { id: BlockId, language: Option<String>, text: String },
    Separator { id: BlockId },
}

pub struct Inline { pub text: String, pub marks: Vec<Mark> }   // Mark: Bold|Italic|Underline|Code|Link{href}
```
- `BlockId` = `"s{section_index}-b{block_index}"` (deterministik, stabil untuk parser_version yang sama). Blok bersarang memakai `id` induk + path tidak dipakai untuk posisi (posisi selalu di blok tingkat atas section).
- Gambar: simpan ke `library/cache/assets/<document_id>/<hash>.<ext>`; dilayani lewat `rt://asset/<document_id>/<hash>`. Gambar > batas ukuran → skip (blok `Image` dengan `asset=None`).
- Semua teks inline sudah **plain text + marks**. Tidak ada HTML mentah di model. Link: hanya skema `http`, `https`, `mailto`; selain itu dibuang.

## 3. LogicalPosition
```rust
pub struct LogicalPosition {
    pub document_id: String,
    pub section_id: Option<u32>,     // section_index
    pub block_id: Option<String>,    // rich text
    pub offset: Option<u32>,         // char offset (Unicode scalar) dalam teks blok
    pub page: Option<u32>,           // PDF, 1-based
    pub page_offset: Option<f32>,    // PDF, 0.0..1.0 dari tinggi halaman (scroll offset ternormalisasi)
    pub percentage: f32,             // 0.0..1.0 terhadap seluruh dokumen (berbasis word count)
    pub parser_version: u32,
}
```
Disimpan sebagai JSON di kolom `*_position` dan **linear position** `linear_pos: i64` untuk query/sort:
- Rich: `linear_pos` = jumlah karakter semua blok sebelum posisi + offset (cumulative char offset).
- PDF: `linear_pos = (page-1) * 1_000_000 + round(page_offset * 999_999)`.

Jangan simpan `scrollTop` mentah. `scrollTop` hanya dipakai lokal oleh UI saat merestorasi dari LogicalPosition.

## 4. Restore position (algoritma)
1. Jika `parser_version` sama: cari `section_id` → `block_id` → `offset` (clamp ke panjang blok). Scroll blok ke tepi atas viewport + offset.
2. Jika `block_id` tidak ada: pilih blok di section yang sama dengan `|linear_pos|` terdekat.
3. Jika section tidak ada: pakai `percentage` → `linear_pos = percentage * total_chars` → blok terdekat.
4. Jika dokumen kosong: posisi awal.
5. PDF: `page` clamp 1..page_count; `page_offset` clamp 0..1.
Fungsi murni di Rust `position_service::resolve()` + unit test untuk tiap cabang. Frontend hanya menerima hasil `ResolvedPosition`.

## 5. Parser trait
```rust
pub trait DocumentParser: Send + Sync {
    fn file_type(&self) -> FileType;
    fn sniff(&self, head: &[u8]) -> bool;                       // magic bytes
    fn metadata(&self, path: &Path) -> Result<DocMetadata, AppError>;
    fn parse(&self, path: &Path, progress: &dyn Fn(f32)) -> Result<NormalizedDocument, AppError>;
}
pub struct ParserRegistry { /* Vec<Box<dyn DocumentParser>> */ }
impl ParserRegistry { pub fn for_file(&self, head:&[u8], ext:&str) -> Result<&dyn DocumentParser, AppError>; }
```
Menambah format baru = implement trait + register + fixture + test. Tidak mengubah reader/tracker.

## 6. Panduan per parser
| Format | Pendekatan | Catatan |
|---|---|---|
| TXT | Deteksi encoding (UTF-8/UTF-16 BOM, fallback Windows-1252). Pecah paragraf di baris kosong. Section tunggal `Body` atau bagi per ~N kata | Tanpa heading → section sintetis "Part N" tiap ~3000 kata agar tracker punya "bab" |
| Markdown | `pulldown-cmark` → blok. Heading level 1–2 memulai section | HTML inline di-strip |
| DOCX | `zip` + `quick-xml` baca `word/document.xml`, `styles.xml`, `numbering.xml`, `_rels`. Style `Heading N` → heading. Run props → marks. Tabel, list, gambar (`word/media`) | Elemen tak dikenal → turun ke teks. Batasi ukuran entry zip (zip bomb) |
| RTF | Tokenizer RTF sendiri atau crate yang teruji. Support: par, b/i/ul, list sederhana, tabel dasar, unicode escape `\uN`, `\'hh` | Kontrol tak dikenal diabaikan |
| EPUB | `zip` + OPF (spine, metadata) + NCX/nav (TOC). XHTML tiap spine item → blok via parser HTML aman (`html5ever`/`scraper`), sanitasi | Section per spine item / TOC entry. Cover → thumbnail |
| PDF | `lopdf` metadata. Section per halaman. Teks via PDF.js worker. TOC dari outline PDF.js | Tidak parse konten di Rust |

Semua parser: batas ukuran, batas kedalaman nesting, timeout, tanpa panic (`catch_unwind` di boundary service) → `ParseFailed`.

## 7. Segment generation
Dari NormalizedDocument saat import (lihat `TRACKER_SPEC.md §2`): rich = grup blok berurutan; PDF = satu segmen per halaman. Dibuat `unread`.
