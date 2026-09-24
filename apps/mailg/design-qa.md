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
