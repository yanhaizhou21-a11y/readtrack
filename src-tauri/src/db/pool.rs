use crate::errors::AppError;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::SqlitePool;
use std::path::Path;
use std::time::Duration;

pub async fn create_sqlite_pool(db_path: &Path) -> Result<SqlitePool, AppError> {
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_millis(5000))
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(AppError::from)?;

    Ok(pool)
}

pub async fn create_in_memory_pool() -> Result<SqlitePool, AppError> {
    let options = SqliteConnectOptions::new()
        .filename(":memory:")
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(AppError::from)?;

    Ok(pool)
}

pub async fn run_migrations(pool: &SqlitePool) -> Result<(), AppError> {
    sqlx::migrate!("./migrations")
        .run(pool)
        .await
        .map_err(|e| {
            tracing::error!("Migration failed: {:?}", e);
            AppError::DatabaseError
        })?;
    Ok(())
}

pub async fn verify_fts5_available(pool: &SqlitePool) -> Result<(), AppError> {
    sqlx::query("SELECT 1 FROM search_index LIMIT 0")
        .execute(pool)
        .await
        .map_err(|e| {
            tracing::error!("FTS5 search_index check failed: {:?}", e);
            AppError::DatabaseError
        })?;
    Ok(())
}
