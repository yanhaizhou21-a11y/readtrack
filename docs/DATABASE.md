# DATABASE — ReadTrack (SQLite)

Pool: `sqlx::SqlitePool`. Pragma saat connect:
```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```
Konvensi: `id TEXT` UUID v4 · waktu `INTEGER` epoch ms UTC · boolean `INTEGER` 0/1 · persen `REAL` 0.0–1.0 · posisi = `*_position` JSON (`LogicalPosition`) + `*_pos` `INTEGER` (linear position, lihat `DOCUMENT_MODEL.md §3`). Path file **relatif** ke app data dir.

## 1. ERD
```text
documents 1─┬─* document_sections
            ├─* reading_segments ──(section_id)→ document_sections
            ├─1 reading_progress
            ├─* reading_sessions
            ├─* bookmarks
            ├─* highlights 1─* notes (opsional, highlight_id)
            ├─* notes
            └─* reminders
app_settings (key/value)      search_index (FTS5, virtual)
```
Semua tabel anak `ON DELETE CASCADE` ke `documents`. `search_index` dibersihkan oleh service saat hapus (FTS5 tidak punya FK).

## 2. Migration `0001_init.sql`
```sql
CREATE TABLE documents (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  author            TEXT,
  original_filename TEXT NOT NULL,
  file_path         TEXT NOT NULL,
  file_type         TEXT NOT NULL CHECK (file_type IN ('pdf','docx','rtf','txt','md','epub')),
  mime_type         TEXT NOT NULL,
  file_size         INTEGER NOT NULL CHECK (file_size >= 0),
  content_hash      TEXT NOT NULL,
  page_count        INTEGER,
  word_count        INTEGER,
  thumbnail_path    TEXT,
  language          TEXT,
  parse_status      TEXT NOT NULL DEFAULT 'pending'
                    CHECK (parse_status IN ('pending','parsing','ready','failed')),
  parse_error       TEXT,
  parser_version    INTEGER NOT NULL DEFAULT 1,
  index_status      TEXT NOT NULL DEFAULT 'none'
                    CHECK (index_status IN ('none','partial','complete')),
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  last_opened_at    INTEGER,
  is_archived       INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1))
);
CREATE UNIQUE INDEX ux_documents_content_hash ON documents(content_hash);
CREATE INDEX ix_documents_last_opened ON documents(last_opened_at DESC);
CREATE INDEX ix_documents_created     ON documents(created_at DESC);
CREATE INDEX ix_documents_archived    ON documents(is_archived);

CREATE TABLE document_sections (
  id             TEXT PRIMARY KEY,
  document_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  section_index  INTEGER NOT NULL,
  section_type   TEXT NOT NULL CHECK (section_type IN ('chapter','heading','page','body')),
  title          TEXT,
  level          INTEGER NOT NULL DEFAULT 0,
  content        TEXT,                 -- rich: JSON blocks; pdf: plain page text (diisi saat indexing)
  word_count     INTEGER NOT NULL DEFAULT 0,
  start_position INTEGER NOT NULL,     -- linear_pos awal
  end_position   INTEGER NOT NULL,     -- linear_pos akhir (eksklusif)
  created_at     INTEGER NOT NULL,
  UNIQUE (document_id, section_index)
);
CREATE INDEX ix_sections_document ON document_sections(document_id, section_index);

CREATE TABLE reading_segments (
  id             TEXT PRIMARY KEY,
  document_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  section_id     TEXT NOT NULL REFERENCES document_sections(id) ON DELETE CASCADE,
  segment_type   TEXT NOT NULL CHECK (segment_type IN ('page','block_group')),
  segment_index  INTEGER NOT NULL,
  first_block_id TEXT,                 -- rich
  last_block_id  TEXT,
  start_position INTEGER NOT NULL,
  end_position   INTEGER NOT NULL,
  word_count     INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'unread'
                 CHECK (status IN ('unread','reading','read','skipped')),
  dwell_ms       INTEGER NOT NULL DEFAULT 0,
  first_read_at  INTEGER,
  last_read_at   INTEGER,
  read_count     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (document_id, segment_index)
);
CREATE INDEX ix_segments_document ON reading_segments(document_id, segment_index);
CREATE INDEX ix_segments_section  ON reading_segments(section_id);
CREATE INDEX ix_segments_status   ON reading_segments(document_id, status);

CREATE TABLE reading_progress (
  id                    TEXT PRIMARY KEY,
  document_id           TEXT NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  current_page          INTEGER,
  current_position      TEXT,          -- JSON LogicalPosition
  current_pos           INTEGER NOT NULL DEFAULT 0,
  current_section_id    TEXT REFERENCES document_sections(id) ON DELETE SET NULL,
  progress_percent      REAL NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 1),
  furthest_pos          INTEGER NOT NULL DEFAULT 0,
  total_read_ms         INTEGER NOT NULL DEFAULT 0,
  completed             INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
  completed_at          INTEGER,
  updated_at            INTEGER NOT NULL
);
CREATE INDEX ix_progress_document ON reading_progress(document_id);
CREATE INDEX ix_progress_updated  ON reading_progress(updated_at DESC);

CREATE TABLE reading_sessions (
  id                TEXT PRIMARY KEY,
  document_id       TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  started_at        INTEGER NOT NULL,
  ended_at          INTEGER,                 -- NULL = sesi terbuka
  last_heartbeat_at INTEGER NOT NULL,
  duration_seconds  INTEGER NOT NULL DEFAULT 0,   -- wall clock
  active_seconds    INTEGER NOT NULL DEFAULT 0,   -- waktu aktif (bukan idle/background)
  start_position    TEXT,
  end_position      TEXT,
  start_pos         INTEGER NOT NULL DEFAULT 0,
  end_pos           INTEGER NOT NULL DEFAULT 0,
  pages_read        INTEGER NOT NULL DEFAULT 0,
  segments_read     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_sessions_document ON reading_sessions(document_id, started_at DESC);
CREATE INDEX ix_sessions_started  ON reading_sessions(started_at DESC);
CREATE INDEX ix_sessions_open     ON reading_sessions(ended_at) WHERE ended_at IS NULL;

CREATE TABLE bookmarks (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  position    TEXT NOT NULL,           -- JSON LogicalPosition
  pos         INTEGER NOT NULL,
  page        INTEGER,
  section_id  TEXT REFERENCES document_sections(id) ON DELETE SET NULL,
  title       TEXT,
  excerpt     TEXT,                    -- cuplikan teks di posisi, dibuat service
  note        TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX ix_bookmarks_document ON bookmarks(document_id, pos);

CREATE TABLE highlights (
  id             TEXT PRIMARY KEY,
  document_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  position_start TEXT NOT NULL,        -- JSON LogicalPosition
  position_end   TEXT NOT NULL,
  start_pos      INTEGER NOT NULL,
  end_pos        INTEGER NOT NULL CHECK (end_pos >= start_pos),
  page           INTEGER,
  selected_text  TEXT NOT NULL,
  color          TEXT NOT NULL DEFAULT 'yellow'
                 CHECK (color IN ('yellow','green','blue','pink','orange')),
  note           TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX ix_highlights_document ON highlights(document_id, start_pos);

CREATE TABLE notes (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  highlight_id TEXT REFERENCES highlights(id) ON DELETE SET NULL,
  position     TEXT NOT NULL,
  pos          INTEGER NOT NULL,
  page         INTEGER,
  content      TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX ix_notes_document ON notes(document_id, pos);

CREATE TABLE reminders (
  id               TEXT PRIMARY KEY,
  document_id      TEXT REFERENCES documents(id) ON DELETE CASCADE,  -- NULL = reminder global
  enabled          INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  schedule_type    TEXT NOT NULL CHECK (schedule_type IN ('daily','weekdays','custom','once')),
  time_of_day_min  INTEGER,            -- menit sejak 00:00 lokal
  days_of_week     INTEGER,            -- bitmask Sen=1..Min=64 (custom)
  scheduled_at     INTEGER,            -- untuk 'once'
  repeat_interval  INTEGER,            -- menit, opsional
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX ix_reminders_document ON reminders(document_id);

CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,            -- JSON
  updated_at INTEGER NOT NULL
);
```

## 3. Migration `0002_search.sql` (FTS5)
```sql
CREATE VIRTUAL TABLE search_index USING fts5(
  text,
  document_id UNINDEXED,
  kind        UNINDEXED,   -- 'title' | 'author' | 'content' | 'note' | 'highlight' | 'bookmark'
  ref_id      UNINDEXED,   -- section_id / note_id / highlight_id / bookmark_id
  page        UNINDEXED,
  pos         UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);
```
Aturan:
- Dikelola **di service/repository dalam transaksi yang sama** dengan perubahan sumber. Tidak ada trigger tersembunyi.
- `content`: satu baris per blok-grup (rich) atau per halaman (PDF) agar snippet + posisi presisi. Simpan `pos` = linear_pos awal.
- Hapus dokumen → `DELETE FROM search_index WHERE document_id = ?`.
- Query: sanitasi input user → `"term1" "term2"*` (escape tanda kutip). Gunakan `snippet(search_index, 0, '<mark>', '</mark>', '…', 12)` dan `bm25()`. Output `<mark>` di-render sebagai React node, bukan `dangerouslySetInnerHTML`.
- Prefix match untuk term terakhir (search-as-you-type). Debounce 200 ms di UI.
- FTS5 wajib tersedia: pastikan `sqlx` link ke SQLite dengan FTS5 (`libsqlite3-sys` bundled). Test startup memverifikasi.

## 4. Settings key (JSON value)
| key | contoh |
|---|---|
| `theme` | `"system" \| "light" \| "dark"` |
| `reader.theme` | `"light" \| "sepia" \| "dark"` |
| `reader.font_family` | `"serif" \| "sans"` |
| `reader.font_scale` | `1.0` |
| `reader.line_height` | `1.6` |
| `reader.margin` | `"normal"` |
| `language` | `"en" \| "id"` |
| `tracker.min_dwell_ms` | `1200` |
| `tracker.max_wpm` | `700` |
| `tracker.read_ratio` | `0.5` |
| `tracker.idle_timeout_ms` | `45000` |
| `library.view` / `library.sort` | `"grid"` / `"recent_opened"` |
| `onboarding.done` | `true` |

Default di Rust (`SettingsService::defaults()`), bukan hanya di DB.

## 5. Query penting
```sql
-- Continue Reading (hero)
SELECT d.*, p.progress_percent, p.current_position
FROM documents d JOIN reading_progress p ON p.document_id = d.id
WHERE d.is_archived = 0 AND p.completed = 0 AND p.progress_percent > 0
ORDER BY d.last_opened_at DESC LIMIT 1;

-- Progres per section (reading map: chapter bars)
SELECT s.id, s.title, s.section_index,
       SUM(CASE WHEN g.status = 'read' THEN g.word_count ELSE 0 END) * 1.0
         / NULLIF(SUM(g.word_count), 0) AS progress,
       MAX(g.last_read_at) AS last_read_at,
       SUM(g.dwell_ms) AS dwell_ms, MAX(g.read_count) AS read_count
FROM document_sections s JOIN reading_segments g ON g.section_id = s.id
WHERE s.document_id = ? GROUP BY s.id ORDER BY s.section_index;

-- Reading time hari ini / minggu ini (zona waktu lokal dihitung di Rust, kirim batas ms)
SELECT COALESCE(SUM(active_seconds),0) FROM reading_sessions WHERE started_at >= ? AND started_at < ?;

-- Sesi yatim
SELECT id, last_heartbeat_at FROM reading_sessions WHERE ended_at IS NULL;
```

## 6. Aturan integritas
- Satu transaksi untuk: import, delete dokumen (+ FTS + file di akhir setelah commit), flush tracker, export baca konsisten (read tx).
- `reading_progress` dibuat bersama dokumen (1:1).
- Hapus file fisik **setelah** commit DB sukses; kegagalan hapus file → log + tandai orphan, dibersihkan di startup (`storage::gc_orphans`).
- Migrasi hanya maju. Jangan edit migration yang sudah dirilis; tambah file baru.
- Test migrasi: DB kosong → latest; ulang idempoten; `foreign_keys` aktif; cascade delete bekerja.
