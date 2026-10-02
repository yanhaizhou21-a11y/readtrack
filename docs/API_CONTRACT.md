# API_CONTRACT — Tauri Commands, Events, Errors

Aturan:
- Semua command `async`, return `Result<T, IpcError>`.
- Rust: struct `#[derive(Serialize, Deserialize)]` + `#[serde(rename_all = "camelCase")]`.
- TS: tipe di `src/types/`, wrapper `src/lib/ipc.ts` memvalidasi respons dengan Zod, melempar `AppErrorDto`.
- Validasi input di command (panjang string, range, enum, UUID). Tolak input tak valid dengan `InvalidInput`.
- Frontend tidak pernah mengirim path file ke command selain `document_import.source` (hasil dialog resmi).

## 1. Error
```rust
#[derive(thiserror::Error, Debug)]
pub enum AppError {
  DocumentNotFound, UnsupportedFormat{ext:String}, DuplicateDocument{existing_id:String},
  InvalidDocument{reason:String}, ParseFailed{reason:String}, DatabaseError, ExportFailed{reason:String},
  PermissionDenied, StorageUnavailable, InvalidInput{field:String}, NotFound{entity:String}, Internal,
}
// Serialisasi ke frontend:
```
```ts
type AppErrorDto = {
  code: "DocumentNotFound"|"UnsupportedFormat"|"DuplicateDocument"|"InvalidDocument"|"ParseFailed"
      |"DatabaseError"|"ExportFailed"|"PermissionDenied"|"StorageUnavailable"|"InvalidInput"|"NotFound"|"Internal";
  message: string;                  // human-readable, aman ditampilkan
  details?: Record<string, unknown>;// mis. { existingId }
  retryable: boolean;
};
```
Panic dibungkus (`catch_unwind` / hook) → `Internal` + log. Detail teknis hanya ke log, **bukan** ke `message`.

Pesan default (en): `UnsupportedFormat` "This file type isn't supported yet." · `InvalidDocument/ParseFailed` "We couldn't open this document. The file may be corrupted or unsupported." · `DuplicateDocument` "This document already exists." · `StorageUnavailable` "Storage isn't available. Free up space and try again." · `PermissionDenied` "ReadTrack doesn't have permission to access this file."

## 2. Tipe inti
```ts
type FileType = "pdf"|"docx"|"rtf"|"txt"|"md"|"epub";
type SegmentStatus = "unread"|"reading"|"read"|"skipped";

type DocumentSummary = {
  id: string; title: string; author?: string; fileType: FileType; fileSize: number;
  pageCount?: number; wordCount?: number; sectionCount: number;
  progress: number; completed: boolean; isArchived: boolean;
  createdAt: number; lastOpenedAt?: number; thumbnailUrl?: string; // rt://thumb/<id>
  parseStatus: "pending"|"parsing"|"ready"|"failed";
};
type DocumentDetail = DocumentSummary & {
  originalFilename: string; mimeType: string; contentHash: string;
  totalReadMs: number; sessionCount: number; lastReadAt?: number; position?: LogicalPosition;
};
type LogicalPosition = {
  documentId: string; sectionId?: number; blockId?: string; offset?: number;
  page?: number; pageOffset?: number; percentage: number; parserVersion: number;
};
```

## 3. Commands

### Document
| Command | Input | Output | Catatan |
|---|---|---|---|
| `document_import` | `{ source: string, onDuplicate?: "ask"\|"open_existing"\|"replace" }` | `DocumentSummary` | Emit `document_import_progress`. `ask` + duplikat → error `DuplicateDocument{existingId}` |
| `document_list` | `{ filter?: "all"\|"in_progress"\|"completed"\|"archived"\|"recent_added"\|"recent_opened", sort?: "recent_opened"\|"recent_added"\|"title"\|"progress", query?: string, limit?: number, offset?: number }` | `{ items: DocumentSummary[], total: number }` | |
| `document_get` | `{ id }` | `DocumentDetail` | Set `last_opened_at` hanya via `document_touch` |
| `document_touch` | `{ id }` | `void` | Dipanggil saat reader dibuka |
| `document_rename` | `{ id, title }` | `DocumentSummary` | 1–200 char |
| `document_archive` | `{ id, archived: boolean }` | `DocumentSummary` | |
| `document_delete` | `{ id }` | `void` | Hapus DB + FTS + file + thumbnail + cache, dalam urutan aman |
| `document_get_sections` | `{ id, fromIndex, count }` | `SectionPayload[]` | Lazy; rich text. `count ≤ 20` |
| `document_get_toc` | `{ id }` | `TocEntry[]` | PDF: TOC dari outline dikirim frontend lewat `document_save_toc` |
| `document_save_toc` | `{ id, entries }` | `void` | Hanya PDF, divalidasi |
| `document_index_pages` | `{ id, pages: {page:number,text:string}[] }` | `{ indexed: number }` | Batch ≤ 20 halaman, ≤ 200 KB/batch. Memperbarui word_count segmen + FTS |
| `document_save_thumbnail` | `{ id, webpBase64: string }` | `void` | Maks 200 KB, validasi magic bytes WebP |
| `document_search` | `{ query, scope?: SearchKind[], documentId?, limit?, offset? }` | `SearchHit[]` | Lihat §4 |
| `document_resolve_position` | `{ position: LogicalPosition }` | `ResolvedPosition` | Algoritma `DOCUMENT_MODEL.md §4` |

### Reading & Tracker
| Command | Input | Output |
|---|---|---|
| `reading_get_progress` | `{ documentId }` | `ReadingProgress` |
| `reading_update_progress` | `{ documentId, position: LogicalPosition }` | `void` (posisi saja; dipanggil debounced) |
| `reading_start_session` | `{ documentId, position }` | `{ sessionId }` |
| `reading_report_viewport` | `ViewportReport` (lihat `TRACKER_SPEC §3`) | `void` |
| `reading_end_session` | `{ sessionId, position }` | `SessionSummary \| null` (null jika dibuang karena noise) |
| `reading_get_sessions` | `{ documentId?, from?, to?, limit?, offset? }` | `ReadingSession[]` |
| `tracker_get_map` | `{ documentId }` | `ReadingMap` |
| `tracker_get_overview` | `{ now: number, tzOffsetMin: number }` | `{ todayMs, weekMs, documents, completed, currentlyReading: DocumentSummary[], activityByDay: {date:string,ms:number}[] }` |
| `reading_mark_completed` | `{ documentId }` | `ReadingProgress` |
| `reading_mark_unread` | `{ documentId }` | `ReadingProgress` (reset segmen + progress, sesi tetap) |
| `home_get_dashboard` | `{ now, tzOffsetMin }` | `{ continueReading?: ContinueCard, recent: DocumentSummary[], currentlyReading, completed, activity }` |

`ContinueCard = { document: DocumentSummary, sectionTitle?: string, progress: number, position: LogicalPosition }`

### Annotations
| Command | Input | Output |
|---|---|---|
| `bookmark_create` | `{ documentId, position, title? , note? }` | `Bookmark` (excerpt dibuat service) |
| `bookmark_update` | `{ id, title?, note? }` | `Bookmark` |
| `bookmark_delete` | `{ id }` | `void` |
| `bookmark_list` | `{ documentId?: string }` | `Bookmark[]` |
| `highlight_create` | `{ documentId, start, end, selectedText, color, note? }` | `Highlight` (service validasi `selectedText` ≤ 5000 char & posisi valid) |
| `highlight_update` | `{ id, color?, note? }` | `Highlight` |
| `highlight_delete` | `{ id }` | `void` |
| `highlight_list` | `{ documentId?: string }` | `Highlight[]` |
| `note_create` | `{ documentId, position, content, highlightId? }` | `Note` |
| `note_update` | `{ id, content }` | `Note` |
| `note_delete` | `{ id }` | `void` |
| `note_list` | `{ documentId?: string }` | `Note[]` |

### Export
| Command | Input | Output |
|---|---|---|
| `export_xlsx` | `{ documentIds?: string[] }` | `{ path: string, fileName: string }` → `ReadTrack-Report-YYYY-MM-DD.xlsx` |
| `export_pdf` | `{ documentIds?: string[] }` | `{ path, fileName }` → `ReadTrack-Reading-Report.pdf` (nama dengan tanggal bila banyak) |
| `export_share` | `{ path }` | `void` — buka share sheet / save dialog (path harus di `exports/`) |

### Settings & Reminder
| Command | Input | Output |
|---|---|---|
| `settings_get_all` | — | `Record<string, unknown>` (default digabung) |
| `settings_set` | `{ key, value }` | `void` (whitelist key + validasi nilai) |
| `reminder_list` / `reminder_upsert` / `reminder_delete` | lihat tabel `reminders` | `Reminder` |
| `reminder_sync_notifications` | — | `void` — jadwalkan ulang notifikasi lokal dari DB (dipanggil start & setelah perubahan) |
| `storage_get_usage` / `storage_clear_cache` | — | `{ documentsBytes, cacheBytes, exportsBytes }` / `void` |

## 4. Search
```ts
type SearchKind = "title"|"author"|"content"|"note"|"highlight"|"bookmark";
type SearchHit = {
  kind: SearchKind; documentId: string; documentTitle: string;
  sectionTitle?: string; page?: number; snippet: SnippetPart[]; // [{text, match:boolean}]
  position: LogicalPosition; refId?: string;
};
```
`position` cukup untuk membuka dokumen, lompat tepat, dan menyorot kecocokan (`reader` menerima `highlightQuery`).

## 5. Events (Rust → React)
| Event | Payload |
|---|---|
| `document_import_progress` | `{ jobId, fileName, percent: 0..100, stage: "copy"\|"hash"\|"metadata"\|"parse"\|"index"\|"save"\|"done" }` |
| `document_parse_progress` | `{ documentId, percent }` |
| `export_progress` | `{ jobId, kind: "xlsx"\|"pdf", percent, stage }` |
| `reading_progress_updated` | `{ documentId, progress, currentSectionId?, completed }` |
| `library_changed` | `{ reason: "import"\|"delete"\|"archive"\|"rename" }` |

Frontend listener didaftarkan sekali di `app/providers`, unlisten saat unmount.

## 6. Custom protocol `rt://`
| URL | Isi |
|---|---|
| `rt://doc/<document_id>` | File asli (PDF untuk PDF.js). Mendukung `Range`, header `Content-Type`, `Accept-Ranges` |
| `rt://thumb/<document_id>` | Thumbnail |
| `rt://asset/<document_id>/<hash>` | Gambar hasil ekstrak (rich text) |
Handler: parse id (UUID/hex ketat) → query DB → resolve path aman → stream. Tidak menerima path mentah. Tolak jika di luar root.

## 7. Contoh (referensi bentuk kode)
```rust
#[tauri::command]
pub async fn bookmark_create(state: State<'_, AppState>, input: BookmarkCreateInput) -> Result<Bookmark, IpcError> {
    input.validate()?;
    state.services.bookmark.create(input).await.map_err(Into::into)
}
```
```ts
export const bookmarkCreate = (input: BookmarkCreateInput) =>
  ipc("bookmark_create", { input }, BookmarkSchema);
```
