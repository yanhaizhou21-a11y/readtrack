use crate::errors::AppError;
use crate::models::LogicalPosition;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReminderScheduleType {
    Daily,
    Weekdays,
    Custom,
    Once,
}

impl ReminderScheduleType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Daily => "daily",
            Self::Weekdays => "weekdays",
            Self::Custom => "custom",
            Self::Once => "once",
        }
    }

    pub fn from_str_val(s: &str) -> Option<Self> {
        match s {
            "daily" => Some(Self::Daily),
            "weekdays" => Some(Self::Weekdays),
            "custom" => Some(Self::Custom),
            "once" => Some(Self::Once),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub id: String,
    pub document_id: Option<String>,
    pub enabled: bool,
    pub schedule_type: ReminderScheduleType,
    pub time_of_day_min: Option<i64>,
    pub days_of_week: Option<i64>,
    pub scheduled_at: Option<i64>,
    pub repeat_interval: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderUpsertInput {
    pub id: Option<String>,
    pub document_id: Option<String>,
    pub enabled: Option<bool>,
    pub schedule_type: ReminderScheduleType,
    pub time_of_day_min: Option<i64>,
    pub days_of_week: Option<i64>,
    pub scheduled_at: Option<i64>,
    pub repeat_interval: Option<i64>,
}

impl ReminderUpsertInput {
    pub fn validate(&self) -> Result<(), AppError> {
        match self.schedule_type {
            ReminderScheduleType::Daily | ReminderScheduleType::Weekdays => {
                let min = self.time_of_day_min.ok_or_else(|| AppError::InvalidInput {
                    field: "time_of_day_min".to_string(),
                })?;
                if !(0..=1439).contains(&min) {
                    return Err(AppError::InvalidInput {
                        field: "time_of_day_min must be between 0 and 1439".to_string(),
                    });
                }
            }
            ReminderScheduleType::Custom => {
                let min = self.time_of_day_min.ok_or_else(|| AppError::InvalidInput {
                    field: "time_of_day_min".to_string(),
                })?;
                if !(0..=1439).contains(&min) {
                    return Err(AppError::InvalidInput {
                        field: "time_of_day_min must be between 0 and 1439".to_string(),
                    });
                }
                let days = self.days_of_week.ok_or_else(|| AppError::InvalidInput {
                    field: "days_of_week".to_string(),
                })?;
                if !(1..=127).contains(&days) {
                    return Err(AppError::InvalidInput {
                        field: "days_of_week must be bitmask between 1 and 127".to_string(),
                    });
                }
            }
            ReminderScheduleType::Once => {
                let at = self.scheduled_at.ok_or_else(|| AppError::InvalidInput {
                    field: "scheduled_at".to_string(),
                })?;
                if at <= 0 {
                    return Err(AppError::InvalidInput {
                        field: "scheduled_at must be positive epoch timestamp".to_string(),
                    });
                }
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderDeleteInput {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderGetInput {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderTestNotifyInput {
    pub id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPayload {
    pub title: String,
    pub body: String,
    pub document_id: Option<String>,
    pub position: Option<LogicalPosition>,
}
