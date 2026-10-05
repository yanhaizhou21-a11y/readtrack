use readtrack_lib::db::{create_in_memory_pool, run_migrations};
use readtrack_lib::models::{
    Document, LogicalPosition, ReadingProgress, ReadingSegment, ViewportReport, VisibleSegmentRatio,
};
use readtrack_lib::repositories::{
    DocumentRepo, ProgressRepo, SectionRepo, SegmentRepo, SessionRepo,
};
use readtrack_lib::services::tracker::engine::{
    calculate_dwell_delta_ms, calculate_progress, calculate_required_dwell_ms,
};
use readtrack_lib::services::TrackerService;

async fn setup_test_doc(
    pool: &sqlx::SqlitePool,
    doc_id: &str,
    segments_count: usize,
    words_per_segment: i64,
) {
    let now = chrono::Utc::now().timestamp_millis();
    let doc = Document {
        id: doc_id.to_string(),
        title: "Test Document".to_string(),
        author: Some("Author".to_string()),
        original_filename: "test.txt".to_string(),
        file_path: "library/documents/test.txt".to_string(),
        file_type: "txt".to_string(),
        mime_type: "text/plain".to_string(),
        file_size: 1024,
        content_hash: format!("hash-{}", doc_id),
        page_count: None,
        word_count: Some((segments_count as i64) * words_per_segment),
        thumbnail_path: None,
        language: None,
        parse_status: "ready".to_string(),
        parse_error: None,
        parser_version: 1,
        index_status: "complete".to_string(),
        created_at: now,
        updated_at: now,
        last_opened_at: Some(now),
        is_archived: false,
    };

    let mut tx = pool.begin().await.unwrap();
    DocumentRepo::create(&mut tx, &doc).await.unwrap();

    let sec_id = format!("sec-{}", doc_id);
    let sec = readtrack_lib::models::DocumentSection {
        id: sec_id.clone(),
        document_id: doc_id.to_string(),
        section_index: 0,
        section_type: "chapter".to_string(),
        title: Some("Chapter 1".to_string()),
        level: 1,
        content: None,
        word_count: (segments_count as i64) * words_per_segment,
        start_position: 0,
        end_position: 1000,
        created_at: now,
    };
    SectionRepo::insert_batch(&mut tx, &[sec]).await.unwrap();

    let mut segments = Vec::new();
    for i in 0..segments_count {
        segments.push(ReadingSegment {
            id: format!("seg-{}-{}", doc_id, i),
            document_id: doc_id.to_string(),
            section_id: sec_id.clone(),
            segment_type: "block_group".to_string(),
            segment_index: i as i64,
            first_block_id: None,
            last_block_id: None,
            start_position: (i * 100) as i64,
            end_position: ((i + 1) * 100) as i64,
            word_count: words_per_segment,
            status: "unread".to_string(),
            dwell_ms: 0,
            first_read_at: None,
            last_read_at: None,
            read_count: 0,
        });
    }
    SegmentRepo::insert_batch(&mut tx, &segments).await.unwrap();

    let progress = ReadingProgress {
        id: format!("prog-{}", doc_id),
        document_id: doc_id.to_string(),
        current_page: None,
        current_position: LogicalPosition {
            document_id: doc_id.to_string(),
            section_id: Some(0),
            block_id: None,
            offset: None,
            page: None,
            page_offset: None,
            percentage: 0.0,
            parser_version: 1,
        },
        current_pos: 0,
        current_section_id: Some(sec_id),
        progress_percent: 0.0,
        furthest_pos: 0,
        total_read_ms: 0,
        completed: false,
        completed_at: None,
        updated_at: now,
    };
    ProgressRepo::create(&mut tx, &progress).await.unwrap();

    tx.commit().await.unwrap();
}

#[tokio::test]
async fn test_fast_scroll_past_10_segments_does_not_mark_read() {
    let pool = create_in_memory_pool().await.unwrap();
    run_migrations(&pool).await.unwrap();

    let doc_id = "doc-fast-scroll";
    setup_test_doc(&pool, doc_id, 10, 100).await;

    let tracker = TrackerService::new(pool.clone());
    let pos = LogicalPosition {
        document_id: doc_id.to_string(),
        section_id: Some(0),
        block_id: None,
        offset: None,
        page: None,
        page_offset: None,
        percentage: 0.0,
        parser_version: 1,
    };

    let session_id = tracker
        .start_session(doc_id.to_string(), pos.clone())
        .await
        .unwrap();

    let start_ts = chrono::Utc::now().timestamp_millis();
    // Rapidly scroll through 10 segments (50ms per segment)
    for i in 0..10 {
        let ts = start_ts + (i as i64 * 50);
        let report = ViewportReport {
            session_id: session_id.clone(),
            ts,
            visible: vec![VisibleSegmentRatio {
                segment_index: i as i64,
                ratio: 1.0,
            }],
            position: pos.clone(),
            interacting: true,
            foreground: true,
            jump: "none".to_string(),
        };
        tracker.report_viewport(report).await.unwrap();
    }

    // Check reading map
    let map = tracker.get_reading_map(doc_id).await.unwrap();
    let read_count = map.sections[0]
        .segments
        .iter()
        .filter(|s| s.status == "read")
        .count();

    assert_eq!(
        read_count, 0,
        "Fast scrolling past 10 segments must not mark any segment as read"
    );
}

#[tokio::test]
async fn test_100_words_dwell_thresholds() {
    let pool = create_in_memory_pool().await.unwrap();
    run_migrations(&pool).await.unwrap();

    let doc_id = "doc-dwell-test";
    setup_test_doc(&pool, doc_id, 1, 100).await;

    // 100 words required dwell: (100 / 700 * 60_000 * 0.5) = ~4286 ms
    let req = calculate_required_dwell_ms(100);
    assert_eq!(req, 4286);

    let tracker = TrackerService::new(pool.clone());
    let pos = LogicalPosition {
        document_id: doc_id.to_string(),
        section_id: Some(0),
        block_id: None,
        offset: None,
        page: None,
        page_offset: None,
        percentage: 0.0,
        parser_version: 1,
    };

    let session_id = tracker
        .start_session(doc_id.to_string(), pos.clone())
        .await
        .unwrap();
    let start_ts = 1_000_000i64;

    // Report at 0ms
    tracker
        .report_viewport(ViewportReport {
            session_id: session_id.clone(),
            ts: start_ts,
            visible: vec![VisibleSegmentRatio {
                segment_index: 0,
                ratio: 1.0,
            }],
            position: pos.clone(),
            interacting: true,
            foreground: true,
            jump: "none".to_string(),
        })
        .await
        .unwrap();

    // Report after 1500ms
    tracker
        .report_viewport(ViewportReport {
            session_id: session_id.clone(),
            ts: start_ts + 1500,
            visible: vec![VisibleSegmentRatio {
                segment_index: 0,
                ratio: 1.0,
            }],
            position: pos.clone(),
            interacting: true,
            foreground: true,
            jump: "none".to_string(),
        })
        .await
        .unwrap();

    // Report after 3000ms total dwell
    tracker
        .report_viewport(ViewportReport {
            session_id: session_id.clone(),
            ts: start_ts + 3000,
            visible: vec![VisibleSegmentRatio {
                segment_index: 0,
                ratio: 1.0,
            }],
            position: pos.clone(),
            interacting: true,
            foreground: true,
            jump: "none".to_string(),
        })
        .await
        .unwrap();

    let map = tracker.get_reading_map(doc_id).await.unwrap();
    assert_eq!(
        map.sections[0].segments[0].status, "reading",
        "At 3s dwell (under 4.286s required), status must be 'reading'"
    );

    // Report after 5000ms total dwell (two 1000ms reports)
    tracker
        .report_viewport(ViewportReport {
            session_id: session_id.clone(),
            ts: start_ts + 4000,
            visible: vec![VisibleSegmentRatio {
                segment_index: 0,
                ratio: 1.0,
            }],
            position: pos.clone(),
            interacting: true,
            foreground: true,
            jump: "none".to_string(),
        })
        .await
        .unwrap();

    tracker
        .report_viewport(ViewportReport {
            session_id: session_id.clone(),
            ts: start_ts + 5000,
            visible: vec![VisibleSegmentRatio {
                segment_index: 0,
                ratio: 1.0,
            }],
            position: pos.clone(),
            interacting: true,
            foreground: true,
            jump: "none".to_string(),
        })
        .await
        .unwrap();

    let map2 = tracker.get_reading_map(doc_id).await.unwrap();
    assert_eq!(
        map2.sections[0].segments[0].status, "read",
        "At 5s dwell (exceeds 4.286s required), status must transition to 'read'"
    );
}

#[test]
fn test_idle_timeout_stops_dwell_accumulation() {
    let last_report_ts = Some(1_000_000);
    let current_ts = 1_060_000; // 60s later
    let last_interaction_ts = 1_000_000;
    let idle_timeout_ms = 45_000; // 45s

    let (delta, is_active) = calculate_dwell_delta_ms(
        last_report_ts,
        current_ts,
        false, // not interacting
        last_interaction_ts,
        idle_timeout_ms,
        true, // foreground
        "none",
    );

    assert_eq!(delta, 0, "Idle past 45s should produce 0 dwell delta");
    assert!(!is_active, "Idle past 45s should not be active");
}

#[tokio::test]
async fn test_jump_toc_does_not_mark_skipped() {
    let pool = create_in_memory_pool().await.unwrap();
    run_migrations(&pool).await.unwrap();

    let doc_id = "doc-jump-toc";
    setup_test_doc(&pool, doc_id, 6, 50).await;

    let tracker = TrackerService::new(pool.clone());
    let pos = LogicalPosition {
        document_id: doc_id.to_string(),
        section_id: Some(0),
        block_id: None,
        offset: None,
        page: None,
        page_offset: None,
        percentage: 0.0,
        parser_version: 1,
    };

    let session_id = tracker
        .start_session(doc_id.to_string(), pos.clone())
        .await
        .unwrap();

    // Report segment 0
    tracker
        .report_viewport(ViewportReport {
            session_id: session_id.clone(),
            ts: 1000,
            visible: vec![VisibleSegmentRatio {
                segment_index: 0,
                ratio: 1.0,
            }],
            position: pos.clone(),
            interacting: true,
            foreground: true,
            jump: "none".to_string(),
        })
        .await
        .unwrap();

    // Jump to segment 5 via TOC
    tracker
        .report_viewport(ViewportReport {
            session_id: session_id.clone(),
            ts: 2000,
            visible: vec![VisibleSegmentRatio {
                segment_index: 5,
                ratio: 1.0,
            }],
            position: pos.clone(),
            interacting: true,
            foreground: true,
            jump: "toc".to_string(),
        })
        .await
        .unwrap();

    let map = tracker.get_reading_map(doc_id).await.unwrap();
    for seg in &map.sections[0].segments[1..5] {
        assert_eq!(
            seg.status, "unread",
            "Jump via TOC must NOT mark skipped segments"
        );
    }
}

#[tokio::test]
async fn test_continuous_scroll_marks_skipped_and_rereading_marks_read() {
    let pool = create_in_memory_pool().await.unwrap();
    run_migrations(&pool).await.unwrap();

    let doc_id = "doc-scroll-skip";
    setup_test_doc(&pool, doc_id, 5, 20).await; // 20 words -> min dwell is 1200ms

    let tracker = TrackerService::new(pool.clone());
    let pos = LogicalPosition {
        document_id: doc_id.to_string(),
        section_id: Some(0),
        block_id: None,
        offset: None,
        page: None,
        page_offset: None,
        percentage: 0.0,
        parser_version: 1,
    };

    let session_id = tracker
        .start_session(doc_id.to_string(), pos.clone())
        .await
        .unwrap();

    // View segment 0
    tracker
        .report_viewport(ViewportReport {
            session_id: session_id.clone(),
            ts: 1000,
            visible: vec![VisibleSegmentRatio {
                segment_index: 0,
                ratio: 1.0,
            }],
            position: pos.clone(),
            interacting: true,
            foreground: true,
            jump: "none".to_string(),
        })
        .await
        .unwrap();

    // Scroll forward continuously (jump="none") straight to segment 3 (skipping 1 and 2)
    tracker
        .report_viewport(ViewportReport {
            session_id: session_id.clone(),
            ts: 2000,
            visible: vec![VisibleSegmentRatio {
                segment_index: 3,
                ratio: 1.0,
            }],
            position: pos.clone(),
            interacting: true,
            foreground: true,
            jump: "none".to_string(),
        })
        .await
        .unwrap();

    let map = tracker.get_reading_map(doc_id).await.unwrap();
    assert_eq!(
        map.sections[0].segments[1].status, "skipped",
        "Passed segment 1 must be skipped"
    );
    assert_eq!(
        map.sections[0].segments[2].status, "skipped",
        "Passed segment 2 must be skipped"
    );

    // Later, user reads segment 1 with sufficient dwell (1500ms > 1200ms)
    tracker
        .report_viewport(ViewportReport {
            session_id: session_id.clone(),
            ts: 3000,
            visible: vec![VisibleSegmentRatio {
                segment_index: 1,
                ratio: 1.0,
            }],
            position: pos.clone(),
            interacting: true,
            foreground: true,
            jump: "none".to_string(),
        })
        .await
        .unwrap();

    tracker
        .report_viewport(ViewportReport {
            session_id: session_id.clone(),
            ts: 4500,
            visible: vec![VisibleSegmentRatio {
                segment_index: 1,
                ratio: 1.0,
            }],
            position: pos.clone(),
            interacting: true,
            foreground: true,
            jump: "none".to_string(),
        })
        .await
        .unwrap();

    let map2 = tracker.get_reading_map(doc_id).await.unwrap();
    assert_eq!(
        map2.sections[0].segments[1].status, "read",
        "Skipped segment read with sufficient dwell must become 'read'"
    );
}

#[test]
fn test_word_weighted_progress_calculation() {
    let segs = vec![
        ReadingSegment {
            id: "1".into(),
            document_id: "doc".into(),
            section_id: "s1".into(),
            segment_type: "p".into(),
            segment_index: 0,
            first_block_id: None,
            last_block_id: None,
            start_position: 0,
            end_position: 100,
            word_count: 100,
            status: "read".into(),
            dwell_ms: 5000,
            first_read_at: None,
            last_read_at: None,
            read_count: 1,
        },
        ReadingSegment {
            id: "2".into(),
            document_id: "doc".into(),
            section_id: "s2".into(),
            segment_type: "p".into(),
            segment_index: 1,
            first_block_id: None,
            last_block_id: None,
            start_position: 100,
            end_position: 200,
            word_count: 63,
            status: "read".into(),
            dwell_ms: 3000,
            first_read_at: None,
            last_read_at: None,
            read_count: 1,
        },
        ReadingSegment {
            id: "3".into(),
            document_id: "doc".into(),
            section_id: "s2".into(),
            segment_type: "p".into(),
            segment_index: 2,
            first_block_id: None,
            last_block_id: None,
            start_position: 200,
            end_position: 300,
            word_count: 37,
            status: "unread".into(),
            dwell_ms: 0,
            first_read_at: None,
            last_read_at: None,
            read_count: 0,
        },
        ReadingSegment {
            id: "4".into(),
            document_id: "doc".into(),
            section_id: "s3".into(),
            segment_type: "p".into(),
            segment_index: 3,
            first_block_id: None,
            last_block_id: None,
            start_position: 300,
            end_position: 400,
            word_count: 100,
            status: "unread".into(),
            dwell_ms: 0,
            first_read_at: None,
            last_read_at: None,
            read_count: 0,
        },
    ];

    let (prog, completed) = calculate_progress(&segs, Some(1));
    // Total words = 100 + 63 + 37 + 100 = 300
    // Read words = 100 + 63 = 163
    // Progress = 163 / 300 = 0.5433
    assert!((prog - (163.0 / 300.0)).abs() < 0.001);
    assert!(!completed);

    // Section 1 progress: 100 / 100 = 100%
    let s1_segs = &segs[0..1];
    let (s1_prog, _) = calculate_progress(s1_segs, None);
    assert_eq!(s1_prog, 1.0);

    // Section 2 progress: 63 / 100 = 63%
    let s2_segs = &segs[1..3];
    let (s2_prog, _) = calculate_progress(s2_segs, None);
    assert_eq!(s2_prog, 0.63);

    // Section 3 progress: 0 / 100 = 0%
    let s3_segs = &segs[3..4];
    let (s3_prog, _) = calculate_progress(s3_segs, None);
    assert_eq!(s3_prog, 0.0);
}

#[tokio::test]
async fn test_session_lifecycle_and_noise_cleanup() {
    let pool = create_in_memory_pool().await.unwrap();
    run_migrations(&pool).await.unwrap();

    let doc_id = "doc-session-noise";
    setup_test_doc(&pool, doc_id, 2, 50).await;

    let tracker = TrackerService::new(pool.clone());
    let pos = LogicalPosition {
        document_id: doc_id.to_string(),
        section_id: Some(0),
        block_id: None,
        offset: None,
        page: None,
        page_offset: None,
        percentage: 0.0,
        parser_version: 1,
    };

    // Start session and end immediately without reading (active < 5s)
    let session_id = tracker
        .start_session(doc_id.to_string(), pos.clone())
        .await
        .unwrap();
    let res = tracker.end_session(&session_id, pos.clone()).await.unwrap();
    assert!(
        res.is_none(),
        "Session under 5s active with no read segments must be deleted as noise"
    );

    let count = SessionRepo::count_for_doc(&pool, doc_id).await.unwrap();
    assert_eq!(count, 0, "Noise session must not exist in database");
}

#[tokio::test]
async fn test_crash_recovery_for_orphaned_sessions() {
    let pool = create_in_memory_pool().await.unwrap();
    run_migrations(&pool).await.unwrap();

    let doc_id = "doc-crash";
    setup_test_doc(&pool, doc_id, 1, 50).await;

    let now = chrono::Utc::now().timestamp_millis();
    // Insert an open orphaned session directly
    let session = readtrack_lib::models::ReadingSession {
        id: "orphaned-session-1".to_string(),
        document_id: doc_id.to_string(),
        started_at: now - 60_000,
        ended_at: None,
        last_heartbeat_at: now - 30_000,
        duration_seconds: 30,
        active_seconds: 30,
        start_position: None,
        end_position: None,
        start_pos: 0,
        end_pos: 0,
        pages_read: 0,
        segments_read: 0,
    };

    let mut tx = pool.begin().await.unwrap();
    SessionRepo::create(&mut tx, &session).await.unwrap();
    tx.commit().await.unwrap();

    let tracker = TrackerService::new(pool.clone());
    let recovered = tracker.crash_recovery().await.unwrap();
    assert_eq!(recovered, 1, "Should recover 1 orphaned session");

    let recovered_session = SessionRepo::get_by_id(&pool, "orphaned-session-1")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        recovered_session.ended_at,
        Some(now - 30_000),
        "Ended at should be set to last_heartbeat_at"
    );
}

#[tokio::test]
async fn test_mark_completed_and_mark_unread() {
    let pool = create_in_memory_pool().await.unwrap();
    run_migrations(&pool).await.unwrap();

    let doc_id = "doc-mark-test";
    setup_test_doc(&pool, doc_id, 3, 50).await;

    let tracker = TrackerService::new(pool.clone());

    // Mark completed
    let prog = tracker.mark_completed(doc_id).await.unwrap();
    assert!(prog.completed);
    assert_eq!(prog.progress_percent, 1.0);

    let map = tracker.get_reading_map(doc_id).await.unwrap();
    assert!(map.completed);
    assert_eq!(map.progress, 1.0);
    for seg in &map.sections[0].segments {
        assert_eq!(seg.status, "read");
    }

    // Mark unread
    let unread_prog = tracker.mark_unread(doc_id).await.unwrap();
    assert!(!unread_prog.completed);
    assert_eq!(unread_prog.progress_percent, 0.0);

    let map2 = tracker.get_reading_map(doc_id).await.unwrap();
    assert!(!map2.completed);
    assert_eq!(map2.progress, 0.0);
    for seg in &map2.sections[0].segments {
        assert_eq!(seg.status, "unread");
    }
}
