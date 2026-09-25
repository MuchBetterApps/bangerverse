# mailG

mailG is an open-source web interface for mailboxes hosted by Banger. The left sidebar is a quick switcher for the mailboxes chosen during setup. Banger remains the source of truth for messages, drafts, labels, sends, and triage.

<p align="center">
  <img src="../../docs/screenshots/mailg-inbox.png" width="1100" alt="mailG demo inbox with a mailbox switcher, mail navigation, and sample messages">
</p>

**Your inbox. Your rules.** Start with a working email interface, then make it your own with your favorite coding agent.

- **Choose your mailboxes.** Keep the inboxes you care about in the left rail, with product avatars and domain labels.
- **Work with your mail.** Read threads, compose drafts, manage labels, and archive, star, or mark messages read and unread.
- **Make it yours.** Copy a starter prompt from the app to change the design, add a workflow, or build a different kind of email client.
- **Explore before connecting.** Explore the sample inbox, then connect Banger to use your own mail.

| Start with a demo or your own mail | Choose what belongs in your sidebar |
| :---: | :---: |
| <img src="../../docs/screenshots/mailg-welcome.png" width="480" alt="mailG welcome dialog with Sign in with Banger and Try demo over a blurred sample inbox"> | <img src="../../docs/screenshots/mailg-mailboxes.png" width="480" alt="Mailbox selection dialog with sample names, email addresses, and checkboxes"> |

*All screenshots use fictional demo mailboxes and messages.*

## How it works

1. **Sign in with Banger—or try the demo.** The welcome dialog sits over a blurred sample inbox. Try demo opens it immediately. Sign-in uses Banger OAuth with PKCE; tokens stay in this tab’s memory. Reloading or opening another tab requires signing in again.
2. **Choose your mailboxes.** On your first connected visit, select the mailboxes to show in the sidebar. mailG remembers the selection for this workspace in this browser. Use **Manage** to change it later.
3. **Open your inbox.** Demo/view state is cleared as mailG switches to live mail. The scrim stays in place until the selected inbox loads. Your mail stays stored in Banger.
4. **Make it yours.** A one-time invitation appears after the inbox is visible. **Copy prompt to customize** gives your coding agent the source location, setup steps, and a place to describe your idea. The header's **Customize mailG** button reopens it.

<p align="center">
  <img src="../../docs/screenshots/mailg-customize.png" width="900" alt="Make this inbox yours dialog with Copy prompt to customize, View source, and Maybe later actions">
</p>

## Build your own version

Use the in-app starter prompt or give your coding agent this brief:

> Read `apps/mailg/AGENTS.md` and `apps/mailg/README.md`, run the app in demo mode, and help me customize it. Start by asking what I want to build. Preserve Banger OAuth, mailbox isolation, and the email HTML sandbox. Keep OAuth tokens in memory and verify changes with fictional mail.

Ideas to start with: a calmer reading view, a keyboard-first inbox, a support queue, or an AI-assisted workflow. The existing app provides the mail interface and Banger integration; additional AI features need their own implementation and provider configuration.

## Run locally

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. Choose **Try demo** or **Sign in with Banger**. `.env.example` documents the optional public API origin for another Banger deployment.

## Connect to Banger

mailG is a static website. It registers a public OAuth client for its current URL, uses authorization code with PKCE, and calls the Banger API directly with `mail:read mail:write mail:send`. Banger controls workspace membership, permissions, persistence, sending, and background processing. Public deployments require HTTPS; loopback HTTP works locally.

**Live sign-in:** requires deployment of Banger's browser OAuth support from [PR #3124](https://github.com/MuchBetterApps/mba/pull/3124). The demo is ready to explore.

## Deploy your copy

Choose **Netlify**, **Vercel**, or **Cloudflare** to create your own mailG repository and deploy it.

[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=for-the-badge)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbangermail%2Fbangerverse%2Ftree%2Fmain%2Fapps%2Fmailg&project-name=mailg&repository-name=mailg)
[![Netlify](https://img.shields.io/badge/Deploy-Netlify-00C7B7?style=for-the-badge)](https://app.netlify.com/start/deploy?repository=https%3A%2F%2Fgithub.com%2Fbangermail%2Fbangerverse&create_from_path=apps%2Fmailg&branch=main)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fbangermail%2Fbangerverse%2Ftree%2Fmain%2Fapps%2Fmailg)

These buttons load `apps/mailg` as the template. Sign in, choose where to create your repository copy, and confirm deployment. Future pushes to that copy update your site.

mailG builds into a static `out/` folder that you can publish with your preferred hosting provider.

| Host | Setup |
| --- | --- |
| **Vercel** | The button copies the mailG app into your repository with its build settings. Choose the repository name and confirm deployment. |
| **Netlify** | The button copies `apps/mailg` into your repository. The included `netlify.toml` sets Node 22, `npm run build`, and the `out` publish directory. Confirm the repository and deploy. |
| **Cloudflare** | The button copies the mailG app, detects `npm run build`, and publishes `out` using the included Workers static-assets configuration. Confirm the repository and deploy. |


For any static host:

```sh
npm ci
npm run build
# Publish the out/ directory at your site's root.
```

For Docker, `docker compose up --build -d` serves static files on port 3000. Use HTTPS in front for public sign-in.

## Supported Banger features

- First-run mailbox selection, quick switching in the left rail, inbox and folder views, cursor paging, search, thread details, attachment download, and isolated message HTML. Demo mode includes Primary, Promotions, and Social tabs; live mail uses Banger folders and labels.
- Read/unread, star, archive, trash, and label commands. Bulk actions send one idempotent command per thread. The UI polls command status and restores the prior list if Banger reports failure.
- Draft create/update and autosave, recipient fields, raw attachment upload (25 MiB Banger limit), attachment removal, and idempotent draft send with status polling.
- Manual mailbox-scoped labels; paid Banger triage rules with exact or natural-language conditions and match preview. The Banger API's `402 plan_upgrade_required` response is the entitlement authority.
- Signed realtime tickets; notifications contain metadata only and cause targeted refetches, with reconnect reconciliation.

## Architecture and security

- Next.js exports static HTML/CSS/JavaScript. `src/lib/browser-auth.ts` handles PKCE and a single in-flight token refresh; `src/lib/client.ts` calls Banger directly, retaining each mailbox's product context.
- Access and refresh tokens live **only in memory**. Session storage temporarily holds the PKCE verifier/state during the sign-in redirect, then deletes them. The browser stores public client registration metadata, mailbox preferences, and send-idempotency IDs.
- Reloading or opening another tab requires signing in again. Sign out clears the local session.
- Browser tokens can be reached by compromised app JavaScript. Use trusted dependencies and scripts. Email HTML is sanitized with DOMPurify and rendered in a CSP-restricted iframe whose sandbox forbids scripts, forms, popups, and top navigation. Remote email images may load directly from their senders.
- Banger handles mail sending, rules, and storage. The browser calls its API directly; mail latency depends on Banger and the network. Add a backend for custom features that require private credentials.

Brand, theme, and feature defaults live in `src/config.ts`.

## Verification status

The earlier demo/layout checks are recorded in `design-qa.md`. Static conversion includes request-contract and OAuth lifecycle tests, plus a static production build. Live browser OAuth, send, realtime, and attachments require the Banger rollout and an end-to-end check. See `design-qa.md` for verification details.

## License

MIT for mailG code. See `NOTICE.md` for separately licensed bundled assets and source attribution.

### Account menu

The account menu shows the Banger sign-in with a neutral avatar, a selected-mailbox dropdown, and a Sign out action. Displaying the user's email and avatar requires a Banger OAuth profile endpoint.
