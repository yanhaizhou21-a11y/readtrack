use readtrack_lib::db::{create_in_memory_pool, run_migrations};
use readtrack_lib::repositories::SettingsRepo;
use readtrack_lib::services::SettingsService;
use serde_json::json;

#[tokio::test]
async fn test_settings_defaults_and_persistence() {
    let pool = create_in_memory_pool()
        .await
        .expect("Failed to create in-memory pool");
    run_migrations(&pool).await.expect("Migration failed");

    let repo = SettingsRepo::new();
    let service = SettingsService::new(repo);

    // Initial check: defaults
    let initial_settings = service
        .get_all(&pool)
        .await
        .expect("Failed to get settings");
    assert_eq!(initial_settings.get("theme"), Some(&json!("system")));
    assert_eq!(initial_settings.get("language"), Some(&json!("en")));
    assert_eq!(
        initial_settings.get("tracker.min_dwell_ms"),
        Some(&json!(1200))
    );

    // Update settings
    service
        .set(&pool, "theme", json!("dark"))
        .await
        .expect("Failed to set theme");
    service
        .set(&pool, "language", json!("id"))
        .await
        .expect("Failed to set language");

    // Fetch updated
    let updated_settings = service
        .get_all(&pool)
        .await
        .expect("Failed to get updated settings");
    assert_eq!(updated_settings.get("theme"), Some(&json!("dark")));
    assert_eq!(updated_settings.get("language"), Some(&json!("id")));
    // Untouched settings remain at defaults
    assert_eq!(
        updated_settings.get("tracker.min_dwell_ms"),
        Some(&json!(1200))
    );
}

#[tokio::test]
async fn test_settings_validation_rules() {
    let pool = create_in_memory_pool()
        .await
        .expect("Failed to create in-memory pool");
    run_migrations(&pool).await.expect("Migration failed");

    let repo = SettingsRepo::new();
    let service = SettingsService::new(repo);

    // Invalid theme
    assert!(service.set(&pool, "theme", json!("neon")).await.is_err());

    // Invalid font scale (outside 0.5..=3.0)
    assert!(service
        .set(&pool, "reader.font_scale", json!(0.1))
        .await
        .is_err());
    assert!(service
        .set(&pool, "reader.font_scale", json!(5.0))
        .await
        .is_err());
    assert!(service
        .set(&pool, "reader.font_scale", json!(1.5))
        .await
        .is_ok());

    // Non-whitelisted key
    assert!(service
        .set(&pool, "unauthorized.key", json!("evil"))
        .await
        .is_err());
}
