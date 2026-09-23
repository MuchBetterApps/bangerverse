mod auth;
mod model;
mod monitor;
mod notification;

use auth::AuthState;
use model::{Alert, Config, Mailbox, Product, ProductMailboxes};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{collections::{HashMap, HashSet}, fs, sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex as StdMutex}};
use tauri::{menu::{Menu, MenuItem}, tray::TrayIconBuilder, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::Mutex;

pub struct AppState {
    app: tauri::AppHandle,
    http: reqwest::Client,
    config: Mutex<Config>,
    auth: Mutex<Option<AuthState>>,
    seen: Mutex<HashMap<String, HashMap<String, String>>>,
    recent: Mutex<Vec<Alert>>,
    monitor: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    connected: AtomicBool,
    connection_error: Mutex<Option<String>>,
    tray: TrayState,
}

struct TrayState {
    copy_item: MenuItem<tauri::Wry>,
    email_item: MenuItem<tauri::Wry>,
    latest_code: StdMutex<Option<String>>,
    latest_email_url: StdMutex<Option<String>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    signed_in: bool,
    connected: bool,
    connection_error: Option<String>,
    workspace_id: Option<String>,
    selected_mailbox_ids: Vec<String>,
    api_url: String,
    web_url: String,
    recent: Vec<Alert>,
}

#[derive(Deserialize)]
struct Envelope<T> { data: T }

fn config_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("settings.json"))
}

fn save_config(app: &tauri::AppHandle, config: &Config) -> Result<(), String> {
    fs::write(config_path(app)?, serde_json::to_vec_pretty(config).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())
}

async fn snapshot(state: &AppState) -> Status {
    let config = state.config.lock().await.clone();
    let auth = state.auth.lock().await.clone();
    let recent = state.recent.lock().await.clone();
    Status {
        signed_in: auth.is_some(),
        connected: state.connected.load(Ordering::SeqCst),
        connection_error: state.connection_error.lock().await.clone(),
        workspace_id: auth.map(|value| value.workspace_id),
        selected_mailbox_ids: config.selected_mailbox_ids,
        api_url: config.api_url,
        web_url: config.web_url,
        recent,
    }
}

async fn publish(app: &tauri::AppHandle, state: &AppState) {
    let _ = app.emit("pulse-state", snapshot(state).await);
}

async fn remember_alert(app: &tauri::AppHandle, state: &AppState, alert: &Alert) {
    {
        let mut recent = state.recent.lock().await;
        recent.insert(0, alert.clone());
        recent.truncate(20);
    }
    if let Some(code) = &alert.code {
        if let Ok(mut latest) = state.tray.latest_code.lock() { *latest = Some(code.clone()); }
        let _ = state.tray.copy_item.set_text(format!("Copy latest code: {code}"));
        let _ = state.tray.copy_item.set_enabled(true);
        if let Some(tray) = app.tray_by_id("pulse") {
            let _ = tray.set_title(Some(code));
        }
    }
    if !alert.is_test {
        let config = state.config.lock().await.clone();
        if let Ok(url) = model::email_url(&config, &alert.mailbox_id, &alert.thread_id) {
            if let Ok(mut latest) = state.tray.latest_email_url.lock() { *latest = Some(url); }
            let _ = state.tray.email_item.set_enabled(true);
        }
    }
    publish(app, state).await;
}

fn clear_tray(app: &tauri::AppHandle, state: &AppState) {
    if let Ok(mut latest) = state.tray.latest_code.lock() { *latest = None; }
    if let Ok(mut latest) = state.tray.latest_email_url.lock() { *latest = None; }
    let _ = state.tray.copy_item.set_text("No recent code");
    let _ = state.tray.copy_item.set_enabled(false);
    let _ = state.tray.email_item.set_enabled(false);
    if let Some(tray) = app.tray_by_id("pulse") {
        let _ = tray.set_title(None::<&str>);
    }
}

impl AppState {
    async fn token(&self) -> Result<(String, String), String> {
        let config = self.config.lock().await.clone();
        let mut guard = self.auth.lock().await;
        let current = guard.as_mut().ok_or("Sign in to Banger first")?;
        if current.expires_at < auth::now() + 60 {
            let refreshed = auth::refresh(&self.http, &config.api_url, current).await?;
            let _ = auth::save(&self.app, &refreshed);
            *current = refreshed;
        }
        Ok((current.access_token.clone(), current.workspace_id.clone()))
    }

    async fn api<T: DeserializeOwned>(&self, method: reqwest::Method, path: &str, body: Option<serde_json::Value>) -> Result<T, String> {
        let (token, _) = self.token().await?;
        let config = self.config.lock().await.clone();
        let mut request = self.http.request(method, format!("{}{}", config.api_url, path)).bearer_auth(token);
        if let Some(body) = body { request = request.json(&body); }
        let response = request.send().await.map_err(|error| error.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Banger request failed ({})", response.status()));
        }
        let result: Envelope<T> = response.json().await.map_err(|error| error.to_string())?;
        Ok(result.data)
    }

    async fn catalog(&self) -> Result<Vec<ProductMailboxes>, String> {
        let (_, workspace) = self.token().await?;
        let base = format!("/v1/workspaces/{workspace}");
        let products: Vec<Product> = self.api(reqwest::Method::GET, &format!("{base}/products"), None).await?;
        let mailboxes: Vec<Mailbox> = self.api(reqwest::Method::GET, &format!("{base}/mailboxes"), None).await?;
        let mut grouped: Vec<ProductMailboxes> = products.into_iter().map(|product| ProductMailboxes { product, mailboxes: vec![] }).collect();
        let mut unknown = vec![];
        for mailbox in mailboxes {
            if let Some(group) = grouped.iter_mut().find(|group| Some(group.product.id.as_str()) == mailbox.product_id.as_deref()) {
                group.mailboxes.push(mailbox);
            } else {
                unknown.push(mailbox);
            }
        }
        if !unknown.is_empty() {
            grouped.push(ProductMailboxes { product: Product { id: "unassigned".into(), name: "Other mailboxes".into(), brand: None, context: None }, mailboxes: unknown });
        }
        Ok(grouped)
    }
}

#[tauri::command]
async fn get_status(state: State<'_, Arc<AppState>>) -> Result<Status, String> {
    Ok(snapshot(&state).await)
}

#[tauri::command]
async fn sign_in(app: tauri::AppHandle, state: State<'_, Arc<AppState>>, api_url: String, web_url: String) -> Result<Status, String> {
    let api_url = model::validate_origin(&api_url)?;
    let web_url = model::validate_origin(&web_url)?;
    let auth = auth::sign_in(&state.http, &api_url).await?;
    let mut config = state.config.lock().await;
    if config.workspace_id.as_deref() != Some(&auth.workspace_id) || config.api_url != api_url {
        config.selected_mailbox_ids.clear();
        config.mailbox_products.clear();
        config.mailbox_addresses.clear();
        state.seen.lock().await.clear();
    }
    config.workspace_id = Some(auth.workspace_id.clone());
    config.api_url = api_url;
    config.web_url = web_url;
    save_config(&app, &config)?;
    *state.auth.lock().await = Some(auth.clone());
    let _ = auth::save(&app, &auth);
    drop(config);
    monitor::restart(app.clone(), state.inner().clone()).await;
    publish(&app, &state).await;
    Ok(snapshot(&state).await)
}

#[tauri::command]
async fn list_catalog(state: State<'_, Arc<AppState>>) -> Result<Vec<ProductMailboxes>, String> {
    state.catalog().await
}

#[tauri::command]
async fn save_selection(app: tauri::AppHandle, state: State<'_, Arc<AppState>>, mailbox_ids: Vec<String>) -> Result<Status, String> {
    let catalog = state.catalog().await?;
    let allowed: HashMap<String, (String, String)> = catalog.iter().flat_map(|group| group.mailboxes.iter().map(|mailbox| (mailbox.id.clone(), (group.product.id.clone(), mailbox.address.clone())))).collect();
    let selected: HashSet<String> = mailbox_ids.into_iter().collect();
    if selected.is_empty() { return Err("Choose at least one mailbox".into()); }
    if selected.iter().any(|id| !allowed.contains_key(id)) { return Err("Choose only mailboxes shown by Banger".into()); }
    let mut config = state.config.lock().await;
    config.selected_mailbox_ids = selected.into_iter().collect();
    config.mailbox_products = config.selected_mailbox_ids.iter()
        .filter_map(|id| allowed.get(id).filter(|(product, _)| product.as_str() != "unassigned").map(|(product, _)| (id.clone(), product.clone())))
        .collect();
    config.mailbox_addresses = config.selected_mailbox_ids.iter()
        .filter_map(|id| allowed.get(id).map(|(_, address)| (id.clone(), address.clone())))
        .collect();
    save_config(&app, &config)?;
    drop(config);
    if let Err(error) = notification::request_permission().await {
        eprintln!("Banger Pulse notification permission request failed: {error}");
    }
    state.seen.lock().await.clear();
    monitor::restart(app.clone(), state.inner().clone()).await;
    publish(&app, &state).await;
    Ok(snapshot(&state).await)
}

#[tauri::command]
async fn check_now(app: tauri::AppHandle, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    monitor::reconcile_all(&app, &state).await
}

#[tauri::command]
async fn test_alert(app: tauri::AppHandle, state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let alert = Alert {
        id: format!("{:016x}", rand::random::<u64>()), mailbox_id: String::new(), thread_id: String::new(),
        title: "Banger Pulse test alert".into(), body: "Alerts are working on this desktop.".into(),
        code: Some("123456".into()), at: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64, is_test: true,
    };
    remember_alert(&app, &state, &alert).await;
    Ok(notification::deliver(&app, &state, &alert).await?.to_string())
}

#[tauri::command]
async fn get_alert(state: State<'_, Arc<AppState>>, id: String) -> Result<Alert, String> {
    state.recent.lock().await.iter().find(|alert| alert.id == id).cloned().ok_or("Alert expired".into())
}

#[tauri::command]
async fn copy_code(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let code = state.recent.lock().await.iter().find(|alert| alert.id == id).and_then(|alert| alert.code.clone()).ok_or("Code expired")?;
    arboard::Clipboard::new().map_err(|error| error.to_string())?.set_text(code).map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_email(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let alert = state.recent.lock().await.iter().find(|alert| alert.id == id).cloned().ok_or("Alert expired")?;
    if alert.is_test { return Err("The test alert has no email to open".into()); }
    let config = state.config.lock().await.clone();
    let url = model::email_url(&config, &alert.mailbox_id, &alert.thread_id)?;
    open::that(url).map_err(|error| error.to_string())
}

#[tauri::command]
async fn sign_out(app: tauri::AppHandle, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    if let Some(task) = state.monitor.lock().await.take() { task.abort(); }
    state.connected.store(false, Ordering::SeqCst);
    *state.connection_error.lock().await = None;
    *state.auth.lock().await = None;
    state.seen.lock().await.clear();
    state.recent.lock().await.clear();
    clear_tray(&app, &state);
    auth::delete_saved(&app);
    let mut config = state.config.lock().await;
    config.workspace_id = None;
    config.selected_mailbox_ids.clear();
    config.mailbox_products.clear();
    config.mailbox_addresses.clear();
    save_config(&app, &config)?;
    drop(config);
    publish(&app, &state).await;
    Ok(())
}

fn show_main(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Banger Pulse").inner_size(540.0, 700.0).min_inner_size(440.0, 480.0)
        .build().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn run() {
    let quitting = Arc::new(AtomicBool::new(false));
    let menu_quitting = quitting.clone();
    tauri::Builder::default()
        .setup(move |app| {
            let handle = app.handle().clone();
            let copy_item = MenuItem::with_id(app, "copy_latest_code", "No recent code", false, None::<&str>)?;
            let email_item = MenuItem::with_id(app, "open_latest_email", "Open latest email", false, None::<&str>)?;
            let config = config_path(&handle).ok().and_then(|path| fs::read(path).ok())
                .and_then(|bytes| serde_json::from_slice::<Config>(&bytes).ok()).unwrap_or_default();
            let has_selection = !config.selected_mailbox_ids.is_empty();
            let auth = auth::load_saved(&handle).filter(|auth| config.workspace_id.as_deref() == Some(&auth.workspace_id));
            let state = Arc::new(AppState {
                app: handle.clone(),
                http: reqwest::Client::builder().timeout(std::time::Duration::from_secs(15)).build()?,
                config: Mutex::new(config), auth: Mutex::new(auth),
                seen: Mutex::new(HashMap::new()), recent: Mutex::new(vec![]), monitor: Mutex::new(None),
                connected: AtomicBool::new(false),
                connection_error: Mutex::new(None),
                tray: TrayState {
                    copy_item: copy_item.clone(), email_item: email_item.clone(),
                    latest_code: StdMutex::new(None), latest_email_url: StdMutex::new(None),
                },
            });
            app.manage(state.clone());
            let open_item = MenuItem::with_id(app, "open", "Open Banger Pulse", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&copy_item, &email_item, &open_item, &quit_item])?;
            let quit_flag = menu_quitting.clone();
            TrayIconBuilder::with_id("pulse")
                .icon(app.default_window_icon().ok_or("Missing app icon")?.clone())
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "open" => { let _ = show_main(app); },
                    "copy_latest_code" => {
                        let state = app.state::<Arc<AppState>>();
                        let code = state.tray.latest_code.lock().ok().and_then(|guard| guard.clone());
                        if let Some(code) = code {
                            let _ = arboard::Clipboard::new().and_then(|mut clipboard| clipboard.set_text(code));
                        }
                    },
                    "open_latest_email" => {
                        let state = app.state::<Arc<AppState>>();
                        let url = state.tray.latest_email_url.lock().ok().and_then(|guard| guard.clone());
                        if let Some(url) = url { let _ = open::that(url); }
                    },
                    "quit" => { quit_flag.store(true, Ordering::SeqCst); app.exit(0); },
                    _ => {}
                })
                .build(app)?;
            show_main(&handle)?;
            tauri::async_runtime::spawn(async move {
                if has_selection {
                    if let Err(error) = notification::request_permission().await {
                        eprintln!("Banger Pulse notification permission request failed: {error}");
                    }
                }
                monitor::restart(handle, state).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_status, sign_in, list_catalog, save_selection, check_now, test_alert, get_alert, copy_code, open_email, sign_out])
        .build(tauri::generate_context!())
        .expect("failed to build Banger Pulse")
        .run(move |_app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if !quitting.load(Ordering::SeqCst) { api.prevent_exit(); }
            }
        });
}
