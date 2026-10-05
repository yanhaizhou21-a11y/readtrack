use sqlx::SqlitePool;

use crate::errors::AppError;
use crate::models::{DocumentSearchInput, SearchHit};
use crate::repositories::SearchRepo;

pub struct SearchService {
    db: SqlitePool,
}

impl SearchService {
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
    }

    pub async fn search(&self, input: DocumentSearchInput) -> Result<Vec<SearchHit>, AppError> {
        let limit = input.limit.unwrap_or(20).clamp(1, 100);
        let offset = input.offset.unwrap_or(0).max(0);

        SearchRepo::search(
            &self.db,
            &input.query,
            input.scope.as_deref(),
            input.document_id.as_deref(),
            limit,
            offset,
        )
        .await
    }
}
