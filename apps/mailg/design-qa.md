# Visual QA

Status: **blocked for a pixel-equality claim**. The desktop UI has been reviewed and the visible layout is close to the chosen Gmail reference, but the reference image is a 2000 × 1250 promotional capture while the local browser preview was 1280 × 720. No normalized pixel comparison is possible from those two captures.

## Evidence

- Reference: [Google's Gmail Material 3 design update](https://blog.google/products-and-platforms/products/gmail/gmail-design-update/) and its [full-size product image](https://storage.googleapis.com/gweb-uniblog-publish-prod/images/Gmail_GM3.width-2000.format-webp.webp).
- Implementation: local demo at `http://127.0.0.1:3001/`, inspected in the Codex in-app browser at 1280 × 720 on 2026-09-24. Reviewed inbox, short mailbox inbox, setup picker, thread, composer, dark theme, and landscape theme. The preview normally starts on port 3000; this QA run used 3001 because 3000 was occupied.
- The implementation uses bundled Google Sans and Material Symbols fonts. Its row height, left folder column, search field, header, rounded mail panel, message typography, and composer position were adjusted against the reference.

## Deliberate differences

- The narrow left app rail contains the user's selected Banger mailboxes and a Manage control, as requested, in place of Gmail's Chat, Spaces, and Meet items.
- mailG uses its own name and mail symbol. It does not use Google's Gmail logo.
- The live Banger view hides Gmail category tabs because the Banger API has no Primary, Promotions, or Social classification. Demo data supports those tabs to show the Gmail layout.
- The landscape theme is an additional mailG option; the default theme is the Gmail-style baseline.

## Remaining limits

- Pixel equality remains unproven because the source and implementation captures differ in viewport and content. The source is a Google promotional screenshot, not an interactive live Gmail page.
- Live Banger authentication, sending, and attachment upload were not exercised without credentials and network access. Demo mailbox switching, draft save/reopen/send, and attachment selection were exercised in the local browser; TypeScript and production build passed.
- Gmail-only features such as keyboard shortcuts, reply-all, and its proprietary category classification are not in this sample.

## 2026-09-24: landscape edges and live actions

- Landscape now paints one background on the app shell, with a uniform light overlay; header and sidebars are transparent, eliminating rectangular seams around the rounded inbox. The reserved right rail remains empty.
- Mail clients carry an immutable product context, including commands, labels, rules, draft changes, and attachment uploads. Product-scoped mailbox reads recover membership when older API responses omit `product_id`.
- Added bulk mark-as-read. Thread display uses current list state, folder changes update optimistically, and commands on one thread execute in order. Stale list/detail responses are ignored.
- Verified live read/unread across refresh and automatic read-on-open through the signed-in local app. Restored the verification message to unread. Trash and label request contracts are covered with mocked fetch; those mutations were not exercised on real mail.
- Validation: client request regression test, TypeScript check, production build. This is a local app connected to Banger, not a deployment.

## 2026-09-24: full-height HTML message reader

- Replaced the fixed 260px HTML frame with a content-measured frame using ResizeObserver. Reply/Forward follow the entire message; the main reader owns vertical scrolling.
- The parent can measure the frame through `allow-same-origin`; scripts, forms, popups and top navigation remain sandboxed, with `default-src 'none'` retained in the response CSP.
- Verified the reported Square Town email: body, document, and frame viewport all measured 742px, with the complete message visible. Restored its original unread state.
- TypeScript and production build passed.

## 2026-09-24: email images and resize-loop repair

- Allowed HTTP/HTTPS email images in the HTML response CSP and added `Referrer-Policy: no-referrer`. Scripts and forms remain blocked.
- Measure a flow-root content wrapper rather than the body's viewport-dependent scroll height, preventing feedback in quirks-mode emails. Reveal the frame after its first complete layout; show a placeholder while loading.
- Removed fabricated live-message bodies and demo rows from live startup to prevent temporary content flashes.
- Verified the previously broken Square Town image loaded (natural width 1200px). Frame height stayed at 1037px on repeated checks; document and viewport heights matched. TypeScript and production build passed.
