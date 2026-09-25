# mailG

mailG is an open-source, Gmail-style web interface for mailboxes hosted by Banger. Its desktop layout follows [Google's Gmail Material 3 reference](https://blog.google/products-and-platforms/products/gmail/gmail-design-update/); the left app rail is intentionally a quick switcher for the mailboxes chosen during setup. Banger remains the source of truth for messages, drafts, labels, sends, and triage. A fork does **not** need a Google OAuth app: mailG registers its own public PKCE client with Banger when a user signs in.

<p align="center">
  <img src="../../docs/screenshots/mailg-inbox.png" width="1100" alt="mailG demo inbox with a mailbox switcher, Gmail-style navigation, and sample messages">
</p>

**Your inbox. Your rules.** Start with a working email interface, then make it your own with your favorite coding agent.

- **Choose your mailboxes.** Keep the inboxes you care about in the left rail, with product avatars and domain labels.
- **Work with your mail.** Read threads, compose drafts, manage labels, and archive, star, or mark messages read and unread.
- **Make it yours.** Copy a starter prompt from the app to change the design, add a workflow, or build a different kind of email client.
- **Explore before connecting.** Try the sample inbox without signing in; connect Banger when you want to use your own mail.

| Start with a demo or your own mail | Choose what belongs in your sidebar |
| :---: | :---: |
| <img src="../../docs/screenshots/mailg-welcome.png" width="480" alt="mailG welcome dialog with Sign in with Banger and Try demo over a blurred sample inbox"> | <img src="../../docs/screenshots/mailg-mailboxes.png" width="480" alt="Mailbox selection dialog with sample names, email addresses, and checkboxes"> |

*All screenshots use fictional demo mailboxes and messages.*

## How it works

1. **Sign in with Banger—or try the demo.** The welcome dialog sits over a blurred sample inbox. Try demo opens it immediately. Sign-in uses Banger OAuth with PKCE; tokens stay in this tab’s memory. Reloading or opening another tab requires signing in again.
2. **Choose your mailboxes.** On your first connected visit, select the mailboxes to show in the sidebar. mailG remembers the selection for this workspace in this browser. Use **Manage** to change it later.
3. **Open your inbox.** Demo/view state is cleared as mailG switches to live mail. The scrim stays in place until the selected inbox loads. This clears interface state, not mail stored in Banger.
4. **Make it yours.** A one-time invitation appears after the inbox is visible. **Copy prompt to customize** gives your coding agent the source location, setup steps, and a place to describe your idea. The header's **Customize mailG** button reopens it.

<p align="center">
  <img src="../../docs/screenshots/mailg-customize.png" width="900" alt="Make this inbox yours dialog with Copy prompt to customize, View source, and Maybe later actions">
</p>

## Build your own version

Use the in-app starter prompt or give your coding agent this brief:

> Read `apps/mailg/AGENTS.md` and `apps/mailg/README.md`, run the app in demo mode, and help me customize it. Start by asking what I want to build. Preserve Banger OAuth, mailbox isolation, and the email HTML sandbox. Keep OAuth tokens in memory, never in persistent browser storage and verify changes with fictional mail.

Ideas to start with: a calmer reading view, a keyboard-first inbox, a support queue, or an AI-assisted workflow. The existing app provides the mail interface and Banger integration; additional AI features need their own implementation and provider configuration.

## Run locally

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. Choose **Try demo** or **Sign in with Banger**. No environment file is required. `.env.example` documents the optional public API origin for another Banger deployment.

## Connect to Banger

mailG is a static website. It registers a public OAuth client for its current URL, uses authorization code with PKCE, and calls the Banger API directly with `mail:read mail:write mail:send`. Banger controls workspace membership, permissions, persistence, sending, and background processing. Public deployments require HTTPS; loopback HTTP works locally. This does not connect a Google/Gmail account.

**Backend rollout dependency:** live sign-in requires Banger's browser-client CORS and registered-origin enforcement changes. Until those are deployed, the demo works but browser sign-in does not. No deployment of that backend change is claimed here.

## Deploy your fork

**Fork first:** [fork Bangerverse](https://github.com/bangermail/bangerverse/fork), then open **Actions → Deploy mailG → Run workflow** in **your fork**. Enable Actions if GitHub asks. The run summary generates Firebase and Vercel buttons for your fork, plus Netlify and Cloudflare choices. The launcher only runs on forks; it does not publish from the upstream repository.

No Redis, database, encryption key, OAuth secret, or mailG server is needed. All providers serve the same static `out/` folder. Provider accounts and their free-tier limits still apply.

| Host | Setup |
| --- | --- |
| **Firebase Hosting** | The generated button opens your fork in Cloud Shell with a tutorial. Run `npm run deploy:firebase`, sign in to Google, and choose a Firebase project. Use **Hosting on Spark**, not App Hosting. First-time Google authorization/project creation cannot be skipped. |
| **Vercel** | The generated button opens guided deployment from your fork's app directory. It creates a deployment copy. To redeploy automatically from your existing fork, import the fork and set **Root Directory** to `apps/mailg`. |
| **Netlify** | Import your fork; set **Base directory** to `apps/mailg`. Its `netlify.toml` sets the build and output directory. |
| **Cloudflare Pages** | Import your fork; choose no framework preset, **Root directory** `apps/mailg`, **Build command** `npm run build`, **Output directory** `out`, Node 22. No Worker or KV is needed. |

Firebase's script builds and publishes to the selected project; it does not create a continuous-deployment integration or a billing account. Run it again to publish changes. See [Firebase Hosting](https://firebase.google.com/docs/hosting/) and [Open in Cloud Shell](https://cloud.google.com/shell/docs/open-in-cloud-shell). Other platforms' buttons also require their account/setup confirmation; “one click” starts their deployment flow.

For any static host:

```sh
npm ci
npm run build
# Publish the out/ directory at your site's root.
```

For Docker, `docker compose up --build -d` serves static files on port 3000. Use HTTPS in front for public sign-in. No persistent volume is necessary. There is no mailG background server to keep running.

## Supported Banger features

- First-run mailbox selection, quick switching in the left rail, inbox and folder views, cursor paging, search, thread details, attachment download, and isolated message HTML. Demo mode includes Gmail-like Primary, Promotions, and Social tabs; the live app omits those tabs because Banger has no category view.
- Read/unread, star, archive, trash, and label commands. Bulk actions send one idempotent command per thread. The UI polls command status and restores the prior list if Banger reports failure.
- Draft create/update and autosave, recipient fields, raw attachment upload (25 MiB Banger limit), attachment removal, and idempotent draft send with status polling.
- Manual mailbox-scoped labels; paid Banger triage rules with exact or natural-language conditions and match preview. The Banger API's `402 plan_upgrade_required` response is the entitlement authority.
- Signed realtime tickets; notifications contain metadata only and cause targeted refetches, with reconnect reconciliation.

The current UI does not expose triage action history, undo, past-mail runs, reply-all, or Gmail's keyboard shortcuts. It does not expose webhook automation or other trigger actions that the Banger mail triage API does not support.

## Architecture and security

- Next.js exports static HTML/CSS/JavaScript. `src/lib/browser-auth.ts` handles PKCE and a single in-flight token refresh; `src/lib/client.ts` calls Banger directly, retaining each mailbox's product context.
- Access and refresh tokens live **only in memory**. Session storage temporarily holds the PKCE verifier/state during the sign-in redirect, then deletes them. The public OAuth client ID, mailbox preferences, and send-idempotency IDs are not credentials and may be stored.
- Reloading or opening another tab requires signing in again. Sign out clears the local session; it does not revoke a provider-wide grant. This trades persistent login for deployment simplicity.
- Browser tokens can be reached by compromised app JavaScript. Keep dependencies trusted and do not add untrusted scripts. Email HTML is sanitized with DOMPurify and rendered in a CSP-restricted iframe whose sandbox forbids scripts, forms, popups, and top navigation. Remote email images may load directly from their senders.
- Mail sending, rules, and storage remain on Banger. Static hosting adds no server cold start. Actual mail latency depends on Banger and the network; no speed improvement has been benchmarked. Server-only additions need a backend, never secrets bundled into this app.

Brand, theme, and feature defaults live in `src/config.ts`. There are no API routes, session cookies, Redis connections, or server secrets in mailG.

## Verification status

The earlier demo/layout checks are recorded in `design-qa.md`. Static conversion includes request-contract and OAuth lifecycle tests, plus a static production build. Live browser OAuth, send, realtime, and attachments require the Banger rollout and an end-to-end check; mocked tests do not establish that production integration works.

## License

MIT for mailG code. See `NOTICE.md` for separately licensed bundled assets and source attribution. Gmail is a trademark of Google LLC; mailG is independent of Google.

### Signed-in user profile limitation

The account menu represents the Banger sign-in, independently of the selected mailbox. It currently uses a neutral avatar: Banger's published OAuth metadata exposes no user-info endpoint or profile scopes, and OAuth access tokens omit email/name/avatar. Banger's first-party `/auth/me` endpoint requires its own session and does not accept the OAuth token used by this sample.

To display the actual account email and avatar, Banger must expose an authorized OAuth profile endpoint (email, display name, avatar URL or authenticated avatar resource). Retrieve that profile with the in-memory OAuth token through the authorized browser API. Do not substitute mailbox addresses, product logos, or synthetic OAuth actor emails for the signed-in user's identity.
