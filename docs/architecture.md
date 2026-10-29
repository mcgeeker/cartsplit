# Technical design and privacy

CartSplit runs the selected-order Amazon.ca workflow in Firefox. It connects
directly to YNAB using a locally entered Personal Access Token. The
upstream OAuth worker and marketing site are not part of this runtime.

Choosing one plan in CartSplit does not restrict what the token itself can access
in YNAB; the selected-plan checks are enforced by CartSplit.

For operating instructions, use [Purchase review](purchase-review.md). For commands,
use the [developer guide](development.md).

## What connects to the network?

| Destination | Purpose and data |
| --- | --- |
| YNAB API | Authenticate, read plans/accounts/categories/transactions, and save category changes the user approves. The bearer token is sent only here. |
| Hugging Face and allowed CDNs | Download pinned public model files. Requests expose ordinary network metadata, including IP address; they do not contain product titles, category text or the YNAB token. |
| Amazon.ca in Firefox tabs | The user browses signed-in order/payment pages. CartSplit reads the selected pages when requested. |

Matching, category suggestions and learning run locally. The extension runtime has
no analytics, feedback submission or cloud inference service. Approved writes send
category/split data to YNAB; they do not upload product-title memos.

The manifest permits Amazon.ca, YNAB and the model download hosts. Packaged scripts
and WebAssembly run locally; the content security policy restricts outbound
extension connections. Ordinary browser traffic outside CartSplit is separate.

## How a purchase becomes a save

1. **Read:** an explicit sidebar action asks the page reader for the selected
   order and the open payments page. The background validates and reconciles the
   replies before suggesting categories.
2. **Match:** each linked card payment must identify one eligible Amazon/AMZN
   outflow in the selected CAD plan. Its amount must match exactly and its date
   must fall within **±2 calendar days** of Amazon's original payment date.
3. **Prepare:** fresh page, category and transaction checks produce a proposal
   bound to the plan, account, tabs, target and allocation choices.
4. **Approve and send:** separate final approval permits one write to the chosen
   transaction. The grant is consumed before the write; the response must verify
   the exact category amounts and preserved parent details.
5. **Record:** verified success creates a session receipt and may teach local
   category history. A learning failure cannot turn a verified save into an
   uncertain financial result or permit saving it again.

Supported accounts are open, on-budget Cash, Checking, Savings and Credit Card
accounts, including linked accounts and imported/matched purchases. A writable
target must be uncategorized, unsplit, not reconciled and not a transfer. Multiple
matches stop the operation, including when one candidate has the exact Amazon date.

Every check stays anchored to the original Amazon payment date. Saving preserves
the actual YNAB date, account, amount, approval, memo, payee, cleared status, flag
and import/match identifiers. Lines sharing a category are combined; one resulting
category uses a direct category update.

Single-product orders assign the full card payment to its category. Multiple
payments keep their individual totals and approvals. Within-payment allocations
are estimates; assignments and allocation choices freeze after the first verified
payment save in that review.

Summary reconciliation recognizes strict negative amounts between the item subtotal
and before-tax total as discounts, independently of their labels. Distinct discount
rows are combined and allocated before estimated tax. Free Shipping credits offset
shipping first; gift-card funding reduces the card total after tax. Duplicate
discount evidence, unknown after-tax reductions and inconsistent totals stop review.

## Where privileged checks live

| Boundary | Implementation |
| --- | --- |
| Sidebar → background | `background/ui-messages.ts` requires the exact extension ID and sidebar URL, no tab sender, and an allowed command. |
| Background → page | `background/page-request.ts` bounds explicit requests by cancellation and a ten-second deadline. |
| Page reply → review | `background/order-review.ts` validates URLs, replies, amounts and funding; sidebar-supplied amounts are not trusted. |
| Background → YNAB | `lib/ynab.ts` uses a fixed HTTPS origin, rejects redirects, omits cookies and checks permitted paths/methods. |
| Background → local learning | `background/purchase-learning.ts` learns only after a verified save and keeps records scoped to the plan. |

Paths are relative to `apps/extension/`. The Canadian content reader registers a
passive listener at document start; loading a page does not automatically scrape,
sync, initialize the model or save. Content scripts cannot read the connection
database or invoke privileged sidebar commands.

## What is stored?

**On disk in this Firefox profile:**

| Data | Location and lifetime |
| --- | --- |
| Token and chosen plan | Extension-origin `cartsplit-connection` IndexedDB. Disconnect removes the connection; revocation is a separate YNAB action. |
| Exact product/category choices | `lineitem` database, `learnedProducts` store. Kept until corrected, removed on conflict or explicitly cleared. |
| Product vectors | `productEmbeddings` store. Reviewed records have empty title fields; up to 50 vectors per category and 500 per plan. Exact choices survive vector eviction. |
| Category cache and older records | Existing `lineitem` stores. Category caches carry a plan tag, returned sequence positions and available group IDs. Older data remains dormant; there is no automatic migration or backfill. |
| Public model files | Browser-managed model cache. Application-data cleanup does not remove these files. |

**In memory:** review drafts, prepared approvals, category-name vectors, session
receipts and uncertain-save warnings. Reviews expire for authorization after ten
minutes; final proposals after five. Expiry does not guarantee physical erasure
at that moment. Up to 100 completed order receipts are retained; partial and
unconfirmed results are kept for the background session. Restart clears them.

Local profile storage is not an encrypted vault. Product IDs, categories and vectors
remain personal data even without raw titles. Confirmed [cleanup](local-data-removal.md)
removes all four application stores across plans, but not YNAB records or model files.

## How suggestions work

Suggestions try the exact reviewed product first, similar reviewed products second,
and comparison with current category/group names third. Weak or competing matches
stay manual. No suggestion alone teaches history.

The model is `Xenova/bge-small-en-v1.5`, q8, pinned to revision
`ea104dacec62c0de699686887e3f920caeb4f3e3`. It produces 384-dimensional vectors
using local WebAssembly. Similar-product scoring requires 0.75; category-name
scoring requires 0.45; both require a 0.08 winning margin. These are heuristics,
not probabilities or measured accuracy.

Category-name vectors are reused in a single memory cache for up to 512 categories.
Its key includes the plan, model and current category inputs. Larger plans still
receive suggestions but bypass this cache. Connection changes and restart clear it.
Product text is not added to that cache.

Canceled or unconfirmed financial saves do not teach history. Conflicts remove
ambiguous choices. Model failure can still allow exact-choice learning; local storage
failure does not justify another financial save.

## Cancellation and remaining limits

Navigation clears prepared approval and preserves order-specific drafts while the
sidebar remains open. Sidebar closure cancels unfinished drafts. Connection changes
invalidate reviews and clear the category-vector cache. Cancellation stops waiting
for model loading, but already-running WebAssembly inference may finish internally.

**A sent write cannot be undone by cancellation or disconnect.** Fresh reads cannot
eliminate concurrent edits in YNAB. There is no remote transaction lock, automatic
rollback or durable exactly-once guarantee. An unconfirmed result requires manual
YNAB inspection; restarting does not make a retry safe.

The [October 25 security review](security-review-2026-10-25.md) is dated evidence.
It is not a certification of later builds. Model accuracy, memory use and first-use
latency have not been benchmarked. New packages need fresh build and source-rebuild
verification before any authorized signing.

## Category display order

Version 1.4.3 preserves the YNAB API response sequence through local cache reads.
Product and separate-adjustment pickers use non-selectable category group headers;
Connection settings shows the same groups. Group IDs distinguish groups sharing a
name. Category IDs, emoji and editable suggestions are preserved. Existing caches
need one **Refresh budget categories** after updating to acquire positions.
The API does not document a custom-position field or guarantee agreement with
manually arranged plan order; CartSplit preserves the order it receives.
