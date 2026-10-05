use crate::models::{MapSection, MapSegment, ReadingSegment};

pub const MAX_WPM: f64 = 700.0;
pub const MIN_DWELL_MS: f64 = 1200.0;
pub const READ_RATIO: f64 = 0.5;
pub const DEFAULT_IDLE_TIMEOUT_MS: i64 = 45_000;
pub const MAX_REPORT_DELTA_MS: i64 = 2000;

/// Calculate required dwell time in milliseconds for a given word count.
pub fn calculate_required_dwell_ms(word_count: i64) -> i64 {
    let expected_ms = (word_count.max(0) as f64 / MAX_WPM) * 60_000.0;
    let required = (expected_ms * READ_RATIO).max(MIN_DWELL_MS);
    required.round() as i64
}

/// Calculate dwell delta and activity status for an incoming viewport report.
pub fn calculate_dwell_delta_ms(
    last_report_ts: Option<i64>,
    current_ts: i64,
    interacting: bool,
    last_interaction_ts: i64,
    idle_timeout_ms: i64,
    foreground: bool,
    jump: &str,
) -> (i64, bool) {
    if !foreground || jump != "none" {
        return (0, false);
    }

    let delta = match last_report_ts {
        Some(last) => (current_ts - last).clamp(0, MAX_REPORT_DELTA_MS),
        None => 0,
    };

    if interacting {
        (delta, true)
    } else {
        let elapsed_since_interaction = current_ts - last_interaction_ts;
        if elapsed_since_interaction <= idle_timeout_ms {
            (delta, true)
        } else {
            (0, false)
        }
    }
}

/// Calculate document progress percentage and completed flag from all segments.
pub fn calculate_progress(
    segments: &[ReadingSegment],
    current_segment_index: Option<i64>,
) -> (f64, bool) {
    if segments.is_empty() {
        return (0.0, false);
    }

    let total_words: i64 = segments.iter().map(|s| s.word_count.max(1)).sum();
    let read_words: i64 = segments
        .iter()
        .filter(|s| s.status == "read")
        .map(|s| s.word_count.max(1))
        .sum();

    let percent = if total_words > 0 {
        (read_words as f64 / total_words as f64).clamp(0.0, 1.0)
    } else {
        0.0
    };

    let all_non_skipped_read = segments
        .iter()
        .filter(|s| s.status != "skipped")
        .all(|s| s.status == "read");

    let last_seg_index = segments.iter().map(|s| s.segment_index).max().unwrap_or(0);
    let reached_end = current_segment_index
        .map(|idx| idx >= last_seg_index)
        .unwrap_or(false);

    let completed = percent >= 0.98 || (all_non_skipped_read && reached_end);

    (percent, completed)
}

/// Build map sections with progress and status.
pub fn build_map_sections(
    segments: &[ReadingSegment],
    section_map: &std::collections::HashMap<String, (i64, String)>, // section_id -> (index, title)
    current_section_id: Option<&str>,
) -> Vec<MapSection> {
    use std::collections::BTreeMap;

    // Group segments by section_id
    let mut grouped = BTreeMap::<String, Vec<ReadingSegment>>::new();
    for seg in segments {
        grouped
            .entry(seg.section_id.clone())
            .or_default()
            .push(seg.clone());
    }

    let mut map_sections = Vec::new();

    for (section_id, segs) in grouped {
        let (sec_index, title) = section_map
            .get(&section_id)
            .cloned()
            .unwrap_or_else(|| (0, format!("Section {}", section_id)));

        let total_words: i64 = segs.iter().map(|s| s.word_count.max(1)).sum();
        let read_words: i64 = segs
            .iter()
            .filter(|s| s.status == "read")
            .map(|s| s.word_count.max(1))
            .sum();

        let progress = if total_words > 0 {
            (read_words as f64 / total_words as f64).clamp(0.0, 1.0)
        } else {
            0.0
        };

        let is_current = current_section_id
            .map(|cid| cid == section_id)
            .unwrap_or(false);
        let status = if progress >= 0.98 {
            "read"
        } else if progress > 0.0 || is_current {
            "reading"
        } else {
            "unread"
        };

        let last_read_at = segs.iter().filter_map(|s| s.last_read_at).max();
        let read_ms: i64 = segs.iter().map(|s| s.dwell_ms).sum();
        let sessions = segs.iter().map(|s| s.read_count).max().unwrap_or(0);

        let map_segments: Vec<MapSegment> = segs
            .iter()
            .map(|s| MapSegment {
                index: s.segment_index,
                status: s.status.clone(),
                word_count: s.word_count,
            })
            .collect();

        let first_seg = segs.first();
        let start_pos = crate::models::LogicalPosition {
            document_id: first_seg.map(|s| s.document_id.clone()).unwrap_or_default(),
            section_id: Some(sec_index),
            block_id: first_seg.and_then(|s| s.first_block_id.clone()),
            offset: None,
            page: None,
            page_offset: None,
            percentage: progress,
            parser_version: 1,
        };

        map_sections.push(MapSection {
            section_id,
            index: sec_index,
            title,
            progress,
            status: status.to_string(),
            last_read_at,
            read_ms,
            sessions,
            segments: map_segments,
            start_pos,
        });
    }

    map_sections.sort_by_key(|s| s.index);
    map_sections
}
