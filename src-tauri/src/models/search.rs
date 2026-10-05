use crate::models::LogicalPosition;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnippetPart {
    pub text: String,
    #[serde(rename = "match")]
    pub is_match: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub kind: String, // "title" | "author" | "content" | "note" | "highlight" | "bookmark"
    pub document_id: String,
    pub document_title: String,
    pub section_title: Option<String>,
    pub page: Option<i64>,
    pub snippet: Vec<SnippetPart>,
    pub position: LogicalPosition,
    pub ref_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSearchInput {
    pub query: String,
    pub scope: Option<Vec<String>>,
    pub document_id: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}
