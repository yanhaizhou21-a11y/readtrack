use std::collections::{HashMap, HashSet};
use crate::models::{LogicalPosition, ReadingSegment, ViewportReport};
use super::engine::{
    calculate_dwell_delta_ms, calculate_required_dwell_ms, DEFAULT_IDLE_TIMEOUT_MS,
};

#[derive(Debug, Clone)]
pub struct SessionAccumulator {
    pub session_id: String,
    pub document_id: String,
    pub started_at: i64,
    pub last_heartbeat_at: i64,
    pub last_report_ts: Option<i64>,
    pub last_interaction_ts: i64,
    pub idle_timeout_ms: i64,
    pub active_ms: i64,
    pub duration_seconds: i64,
    pub start_pos: i64,
    pub end_pos: i64,
    pub start_position: Option<LogicalPosition>,
    pub end_position: Option<LogicalPosition>,
    pub segments: HashMap<i64, ReadingSegment>, // indexed by segment_index
    pub session_dwell: HashMap<i64, i64>,       // dwell accumulated in this session
    pub segments_read_this_session: HashSet<i64>,
    pub pages_read_this_session: HashSet<i64>,
    pub last_visible_indices: Vec<i64>,
    pub dirty: bool,
    pub just_became_read: bool,
    pub last_flush_at: i64,
}

impl SessionAccumulator {
    pub fn new(
        session_id: String,
        document_id: String,
        started_at: i64,
        start_position: LogicalPosition,
        segments_list: Vec<ReadingSegment>,
    ) -> Self {
        let mut segments = HashMap::new();
        for seg in segments_list {
            segments.insert(seg.segment_index, seg);
        }

        Self {
            session_id,
            document_id,
            started_at,
            last_heartbeat_at: started_at,
            last_report_ts: None,
            last_interaction_ts: started_at,
            idle_timeout_ms: DEFAULT_IDLE_TIMEOUT_MS,
            active_ms: 0,
            duration_seconds: 0,
            start_pos: 0,
            end_pos: 0,
            start_position: Some(start_position.clone()),
            end_position: Some(start_position),
            segments,
            session_dwell: HashMap::new(),
            segments_read_this_session: HashSet::new(),
            pages_read_this_session: HashSet::new(),
            last_visible_indices: Vec::new(),
            dirty: true,
            just_became_read: false,
            last_flush_at: started_at,
        }
    }

    pub fn process_report(&mut self, report: &ViewportReport) {
        self.just_became_read = false;

        if self.last_report_ts.is_none() {
            self.started_at = report.ts;
            self.last_flush_at = report.ts;
            self.last_interaction_ts = report.ts;
        }

        let (dwell_delta, is_active) = calculate_dwell_delta_ms(
            self.last_report_ts,
            report.ts,
            report.interacting,
            self.last_interaction_ts,
            self.idle_timeout_ms,
            report.foreground,
            &report.jump,
        );

        if is_active {
            self.active_ms += dwell_delta;
        }

        if report.interacting {
            self.last_interaction_ts = report.ts;
        }

        self.last_report_ts = Some(report.ts);
        self.last_heartbeat_at = report.ts;
        self.duration_seconds = ((report.ts - self.started_at).max(0) / 1000) as i64;
        self.end_position = Some(report.position.clone());

        let visible_in_zone: Vec<i64> = report
            .visible
            .iter()
            .filter(|v| v.ratio >= 0.5)
            .map(|v| v.segment_index)
            .collect();

        // Detect skipped segments if continuously moving forward without jump
        if report.jump == "none" && !self.last_visible_indices.is_empty() && !visible_in_zone.is_empty() {
            let max_prev = *self.last_visible_indices.iter().max().unwrap_or(&0);
            let min_curr = *visible_in_zone.iter().min().unwrap_or(&0);

            if min_curr > max_prev + 1 {
                for skipped_idx in (max_prev + 1)..min_curr {
                    if let Some(seg) = self.segments.get_mut(&skipped_idx) {
                        if seg.status == "unread" {
                            seg.status = "skipped".to_string();
                            self.dirty = true;
                        }
                    }
                }
            }
        }

        // Distribute dwell delta to visible segments
        if is_active && dwell_delta > 0 && !visible_in_zone.is_empty() {
            let dwell_per_segment = dwell_delta / visible_in_zone.len() as i64;

            for &seg_idx in &visible_in_zone {
                if let Some(seg) = self.segments.get_mut(&seg_idx) {
                    seg.dwell_ms += dwell_per_segment;

                    let session_seg_dwell = self.session_dwell.entry(seg_idx).or_insert(0);
                    *session_seg_dwell += dwell_per_segment;

                    let required_dwell = calculate_required_dwell_ms(seg.word_count);

                    if seg.status == "read" {
                        if *session_seg_dwell >= required_dwell
                            && !self.segments_read_this_session.contains(&seg_idx)
                        {
                            seg.read_count += 1;
                            seg.last_read_at = Some(report.ts);
                            self.segments_read_this_session.insert(seg_idx);
                            self.dirty = true;
                        }
                    } else if *session_seg_dwell >= required_dwell {
                        seg.status = "read".to_string();
                        seg.read_count += 1;
                        if seg.first_read_at.is_none() {
                            seg.first_read_at = Some(report.ts);
                        }
                        seg.last_read_at = Some(report.ts);
                        self.segments_read_this_session.insert(seg_idx);

                        if let Some(page) = report.position.page {
                            self.pages_read_this_session.insert(page);
                        }

                        self.dirty = true;
                        self.just_became_read = true;
                    } else if seg.status == "unread" || seg.status == "skipped" {
                        seg.status = "reading".to_string();
                        self.dirty = true;
                    }
                }
            }
        } else if !visible_in_zone.is_empty() {
            // Even if no dwell added, visible segments that are unread can transition to reading if current pos
            for &seg_idx in &visible_in_zone {
                if let Some(seg) = self.segments.get_mut(&seg_idx) {
                    if seg.status == "unread" && seg.dwell_ms > 0 {
                        seg.status = "reading".to_string();
                        self.dirty = true;
                    }
                }
            }
        }

        if !visible_in_zone.is_empty() {
            self.last_visible_indices = visible_in_zone;
        }

        self.dirty = true;
    }

    pub fn should_flush(&self, now: i64) -> bool {
        self.dirty && (self.just_became_read || (now - self.last_flush_at >= 5000))
    }

    pub fn active_seconds(&self) -> i64 {
        self.active_ms / 1000
    }

    pub fn is_noise(&self) -> bool {
        self.active_seconds() < 5 && self.segments_read_this_session.is_empty()
    }
}
