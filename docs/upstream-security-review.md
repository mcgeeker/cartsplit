# lineitem Firefox extension: source security review

Reviewed: October 22, 2026
Commit: `e358b565addbe433673eaff6b6f5f12cbc88ed9a`
Source version: 1.4.0

## Assessment

I found no evidence of covert bulk uploading of shopping history, budgets, passwords, or browsing history in the first-party code paths reviewed. I did find deliberate transmission of reusable YNAB credentials through the developer's service, optional feedback submission to Web3Forms, ordinary remote asset requests, and several privacy/security weaknesses. This is a source review, not a clean bill of health for the installed add-on or deployed service.

The most consequential trust decision is whether to let the operator of auth.lineitem.dev handle reusable YNAB tokens. The reviewed worker does not persist them or send them to another destination besides YNAB, but it necessarily receives them. Its operator could change that service independently of an extension update.

## Scope and method

Retrieved 115 first-party text files at the requested commit: 83 extension files, 21 shared UI files, and 11 supporting worker, policy, dependency, workflow, and repository files. Scanned the first-party source for outbound HTTP, WebSockets, beacons, external URLs, dynamic execution, encoding, sensitive browser APIs, storage, messaging, navigation, and remote images. Traced the identified OAuth, YNAB update, feedback, model initialization, image rendering, and disconnect paths.

Additionally inspected the upstream Transformers.js 3.8.1 model-loading helper, environment defaults, and feature-extraction pipeline. The lockfile resolves that version. Did not install packages, execute repository code, connect a personal account, or change the MediaStack.

## What leaves the browser

| Recipient | Data or request | Trigger |
| --- | --- | --- |
| auth.lineitem.dev, hosted as a Cloudflare Worker | Authorization code and redirect URI; refresh token; token responses pass back through the worker. The service sees connection metadata such as the client IP. | YNAB connection and token refresh |
| YNAB API | Bearer access token; budget/transaction/category requests; approved categories, amounts, and product-title memos | Sync, backfill, budget selection, approval |
| Amazon/Target and image hosts from their page DOM | Normal authenticated retailer page requests; separate requests for product image URLs displayed in the sidebar | Retailer browsing/scraping and image rendering |
| Hugging Face and its download CDNs | Model/config/tokenizer download requests and ordinary connection metadata; no product-title upload found | Model initialization at background startup; browser caching can satisfy later requests |
| Web3Forms | User-entered message and optional email, form type; issue reports also add browser and extension versions | User submits a feedback form |

Other external destinations, such as GitHub, the website, and Ko-fi, appear as links requiring user navigation. They are not automatic transaction-upload endpoints.

## Findings

### 1. Material trust exposure: the developer's server handles reusable YNAB credentials

[apps/extension/lib/oauth.ts](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/extension/lib/oauth.ts#L61-L97) POSTs the refresh token to `/oauth/refresh` and the authorization code to `/oauth/exchange`. [apps/worker/src/index.ts](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/worker/src/index.ts#L37-L70) adds the application secret, calls YNAB, and returns YNAB's token response.

This is intentional OAuth architecture, not proof of credential theft. However, the relay receives the refresh token and can observe access-token responses. A malicious or compromised operator could use those credentials for API access within the grant. HTTPS protects transit; it does not hide request/response contents from the relay.

The authorization request does not request read-only access. The extension needs write access for splits. Selecting a default plan is an application routing choice, not evidence that the token is restricted to that one plan: [apps/extension/lib/ynab.ts](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/extension/lib/ynab.ts#L78-L103) explicitly provides a list of accessible plans.

No token database, token logging, or additional token recipient appears in the reviewed worker. Deployed code, Cloudflare settings, logs, and retention were not verified.

### 2. Confirmed privacy/control gap: Disconnect does not revoke or erase everything

[apps/extension/components/Settings.tsx](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/extension/components/Settings.tsx#L45-L53) calls the clear-settings message. The background handler calls only `clearSettings()`. [apps/extension/lib/settings.ts](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/extension/lib/settings.ts#L15-L40) removes local credential and plan keys.

That flow does not call a YNAB revocation endpoint, clear IndexedDB, or cancel existing sync/backfill work. Existing work can already hold a token in memory. [apps/extension/lib/db.ts](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/extension/lib/db.ts#L20-L31) stores allocated transactions, learned product/category associations, product embeddings, and categories separately. Product-title storage is explicit in [apps/extension/background/approval.ts](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/extension/background/approval.ts#L131-L145).

The policy's statements that Settings revokes access and that learned data remains only until disconnect overstate what this implementation does: [apps/landing/src/components/PrivacyPolicy.tsx](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/landing/src/components/PrivacyPolicy.tsx#L127-L162).

For complete revocation, use YNAB's own authorized-app controls. Removing local credentials cannot invalidate a token already held elsewhere. A stronger implementation would cancel active work, offer deletion of local learned data, and distinguish local disconnection from server-side revocation.

### 3. Confirmed minor disclosure gaps: feedback metadata and image requests

[apps/extension/components/Help.tsx](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/extension/components/Help.tsx#L88-L96) supplies browser and extension versions to issue reports. [packages/ui/src/feedback.ts](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/packages/ui/src/feedback.ts#L67-L86) appends them to the submitted form, and [packages/ui/src/feedback.ts](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/packages/ui/src/feedback.ts#L106-L119) sends it to Web3Forms. [packages/ui/src/FeedbackForm.tsx](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/packages/ui/src/FeedbackForm.tsx#L107-L110) does disclose this beside the issue form, but the policy table says only the typed message/email are shared. No automatic budget dump or diagnostic-log attachment was found.

Retailer scrapers copy image URLs directly from the DOM: [apps/extension/retailers/amazon/scraper.ts](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/extension/retailers/amazon/scraper.ts#L134-L143) and [apps/extension/retailers/target/scraper.ts](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/extension/retailers/target/scraper.ts#L205-L219). [apps/extension/components/Thumb.tsx](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/extension/components/Thumb.tsx#L23-L32) loads that URL as an image with no explicit origin allowlist. This can reveal requested product-image identifiers, timing, and IP to the image host, subject to caching/browser behavior. No code constructs tracking URLs carrying tokens or budget data. Treat this as ordinary remote image loading with a hardening opportunity, not demonstrated malicious tracking.

### 4. Security hardening: credentials are exposed too broadly within the extension

[apps/extension/entrypoints/background.ts](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/extension/entrypoints/background.ts#L87-L105) ignores the message sender and returns the entire settings object for `GET_SETTINGS`. That includes both access and refresh tokens. The sidebar uses only token presence to choose a view: [apps/extension/entrypoints/sidepanel/App.tsx](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/extension/entrypoints/sidepanel/App.tsx#L77-L83).

A better design returns a sanitized connection status and plan information, keeps credentials in the background, and restricts sensitive commands to the sidebar. Content scripts should be allowed only their required message types.

This is a conditional weakness: it increases consequences of a compromised extension context. I found no web-page-to-extension bridge that lets an ordinary site invoke these commands, and I am not claiming an arbitrary website can currently steal the tokens through this handler. The existing content scripts already have access to the extension storage API, so sender checks alone are not a complete token-isolation strategy.

The OAuth flow correctly checks random `state`, but has no PKCE challenge/verifier. YNAB's current documentation supports PKCE. Adding it would protect against authorization-code interception; it would not remove the relay's ability to see token responses.

### 5. Supply-chain hardening: remotely fetched model is not pinned to a revision

[apps/extension/background/embedder.ts](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/extension/background/embedder.ts#L51-L59) names a model and dtype but no immutable revision. Transformers.js 3.8.1 defaults the model revision to `main`. A fresh cache can therefore receive different model files even when extension source remains unchanged.

The reviewed feature-extraction path tokenizes and runs the model locally. No inference API call carrying product titles was found. The downloaded ONNX model is model data, not an arbitrary downloaded JavaScript program; parser/runtime supply-chain risk still exists.

The ONNX JavaScript/WebAssembly runtime is packaged locally by [apps/extension/wxt.config.ts](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/extension/wxt.config.ts#L123-L134); the configured script policy restricts scripts to the extension plus WebAssembly compilation. Pinning the model to an immutable revision, or bundling it with validated hashes, would make the reviewed behavior more reproducible.

The model also initializes at background startup ([apps/extension/entrypoints/background.ts](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/extension/entrypoints/background.ts#L59-L63)), which is earlier than the policy's statement that its first download occurs at first sync.

## Reassuring observations

1. No first-party analytics SDK, keylogger, cookie extraction, history harvesting, native messaging, WebSocket/beacon uploader, obfuscated payload, or arbitrary eval/new Function path was found.
2. Product classification uses a local feature-extraction pipeline. Browser network helpers fetch model files rather than submitting input texts to an inference service.
3. Approved shopping item names do leave the device as YNAB memos. This is part of the visible budgeting feature: [apps/extension/background/approval.ts](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/extension/background/approval.ts#L71-L89) and [apps/extension/background/approval.ts](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/apps/extension/background/approval.ts#L214-L222).
4. The manifest scopes site access to listed services rather than all websites. Amazon/Target content-script matches are nevertheless broad across their subdomains and pages, and include HTTP/HTTPS patterns.
5. OAuth checks a random state value, token refresh is deduplicated, and the worker validates basic inputs and rate-limits by IP. Those are positive controls, not proof of deployment security.

## Limits and practical decision

Did not compare the signed Firefox XPI with a reproducible build, capture runtime network traffic, audit all transitive dependency code or binary runtimes, inspect downloaded model artifacts, or verify the deployed worker against this source. Future extension or server changes are outside this review.

Assessment: no observed spyware behavior in the reviewed first-party source; meaningful third-party credential exposure and privacy/control gaps remain. For a sensitive YNAB account, decide on the basis that you are trusting the developer and their hosted auth service with reusable budget API credentials.

## Supporting upstream references

- [YNAB OAuth and API documentation](https://api.ynab.com/#oauth) — token usage, write scope, default plan selection, state, PKCE, independent token revocation.
- [Mozilla runtime.onMessage](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage) — extension-internal messaging boundary.
- [Mozilla storage.local](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/local) — local storage persistence and normal uninstall behavior.
- [Transformers.js 3.8.1 hub.js](https://github.com/huggingface/transformers.js/blob/3.8.1/src/utils/hub.js#L215-L248) — browser model-file fetch helper; default revision at line 467.
- [Transformers.js 3.8.1 pipelines.js](https://github.com/huggingface/transformers.js/blob/3.8.1/src/pipelines.js#L1295-L1356) — feature extraction implementation.
