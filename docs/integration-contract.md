# Banger integration contract

This page describes the public-facing interfaces currently used by Banger Pulse. It is an integration note, not a copy of Banger's private implementation.

Pulse registers a public OAuth client with `POST /oauth/register`, signs in through `/oauth/authorize` using authorization code with PKCE, and exchanges or refreshes tokens through `POST /oauth/token`. It requests the `mail:read` scope.

Within the authorized workspace, Pulse reads products and mailboxes through `GET /v1/workspaces/{workspace}/products` and `/mailboxes`. Mailboxes may include a `product_id` for grouping. It requests a short-lived realtime ticket through `POST /v1/workspaces/{workspace}/realtime-ticket`, connects to the returned websocket URL, and reacts to `new_mail` and relevant `workspace_revision` signals. It then fetches recent threads and individual thread details through `/threads` and `/threads/{thread}`. Pulse does not receive email bodies in websocket signals.

For **Open email**, Pulse opens the Banger web app with `section=mail`, `product`, `mailbox`, and `thread` query parameters. Product grouping and exact thread links require the Banger deployment to expose `product_id` and honor those deep-link parameters. Integrations should handle older deployments where `product_id` is absent.

Do not add Banger server patches or private source files here. Make upstream changes in Banger's own repository.

## mailG browser client

mailG uses the same public PKCE flow with `mail:read mail:write mail:send`, registers its current root URL, and calls workspace mail endpoints directly with bearer authorization and the selected `x-banger-product-id`. Tokens stay in memory; only pending PKCE redirect state is in session storage. Banger must support credentialless CORS for public registration/token exchange and OAuth bearer workspace requests, checking the requesting origin against the client's registered redirect origins. Cookie-based first-party auth is unchanged. This requires the corresponding Banger backend rollout.
