/// Count words in a string by splitting on whitespace.
pub fn count_words(text: &str) -> u32 {
    text.split_whitespace().count() as u32
}

/// Count Unicode characters in a string.
pub fn count_chars(text: &str) -> u32 {
    text.chars().count() as u32
}

/// Validates link schemes against XSS and malicious protocols per docs/SECURITY.md.
/// Only permits URLs beginning with http://, https://, or mailto:.
pub fn is_safe_link_url(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_count_words() {
        assert_eq!(count_words(""), 0);
        assert_eq!(count_words("   "), 0);
        assert_eq!(count_words("Hello world"), 2);
        assert_eq!(count_words("  One \n\t two   three \n "), 3);
    }

    #[test]
    fn test_count_chars() {
        assert_eq!(count_chars(""), 0);
        assert_eq!(count_chars("abc"), 3);
        assert_eq!(count_chars("Hello, 🌍!"), 9);
    }

    #[test]
    fn test_is_safe_link_url() {
        assert!(is_safe_link_url("https://example.com"));
        assert!(is_safe_link_url("http://example.com/test?a=1"));
        assert!(is_safe_link_url("mailto:user@example.com"));
        assert!(is_safe_link_url("HTTPS://SECURE.COM"));

        // Dangerous schemes must be rejected
        assert!(!is_safe_link_url("javascript:alert(1)"));
        assert!(!is_safe_link_url("data:text/html,<script>alert(1)</script>"));
        assert!(!is_safe_link_url("file:///etc/passwd"));
        assert!(!is_safe_link_url("intent://scan"));
        assert!(!is_safe_link_url("vbscript:msgbox"));
    }
}
