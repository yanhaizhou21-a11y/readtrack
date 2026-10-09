use chrono::{Duration, NaiveDate, NaiveTime, TimeZone, Utc};
use readtrack_lib::db::{create_in_memory_pool, run_migrations};
use readtrack_lib::models::{
    Document, LogicalPosition, Reminder, ReminderScheduleType, ReminderUpsertInput,
};
use readtrack_lib::repositories::{DocumentRepo, ReminderRepo, SectionRepo};
use readtrack_lib::services::{compute_next_trigger_from_dt, ReminderService};

#[test]
fn test_compute_next_trigger_daily() {
    // 2026-10-12 is a Monday
    let base_date = NaiveDate::from_ymd_opt(2026, 10, 12).unwrap();
    // Current time: 10:00 UTC
    let now =
        Utc.from_utc_datetime(&base_date.and_time(NaiveTime::from_hms_opt(10, 0, 0).unwrap()));

    // Target 20:00 (1200 minutes) - later today
    let next_same_day =
        compute_next_trigger_from_dt(ReminderScheduleType::Daily, Some(1200), None, None, now);
    assert!(next_same_day.is_some());
    let expected_same_day = Utc
        .from_utc_datetime(&base_date.and_time(NaiveTime::from_hms_opt(20, 0, 0).unwrap()))
        .timestamp_millis();
    assert_eq!(next_same_day.unwrap(), expected_same_day);

    // Target 08:00 (480 minutes) - already passed today, must be tomorrow
    let next_next_day =
        compute_next_trigger_from_dt(ReminderScheduleType::Daily, Some(480), None, None, now);
    assert!(next_next_day.is_some());
    let expected_next_day = Utc
        .from_utc_datetime(
            &(base_date + Duration::days(1)).and_time(NaiveTime::from_hms_opt(8, 0, 0).unwrap()),
        )
        .timestamp_millis();
    assert_eq!(next_next_day.unwrap(), expected_next_day);
}

#[test]
fn test_compute_next_trigger_weekdays() {
    // 2026-10-16 is a Friday
    let friday_date = NaiveDate::from_ymd_opt(2026, 10, 16).unwrap();
    // Friday at 21:00 UTC
    let friday_night =
        Utc.from_utc_datetime(&friday_date.and_time(NaiveTime::from_hms_opt(21, 0, 0).unwrap()));

    // Target 20:00 (1200 minutes) has already passed on Friday -> must skip Sat and Sun, trigger Monday 2026-10-19!
    let next_weekday = compute_next_trigger_from_dt(
        ReminderScheduleType::Weekdays,
        Some(1200),
        None,
        None,
        friday_night,
    );
    assert!(next_weekday.is_some());

    let monday_date = NaiveDate::from_ymd_opt(2026, 10, 19).unwrap();
    let expected_monday = Utc
        .from_utc_datetime(&monday_date.and_time(NaiveTime::from_hms_opt(20, 0, 0).unwrap()))
        .timestamp_millis();
    assert_eq!(next_weekday.unwrap(), expected_monday);
}

#[test]
fn test_compute_next_trigger_custom_bitmask() {
    // 2026-10-12 is a Monday
    let monday_date = NaiveDate::from_ymd_opt(2026, 10, 12).unwrap();
    let monday_afternoon =
        Utc.from_utc_datetime(&monday_date.and_time(NaiveTime::from_hms_opt(15, 0, 0).unwrap()));

    // Schedule on Tue (2) + Thu (8) + Sun (64) = 74 at 18:00 (1080 min)
    let bitmask = 2 | 8 | 64;

    // From Monday 15:00, next trigger is Tuesday 18:00
    let next_tue = compute_next_trigger_from_dt(
        ReminderScheduleType::Custom,
        Some(1080),
        Some(bitmask),
        None,
        monday_afternoon,
    );
    assert!(next_tue.is_some());
    let tue_date = NaiveDate::from_ymd_opt(2026, 10, 13).unwrap();
    let expected_tue = Utc
        .from_utc_datetime(&tue_date.and_time(NaiveTime::from_hms_opt(18, 0, 0).unwrap()))
        .timestamp_millis();
    assert_eq!(next_tue.unwrap(), expected_tue);

    // From Tuesday 19:00, next trigger is Thursday 18:00
    let tue_night =
        Utc.from_utc_datetime(&tue_date.and_time(NaiveTime::from_hms_opt(19, 0, 0).unwrap()));
    let next_thu = compute_next_trigger_from_dt(
        ReminderScheduleType::Custom,
        Some(1080),
        Some(bitmask),
        None,
        tue_night,
    );
    assert!(next_thu.is_some());
    let thu_date = NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
    let expected_thu = Utc
        .from_utc_datetime(&thu_date.and_time(NaiveTime::from_hms_opt(18, 0, 0).unwrap()))
        .timestamp_millis();
    assert_eq!(next_thu.unwrap(), expected_thu);
}

#[test]
fn test_compute_next_trigger_quiet_skip_once() {
    let now = Utc::now();
    let past_timestamp = now.timestamp_millis() - 100_000;
    let future_timestamp = now.timestamp_millis() + 100_000;

    // Past timestamp returns None (quiet skip, no retroactive noise)
    let past_result = compute_next_trigger_from_dt(
        ReminderScheduleType::Once,
        None,
        None,
        Some(past_timestamp),
        now,
    );
    assert!(past_result.is_none());

    // Future timestamp returns the exact scheduled timestamp
    let future_result = compute_next_trigger_from_dt(
        ReminderScheduleType::Once,
        None,
        None,
        Some(future_timestamp),
        now,
    );
    assert_eq!(future_result, Some(future_timestamp));
}

#[tokio::test]
async fn test_reminder_repository_crud() {
    let pool = create_in_memory_pool()
        .await
        .expect("Failed to create in-memory pool");
    run_migrations(&pool).await.expect("Migration failed");

    // 1. Initial list empty
    let list = ReminderRepo::list_all(&pool).await.unwrap();
    assert_eq!(list.len(), 0);

    // 2. Insert global habit reminder
    let habit = Reminder {
        id: "habit-1".to_string(),
        document_id: None,
        enabled: true,
        schedule_type: ReminderScheduleType::Daily,
        time_of_day_min: Some(1200),
        days_of_week: None,
        scheduled_at: None,
        repeat_interval: None,
        created_at: 1000,
        updated_at: 1000,
    };
    ReminderRepo::upsert(&pool, &habit).await.unwrap();

    // Verify fetched via get_global_habit
    let fetched_habit = ReminderRepo::get_global_habit(&pool)
        .await
        .unwrap()
        .expect("Habit reminder should exist");
    assert_eq!(fetched_habit.id, "habit-1");
    assert!(fetched_habit.enabled);
    assert_eq!(fetched_habit.time_of_day_min, Some(1200));

    // 3. Insert document-specific reminder
    // First create a document to satisfy foreign key
    let mut conn = pool.acquire().await.unwrap();
    let doc = Document {
        id: "doc-1".to_string(),
        title: "Test Book".to_string(),
        author: Some("Author".to_string()),
        original_filename: "test.epub".to_string(),
        file_path: "test.epub".to_string(),
        file_type: "epub".to_string(),
        mime_type: "application/epub+zip".to_string(),
        file_size: 1024,
        content_hash: "hash123".to_string(),
        page_count: None,
        word_count: Some(500),
        thumbnail_path: None,
        language: None,
        parse_status: "ready".to_string(),
        parse_error: None,
        parser_version: 1,
        index_status: "complete".to_string(),
        created_at: 1000,
        updated_at: 1000,
        last_opened_at: Some(1000),
        is_archived: false,
    };
    DocumentRepo::create(&mut conn, &doc).await.unwrap();
    drop(conn);

    let doc_reminder = Reminder {
        id: "rem-doc-1".to_string(),
        document_id: Some("doc-1".to_string()),
        enabled: true,
        schedule_type: ReminderScheduleType::Weekdays,
        time_of_day_min: Some(540), // 09:00
        days_of_week: None,
        scheduled_at: None,
        repeat_interval: None,
        created_at: 2000,
        updated_at: 2000,
    };
    ReminderRepo::upsert(&pool, &doc_reminder).await.unwrap();

    // 4. List all and list enabled
    let all = ReminderRepo::list_all(&pool).await.unwrap();
    assert_eq!(all.len(), 2);

    let enabled = ReminderRepo::list_enabled(&pool).await.unwrap();
    assert_eq!(enabled.len(), 2);

    // Disable one
    let mut disabled_habit = habit.clone();
    disabled_habit.enabled = false;
    disabled_habit.updated_at = 3000;
    ReminderRepo::upsert(&pool, &disabled_habit).await.unwrap();

    let enabled_after = ReminderRepo::list_enabled(&pool).await.unwrap();
    assert_eq!(enabled_after.len(), 1);
    assert_eq!(enabled_after[0].id, "rem-doc-1");

    // 5. Delete document-specific reminder
    let deleted = ReminderRepo::delete(&pool, "rem-doc-1").await.unwrap();
    assert!(deleted);

    let remaining = ReminderRepo::list_all(&pool).await.unwrap();
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].id, "habit-1");
}

#[tokio::test]
async fn test_reminder_service_validation_and_payload() {
    let pool = create_in_memory_pool()
        .await
        .expect("Failed to create in-memory pool");
    run_migrations(&pool).await.expect("Migration failed");

    let service = ReminderService::new(pool.clone());

    // 1. Validation tests
    // Missing time_of_day_min for Daily
    let invalid_daily = ReminderUpsertInput {
        id: None,
        document_id: None,
        enabled: Some(true),
        schedule_type: ReminderScheduleType::Daily,
        time_of_day_min: None,
        days_of_week: None,
        scheduled_at: None,
        repeat_interval: None,
    };
    assert!(service.upsert(invalid_daily).await.is_err());

    // Out of range time_of_day_min
    let invalid_time = ReminderUpsertInput {
        id: None,
        document_id: None,
        enabled: Some(true),
        schedule_type: ReminderScheduleType::Daily,
        time_of_day_min: Some(1500),
        days_of_week: None,
        scheduled_at: None,
        repeat_interval: None,
    };
    assert!(service.upsert(invalid_time).await.is_err());

    // Custom schedule missing days_of_week
    let invalid_custom = ReminderUpsertInput {
        id: None,
        document_id: None,
        enabled: Some(true),
        schedule_type: ReminderScheduleType::Custom,
        time_of_day_min: Some(600),
        days_of_week: None,
        scheduled_at: None,
        repeat_interval: None,
    };
    assert!(service.upsert(invalid_custom).await.is_err());

    // 2. Valid upsert
    let valid_habit = ReminderUpsertInput {
        id: None,
        document_id: None,
        enabled: Some(true),
        schedule_type: ReminderScheduleType::Daily,
        time_of_day_min: Some(1200),
        days_of_week: None,
        scheduled_at: None,
        repeat_interval: None,
    };
    let saved_habit = service.upsert(valid_habit).await.unwrap();
    assert!(saved_habit.enabled);
    assert_eq!(saved_habit.time_of_day_min, Some(1200));

    // 3. Payload generation when library is empty
    let empty_payload = service.generate_payload(&saved_habit).await.unwrap();
    assert_eq!(empty_payload.title, "Reading Reminder");
    assert!(empty_payload.document_id.is_none());

    // 4. Create document and sections, verify dynamic payload
    let mut conn = pool.acquire().await.unwrap();
    let doc = Document {
        id: "rust-book".to_string(),
        title: "The Rust Programming Language".to_string(),
        author: Some("Steve Klabnik".to_string()),
        original_filename: "trpl.epub".to_string(),
        file_path: "trpl.epub".to_string(),
        file_type: "epub".to_string(),
        mime_type: "application/epub+zip".to_string(),
        file_size: 4096,
        content_hash: "rust123".to_string(),
        page_count: None,
        word_count: Some(10000),
        thumbnail_path: None,
        language: None,
        parse_status: "ready".to_string(),
        parse_error: None,
        parser_version: 1,
        index_status: "complete".to_string(),
        created_at: 1000,
        updated_at: 1000,
        last_opened_at: Some(5000),
        is_archived: false,
    };
    DocumentRepo::create(&mut conn, &doc).await.unwrap();

    let sec = readtrack_lib::models::DocumentSection {
        id: "sec-1".to_string(),
        document_id: "rust-book".to_string(),
        section_index: 4,
        section_type: "chapter".to_string(),
        title: Some("Chapter 4: Understanding Ownership".to_string()),
        level: 1,
        content: Some("Ownership is Rust's most unique feature...".to_string()),
        word_count: 500,
        start_position: 0,
        end_position: 500,
        created_at: 1000,
    };
    SectionRepo::insert_batch(&mut conn, &[sec]).await.unwrap();

    // Set reading progress
    let pos = LogicalPosition {
        document_id: "rust-book".to_string(),
        section_id: Some(4),
        block_id: None,
        offset: Some(0),
        page: None,
        page_offset: None,
        percentage: 0.42,
        parser_version: 1,
    };
    let progress = readtrack_lib::models::ReadingProgress {
        id: "prog-1".to_string(),
        document_id: "rust-book".to_string(),
        current_page: None,
        current_position: pos,
        current_pos: 0,
        current_section_id: Some("sec-1".to_string()),
        progress_percent: 0.42,
        furthest_pos: 0,
        total_read_ms: 1000,
        completed: false,
        completed_at: None,
        updated_at: 5000,
    };
    readtrack_lib::repositories::ProgressRepo::upsert(&mut conn, &progress)
        .await
        .unwrap();
    drop(conn);

    let doc_payload = service.generate_payload(&saved_habit).await.unwrap();
    assert_eq!(
        doc_payload.title,
        "Continue reading: The Rust Programming Language"
    );
    assert!(doc_payload
        .body
        .contains("Chapter 4: Understanding Ownership"));
    assert!(doc_payload.body.contains("42% completed"));
    assert_eq!(doc_payload.document_id, Some("rust-book".to_string()));
}
