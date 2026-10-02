pub mod commands;
pub mod db;
pub mod errors;
pub mod exporters;
pub mod models;
pub mod parsers;
pub mod repositories;
pub mod services;
pub mod storage;
pub mod utils;

use tauri::Manager;

pub struct AppState {
    pub db: sqlx::SqlitePool,
    pub storage: storage::StoragePaths,
    pub settings_service: services::SettingsService,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            let storage = storage::StoragePaths::new(app_data_dir);
            storage
                .init_dirs()
                .expect("Failed to initialize storage directories");

            let db_path = storage.db_path();
            let app_handle = app.handle().clone();

            tauri::async_runtime::block_on(async move {
                let pool = db::create_sqlite_pool(&db_path)
                    .await
                    .expect("Failed to create SQLite pool");

                db::run_migrations(&pool)
                    .await
                    .expect("Failed to run database migrations");

                db::verify_fts5_available(&pool)
                    .await
                    .expect("FTS5 verification failed");

                let settings_repo = repositories::SettingsRepo::new();
                let settings_service = services::SettingsService::new(settings_repo);

                app_handle.manage(AppState {
                    db: pool,
                    storage,
                    settings_service,
                });
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings_get_all,
            commands::settings_set
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
