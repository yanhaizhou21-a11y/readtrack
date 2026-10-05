pub mod text;
pub mod time;

pub use text::{count_chars, count_words, is_safe_link_url};
pub use time::now_epoch_ms;
