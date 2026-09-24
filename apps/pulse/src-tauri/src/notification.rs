use super::{model::{code_is_fresh, email_url, Alert, CODE_TTL_MS}, monitor, now_millis, AppState};
use tauri::AppHandle;

#[cfg(target_os = "macos")]
pub async fn request_permission() -> Result<bool, String> {
    mac_usernotifications::request_auth().await.map_err(|error| error.to_string())
}

#[cfg(not(target_os = "macos"))]
pub async fn request_permission() -> Result<bool, String> { Ok(true) }

#[cfg(target_os = "macos")]
pub async fn deliver(app: &AppHandle, state: &AppState, alert: &Alert) -> Result<&'static str, String> {
    use mac_usernotifications::{Action, AuthorizationStatus, Notification};
    use std::time::Duration;

    let authorized = match mac_usernotifications::get_notification_settings().await {
        Ok(settings) => match settings.authorization_status {
            AuthorizationStatus::Authorized | AuthorizationStatus::Provisional => true,
            AuthorizationStatus::NotDetermined => request_permission().await.unwrap_or(false),
            _ => false,
        },
        Err(error) => {
            eprintln!("Banger Pulse could not check notification permission: {error}");
            false
        }
    };
    if authorized {
        let timeout = if alert.code.is_some() {
            Duration::from_millis(CODE_TTL_MS.saturating_sub(now_millis().saturating_sub(alert.at)).max(1))
        } else { Duration::from_secs(3600) };
        let mut notification = Notification::new()
            .title(&alert.title)
            .message(&alert.body)
            .timeout(timeout);
        if alert.code.is_some() {
            notification = notification.action(Action::button("copy", "Copy code"));
        }
        if !alert.is_test {
            notification = notification.action(Action::button("open", "Open email"));
        }
        match notification.send().await {
            Ok(handle) => {
                let code = alert.code.clone();
                let received_at = alert.at;
                let url = if alert.is_test { None } else {
                    let config = state.config.lock().await.clone();
                    email_url(&config, &alert.mailbox_id, &alert.thread_id).ok()
                };
                tauri::async_runtime::spawn(async move {
                    if let Ok(response) = handle.response().await {
                        if response.action_identifier == "copy" {
                            if let Some(code) = code.filter(|_| code_is_fresh(received_at, now_millis())) {
                                let _ = arboard::Clipboard::new().and_then(|mut clipboard| clipboard.set_text(code));
                            }
                        } else if response.is_default_action() || response.action_identifier == "open" {
                            if let Some(url) = url { let _ = open::that(url); }
                        }
                    }
                });
                return Ok("native");
            }
            Err(error) => eprintln!("Banger Pulse native notification failed: {error}"),
        }
    }
    monitor::show_toast(app, alert)?;
    Ok("popup")
}

#[cfg(not(target_os = "macos"))]
pub async fn deliver(app: &AppHandle, state: &AppState, alert: &Alert) -> Result<&'static str, String> {
    use notify_rust::{NotificationResponse, Timeout};

    // Keep the actionable popup as a fallback for notification servers without buttons.
    let mut notification = notify_rust::Notification::new();
    let timeout = alert.code.as_ref().map(|_| CODE_TTL_MS.saturating_sub(now_millis().saturating_sub(alert.at)).min(60_000).max(1) as u32)
        .unwrap_or(60_000);
    notification.summary(&alert.title).body(&alert.body).appname("Banger Pulse")
        .timeout(Timeout::Milliseconds(timeout));
    #[cfg(not(target_os = "windows"))]
    {
        if alert.code.is_some() { notification.action("copy", "Copy code"); }
        if !alert.is_test { notification.action("default", "Open email"); }
    }
    match notification.show() {
        Ok(handle) => {
            let code = alert.code.clone();
            let received_at = alert.at;
            let url = if alert.is_test { None } else {
                let config = state.config.lock().await.clone();
                email_url(&config, &alert.mailbox_id, &alert.thread_id).ok()
            };
            tauri::async_runtime::spawn_blocking(move || {
                let _ = handle.wait_for_response(|response: &NotificationResponse| match response {
                    NotificationResponse::Action(action) if action == "copy" => {
                        if let Some(code) = code.as_ref().filter(|_| code_is_fresh(received_at, now_millis())) {
                            let _ = arboard::Clipboard::new().and_then(|mut clipboard| clipboard.set_text(code));
                        }
                    }
                    NotificationResponse::Default | NotificationResponse::Action(_) => {
                        if let Some(url) = &url { let _ = open::that(url); }
                    }
                    _ => {}
                });
            });
        }
        Err(error) => eprintln!("Banger Pulse native notification failed: {error}"),
    }
    monitor::show_toast(app, alert)?;
    Ok("native and popup")
}
