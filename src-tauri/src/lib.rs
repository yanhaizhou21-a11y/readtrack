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
    pub import_service: services::ImportService,
    pub library_service: services::LibraryService,
    pub tracker_service: std::sync::Arc<services::TrackerService>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .register_asynchronous_uri_scheme_protocol("rt", |app_handle, request, responder| {
            let app_handle = app_handle.app_handle().clone();
            let uri = request.uri().to_string();
            let range_header = request.headers().get("Range").and_then(|h| h.to_str().ok().map(|s| s.to_string()));
            
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<AppState>();
                let parsed = url::Url::parse(&uri).unwrap_or_else(|_| url::Url::parse("rt://error").unwrap());
                
                let mut path_segments = parsed.path_segments().into_iter().flatten();
                let category = parsed.host_str().unwrap_or("");
                
                let response = match category {
                    "doc" => {
                        let id = path_segments.next().unwrap_or("");
                        if uuid::Uuid::parse_str(id).is_ok() {
                            if let Ok(Some(doc)) = repositories::DocumentRepo::get_by_id(&state.db, id).await {
                                let file_store = crate::storage::file_store::FileStore::new(state.storage.clone());
                                if let Ok(file_path) = file_store.get_document_path(&doc.id, &doc.file_type) {
                                    if let Ok(file_bytes) = std::fs::read(&file_path) {
                                        if let Some(range) = range_header {
                                            if let Some(stripped) = range.strip_prefix("bytes=") {
                                                let parts: Vec<&str> = stripped.split('-').collect();
                                                let start: usize = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
                                                let end: usize = parts.get(1).and_then(|s| if s.is_empty() { None } else { s.parse().ok() }).unwrap_or(file_bytes.len() - 1);
                                                
                                                let end = end.min(file_bytes.len() - 1);
                                                let slice = file_bytes[start..=end].to_vec();
                                                
                                                tauri::http::Response::builder()
                                                    .status(206)
                                                    .header("Content-Range", format!("bytes {}-{}/{}", start, end, file_bytes.len()))
                                                    .header("Accept-Ranges", "bytes")
                                                    .body(slice)
                                                    .unwrap()
                                            } else {
                                                tauri::http::Response::builder()
                                                    .status(200)
                                                    .body(file_bytes)
                                                    .unwrap()
                                            }
                                        } else {
                                            tauri::http::Response::builder()
                                                .status(200)
                                                .body(file_bytes)
                                                .unwrap()
                                        }
                                    } else {
                                        tauri::http::Response::builder().status(404).body(Vec::new()).unwrap()
                                    }
                                } else {
                                    tauri::http::Response::builder().status(404).body(Vec::new()).unwrap()
                                }
                            } else {
                                tauri::http::Response::builder().status(404).body(Vec::new()).unwrap()
                            }
                        } else {
                            tauri::http::Response::builder().status(400).body(Vec::new()).unwrap()
                        }
                    }
                    "thumb" => {
                        let id = path_segments.next().unwrap_or("");
                        if uuid::Uuid::parse_str(id).is_ok() {
                            let thumb_path = state.storage.thumbnails_dir().join(format!("{}.webp", id));
                            if let Ok(file_bytes) = std::fs::read(&thumb_path) {
                                tauri::http::Response::builder()
                                    .status(200)
                                    .header("Content-Type", "image/webp")
                                    .body(file_bytes)
                                    .unwrap()
                            } else {
                                tauri::http::Response::builder().status(404).body(Vec::new()).unwrap()
                            }
                        } else {
                            tauri::http::Response::builder().status(400).body(Vec::new()).unwrap()
                        }
                    }
                    _ => tauri::http::Response::builder().status(404).body(Vec::new()).unwrap()
                };
                
                responder.respond(response);
            });
        })
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
                let import_service =
                    services::ImportService::new(pool.clone(), storage.clone());
                let library_service =
                    services::LibraryService::new(pool.clone(), storage.clone());
                let tracker_service =
                    std::sync::Arc::new(services::TrackerService::new(pool.clone()));

                // Run crash recovery for orphaned sessions on startup
                if let Err(e) = tracker_service.crash_recovery().await {
                    eprintln!("Failed to run session crash recovery: {}", e);
                }

                tracker_service.set_app_handle(app_handle.clone()).await;

                app_handle.manage(AppState {
                    db: pool,
                    storage,
                    settings_service,
                    import_service,
                    library_service,
                    tracker_service,
                });
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings_get_all,
            commands::settings_set,
            commands::document_import,
            commands::document_list,
            commands::document_get,
            commands::document_rename,
            commands::document_archive,
            commands::document_delete,
            commands::document_touch,
            commands::document_get_sections,
            commands::document_resolve_position,
            commands::reading_get_progress,
            commands::reading_update_progress,
            commands::reading_start_session,
            commands::reading_report_viewport,
            commands::reading_end_session,
            commands::reading_get_sessions,
            commands::tracker_get_map,
            commands::tracker_get_overview,
            commands::home_get_dashboard,
            commands::reading_mark_completed,
            commands::reading_mark_unread
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
