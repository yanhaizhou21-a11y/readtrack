use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct SettingRecord {
    pub key: String,
    pub value: Value,
    pub updated_at: i64,
}

pub fn default_settings() -> HashMap<String, Value> {
    let mut map = HashMap::new();
    map.insert("theme".to_string(), json!("system"));
    map.insert("reader.theme".to_string(), json!("light"));
    map.insert("reader.font_family".to_string(), json!("serif"));
    map.insert("reader.font_scale".to_string(), json!(1.0));
    map.insert("reader.line_height".to_string(), json!(1.6));
    map.insert("reader.margin".to_string(), json!("normal"));
    map.insert("language".to_string(), json!("en"));
    map.insert("tracker.min_dwell_ms".to_string(), json!(1200));
    map.insert("tracker.max_wpm".to_string(), json!(700));
    map.insert("tracker.read_ratio".to_string(), json!(0.5));
    map.insert("tracker.idle_timeout_ms".to_string(), json!(45000));
    map.insert("library.view".to_string(), json!("grid"));
    map.insert("library.sort".to_string(), json!("recent_opened"));
    map.insert("onboarding.done".to_string(), json!(false));
    map
}
