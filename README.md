# Bangerverse

Open source companions that connect to [Banger](https://bangermail.com) through its OAuth, API, and realtime interfaces. A home for useful things built around Banger, separate from its private application code.

## Projects

| Project | What it does | Source |
| --- | --- | --- |
| Banger Pulse | Lightweight desktop alerts and one time codes for selected mailboxes | [apps/pulse](apps/pulse) |

Each project keeps its own build instructions and can be developed independently. To run Pulse locally:

```sh
cd apps/pulse
npm install
npm run dev
```

The [integration contract](docs/integration-contract.md) records the Banger interfaces these projects rely on. It contains no Banger server or web application source.

## Contributions

New integrations belong in their own directory under `apps/`. Keep credentials, real mail, generated builds, and Banger's private source out of commits. Include a README, an explicit license for any third party assets, and a way to run the project locally.

Code in this repository is MIT licensed unless a project says otherwise. Banger names and logos remain their owners' trademarks; the code license does not grant trademark rights.
