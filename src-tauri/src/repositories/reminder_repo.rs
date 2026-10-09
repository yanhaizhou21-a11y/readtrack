use crate::errors::AppError;
use crate::models::{Reminder, ReminderScheduleType};
use sqlx::{Row, SqlitePool};

pub struct ReminderRepo;

impl ReminderRepo {
    fn from_row(row: &sqlx::sqlite::SqliteRow) -> Result<Reminder, AppError> {
        let schedule_type_str: String = row.get("schedule_type");
        let schedule_type = ReminderScheduleType::from_str_val(&schedule_type_str)
            .unwrap_or(ReminderScheduleType::Daily);
        let enabled_num: i64 = row.get("enabled");

        Ok(Reminder {
            id: row.get("id"),
            document_id: row.get("document_id"),
            enabled: enabled_num != 0,
            schedule_type,
            time_of_day_min: row.get("time_of_day_min"),
            days_of_week: row.get("days_of_week"),
            scheduled_at: row.get("scheduled_at"),
            repeat_interval: row.get("repeat_interval"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        })
    }

    pub async fn upsert(pool: &SqlitePool, reminder: &Reminder) -> Result<(), AppError> {
        let enabled_val: i64 = if reminder.enabled { 1 } else { 0 };

        sqlx::query(
            r#"
            INSERT INTO reminders (
                id, document_id, enabled, schedule_type, time_of_day_min,
                days_of_week, scheduled_at, repeat_interval, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                document_id = excluded.document_id,
                enabled = excluded.enabled,
                schedule_type = excluded.schedule_type,
                time_of_day_min = excluded.time_of_day_min,
                days_of_week = excluded.days_of_week,
                scheduled_at = excluded.scheduled_at,
                repeat_interval = excluded.repeat_interval,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(&reminder.id)
        .bind(&reminder.document_id)
        .bind(enabled_val)
        .bind(reminder.schedule_type.as_str())
        .bind(reminder.time_of_day_min)
        .bind(reminder.days_of_week)
        .bind(reminder.scheduled_at)
        .bind(reminder.repeat_interval)
        .bind(reminder.created_at)
        .bind(reminder.updated_at)
        .execute(pool)
        .await
        .map_err(AppError::from)?;

        Ok(())
    }

    pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Reminder>, AppError> {
        let rows = sqlx::query(
            r#"
            SELECT id, document_id, enabled, schedule_type, time_of_day_min,
                   days_of_week, scheduled_at, repeat_interval, created_at, updated_at
            FROM reminders
            ORDER BY created_at ASC
            "#,
        )
        .fetch_all(pool)
        .await
        .map_err(AppError::from)?;

        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            list.push(Self::from_row(&row)?);
        }
        Ok(list)
    }

    pub async fn list_enabled(pool: &SqlitePool) -> Result<Vec<Reminder>, AppError> {
        let rows = sqlx::query(
            r#"
            SELECT id, document_id, enabled, schedule_type, time_of_day_min,
                   days_of_week, scheduled_at, repeat_interval, created_at, updated_at
            FROM reminders
            WHERE enabled = 1
            ORDER BY created_at ASC
            "#,
        )
        .fetch_all(pool)
        .await
        .map_err(AppError::from)?;

        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            list.push(Self::from_row(&row)?);
        }
        Ok(list)
    }

    pub async fn get_by_id(pool: &SqlitePool, id: &str) -> Result<Option<Reminder>, AppError> {
        let row = sqlx::query(
            r#"
            SELECT id, document_id, enabled, schedule_type, time_of_day_min,
                   days_of_week, scheduled_at, repeat_interval, created_at, updated_at
            FROM reminders
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(AppError::from)?;

        match row {
            Some(r) => Ok(Some(Self::from_row(&r)?)),
            None => Ok(None),
        }
    }

    pub async fn get_global_habit(pool: &SqlitePool) -> Result<Option<Reminder>, AppError> {
        let row = sqlx::query(
            r#"
            SELECT id, document_id, enabled, schedule_type, time_of_day_min,
                   days_of_week, scheduled_at, repeat_interval, created_at, updated_at
            FROM reminders
            WHERE document_id IS NULL
            ORDER BY created_at ASC
            LIMIT 1
            "#,
        )
        .fetch_optional(pool)
        .await
        .map_err(AppError::from)?;

        match row {
            Some(r) => Ok(Some(Self::from_row(&r)?)),
            None => Ok(None),
        }
    }

    pub async fn get_for_document(
        pool: &SqlitePool,
        doc_id: &str,
    ) -> Result<Option<Reminder>, AppError> {
        let row = sqlx::query(
            r#"
            SELECT id, document_id, enabled, schedule_type, time_of_day_min,
                   days_of_week, scheduled_at, repeat_interval, created_at, updated_at
            FROM reminders
            WHERE document_id = ?
            ORDER BY created_at ASC
            LIMIT 1
            "#,
        )
        .bind(doc_id)
        .fetch_optional(pool)
        .await
        .map_err(AppError::from)?;

        match row {
            Some(r) => Ok(Some(Self::from_row(&r)?)),
            None => Ok(None),
        }
    }

    pub async fn delete(pool: &SqlitePool, id: &str) -> Result<bool, AppError> {
        let result = sqlx::query("DELETE FROM reminders WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await
            .map_err(AppError::from)?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn delete_for_document(pool: &SqlitePool, doc_id: &str) -> Result<u64, AppError> {
        let result = sqlx::query("DELETE FROM reminders WHERE document_id = ?")
            .bind(doc_id)
            .execute(pool)
            .await
            .map_err(AppError::from)?;

        Ok(result.rows_affected())
    }
}
