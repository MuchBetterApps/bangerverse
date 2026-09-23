use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::random;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs::{self, OpenOptions}, io::Write, time::{SystemTime, UNIX_EPOCH}};
use tauri::Manager;
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, net::TcpListener, time::{timeout, Duration}};
use url::Url;

const SESSION_FILE: &str = "session.json";

#[derive(Clone, Serialize, Deserialize)]
pub struct AuthState {
    pub access_token: String,
    pub refresh_token: String,
    pub client_id: String,
    pub workspace_id: String,
    pub expires_at: u64,
}

#[derive(Deserialize)]
struct Registration { client_id: String }

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

#[derive(Deserialize)]
struct Claims { workspace_id: String }

pub fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

fn session_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o700)).map_err(|error| error.to_string())?;
    }
    Ok(dir.join(SESSION_FILE))
}

pub fn load_saved(app: &tauri::AppHandle) -> Option<AuthState> {
    let path = session_path(app).ok()?;
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        if fs::metadata(&path).ok()?.permissions().mode() & 0o077 != 0 { return None; }
    }
    fs::read(&path).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok())
}

pub fn save(app: &tauri::AppHandle, auth: &AuthState) -> Result<(), String> {
    let path = session_path(app)?;
    let temp = path.with_extension(format!("{}.tmp", random::<u64>()));
    let result = (|| -> Result<(), String> {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)] {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp).map_err(|error| error.to_string())?;
        file.write_all(&serde_json::to_vec(auth).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        #[cfg(windows)] {
            if path.exists() { fs::remove_file(&path).map_err(|error| error.to_string())?; }
        }
        fs::rename(&temp, &path).map_err(|error| error.to_string())
    })();
    if result.is_err() { let _ = fs::remove_file(&temp); }
    result
}

pub fn delete_saved(app: &tauri::AppHandle) {
    if let Ok(path) = session_path(app) { let _ = fs::remove_file(path); }
}

pub async fn sign_in(http: &reqwest::Client, api_url: &str) -> Result<AuthState, String> {
    let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|error| error.to_string())?;
    let redirect_uri = format!("http://127.0.0.1:{}/callback", listener.local_addr().map_err(|error| error.to_string())?.port());
    let response = http.post(format!("{api_url}/oauth/register"))
        .json(&serde_json::json!({
            "client_name": "Banger Pulse",
            "redirect_uris": [redirect_uri],
            "token_endpoint_auth_method": "none"
        }))
        .send().await.map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Banger could not register the desktop sign-in ({})", response.status()));
    }
    let registration: Registration = response.json().await.map_err(|error| error.to_string())?;
    let verifier = URL_SAFE_NO_PAD.encode(random::<[u8; 32]>());
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let expected_state = URL_SAFE_NO_PAD.encode(random::<[u8; 24]>());
    let mut authorize = Url::parse(&format!("{api_url}/oauth/authorize")).map_err(|error| error.to_string())?;
    authorize.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", &registration.client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("scope", "mail:read")
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &expected_state);
    open::that(authorize.as_str()).map_err(|error| format!("Could not open browser: {error}"))?;

    let (mut stream, _) = timeout(Duration::from_secs(300), listener.accept())
        .await.map_err(|_| "Sign-in timed out after five minutes".to_string())?
        .map_err(|error| error.to_string())?;
    let mut bytes = [0u8; 4096];
    let count = timeout(Duration::from_secs(10), stream.read(&mut bytes))
        .await.map_err(|_| "Sign-in callback timed out".to_string())?
        .map_err(|error| error.to_string())?;
    let request = String::from_utf8_lossy(&bytes[..count]);
    let path = request.split_whitespace().nth(1).ok_or("Invalid sign-in callback")?;
    let callback = Url::parse(&format!("http://127.0.0.1{path}"))
        .map_err(|_| "Invalid sign-in callback URL")?;
    let params: std::collections::HashMap<_, _> = callback.query_pairs().into_owned().collect();
    let valid_state = params.get("state") == Some(&expected_state) && callback.path() == "/callback";
    let code = params.get("code").cloned();
    let page = if valid_state && code.is_some() {
        "<h1>Banger Pulse connected</h1><p>You can return to the desktop app.</p>"
    } else {
        "<h1>Sign-in failed</h1><p>Return to Banger Pulse and try again.</p>"
    };
    let reply = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{page}", page.len());
    let _ = stream.write_all(reply.as_bytes()).await;
    if !valid_state { return Err("Sign-in state did not match".into()); }
    let code = code.ok_or_else(|| params.get("error_description").cloned().unwrap_or("Banger sign-in was cancelled".into()))?;

    let token_response = http.post(format!("{api_url}/oauth/token"))
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("client_id", registration.client_id.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("code_verifier", verifier.as_str()),
        ])
        .send().await.map_err(|error| error.to_string())?;
    if !token_response.status().is_success() { return Err(format!("Banger token exchange failed ({})", token_response.status())); }
    let token: TokenResponse = token_response.json().await.map_err(|error| error.to_string())?;
    let workspace_id = workspace_from_token(&token.access_token)?;
    Ok(AuthState {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        client_id: registration.client_id,
        workspace_id,
        expires_at: now() + token.expires_in,
    })
}

pub async fn refresh(http: &reqwest::Client, api_url: &str, current: &AuthState) -> Result<AuthState, String> {
    let response = http.post(format!("{api_url}/oauth/token"))
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", current.refresh_token.as_str()),
            ("client_id", current.client_id.as_str()),
        ])
        .send().await.map_err(|error| error.to_string())?;
    if !response.status().is_success() { return Err("Banger sign-in expired. Sign in again.".into()); }
    let token: TokenResponse = response.json().await.map_err(|error| error.to_string())?;
    let workspace_id = workspace_from_token(&token.access_token)?;
    if workspace_id != current.workspace_id { return Err("Banger changed the authorized workspace. Sign in again.".into()); }
    Ok(AuthState {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        client_id: current.client_id.clone(),
        workspace_id,
        expires_at: now() + token.expires_in,
    })
}

fn workspace_from_token(token: &str) -> Result<String, String> {
    let payload = token.split('.').nth(1).ok_or("Invalid Banger access token")?;
    let bytes = URL_SAFE_NO_PAD.decode(payload).map_err(|_| "Invalid Banger access token")?;
    let claims: Claims = serde_json::from_slice(&bytes).map_err(|_| "Missing Banger workspace")?;
    if !claims.workspace_id.chars().all(|character| character.is_ascii_hexdigit() || character == '-')
        || claims.workspace_id.len() != 36 { return Err("Invalid Banger workspace".into()); }
    Ok(claims.workspace_id)
}
