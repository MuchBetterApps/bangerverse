# Banger Pulse

A small open source desktop companion for [Banger](https://bangermail.com). It shows actionable alerts for selected mailboxes and extracts one time codes from new mail. Clicking **Open email** opens the exact Banger thread in your browser. **Copy code** is available directly on each alert.

## How it works

1. **Sign in with Banger.** Pulse uses Banger's OAuth authorization code flow with PKCE and requests only `mail:read`. The browser handles sign-in and consent. Pulse keeps the session in its local app config directory, using a user-only credential file on macOS and Linux. It never accesses Keychain. Updating from an earlier build requires signing in once again.
2. **Choose mailboxes.** Pulse lists mailboxes under every product in the authorized workspace. Select the ones you care about. Setup uses Banger's production URLs by default; the top-right Settings button contains server URLs for staging or self-hosted origins.
3. **Receive alerts.** Pulse obtains a signed realtime ticket and connects to `ws-notify`. A `new_mail` or relevant `workspace_revision` signal makes it fetch the latest threads in selected mailboxes. It fetches the message detail only for a new thread or updated message, extracts a code when one is clearly identified, and shows an actionable desktop alert. A ten minute reconciliation after reconnect or while online protects against missed websocket events.

Pulse does not store email bodies on disk. Its recent alert list holds only a short subject/snippet and any detected code in memory, capped at 20 items. The settings window closes completely when you close it; the Rust tray process keeps the websocket connected. On macOS and supported Linux desktops, the latest code appears beside the tray icon. The tray menu also shows it and has a one-click Copy action.

On macOS, Pulse asks for notification permission after mailbox selection and sends native Notification Center alerts. A click opens the email in the browser; the notification actions can copy the code or open the email. If permission is unavailable, a temporary Pulse popup provides the same actions. On Windows and Linux, Pulse sends an OS notification alongside an actionable popup because native action buttons vary by desktop environment. Popups are placed inside the current display's usable area. After choosing mailboxes, click **Test alert** to check local delivery. This checks the desktop alert, not delivery from Banger. The **Live** indicator means the websocket is connected; if it cannot connect, Pulse shows the connection error in the app. Pulse must remain running in the tray to receive new mail.

## Development

Install [Rust](https://rustup.rs/) and the [Tauri 2 desktop prerequisites](https://v2.tauri.app/start/prerequisites/). Then:

```sh
npm install
npm run dev
```

Run `npm test` for Rust unit tests and `npm run build` for a package on the current platform. Build on macOS, Windows, and Linux separately for their respective installers. On Linux, install the WebKitGTK and AppIndicator development packages listed in the Tauri prerequisites.

## Banger integration

Pulse uses Banger's public OAuth endpoints, workspace products/mailboxes/threads APIs, and realtime tickets. The companion has no dependency on Banger source code. Product grouping and precise browser links require Banger to include `product_id` in mailbox responses and honor `?section=mail&product=…&mailbox=…&thread=…` in the web app. Those changes must deploy before Pulse's deep links and product grouping work fully against production. Upstream source changes are maintained in Banger's own repository.

The realtime signal contains no email body. Pulse reads at most 50 recent inbox threads per selected mailbox after relevant events. Code parsing accepts 4–8 digit values with verification, sign-in, security, OTP, or similar context. It deliberately avoids copying incidental numbers. Messages older than ten minutes are never turned into new alerts during reconciliation.

## Repository layout

Pulse lives under `apps/pulse` in Bangerverse, separate from the private Banger monorepo. Banger server and web application source does not belong in this repository.

## Pulse 0.4 design

Pulse uses Banger’s ink and lime palette, original wordmark, native app icon, and bundled Lato fonts. No fonts or artwork are fetched at runtime. Settings (top right) includes System, Dark, and Light appearances and the server origins. Appearance is the only browser preference stored locally; alerts and message snippets remain in memory.

The live view keeps monitoring controls outside a scrollable recent-alert feed. Product avatars use the logo already returned in each product’s brand or discovery context, with an initial when absent; avatar images load over HTTPS without a referrer. No additional OAuth scopes are requested. Codes are grouped visually without inserting spaces into the clipboard. Mailboxes can be searched by address or product, selected in bulk within the current filter, and edited with Cancel/Save. Alerts provide inline action errors and copy feedback. The welcome includes a 3.2-second code-arrival/copy demonstration. Motion respects Reduce Motion.

For browser design QA, run `npm run frontend:dev` and use `?preview=welcome`, `?preview=mailboxes`, `?preview=live`, `?preview=empty`, or `?preview=offline`. Add `&appearance=light` or `&appearance=dark`; `&clean` hides the preview navigation. `toast.html?preview=toast&id=a1` previews the fallback alert at 380×228. These fixtures are removed from production bundles; they never replace native commands in the packaged app.

Local fonts are distributed under the SIL Open Font License and Lucide icons under the ISC license; notices are in `licenses/`. Banger brand assets retain their original ownership.
