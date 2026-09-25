# Bangerverse

**Little superpowers for your email automation.** An open source home for apps and integrations built around [Banger](https://bangermail.com).

## Meet Pulse

[**Banger Pulse**](apps/pulse) is a lightweight desktop companion for macOS, Windows, and Linux. Pick the mailboxes that matter, then let Pulse watch for new mail and one time codes while you work.

<p align="center">
  <img src="docs/screenshots/pulse-live.png" width="900" alt="Banger Pulse live view showing six watched mailboxes and an empty recent alerts list against a colorful background">
</p>

- **Your inboxes, your choice.** Select mailboxes across your Banger products.
- **Useful alerts.** Get desktop notifications for new mail, with a browser link to the exact thread.
- **Codes within reach.** Copy a detected code from an alert, or find the latest code in the tray.
- **Small footprint.** Pulse stays in the tray, keeps only a short recent-alert list in memory, and does not save email bodies.

| Choose what to watch | Copy and get back to work |
| :---: | :---: |
| <img src="docs/screenshots/pulse-mailboxes.png" width="320" alt="Pulse mailbox selection with products and individual inboxes"> | <img src="docs/screenshots/pulse-code-alert.png" width="320" alt="Pulse code alert with Copy code and Open email buttons"> |

*Screenshots use sample mailboxes and messages.*

Pulse signs in through Banger OAuth, listens for realtime mail events, and fetches message details only when needed to make an alert. Read the [Pulse guide](apps/pulse/README.md) for setup, platform behavior, and the current Banger integration requirements.

### Run it locally

Install [Rust](https://rustup.rs/) and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/), then:

```sh
cd apps/pulse
npm install
npm run dev
```

## Meet mailG

[**mailG**](apps/mailg) is a Gmail-style web app for [Banger](https://bangermail.com) mailboxes, built to be forked and customized with your favorite coding agent. **Your inbox. Your rules.**

<p align="center">
  <img src="docs/screenshots/mailg-inbox.png" width="1100" alt="mailG demo inbox showing selected mailboxes, familiar mail navigation, and sample messages">
</p>

- **Your mailboxes, together.** Pick the inboxes you care about and switch between them from the left rail.
- **A familiar place to work.** Read, compose, label, star, archive, and manage mail through Banger.
- **Try it first.** Explore the demo without an account, then sign in with Banger to use your own mail.
- **Built to be remixed.** Copy the in-app starter prompt and ask your coding agent to change the design or build a new workflow.

| Choose your mailboxes | Make it yours |
| :---: | :---: |
| <img src="docs/screenshots/mailg-mailboxes.png" width="480" alt="mailG mailbox picker with fictional mailbox names and addresses"> | <img src="docs/screenshots/mailg-customize.png" width="480" alt="mailG customization invitation with a copyable coding-agent starter prompt"> |

*Screenshots use fictional demo mailboxes and messages.*

Read the [mailG guide](apps/mailg/README.md) for onboarding, local setup, Banger integration, deployment, and current verification limits.

**Fork, customize, deploy.** mailG exports a static site—no Redis, encryption key, or app server. In your fork, run **Actions → Deploy mailG** for Firebase and Vercel launchers plus Netlify and Cloudflare instructions. [Deployment guide](apps/mailg/README.md#deploy-your-fork). Live browser sign-in depends on Banger's browser OAuth rollout.

### Run the mailG preview

```sh
cd apps/mailg
npm ci
npm run dev
```

## Email templates

[**70 email templates**](templates) that look designed and do a job: welcomes, trial endings, abandoned carts, receipts, newsletters, event invites and more, for SaaS, shops, creators, services, local businesses and communities. Each comes with a brief (what it's for, when to send it, what to measure, why it works) and renders in eight styles, in your brand's colors and fonts. Plain email-safe HTML you can use anywhere.

<p align="center">
  <img src="templates/styles/brand.webp" width="160" alt="Welcome email in the Your brand style">
  <img src="templates/styles/clarity.webp" width="160" alt="Welcome email in the Clarity style">
  <img src="templates/styles/editorial.webp" width="160" alt="Welcome email in the Editorial style">
  <img src="templates/styles/bold.webp" width="160" alt="Welcome email in the Bold style">
</p>

## What's next

| Project | Status | Idea |
| --- | --- | --- |
| [Pulse](apps/pulse) | In development | Desktop mail alerts and one time codes. |
| [mailG](apps/mailg) | In development | Gmail-style web mail interface backed by Banger. |
| [Templates](templates) | Available | 70 email templates in eight styles, with briefs. |
| **More companions** | Open for ideas | Small, focused tools that connect through Banger's OAuth, API, and realtime interfaces. |

## Make it yours

We built this to be forked. Make Pulse or mailG your own, invent a new workflow, or build something we haven't imagined yet. We can't wait to see what you make.

Made something even cooler? Email [hello@team.bangermail.com](mailto:hello@team.bangermail.com) with a link and a screenshot or short demo. We'd love to share community projects on Twitter and elsewhere.

## For builders

The [integration contract](docs/integration-contract.md) documents the Banger interfaces these projects use. This repository contains no Banger server or web app source. Keep credentials, real mail, and generated builds out of commits.

Code here is [MIT licensed](LICENSE) unless a project says otherwise. Banger names and logos remain their owners' trademarks; the code license does not grant trademark rights.
