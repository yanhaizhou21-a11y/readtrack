use crate::errors::AppError;
use crate::models::{default_settings, SettingRecord};
use crate::repositories::SettingsRepo;
use serde_json::Value;
use sqlx::SqlitePool;
use std::collections::HashMap;

#[derive(Clone)]
pub struct SettingsService {
    repo: SettingsRepo,
}

impl SettingsService {
    pub fn new(repo: SettingsRepo) -> Self {
        Self { repo }
    }

    pub fn defaults(&self) -> HashMap<String, Value> {
        default_settings()
    }

    pub async fn get_all(&self, pool: &SqlitePool) -> Result<HashMap<String, Value>, AppError> {
        let mut settings = self.defaults();
        let persisted = self.repo.get_all(pool).await?;

        for record in persisted {
            settings.insert(record.key, record.value);
        }

        Ok(settings)
    }

    pub async fn set(&self, pool: &SqlitePool, key: &str, value: Value) -> Result<(), AppError> {
        self.validate_setting(key, &value)?;

        let now_ms = chrono::Utc::now().timestamp_millis();
        let record = SettingRecord {
            key: key.to_string(),
            value,
            updated_at: now_ms,
        };

        self.repo.upsert(pool, &record).await
    }

    fn validate_setting(&self, key: &str, val: &Value) -> Result<(), AppError> {
        let invalid = || AppError::InvalidInput {
            field: key.to_string(),
        };

        match key {
            "theme" => match val.as_str() {
                Some("system" | "light" | "dark") => Ok(()),
                _ => Err(invalid()),
            },
            "reader.theme" => match val.as_str() {
                Some("light" | "sepia" | "dark") => Ok(()),
                _ => Err(invalid()),
            },
            "reader.font_family" => match val.as_str() {
                Some("serif" | "sans") => Ok(()),
                _ => Err(invalid()),
            },
            "reader.font_scale" => match val.as_f64() {
                Some(scale) if (0.5..=3.0).contains(&scale) => Ok(()),
                _ => Err(invalid()),
            },
            "reader.line_height" => match val.as_f64() {
                Some(lh) if (1.0..=3.0).contains(&lh) => Ok(()),
                _ => Err(invalid()),
            },
            "reader.margin" => match val.as_str() {
                Some("compact" | "normal" | "wide") => Ok(()),
                _ => Err(invalid()),
            },
            "language" => match val.as_str() {
                Some("en" | "id") => Ok(()),
                _ => Err(invalid()),
            },
            "tracker.min_dwell_ms" => match val.as_i64() {
                Some(ms) if ms >= 0 => Ok(()),
                _ => Err(invalid()),
            },
            "tracker.max_wpm" => match val.as_i64() {
                Some(wpm) if wpm > 0 => Ok(()),
                _ => Err(invalid()),
            },
            "tracker.read_ratio" => match val.as_f64() {
                Some(r) if (0.0..=1.0).contains(&r) => Ok(()),
                _ => Err(invalid()),
            },
            "tracker.idle_timeout_ms" => match val.as_i64() {
                Some(ms) if ms > 0 => Ok(()),
                _ => Err(invalid()),
            },
            "library.view" => match val.as_str() {
                Some("grid" | "list") => Ok(()),
                _ => Err(invalid()),
            },
            "library.sort" => match val.as_str() {
                Some("recent_opened" | "recent_added" | "title" | "progress") => Ok(()),
                _ => Err(invalid()),
            },
            "onboarding.done" => match val.as_bool() {
                Some(_) => Ok(()),
                _ => Err(invalid()),
            },
            _ => Err(invalid()),
        }
    }
}
