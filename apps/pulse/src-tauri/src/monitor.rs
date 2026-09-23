use super::{model::{code_from_message, latest_sender, timestamp_millis, Alert, Thread, ThreadDetail}, AppState};
use futures_util::StreamExt;
use serde::Deserialize;
use std::{collections::HashMap, sync::{atomic::Ordering, Arc}, time::{SystemTime, UNIX_EPOCH}};
use tauri::{Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};
use tokio::time::{sleep, Duration};
use url::Url;

#[derive(Deserialize)]
struct Ticket {
    ticket: String,
    websocket_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Signal {
    #[serde(rename = "type")]
    kind: String,
    mailbox_id: Option<String>,
    mailbox_ids: Option<Vec<String>>,
    topics: Option<Vec<String>>,
}

fn now_millis() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

pub async fn restart(app: tauri::AppHandle, state: Arc<AppState>) {
    if let Some(task) = state.monitor.lock().await.take() { task.abort(); }
    state.connected.store(false, Ordering::SeqCst);
    *state.connection_error.lock().await = None;
    if state.auth.lock().await.is_none() || state.config.lock().await.selected_mailbox_ids.is_empty() { return; }
    let run_state = state.clone();
    let task = tauri::async_runtime::spawn(async move { run(app, run_state).await });
    *state.monitor.lock().await = Some(task);
}

async fn run(app: tauri::AppHandle, state: Arc<AppState>) {
    let mut backoff = 2u64;
    loop {
        match connect(&app, &state).await {
            Ok(()) => backoff = 2,
            Err(error) => {
                eprintln!("Banger Pulse realtime connection: {error}");
                *state.connection_error.lock().await = Some(error);
                backoff = (backoff * 2).min(60);
            }
        }
        state.connected.store(false, Ordering::SeqCst);
        super::publish(&app, &state).await;
        sleep(Duration::from_secs(backoff)).await;
    }
}

async fn connect(app: &tauri::AppHandle, state: &AppState) -> Result<(), String> {
    let (_, workspace) = state.token().await?;
    let device_id = format!("pulse-{:016x}", rand::random::<u64>());
    let ticket: Ticket = state.api(reqwest::Method::POST,
        &format!("/v1/workspaces/{workspace}/realtime-ticket"),
        Some(serde_json::json!({"device_id": device_id}))).await?;
    let mut url = Url::parse(&ticket.websocket_url).map_err(|error| error.to_string())?;
    url.query_pairs_mut().append_pair("ticket", &ticket.ticket).append_pair("workspace", &workspace);
    let (mut socket, _) = tokio_tungstenite::connect_async(url.as_str()).await.map_err(|error| error.to_string())?;
    state.connected.store(true, Ordering::SeqCst);
    *state.connection_error.lock().await = None;
    super::publish(app, state).await;
    // Reconcile after reconnect to recover notifications missed while offline.
    reconcile_all(app, state).await?;
    loop {
        tokio::select! {
            message = socket.next() => {
                let message = message.ok_or("Banger websocket closed")?.map_err(|error| error.to_string())?;
                if let tokio_tungstenite::tungstenite::Message::Text(text) = message {
                    if let Ok(signal) = serde_json::from_str::<Signal>(&text) {
                        match signal.kind.as_str() {
                            "new_mail" => {
                                if let Some(mailbox_id) = signal.mailbox_id {
                                    if state.config.lock().await.selected_mailbox_ids.contains(&mailbox_id) {
                                        // Ingest may precede materialization by a moment.
                                        for delay in [800, 2_000, 5_000] {
                                            sleep(Duration::from_millis(delay)).await;
                                            let _ = reconcile_mailbox(app, state, &mailbox_id).await;
                                        }
                                    }
                                }
                            },
                            "workspace_revision" => {
                                let relevant = signal.topics.as_ref().is_none_or(|topics| topics.iter().any(|topic| topic.eq_ignore_ascii_case("threads") || topic.eq_ignore_ascii_case("mailboxes")));
                                if relevant {
                                    let selected = state.config.lock().await.selected_mailbox_ids.clone();
                                    let changed = signal.mailbox_ids.unwrap_or_default();
                                    for mailbox_id in selected {
                                        if changed.is_empty() || changed.contains(&mailbox_id) {
                                            let _ = reconcile_mailbox(app, state, &mailbox_id).await;
                                        }
                                    }
                                }
                            },
                            _ => {}
                        }
                    }
                }
            },
            _ = sleep(Duration::from_secs(600)) => {
                reconcile_all(app, state).await?;
            }
        }
    }
}

pub async fn reconcile_all(app: &tauri::AppHandle, state: &AppState) -> Result<(), String> {
    let selected = state.config.lock().await.selected_mailbox_ids.clone();
    for mailbox_id in selected { reconcile_mailbox(app, state, &mailbox_id).await?; }
    Ok(())
}

async fn reconcile_mailbox(app: &tauri::AppHandle, state: &AppState, mailbox_id: &str) -> Result<(), String> {
    let (_, workspace) = state.token().await?;
    let path = format!("/v1/workspaces/{workspace}/threads?mailbox_id={mailbox_id}&view=inbox&limit=50");
    let threads: Vec<Thread> = state.api(reqwest::Method::GET, &path, None).await?;
    let current: HashMap<String, String> = threads.iter().map(|thread| (thread.id.clone(), thread.last_message_at.clone())).collect();
    let previous = state.seen.lock().await.get(mailbox_id).cloned();
    let Some(previous) = previous else {
        state.seen.lock().await.insert(mailbox_id.to_string(), current);
        return Ok(());
    };
    for thread in threads.iter().rev() {
        if previous.get(&thread.id) == Some(&thread.last_message_at) { continue; }
        let Some(received) = timestamp_millis(&thread.last_message_at) else {
            eprintln!("Banger Pulse skipped a thread with an invalid timestamp");
            continue;
        };
        if (now_millis() as i64 - received) > 10 * 60 * 1000 { continue; }
        let detail: ThreadDetail = state.api(reqwest::Method::GET,
            &format!("/v1/workspaces/{workspace}/threads/{}", thread.id), None).await?;
        let config = state.config.lock().await.clone();
        if let (Some(sender), Some(address)) = (latest_sender(&detail), config.mailbox_addresses.get(mailbox_id)) {
            if sender.eq_ignore_ascii_case(address) { continue; }
        }
        let code = code_from_message(thread, &detail);
        let sender = thread.participants.first().map(|person| person.name.as_deref().unwrap_or(&person.email)).unwrap_or("New email");
        let title = match &code { Some(code) => format!("Code {code} · {sender}"), None => format!("{sender} · Banger") };
        let body = format!("{} — {}", thread.subject, thread.snippet).chars().take(180).collect();
        let alert = Alert {
            id: format!("{:016x}", rand::random::<u64>()), mailbox_id: mailbox_id.into(), thread_id: thread.id.clone(),
            title, body, code, at: now_millis(), is_test: false,
        };
        super::remember_alert(app, state, &alert).await;
        if let Err(error) = super::notification::deliver(app, state, &alert).await {
            eprintln!("Banger Pulse could not display alert: {error}");
        }
    }
    state.seen.lock().await.insert(mailbox_id.to_string(), current);
    Ok(())
}

pub fn show_toast(app: &tauri::AppHandle, alert: &Alert) -> Result<(), String> {
    let active_monitor = app.get_webview_window("main")
        .and_then(|main| main.current_monitor().ok().flatten())
        .or_else(|| app.cursor_position().ok().and_then(|cursor|
            app.monitor_from_point(cursor.x, cursor.y).ok().flatten()))
        .or_else(|| app.primary_monitor().ok().flatten());
    let label = format!("toast-{}", alert.id);
    let url = format!("toast.html?id={}", alert.id);
    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
        .title("Banger Pulse alert").inner_size(380.0, 228.0)
        .decorations(false).always_on_top(true).resizable(false).skip_taskbar(true).visible(false)
        .build().map_err(|error| error.to_string())?;
    if let Some(monitor) = active_monitor {
        if let Ok(size) = window.outer_size() {
            let area = monitor.work_area();
            let margin = (16.0 * monitor.scale_factor()).round() as i32;
            let position = popup_position(
                area.position.x, area.position.y, area.size.width, area.size.height,
                size.width, size.height, margin,
            );
            window.set_position(position).map_err(|error| error.to_string())?;
        }
    }
    window.show().map_err(|error| error.to_string())?;
    let close_window = window.clone();
    tauri::async_runtime::spawn(async move {
        sleep(Duration::from_secs(16)).await;
        let _ = close_window.close();
    });
    Ok(())
}

fn popup_position(left: i32, top: i32, area_width: u32, area_height: u32,
                  window_width: u32, window_height: u32, margin: i32) -> PhysicalPosition<i32> {
    let x = left.saturating_add((area_width as i64 - window_width as i64 - margin as i64).max(0) as i32);
    let y = top.saturating_add((area_height as i64 - window_height as i64).max(0).min(margin as i64) as i32);
    PhysicalPosition::new(x, y)
}

#[cfg(test)]
mod tests {
    use super::popup_position;
    use tauri::PhysicalPosition;

    #[test]
    fn popup_stays_inside_secondary_display_with_negative_origin() {
        assert_eq!(popup_position(-1920, -1080, 1920, 1080, 720, 312, 32),
            PhysicalPosition::new(-752, -1048));
    }
}
