# Bangerverse

**Little superpowers for your email automation.** An open source home for apps and integrations built around [Banger](https://bangermail.com).

## Meet Pulse

[**Banger Pulse**](apps/pulse) is a lightweight desktop companion for macOS, Windows, and Linux. Pick the mailboxes that matter, then let Pulse watch for new mail and one time codes while you work.

<p align="center">
  <img src="docs/screenshots/pulse-live.png" width="420" alt="Pulse live view showing recent mail, a one time code, and actions to copy the code or open the email">
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

## What's next

| Project | Status | Idea |
| --- | --- | --- |
| [Pulse](apps/pulse) | In development | Desktop mail alerts and one time codes. |
| **MailG** | Planned | Another way to work with mail in the Bangerverse. We'll publish the scope as it takes shape. |
| **More companions** | Open for ideas | Small, focused tools that connect through Banger's OAuth, API, and realtime interfaces. |

## Make it yours

Fork Pulse. Change the look, add a workflow, or build something entirely new on Banger's APIs. Your version does not have to fit our roadmap.

When it's ready, [show us your fork in an Issue](https://github.com/MuchBetterApps/bangerverse/issues/new) with a link and a screenshot or short demo. We'd love to feature projects from the community on Twitter and elsewhere. If you want your work in Bangerverse too, open a pull request; new apps can live in their own directory under `apps/`.

## For builders

The [integration contract](docs/integration-contract.md) documents the Banger interfaces these projects use. This repository contains no Banger server or web app source. Keep credentials, real mail, and generated builds out of commits.

Code here is [MIT licensed](LICENSE) unless a project says otherwise. Banger names and logos remain their owners' trademarks; the code license does not grant trademark rights.
