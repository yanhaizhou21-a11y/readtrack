use tauri::State;

use crate::errors::IpcError;
use crate::models::{
    NotificationPayload, Reminder, ReminderDeleteInput, ReminderGetInput, ReminderTestNotifyInput,
    ReminderUpsertInput,
};
use crate::AppState;

#[tauri::command]
pub async fn reminder_list(state: State<'_, AppState>) -> Result<Vec<Reminder>, IpcError> {
    state.reminder_service.list().await.map_err(IpcError::from)
}

#[tauri::command]
pub async fn reminder_get(
    state: State<'_, AppState>,
    input: ReminderGetInput,
) -> Result<Option<Reminder>, IpcError> {
    state
        .reminder_service
        .get(&input.id)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn reminder_upsert(
    state: State<'_, AppState>,
    input: ReminderUpsertInput,
) -> Result<Reminder, IpcError> {
    state
        .reminder_service
        .upsert(input)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn reminder_delete(
    state: State<'_, AppState>,
    input: ReminderDeleteInput,
) -> Result<(), IpcError> {
    state
        .reminder_service
        .delete(&input.id)
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn reminder_sync_notifications(state: State<'_, AppState>) -> Result<(), IpcError> {
    state
        .reminder_service
        .sync_notifications()
        .await
        .map_err(IpcError::from)
}

#[tauri::command]
pub async fn reminder_test_notify(
    state: State<'_, AppState>,
    input: ReminderTestNotifyInput,
) -> Result<NotificationPayload, IpcError> {
    state
        .reminder_service
        .test_notify(input.id.as_deref())
        .await
        .map_err(IpcError::from)
}
