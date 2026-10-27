# Amazon.ca review and approved changes

This workflow currently operates in the separate **Test Plan → Lineitem Test**
account. It does not run automatic sync, bulk approval or backfill.

For an order containing **one product row**, CartSplit uses a simpler entry: choose
or check that product's category and click **Prepare changes**. The full card amount,
after all discounts, gift funding, fees, shipping and tax, goes to that category.
Multiple units of the same product are included. Adjustment distribution, extra fee
categories, quantity confirmation and allocation-policy controls are unnecessary and
hidden; **Charge breakdown** remains available. Exact quantity/price/subtotal and
funding checks still run. The prepared proposal still requires separate final approval
before Save. For several matched card charges belonging to that one product, select
one **Payment to prepare** at a time; each stays separate and needs its own approval.

The detailed allocation steps below apply to orders with several product rows.

1. Select the Canadian Order details tab and keep one Canadian Transactions tab
   open in the same window. If none is open, **Open Amazon Transactions** opens
   it in an active tab; select Order details again before reviewing. Click **Review selected order**. Item count, order adjustments and payment data
   are discovered from the pages. CartSplit first matches the linked Amazon payment
   date and exact card amount against YNAB in **Test Plan → Lineitem Test**. Only
   one complete, uncategorized, unsplit manual Amazon outflow is eligible. Missing,
   duplicate, already categorized/split or unreadable targets stop Review with a
   specific message before allocation/category suggestions. There is no 90-day
   age cutoff; date validity and the existing future-date check remain. This action
   makes read-only YNAB requests and does not change YNAB.
   Gift-card funding is reconciled separately from card charges. If one unique
   order-linked payment equals the complete card remainder, CartSplit can also
   accept older unlabeled rows when ALL remaining linked funding exactly equals
   the order's declared gift contribution, has matching currency markings and
   contains no explicitly identified extra card charge. The card still requires
   its own unique eligible YNAB match. Ambiguous full-amount candidates, unexplained
   extras and unknown partial-shipment combinations remain blocked.
   Explicit gift-method labels continue to support separate funding reconciliation.
   After an update that changes page reading, refresh both Amazon tabs after
   reloading CartSplit before Review; this grouping fix also accepts the old format.
   For a split shipment, CartSplit groups purchase charges explicitly linked to
   the same order number on the current Transactions page. Their sum must equal
   the order’s card total, and each date/amount must identify a different complete
   manual Amazon transaction. Saved categorized/split charges are displayed as
   preserved; only uncategorized, unsplit charges can be selected for changes.
   Incomplete pages, indistinguishable duplicate rows, more than 20 charges and
   missing/incomplete/otherwise ineligible targets stop Review before suggestions.
2. Check displayed quantities and item totals. CartSplit distinguishes unit prices
   from full-line prices only when one interpretation exactly matches Amazon’s
   item subtotal; it shows quantity × price when multiplication is required.
   Ambiguous or inconsistent interpretations remain blocked. Confirm the shown
   full item total for quantities greater than one or missing quantities. Review the product-category
   suggestions and change them if needed. Choose a category for each unsuggested item
   and review **Adjustments**. For each detected fee, net shipping charge, coupon or
   gift contribution, choose **All items** or **Selected items**. Selected items
   shows a checkbox for each whole product row; each checked row includes all its
   units. These destination modes are exclusive. Positive fee/shipping charges
   also offer **Separate category**, which adds their payment/category row below.
   Choose **Equally** or **By item value** for distributed adjustments. Fees and
   net shipping default to equal distribution; coupons and gift funding default
   to item value. Review the updated item estimates and exact card total, then
   check the allocation-policy box.
   Coupons reduce product cost before tax. Positive charges are allocated using
   discounted product values (or equally); estimated tax follows adjusted pre-tax
   values. Gift funding reduces gross card-funded shares after tax and does not
   reduce purchase price. All/selected targets are product rows; separate charge
   rows retain their own category and do not receive coupon/gift reductions.
   Free Shipping credit offsets shipping first; controls allocate only the net
   shipping amount, never that credit a second time. Discounts use the existing
   detected coupon-savings field; this does not infer additional undisclosed offers.
   Empty selections, invalid policies, excessive per-item reductions and funding
   mismatches stop with a specific message. A zero-value proportional target needs
   an explicit different choice. No reduction is silently capped or reassigned.
   Integer-cent rounding uses largest remainders, with displayed order breaking ties.
3. Click **Prepare changes**. Fresh page, category and transaction checks must
   find one uncategorized, unsplit manual Amazon purchase with the detected
   payment date and amount in Lineitem Test. Already-saved splits are rejected
   and preserved. Review the before/after category amounts and date.
4. Only if the proposal is correct, check the separate final approval and click
   **Save approved changes once** within five minutes. Inspect the transaction
   in YNAB after the verified-response success message.

For **split shipments**, the same product suggestions and quantity confirmations
are available. Choose a **Payment** and category for each whole product row and
separate-category additional charge. Distributed adjustments use the selected product
rows and need no separate payment/category. A row includes all its units; dividing a single row's units
between payments is not supported. Each payment needs at least one assigned row.
Each actual payment total stays fixed. The same staged adjustment calculator
produces order-level card-funded values; those values become weights within each
payment's assigned rows. This applies the user's choices within payment boundaries,
without moving money between payments or claiming actual shipment-specific tax,
gift or coupon ownership. An individual payment's fixed amount takes precedence
when its assigned estimates differ. Product adjustment shares shown are order-level
estimates, not a charge-specific accounting of each adjustment. A payment assigned
only zero-funded rows is blocked. The order subtotal, funding and charge-total checks
still pass independently; a mismatched order total is never rescaled into agreement.

Choose **Payment to prepare**, accept the allocation policy, then **Prepare selected
payment**. The proposal shows only that payment's date, amount and category lines.
Final approval saves that single transaction once. Review it in YNAB before choosing
the next payment; no other transaction is written automatically. Assignments,
categories, adjustment policies and quantity confirmations become fixed within the current review after
its first verified save. Each remaining payment needs its own policy/final approval.
On a fresh Review, saved payments remain visible but cannot be selected for saving.
No allocation proof is persisted between reviews; confirm the assignments again.

Only products belonging to the verified saved payment teach the local category
history. Conflicting chosen categories for the same product across payments are
conservatively forgotten rather than storing an unconfirmed payment's choice.
A local learning failure still reports financial success, marks the payment saved
and retains its no-retry protection. An unconfirmed financial write invalidates the
current review and remains locked in the sidebar: inspect YNAB and do not retry.

The sidebar follows the selected order. Opening another order, including in the
same tab, shows that order's starting screen; other pages show a select-order prompt.
Navigation does not automatically review, prepare or save anything. Unfinished choices
stay with their original order while the sidebar remains open, within the existing
review expiry. Switching away or moving to a duplicate tab clears prepared approval
and final consent. Return to the original bound tab/URL and prepare again before saving.
Partial split orders retain saved progress and their locked assignments/categories.

A verified completed save shows a compact **Saved to YNAB** receipt with date, amount
and categories. Returning to that order restores its read-only receipt, including
after closing/reopening the sidebar. These are receipts for this session's saves,
not a fresh read of YNAB. Up to 100 completed order receipts are held in background
memory; partial/unconfirmed results are retained. Firefox or extension background
restart clears them. Earlier saves are not reconstructed or repeated to create receipts.
No receipt data is persisted or used for category learning.

A save in progress remains tied to its order when switching pages; it is never
retried automatically. An unconfirmed result keeps its inspect-YNAB/no-retry warning
on that order across navigation and sidebar reopening. Another order can show its own
starting screen. Closing the sidebar still cancels unfinished drafts; on reopening,
saved/partial progress remains visible but new work needs a fresh explicit Review.

Newly returned reviews, prepared proposals and action feedback scroll into view.
Expanded information sections also reveal their beginning. Scrolling respects reduced
motion and keeps keyboard focus unchanged; editing choices does not repeatedly scroll.

Preparing is read-only. Saving changes only the selected transaction's category
or split and retains its existing approval status. The parent amount, account,
date, payee, memo, cleared status and flag are preserved. Split memos are empty;
product titles are not uploaded by this save. Lines sharing a category are
grouped. A single resulting category uses a direct category update.

Category suggestions use three stages in order:

1. Your previously confirmed category for the exact product in this YNAB Plan.
2. A sufficiently strong, unambiguous similarity match to products confirmed by
   verified CartSplit saves in this Plan.
3. The existing local embedding model compares the product title with current
   category and group names. This is a semantic similarity guess, not generative
   reasoning. Weak or closely competing results leave the category blank.

Each suggestion is labeled by its origin and can be changed. Current visible
categories are checked before suggesting; preparation/save still freshly validate
selected category IDs and names. Similarity scores are heuristics, not calibrated
probabilities. Ambiguous names such as personal catch-all categories may need your
manual choice. No suggestion alone trains the history.

The existing bge-small-en-v1.5 quantized model downloads on first use if not cached.
It runs locally in Firefox; there is no cloud AI account or per-request inference
bill. Product/category text is not sent to an inference service. Model-file requests
still contact the existing Hugging Face download hosts. Initial download/loading can
make Review take longer; Cancel review remains available. Inference already running
may finish internally after cancellation, but its result cannot restore a canceled
review or commit learning.

After a verified save, exact product/category IDs and model-tagged product vectors
are remembered locally for the connected YNAB Plan. Raw product titles and
order/transaction identifiers are not stored by this feature. The vector pool is
limited to 50 products per category and 500 per Plan; exact product choices survive
vector eviction. Category-name vectors last only for the current Review. Legacy/model
learning remains separate and is not imported or backfilled. Older exact-only records
continue to work without vectors and gain vectors only on a future normal verified
save; accepted transactions must not be saved again to populate history.

Corrections atomically replace choices and vectors. Conflicting choices for the same
product within one order remove both. If the model is unavailable during learning,
exact choices can still be committed and old vectors for corrected products are
removed. Cancellation rolls back pending local writes; canceled or unconfirmed
financial saves never train the cache. A local storage failure cannot turn a verified
financial success into an uncertain result or permit another financial write. Clear
learning using the existing Local data removal controls after disconnecting; removal
covers all plans in this profile. No deletion is needed for acceptance testing.

**Cancel review** is available during the initial page read, after discovery,
during preparation and while saving. Canceling a read/preparation clears the
review, choices and consent without disconnecting YNAB. Late review/proposal
replies are discarded and their grants revoked. Closing the sidebar during the
initial read also cancels work before a review ID exists. Canceling a save keeps
the screen locked with an unconfirmed-result instruction; it cannot undo a
request already sent. A late response cannot restore approval or offer a retry.

Changing categories, adjustment destinations/methods/item selections or line-total confirmations, Cancel review, sidebar closure,
Disconnect or a connection/budget change revokes approval. Review bindings
expire after ten minutes; final proposals expire after five. A canceled or
stale proposal cannot be reused. The actual send checks credentials, expiry
and cancellation again after the last asynchronous reads.

An error after send is **unconfirmed**: inspect YNAB and **do not retry or reload
to retry**. The background blocks another attempt at that target for its current
session. This is not durable exactly-once delivery; a background restart loses
memory state. Separate preflight and write requests cannot prevent every
concurrent remote edit. Do not edit the order, categories or transaction during
the operation. Disconnect cannot undo a remotely accepted request.
