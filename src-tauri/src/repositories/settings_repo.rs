use crate::errors::AppError;
use crate::models::SettingRecord;
use sqlx::{Row, SqlitePool};

#[derive(Clone, Default)]
pub struct SettingsRepo;

impl SettingsRepo {
    pub fn new() -> Self {
        Self
    }

    pub async fn get_all(&self, pool: &SqlitePool) -> Result<Vec<SettingRecord>, AppError> {
        let rows = sqlx::query("SELECT key, value, updated_at FROM app_settings")
            .fetch_all(pool)
            .await
            .map_err(AppError::from)?;

        let mut results = Vec::new();
        for row in rows {
            let key: String = row.try_get("key").map_err(AppError::from)?;
            let value_str: String = row.try_get("value").map_err(AppError::from)?;
            let updated_at: i64 = row.try_get("updated_at").map_err(AppError::from)?;

            let value = serde_json::from_str(&value_str).unwrap_or(serde_json::Value::Null);
            results.push(SettingRecord {
                key,
                value,
                updated_at,
            });
        }

        Ok(results)
    }

    pub async fn get(
        &self,
        pool: &SqlitePool,
        key: &str,
    ) -> Result<Option<SettingRecord>, AppError> {
        let row_opt = sqlx::query("SELECT key, value, updated_at FROM app_settings WHERE key = ?")
            .bind(key)
            .fetch_optional(pool)
            .await
            .map_err(AppError::from)?;

        if let Some(row) = row_opt {
            let key: String = row.try_get("key").map_err(AppError::from)?;
            let value_str: String = row.try_get("value").map_err(AppError::from)?;
            let updated_at: i64 = row.try_get("updated_at").map_err(AppError::from)?;
            let value = serde_json::from_str(&value_str).unwrap_or(serde_json::Value::Null);
            Ok(Some(SettingRecord {
                key,
                value,
                updated_at,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn upsert(&self, pool: &SqlitePool, record: &SettingRecord) -> Result<(), AppError> {
        let value_str = serde_json::to_string(&record.value).map_err(|e| {
            tracing::error!("Failed to serialize setting value: {:?}", e);
            AppError::InvalidInput {
                field: record.key.clone(),
            }
        })?;

        sqlx::query(
            "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        )
        .bind(&record.key)
        .bind(value_str)
        .bind(record.updated_at)
        .execute(pool)
        .await
        .map_err(AppError::from)?;

        Ok(())
    }
}
