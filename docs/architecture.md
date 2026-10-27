# CartSplit architecture and maintenance

Current scope: October 25, 2026. This document describes the personal Firefox runtime. The retained upstream OAuth worker and marketing site are outside that runtime. See the [development guide](development.md) for build instructions and recorded verification.

## Trust boundaries

| Boundary | Owner | Rule |
| --- | --- | --- |
| Web page → content reader | `entrypoints/amazon-ca.content.ts` | Passive listener registers at document start; loading documents return a closed status. No automatic read. Only own-extension, non-tab requests for order summary or payments. Readers validate Canadian URLs, language, links, quantities, currency and amounts. |
| Sidebar → background | `background/ui-messages.ts`, `lib/verification.ts` | Exact extension ID and sidebar URL, no tab sender, one explicit command allowlist. Content scripts cannot connect, read settings, prepare, save or delete local data. |
| Page reply → review | `background/page-request.ts`, `background/order-review.ts` | Treat replies as untrusted. Ten-second request deadline, abort handling, closed unavailable/empty/timeout diagnostics, bounded item count and strict projections. Never accept sidebar-provided amounts. |
| Background → YNAB | `lib/ynab.ts` | Fixed HTTPS API origin, redirects rejected, cookies omitted, bearer token added only here. Private read/write capabilities and path/method allowlists apply independently of the UI. |
| Background → local model | `background/embedder.ts`, `background/purchase-learning.ts` | Only public model files are fetched. Text inference stays on-device; remote model data is pinned to a commit and executable WASM is packaged locally. |

React renders titles/category labels as text. The runtime has no HTML injection, web-page message bridge, feedback-submission path, general transaction writer, batch approval, sync, backfill or OAuth relay client.

## Review and save lifecycle

1. The workspace follows validated order metadata from the active tab. Drafts remain mounted per order; order keys are own properties, including unusual names such as `constructor`. Session receipts are read-only. Changing tabs never starts a review or save.
2. Review reads the selected detail page and the one current payments page, reconciles full funding, and checks each exact linked amount/date against eligible YNAB charges before suggesting categories. No ninety-day cutoff applies. Existing categorized/split transactions are preserved.
3. Preparation recomputes allocation from fresh data and validates exact current category IDs/names. Single-product orders use the complete card amount. Split shipments retain distinct charges and approvals; allocation freezes after the first saved charge. Grants expire after five minutes and are bound to the review, connection, original tabs, target and policy.
4. Apply consumes the grant before awaiting. It rechecks pages, selected tab, connection, categories and transaction; the writer also verifies that the destination is currently named Test Plan. The only writable target is an eligible manual Amazon outflow in the open, unlinked, on-budget Lineitem Test Cash account. The response must verify parent fields and exact category/split amounts.
5. A sent write is never retried automatically. A lost response or post-send cancellation produces an unconfirmed result and blocks another attempt in that background session. Only verified success can teach categories. Optional local-learning failure cannot turn verified remote success into a failed financial save.

The background serializes connection, cache and review mutations. Cancellation reaches queued/in-flight work immediately. Navigation cancels review/preparation and invalidates final consent while preserving drafts; it preserves an already-sent save. Explicit disconnect cancels active requests. Waiting on a shared model download is abortable; the public download may finish, while canceled text inference/storage cannot resume. Already-running WASM inference is not forcibly terminated.

YNAB does not supply a transaction lock for this workflow. Fresh reads narrow the race but cannot make external edits between preflight and PUT impossible. There is no remote rollback or durable idempotency guarantee. An unconfirmed result requires manual inspection, including after extension restart.

## Storage and retention

| Data | Location/lifetime | Notes |
| --- | --- | --- |
| Personal Access Token and chosen plan | Extension-origin `cartsplit-connection` IndexedDB | Content scripts use the page's IndexedDB origin. The token is not returned to the sidebar or stored in `storage.local`. Local profile storage is not encryption or an OS vault. Disconnect removes the local connection; revoke separately at YNAB. |
| Exact reviewed choices | `lineitem` / `learnedProducts` | Plan + reviewed-retailer + product ID → category ID. Persist until correction, conflict removal or confirmed cleanup. Product/category IDs still reveal purchasing information. |
| Reviewed vectors | `lineitem` / `productEmbeddings` | 384 dimensions, model marker, timestamp, category ID, empty title. At most 50/category and 500/plan in the reviewed pool. Embeddings are derived personal data, not anonymization. |
| Category cache | `lineitem` / `categories` | Each replacement is tagged with the owning plan. A canceled switch cannot expose the new cache under the old plan. Untagged historical cache rows are hidden from active category reads; refresh explicitly. |
| Historical upstream data | Existing four `lineitem` stores | Schema and records are preserved. No startup adoption or guessed plan assignment. Old rows may contain titles, prices or identifiers; they remain dormant until explicitly removed. |
| Review drafts / bindings | Sidebar and background memory | Include current product text and connection binding. Reviews expire for authorization after ten minutes; expiry is not a guaranteed physical erasure timer. Navigation may retain mounted drafts until sidebar close. Background snapshots prune on subsequent review/clear/invalidation. |
| Save receipts / warnings | Background memory, plan/order scoped | No token, titles or raw YNAB IDs in UI projections. Up to 100 completed receipts; partial/unconfirmed entries are retained for safety. Restart clears them and cannot establish whether a prior write saved. |
| Model files | Browser-managed model Cache API | Public artifact files, separate from learned records. Pinning a revision can cause a new download alongside a previous cache entry. Local-data cleanup does not clear this cache. |

Local-data removal uses a disconnected-only count preview and a single-use expiring grant. It compares record keys and atomically clears all four application stores. It does not erase the separate credential DB, model/browser cache, or YNAB records. Nothing is deleted at upgrade/startup. Fixture writers exist only under `test-support/` and are not imported by runtime entries.

## Local suggestions

`suggestPurchaseCategories` tries exact reviewed-product learning, then similar reviewed products, then category-name/group embeddings from the same local model. The historical similarity threshold is 0.75; category similarity is 0.45; both require a 0.08 margin over the next category. These are heuristics, not calibrated probabilities. Low confidence or model failure leaves manual selection available. Duplicate/invalid categories cannot be used.

Category-name vectors are reused across reviews in a single background-memory snapshot of at most 512 categories (0.75 MiB of vector data at that cap, plus identifiers/text and object overhead). The key includes the plan, model marker, current category IDs and exact bounded text used for inference; category ordering alone does not force recomputation. Changed model inputs or IDs require a fresh fill. Larger plans still score all valid categories but bypass this cache. Connection attempts, plan selection, disconnect and background restart clear it. Failed/canceled fills and fills invalidated by a connection change are never retained. No product text is added to this cache, no cache data is written to disk, and fresh YNAB category/transaction checks still run independently. The first model-assisted review after reload still pays initialization and category encoding costs; subsequent reviews avoid repeated category encoding.

The model is `Xenova/bge-small-en-v1.5`, q8, revision `ea104dacec62c0de699686887e3f920caeb4f3e3`. Model updates require code review and compatibility consideration for persisted vectors. Processing uses one WASM thread, batches up to eight inputs, bounded text lengths, and validated finite 384-dimensional vectors. Mean pooling is retained for compatibility with existing reviewed vectors. First-use loading and inference latency/RAM are not benchmarked on this user's browser.

Hugging Face and its allowed CDNs can observe IP address, request timing and requested public artifact paths. Product text, category names, YNAB token and financial records are not model-download parameters and are not sent to a cloud inference service. The CSP restricts outbound extension connections to YNAB and those artifact hosts; no remote JavaScript is permitted.

## Maintenance and verification

Use the [development guide](development.md) with the pinned package manager, frozen lockfile, disabled install hooks and explicit `wxt prepare`. Root overrides pin patched transitive dependencies across the workspace; remove an override only after verifying that all dependency paths have a safe supported replacement. Storybook development telemetry is explicitly disabled in its local configuration. Native sharp is used for build-time icons/Node tooling, not browser inference. The Node ONNX dependency and its tar installer are not the Firefox execution path.

Run typecheck (including unused locals/parameters), extension tests/coverage, Firefox build and `scripts/verify-personal-build.py`. Relevant dependency changes also warrant the retained worker/landing checks and Storybook build. The manifest checker verifies identity, exact permissions/readers, CSP, local WASM and absence of the removed relay/feedback integrations in JavaScript. It does not prove runtime network behavior.

Before any future signing decision, complete only the new, outstanding browser checks from HANDOFF.md, review fresh unsigned/source artifacts, and verify a source rebuild. Existing signing archives and historical preview guides are not current release instructions. No publishing/deployment workflow may be enabled without the user's separate authorization.
