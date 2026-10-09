use chrono::{Datelike, Duration, NaiveTime, TimeZone};
use sqlx::SqlitePool;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::errors::AppError;
use crate::models::{NotificationPayload, Reminder, ReminderScheduleType, ReminderUpsertInput};
use crate::repositories::{DocumentRepo, ReminderRepo};

pub fn compute_next_trigger_from_dt<Tz: TimeZone>(
    schedule_type: ReminderScheduleType,
    time_of_day_min: Option<i64>,
    days_of_week: Option<i64>,
    scheduled_at: Option<i64>,
    now: chrono::DateTime<Tz>,
) -> Option<i64> {
    match schedule_type {
        ReminderScheduleType::Once => {
            let at = scheduled_at?;
            if at > now.timestamp_millis() {
                Some(at)
            } else {
                // Quiet skip: do not trigger past appointments
                None
            }
        }
        ReminderScheduleType::Daily => {
            let total_min = time_of_day_min?;
            let hour = (total_min / 60) as u32;
            let min = (total_min % 60) as u32;
            let target_time = NaiveTime::from_hms_opt(hour, min, 0)?;

            let today_date = now.date_naive();
            for offset in 0..=7 {
                let candidate_date = today_date + Duration::days(offset);
                if let Some(candidate_dt) = now
                    .timezone()
                    .from_local_datetime(&candidate_date.and_time(target_time))
                    .earliest()
                {
                    if candidate_dt > now {
                        return Some(candidate_dt.timestamp_millis());
                    }
                }
            }
            None
        }
        ReminderScheduleType::Weekdays => {
            let total_min = time_of_day_min?;
            let hour = (total_min / 60) as u32;
            let min = (total_min % 60) as u32;
            let target_time = NaiveTime::from_hms_opt(hour, min, 0)?;

            let today_date = now.date_naive();
            for offset in 0..=7 {
                let candidate_date = today_date + Duration::days(offset);
                let weekday = candidate_date.weekday();
                // Monday = 1, Friday = 5
                if weekday.number_from_monday() <= 5 {
                    if let Some(candidate_dt) = now
                        .timezone()
                        .from_local_datetime(&candidate_date.and_time(target_time))
                        .earliest()
                    {
                        if candidate_dt > now {
                            return Some(candidate_dt.timestamp_millis());
                        }
                    }
                }
            }
            None
        }
        ReminderScheduleType::Custom => {
            let total_min = time_of_day_min?;
            let days_mask = days_of_week?;
            if days_mask <= 0 {
                return None;
            }
            let hour = (total_min / 60) as u32;
            let min = (total_min % 60) as u32;
            let target_time = NaiveTime::from_hms_opt(hour, min, 0)?;

            let today_date = now.date_naive();
            for offset in 0..=7 {
                let candidate_date = today_date + Duration::days(offset);
                let weekday = candidate_date.weekday();
                // Bitmask: Mon=1, Tue=2, Wed=4, Thu=8, Fri=16, Sat=32, Sun=64
                let bit = 1i64 << (weekday.number_from_monday() - 1);
                if (days_mask & bit) != 0 {
                    if let Some(candidate_dt) = now
                        .timezone()
                        .from_local_datetime(&candidate_date.and_time(target_time))
                        .earliest()
                    {
                        if candidate_dt > now {
                            return Some(candidate_dt.timestamp_millis());
                        }
                    }
                }
            }
            None
        }
    }
}

pub fn compute_next_trigger(
    schedule_type: ReminderScheduleType,
    time_of_day_min: Option<i64>,
    days_of_week: Option<i64>,
    scheduled_at: Option<i64>,
    now_local: chrono::DateTime<chrono::Local>,
) -> Option<i64> {
    compute_next_trigger_from_dt(
        schedule_type,
        time_of_day_min,
        days_of_week,
        scheduled_at,
        now_local,
    )
}

#[derive(Clone)]
pub struct ReminderService {
    pool: SqlitePool,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    scheduler_task: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl ReminderService {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            pool,
            app_handle: Arc::new(Mutex::new(None)),
            scheduler_task: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn set_app_handle(&self, handle: AppHandle) {
        let mut handle_guard = self.app_handle.lock().await;
        *handle_guard = Some(handle);
    }

    pub async fn list(&self) -> Result<Vec<Reminder>, AppError> {
        ReminderRepo::list_all(&self.pool).await
    }

    pub async fn get(&self, id: &str) -> Result<Option<Reminder>, AppError> {
        ReminderRepo::get_by_id(&self.pool, id).await
    }

    pub async fn get_global_habit(&self) -> Result<Option<Reminder>, AppError> {
        ReminderRepo::get_global_habit(&self.pool).await
    }

    pub async fn get_for_document(&self, doc_id: &str) -> Result<Option<Reminder>, AppError> {
        ReminderRepo::get_for_document(&self.pool, doc_id).await
    }

    pub async fn upsert(&self, input: ReminderUpsertInput) -> Result<Reminder, AppError> {
        input.validate()?;

        let now = chrono::Utc::now().timestamp_millis();
        let id = match input.id {
            Some(ref s) if !s.trim().is_empty() => s.clone(),
            _ => uuid::Uuid::new_v4().to_string(),
        };

        let existing = ReminderRepo::get_by_id(&self.pool, &id).await?;
        let created_at = existing.map(|e| e.created_at).unwrap_or(now);

        let reminder = Reminder {
            id,
            document_id: input.document_id,
            enabled: input.enabled.unwrap_or(true),
            schedule_type: input.schedule_type,
            time_of_day_min: input.time_of_day_min,
            days_of_week: input.days_of_week,
            scheduled_at: input.scheduled_at,
            repeat_interval: input.repeat_interval,
            created_at,
            updated_at: now,
        };

        ReminderRepo::upsert(&self.pool, &reminder).await?;
        self.sync_notifications().await?;

        Ok(reminder)
    }

    pub async fn delete(&self, id: &str) -> Result<(), AppError> {
        ReminderRepo::delete(&self.pool, id).await?;
        self.sync_notifications().await?;
        Ok(())
    }

    pub async fn build_document_payload(
        &self,
        detail: &crate::models::DocumentDetail,
    ) -> NotificationPayload {
        let progress_pct = (detail.summary.progress * 100.0).round() as i64;
        let section_title = if let Some(ref pos) = detail.position {
            if let Some(sec_id) = pos.section_id {
                sqlx::query_scalar::<_, String>(
                    "SELECT title FROM document_sections WHERE document_id = ? AND section_index = ? LIMIT 1",
                )
                .bind(&detail.summary.id)
                .bind(sec_id)
                .fetch_optional(&self.pool)
                .await
                .ok()
                .flatten()
            } else {
                None
            }
        } else {
            None
        };

        let title = format!("Continue reading: {}", detail.summary.title);
        let body = match section_title {
            Some(ref sec) if !sec.trim().is_empty() => {
                format!(
                    "{} · {}% completed. Tap to resume.",
                    sec.trim(),
                    progress_pct
                )
            }
            _ => format!("{}% completed. Tap to resume.", progress_pct),
        };

        NotificationPayload {
            title,
            body,
            document_id: Some(detail.summary.id.clone()),
            position: detail.position.clone(),
        }
    }

    pub async fn generate_payload(
        &self,
        reminder: &Reminder,
    ) -> Result<NotificationPayload, AppError> {
        // 1. If reminder has specific document_id, use it
        if let Some(ref doc_id) = reminder.document_id {
            if let Ok(Some(detail)) = DocumentRepo::get_detail(&self.pool, doc_id).await {
                return Ok(self.build_document_payload(&detail).await);
            }
        }

        // 2. Global habit: find latest read or opened active document
        let latest_doc_id = sqlx::query_scalar::<_, String>(
            r#"
            SELECT d.id
            FROM documents d
            LEFT JOIN reading_progress p ON p.document_id = d.id
            WHERE d.is_archived = 0 AND COALESCE(p.completed, 0) = 0
            ORDER BY COALESCE(d.last_opened_at, d.created_at) DESC
            LIMIT 1
            "#,
        )
        .fetch_optional(&self.pool)
        .await
        .unwrap_or(None);

        if let Some(id) = latest_doc_id {
            if let Ok(Some(detail)) = DocumentRepo::get_detail(&self.pool, &id).await {
                return Ok(self.build_document_payload(&detail).await);
            }
        }

        // 3. Fallback when no active documents
        Ok(NotificationPayload {
            title: "Reading Reminder".to_string(),
            body: "Time for your daily reading habit. Open ReadTrack to read.".to_string(),
            document_id: None,
            position: None,
        })
    }

    pub async fn send_notification(&self, payload: &NotificationPayload) -> Result<(), AppError> {
        let handle_guard = self.app_handle.lock().await;
        if let Some(handle) = handle_guard.as_ref() {
            use tauri_plugin_notification::NotificationExt;
            let _ = handle
                .notification()
                .builder()
                .title(&payload.title)
                .body(&payload.body)
                .show();

            let _ = handle.emit("reminder_notification_triggered", payload);
        }
        Ok(())
    }

    pub async fn test_notify(
        &self,
        reminder_id: Option<&str>,
    ) -> Result<NotificationPayload, AppError> {
        let reminder = match reminder_id {
            Some(id) => self.get(id).await?.unwrap_or_else(|| Reminder {
                id: "test".to_string(),
                document_id: None,
                enabled: true,
                schedule_type: ReminderScheduleType::Daily,
                time_of_day_min: Some(1200),
                days_of_week: None,
                scheduled_at: None,
                repeat_interval: None,
                created_at: 0,
                updated_at: 0,
            }),
            None => self.get_global_habit().await?.unwrap_or_else(|| Reminder {
                id: "test".to_string(),
                document_id: None,
                enabled: true,
                schedule_type: ReminderScheduleType::Daily,
                time_of_day_min: Some(1200),
                days_of_week: None,
                scheduled_at: None,
                repeat_interval: None,
                created_at: 0,
                updated_at: 0,
            }),
        };

        let payload = self.generate_payload(&reminder).await?;
        self.send_notification(&payload).await?;
        Ok(payload)
    }

    pub async fn sync_notifications(&self) -> Result<(), AppError> {
        let mut scheduler_guard = self.scheduler_task.lock().await;
        if let Some(task) = scheduler_guard.take() {
            task.abort();
        }

        let service_clone = self.clone();
        let join_handle = tokio::spawn(async move {
            loop {
                let reminders = match ReminderRepo::list_enabled(&service_clone.pool).await {
                    Ok(r) => r,
                    Err(_) => break,
                };
                if reminders.is_empty() {
                    break;
                }

                let now_local = chrono::Local::now();
                let mut min_ms: Option<i64> = None;
                let mut scheduled: Vec<(i64, Reminder)> = Vec::new();

                for r in reminders {
                    if let Some(next_ms) = compute_next_trigger(
                        r.schedule_type,
                        r.time_of_day_min,
                        r.days_of_week,
                        r.scheduled_at,
                        now_local,
                    ) {
                        match min_ms {
                            Some(cur_min) if next_ms < cur_min => {
                                min_ms = Some(next_ms);
                            }
                            None => {
                                min_ms = Some(next_ms);
                            }
                            _ => {}
                        }
                        scheduled.push((next_ms, r));
                    }
                }

                let wake_ms = match min_ms {
                    Some(ms) => ms,
                    None => break,
                };

                let due_reminders: Vec<Reminder> = scheduled
                    .into_iter()
                    .filter(|(r_ms, _)| *r_ms <= wake_ms + 5000)
                    .map(|(_, r)| r)
                    .collect();

                let now_ms = chrono::Utc::now().timestamp_millis();
                let delay_ms = (wake_ms - now_ms).max(0) as u64;

                tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;

                for reminder in due_reminders {
                    if let Ok(payload) = service_clone.generate_payload(&reminder).await {
                        let _ = service_clone.send_notification(&payload).await;
                    }
                    if reminder.schedule_type == ReminderScheduleType::Once {
                        let mut disabled = reminder.clone();
                        disabled.enabled = false;
                        let _ = ReminderRepo::upsert(&service_clone.pool, &disabled).await;
                    }
                }
            }
        });

        *scheduler_guard = Some(join_handle);
        Ok(())
    }
}
