use super::document::DocumentSummary;
use super::position::LogicalPosition;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingSession {
    pub id: String,
    pub document_id: String,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub last_heartbeat_at: i64,
    pub duration_seconds: i64,
    pub active_seconds: i64,
    pub start_position: Option<LogicalPosition>,
    pub end_position: Option<LogicalPosition>,
    pub start_pos: i64,
    pub end_pos: i64,
    pub pages_read: i64,
    pub segments_read: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub session_id: String,
    pub document_id: String,
    pub started_at: i64,
    pub ended_at: i64,
    pub duration_seconds: i64,
    pub active_seconds: i64,
    pub pages_read: i64,
    pub segments_read: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisibleSegmentRatio {
    pub segment_index: i64,
    pub ratio: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportReport {
    pub session_id: String,
    pub ts: i64,
    pub visible: Vec<VisibleSegmentRatio>,
    pub position: LogicalPosition,
    pub interacting: bool,
    pub foreground: bool,
    pub jump: String, // "none" | "toc" | "search" | "bookmark" | "resume" | "slider"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSessionInput {
    pub document_id: String,
    pub position: LogicalPosition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSessionResponse {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndSessionInput {
    pub session_id: String,
    pub position: LogicalPosition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSessionsInput {
    pub document_id: Option<String>,
    pub from: Option<i64>,
    pub to: Option<i64>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapSegment {
    pub index: i64,
    pub status: String,
    pub word_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapSection {
    pub section_id: String,
    pub index: i64,
    pub title: String,
    pub progress: f64,
    pub status: String, // "unread" | "reading" | "read"
    pub last_read_at: Option<i64>,
    pub read_ms: i64,
    pub sessions: i64,
    pub segments: Vec<MapSegment>,
    pub start_pos: LogicalPosition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingMap {
    pub document_id: String,
    pub progress: f64,
    pub completed: bool,
    pub total_read_ms: i64,
    pub sessions: i64,
    pub last_read_at: Option<i64>,
    pub sections: Vec<MapSection>,
    pub current: LogicalPosition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayActivity {
    pub date: String,
    pub ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackerOverviewInput {
    pub now: i64,
    pub tz_offset_min: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackerOverview {
    pub today_ms: i64,
    pub week_ms: i64,
    pub documents: i64,
    pub completed: i64,
    pub currently_reading: Vec<DocumentSummary>,
    pub activity_by_day: Vec<DayActivity>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeDashboardInput {
    pub now: i64,
    pub tz_offset_min: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinueCard {
    pub document: DocumentSummary,
    pub section_title: Option<String>,
    pub progress: f64,
    pub position: LogicalPosition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeDashboard {
    pub continue_reading: Option<ContinueCard>,
    pub recent: Vec<DocumentSummary>,
    pub currently_reading: i64,
    pub completed: i64,
    pub activity: Vec<DayActivity>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgressUpdatedPayload {
    pub document_id: String,
    pub progress: f64,
    pub current_section_id: Option<String>,
    pub completed: bool,
}
