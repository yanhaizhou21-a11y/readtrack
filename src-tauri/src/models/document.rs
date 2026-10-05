use serde::{Deserialize, Serialize};

use super::position::LogicalPosition;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub title: String,
    pub author: Option<String>,
    pub original_filename: String,
    pub file_path: String,
    pub file_type: String,
    pub mime_type: String,
    pub file_size: i64,
    pub content_hash: String,
    pub page_count: Option<i64>,
    pub word_count: Option<i64>,
    pub thumbnail_path: Option<String>,
    pub language: Option<String>,
    pub parse_status: String,
    pub parse_error: Option<String>,
    pub parser_version: i64,
    pub index_status: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_opened_at: Option<i64>,
    pub is_archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummary {
    pub id: String,
    pub title: String,
    pub author: Option<String>,
    pub file_type: String,
    pub file_size: i64,
    pub page_count: Option<i64>,
    pub word_count: Option<i64>,
    pub section_count: i64,
    pub progress: f64,
    pub completed: bool,
    pub is_archived: bool,
    pub created_at: i64,
    pub last_opened_at: Option<i64>,
    pub thumbnail_url: Option<String>,
    pub parse_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentDetail {
    #[serde(flatten)]
    pub summary: DocumentSummary,
    pub original_filename: String,
    pub mime_type: String,
    pub content_hash: String,
    pub total_read_ms: i64,
    pub session_count: i64,
    pub last_read_at: Option<i64>,
    pub position: Option<LogicalPosition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSection {
    pub id: String,
    pub document_id: String,
    pub section_index: i64,
    pub section_type: String,
    pub title: Option<String>,
    pub level: i64,
    pub content: Option<String>,
    pub word_count: i64,
    pub start_position: i64,
    pub end_position: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockPayload {
    pub id: String,
    #[serde(rename = "type")]
    pub block_type: String,
    pub text: String,
    pub word_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionPayload {
    pub id: String,
    pub index: i64,
    pub title: Option<String>,
    pub level: i64,
    pub word_count: i64,
    pub blocks: Vec<BlockPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingSegment {
    pub id: String,
    pub document_id: String,
    pub section_id: String,
    pub segment_type: String,
    pub segment_index: i64,
    pub first_block_id: Option<String>,
    pub last_block_id: Option<String>,
    pub start_position: i64,
    pub end_position: i64,
    pub word_count: i64,
    pub status: String,
    pub dwell_ms: i64,
    pub first_read_at: Option<i64>,
    pub last_read_at: Option<i64>,
    pub read_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgress {
    pub id: String,
    pub document_id: String,
    pub current_page: Option<i64>,
    pub current_position: LogicalPosition,
    pub current_pos: i64,
    pub current_section_id: Option<String>,
    pub progress_percent: f64,
    pub furthest_pos: i64,
    pub total_read_ms: i64,
    pub completed: bool,
    pub completed_at: Option<i64>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentImportInput {
    pub source: String,
    pub on_duplicate: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentImportBytesInput {
    pub file_name: String,
    pub data: Vec<u8>,
    pub on_duplicate: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentListInput {
    pub filter: Option<String>,
    pub sort: Option<String>,
    pub query: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentListResponse {
    pub items: Vec<DocumentSummary>,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentGetInput {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRenameInput {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentArchiveInput {
    pub id: String,
    pub archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentDeleteInput {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentTouchInput {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentGetSectionsInput {
    pub id: String,
    pub from_index: Option<i64>,
    pub count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgressPayload {
    pub job_id: String,
    pub file_name: String,
    pub percent: f64,
    pub stage: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryChangedPayload {
    pub reason: String,
}
