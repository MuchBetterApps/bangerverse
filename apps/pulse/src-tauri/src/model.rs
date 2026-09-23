use regex::Regex;
use chrono::DateTime;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use url::Url;

pub const DEFAULT_API_URL: &str = "https://api.bangermail.com";
pub const DEFAULT_WEB_URL: &str = "https://app.bangermail.com";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub api_url: String,
    pub web_url: String,
    #[serde(default)]
    pub workspace_id: Option<String>,
    pub selected_mailbox_ids: Vec<String>,
    #[serde(default)]
    pub mailbox_products: HashMap<String, String>,
    #[serde(default)]
    pub mailbox_addresses: HashMap<String, String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            api_url: DEFAULT_API_URL.into(),
            web_url: DEFAULT_WEB_URL.into(),
            workspace_id: None,
            selected_mailbox_ids: vec![],
            mailbox_products: HashMap::new(),
            mailbox_addresses: HashMap::new(),
        }
    }
}

pub fn validate_origin(raw: &str) -> Result<String, String> {
    let url = Url::parse(raw).map_err(|_| "Enter a valid server URL".to_string())?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1"));
    if !(url.scheme() == "https" || (local && url.scheme() == "http"))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err("Use an HTTPS server origin (or localhost for development)".into());
    }
    Ok(url.origin().ascii_serialization())
}

#[derive(Clone, Deserialize, Serialize)]
pub struct Product {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub brand: Option<ProductBrand>,
    #[serde(default)]
    pub context: Option<ProductContext>,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct ProductBrand { pub logo_url: Option<String> }

#[derive(Clone, Deserialize, Serialize)]
pub struct ProductContext { pub brand_discovery: Option<ProductDiscovery> }

#[derive(Clone, Deserialize, Serialize)]
pub struct ProductDiscovery { pub brand: Option<ProductBrand> }

#[derive(Clone, Deserialize, Serialize)]
pub struct Mailbox {
    pub id: String,
    pub address: String,
    pub product_id: Option<String>,
    pub status: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductMailboxes {
    pub product: Product,
    pub mailboxes: Vec<Mailbox>,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct Participant {
    pub name: Option<String>,
    pub email: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct Thread {
    pub id: String,
    pub mailbox_id: String,
    pub subject: String,
    pub snippet: String,
    pub last_message_at: String,
    #[serde(default)]
    pub participants: Vec<Participant>,
}

#[derive(Deserialize)]
pub struct Message {
    pub body_text: Option<String>,
    pub sent_at: String,
    pub from: Option<Participant>,
}

#[derive(Deserialize)]
pub struct ThreadDetail {
    #[serde(default)]
    pub messages: Vec<Message>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Alert {
    pub id: String,
    pub mailbox_id: String,
    pub thread_id: String,
    pub title: String,
    pub body: String,
    pub code: Option<String>,
    pub at: u64,
    pub is_test: bool,
}

pub fn extract_code(text: &str) -> Option<String> {
    let text = text.chars().take(12_000).collect::<String>();
    for pattern in [
        r"(?i)(?:verification|security|login|sign[ -]?in|one[ -]?time|otp|2fa|auth(?:entication)?|access)\s+(?:code|pin|number)?\s*(?:is|:|#|-)?\s*\b(\d{4,8})\b",
        r"(?i)\b(\d{4,8})\b\s*(?:is\s+your|for\s+your)\s+(?:verification|security|login|sign[ -]?in|one[ -]?time|otp|2fa|auth(?:entication)?|access)\s+code",
        r"(?i)\bcode\s*(?:is|:|#|-)\s*\b(\d{4,8})\b",
    ] {
        let regex = Regex::new(pattern).expect("static code regex");
        if let Some(code) = regex.captures(&text).and_then(|capture| capture.get(1)) {
            return Some(code.as_str().to_string());
        }
    }
    None
}

pub fn code_from_message(thread: &Thread, detail: &ThreadDetail) -> Option<String> {
    detail
        .messages
        .iter()
        .max_by(|a, b| a.sent_at.cmp(&b.sent_at))
        .and_then(|message| message.body_text.as_deref())
        .and_then(extract_code)
        .or_else(|| extract_code(&thread.snippet))
        .or_else(|| extract_code(&thread.subject))
}

pub fn latest_sender(detail: &ThreadDetail) -> Option<&str> {
    detail.messages.iter().max_by(|a, b| a.sent_at.cmp(&b.sent_at))
        .and_then(|message| message.from.as_ref())
        .map(|participant| participant.email.as_str())
}

pub fn timestamp_millis(raw: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(raw)
        .or_else(|_| DateTime::parse_from_str(raw, "%Y-%m-%d %H:%M:%S%.f%#z"))
        .ok()
        .map(|timestamp| timestamp.timestamp_millis())
}

pub fn email_url(config: &Config, mailbox_id: &str, thread_id: &str) -> Result<String, String> {
    let mut url = Url::parse(&config.web_url).map_err(|error| error.to_string())?;
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("section", "mail");
        if let Some(product_id) = config.mailbox_products.get(mailbox_id) {
            query.append_pair("product", product_id);
        }
        query.append_pair("mailbox", mailbox_id);
        query.append_pair("thread", thread_id);
    }
    Ok(url.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn product_avatars_keep_legacy_catalogs_compatible() {
        let legacy: Product = serde_json::from_str(r#"{"id":"p","name":"Product"}"#).unwrap();
        assert!(legacy.brand.is_none());
        let explicit: Product = serde_json::from_str(r#"{"id":"p","name":"Product","brand":{"logo_url":"https://example.com/logo.png"}}"#).unwrap();
        assert_eq!(explicit.brand.unwrap().logo_url.as_deref(), Some("https://example.com/logo.png"));
        let discovered: Product = serde_json::from_str(r#"{"id":"p","name":"Product","context":{"brand_discovery":{"brand":{"logo_url":"https://example.com/discovered.png"}},"other":"ignored"}}"#).unwrap();
        assert_eq!(discovered.context.unwrap().brand_discovery.unwrap().brand.unwrap().logo_url.as_deref(), Some("https://example.com/discovered.png"));
    }

    #[test]
    fn codes_require_context() {
        assert_eq!(extract_code("Your code is 123456"), Some("123456".into()));
        assert_eq!(extract_code("Order 123456 shipped"), None);
    }

    #[test]
    fn deep_link_targets_specific_email() {
        let mut config = Config::default();
        config.mailbox_products.insert("mb".into(), "product".into());
        assert_eq!(email_url(&config, "mb", "thread").unwrap(),
            "https://app.bangermail.com/?section=mail&product=product&mailbox=mb&thread=thread");
    }

    #[test]
    fn latest_message_sender_can_exclude_sent_mail() {
        let detail = ThreadDetail { messages: vec![
            Message { sent_at: "2026-09-23T10:00:00Z".into(), body_text: None,
                from: Some(Participant { name: None, email: "sender@example.com".into() }) },
            Message { sent_at: "2026-09-23T10:01:00Z".into(), body_text: None,
                from: Some(Participant { name: None, email: "me@example.com".into() }) },
        ] };
        assert_eq!(latest_sender(&detail), Some("me@example.com"));
    }

    #[test]
    fn accepts_banger_postgres_timestamps() {
        let expected = timestamp_millis("2026-09-23T13:05:23Z");
        assert_eq!(timestamp_millis("2026-09-23 13:05:23+00"), expected);
        assert_eq!(timestamp_millis("2026-09-23 13:05:23.123456+00"),
            expected.map(|millis| millis + 123));
        assert_eq!(timestamp_millis("2026-09-23 10:05:23-03"), expected);
    }
}
