use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportInput {
    pub document_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub file_name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportShareInput {
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgressPayload {
    pub job_id: String,
    pub kind: String,
    pub percent: u32,
    pub stage: String,
}

#[derive(Debug, Clone)]
pub struct ExportData {
    pub documents: Vec<ExportDocumentRow>,
    pub sessions: Vec<ExportSessionRow>,
    pub progress_segments: Vec<ExportProgressRow>,
    pub bookmarks: Vec<ExportBookmarkRow>,
    pub highlights: Vec<ExportHighlightRow>,
    pub notes: Vec<ExportNoteRow>,
}

#[derive(Debug, Clone)]
pub struct ExportDocumentRow {
    pub id: String,
    pub title: String,
    pub author: Option<String>,
    pub file_type: String,
    pub file_size: i64,
    pub word_count: Option<i64>,
    pub page_count: Option<i64>,
    pub progress_percent: f64,
    pub completed: bool,
    pub created_at: i64,
    pub last_opened_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct ExportSessionRow {
    pub id: String,
    pub document_id: String,
    pub document_title: String,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub duration_seconds: i64,
    pub active_seconds: i64,
    pub pages_read: i64,
    pub segments_read: i64,
}

#[derive(Debug, Clone)]
pub struct ExportProgressRow {
    pub document_title: String,
    pub section_index: i64,
    pub section_title: String,
    pub segment_index: i64,
    pub status: String,
    pub dwell_ms: i64,
    pub last_read_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct ExportBookmarkRow {
    pub id: String,
    pub document_title: String,
    pub page: Option<i64>,
    pub section_title: Option<String>,
    pub title: Option<String>,
    pub excerpt: Option<String>,
    pub note: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct ExportHighlightRow {
    pub id: String,
    pub document_title: String,
    pub color: String,
    pub selected_text: String,
    pub note: Option<String>,
    pub start_pos: i64,
    pub end_pos: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct ExportNoteRow {
    pub id: String,
    pub document_title: String,
    pub content: String,
    pub created_at: i64,
}
