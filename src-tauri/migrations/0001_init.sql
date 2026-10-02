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
  content        TEXT,
  word_count     INTEGER NOT NULL DEFAULT 0,
  start_position INTEGER NOT NULL,
  end_position   INTEGER NOT NULL,
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
  first_block_id TEXT,
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
  current_position      TEXT,
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
  ended_at          INTEGER,
  last_heartbeat_at INTEGER NOT NULL,
  duration_seconds  INTEGER NOT NULL DEFAULT 0,
  active_seconds    INTEGER NOT NULL DEFAULT 0,
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
  position    TEXT NOT NULL,
  pos         INTEGER NOT NULL,
  page        INTEGER,
  section_id  TEXT REFERENCES document_sections(id) ON DELETE SET NULL,
  title       TEXT,
  excerpt     TEXT,
  note        TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX ix_bookmarks_document ON bookmarks(document_id, pos);

CREATE TABLE highlights (
  id             TEXT PRIMARY KEY,
  document_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  position_start TEXT NOT NULL,
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
  document_id      TEXT REFERENCES documents(id) ON DELETE CASCADE,
  enabled          INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  schedule_type    TEXT NOT NULL CHECK (schedule_type IN ('daily','weekdays','custom','once')),
  time_of_day_min  INTEGER,
  days_of_week     INTEGER,
  scheduled_at     INTEGER,
  repeat_interval  INTEGER,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX ix_reminders_document ON reminders(document_id);

CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
