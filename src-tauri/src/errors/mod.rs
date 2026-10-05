use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(thiserror::Error, Debug)]
pub enum AppError {
    #[error("Document not found")]
    DocumentNotFound,

    #[error("This file type isn't supported yet.")]
    UnsupportedFormat { ext: String },

    #[error("This document already exists.")]
    DuplicateDocument { existing_id: String },

    #[error("The file is too large to import. Maximum allowed size is {max_mb} MB.")]
    FileTooLarge {
        max_bytes: u64,
        actual_bytes: u64,
        max_mb: u64,
    },

    #[error("We couldn't open this document. The file may be corrupted or unsupported.")]
    InvalidDocument { reason: String },

    #[error("We couldn't open this document. The file may be corrupted or unsupported.")]
    ParseFailed { reason: String },

    #[error("Database error occurred.")]
    DatabaseError,

    #[error("Export failed: {reason}")]
    ExportFailed { reason: String },

    #[error("ReadTrack doesn't have permission to access this file.")]
    PermissionDenied,

    #[error("Storage isn't available. Free up space and try again.")]
    StorageUnavailable,

    #[error("Invalid input for {field}")]
    InvalidInput { field: String },

    #[error("Not found: {entity}")]
    NotFound { entity: String },

    #[error("An unexpected error occurred.")]
    Internal,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IpcError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
    pub retryable: bool,
}

impl From<AppError> for IpcError {
    fn from(err: AppError) -> Self {
        match err {
            AppError::DocumentNotFound => Self {
                code: "DocumentNotFound".to_string(),
                message: "Document not found.".to_string(),
                details: None,
                retryable: false,
            },
            AppError::UnsupportedFormat { ext } => Self {
                code: "UnsupportedFormat".to_string(),
                message: "This file type isn't supported yet.".to_string(),
                details: Some(json!({ "extension": ext })),
                retryable: false,
            },
            AppError::DuplicateDocument { existing_id } => Self {
                code: "DuplicateDocument".to_string(),
                message: "This document already exists.".to_string(),
                details: Some(json!({ "existingId": existing_id })),
                retryable: false,
            },
            AppError::FileTooLarge {
                max_bytes,
                actual_bytes,
                max_mb,
            } => Self {
                code: "FileTooLarge".to_string(),
                message: format!("The file exceeds the maximum allowed size of {max_mb} MB."),
                details: Some(json!({
                    "code": 41301,
                    "maxBytes": max_bytes,
                    "actualBytes": actual_bytes
                })),
                retryable: false,
            },
            AppError::InvalidDocument { .. } => Self {
                code: "InvalidDocument".to_string(),
                message:
                    "We couldn't open this document. The file may be corrupted or unsupported."
                        .to_string(),
                details: None,
                retryable: false,
            },
            AppError::ParseFailed { .. } => Self {
                code: "ParseFailed".to_string(),
                message:
                    "We couldn't open this document. The file may be corrupted or unsupported."
                        .to_string(),
                details: None,
                retryable: false,
            },
            AppError::DatabaseError => Self {
                code: "DatabaseError".to_string(),
                message: "A database error occurred.".to_string(),
                details: None,
                retryable: true,
            },
            AppError::ExportFailed { .. } => Self {
                code: "ExportFailed".to_string(),
                message: "Export failed. Please try again.".to_string(),
                details: None,
                retryable: true,
            },
            AppError::PermissionDenied => Self {
                code: "PermissionDenied".to_string(),
                message: "ReadTrack doesn't have permission to access this file.".to_string(),
                details: None,
                retryable: false,
            },
            AppError::StorageUnavailable => Self {
                code: "StorageUnavailable".to_string(),
                message: "Storage isn't available. Free up space and try again.".to_string(),
                details: None,
                retryable: true,
            },
            AppError::InvalidInput { field } => Self {
                code: "InvalidInput".to_string(),
                message: format!("Invalid input for {field}."),
                details: Some(json!({ "field": field })),
                retryable: false,
            },
            AppError::NotFound { entity } => Self {
                code: "NotFound".to_string(),
                message: format!("Not found: {entity}."),
                details: Some(json!({ "entity": entity })),
                retryable: false,
            },
            AppError::Internal => Self {
                code: "Internal".to_string(),
                message: "An unexpected error occurred.".to_string(),
                details: None,
                retryable: true,
            },
        }
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        tracing::error!("Database error: {:?}", err);
        AppError::DatabaseError
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        tracing::error!("IO error: {:?}", err);
        match err.kind() {
            std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied,
            _ => AppError::StorageUnavailable,
        }
    }
}
