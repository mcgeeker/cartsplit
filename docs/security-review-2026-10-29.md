# Repository review — October 29, 2026

**Reviewed development source for milestones 6 and 7; owner acceptance remains
pending. This is a dated code review, not a security certification.** Signed
1.4.3 and its installed profile have not been changed. The 2.0.0 version gate
remains closed until controlled Firefox acceptance passes.

## Review coverage

| Area | Review and result |
| --- | --- |
| Extension entrypoints and messages | Inspected sidebar and content-script listeners, sender validation, command allowlists, cancellation and connection changes. Register lookup has a separate read-only receiver; financial commands remain sidebar-only. No startup API writes or bulk operations were added. |
| YNAB access and financial correctness | Inspected fixed-origin transport, allowed methods/paths, token storage/use, CAD plan/account checks, exact matching, original-date revalidation, allocation arithmetic, immutable grants, write consumption and response verification. Parent and line memos are bound to approval; repeated split lines are verified as a multiset. |
| Retailer and register parsing | Inspected page-origin/identity checks, product/quantity/summary/funding parsing, chronological search coverage, pagination controls and untrusted reply projection. Register DOM uses public row attributes, not page-world application models. Unsupported layouts stop safely and still require real-page acceptance. |
| Local data and model | Inspected IndexedDB scoping/transactions, cleanup authorization, suggestion/learning behavior, pinned model files, public downloads and packaged WASM/CSP. Memos and lookup state are session-only locally; approved memo text is sent directly to YNAB. No storage schema or automatic learning migration was introduced. |
| Shared UI and retained applications | Reviewed forms, navigation, feedback transport, retained worker OAuth flow/configuration and landing build. Worker/landing code remains outside the extension runtime and personal release packages. Neither application was deployed or invoked against live accounts. |
| Dependencies, CI and release tools | Checked pinned package-manager/lockfile use, install hooks, CI scripts, disabled deployment/release jobs, source selection, archive paths/symlinks and independent build comparison. npm advisory checks found zero reported vulnerabilities in 90 production dependencies and 623 total dependencies on this date. |

The register adapter's `.ynab-grid-body-row` / `data-row-id` convention was
cross-checked against the public
[Toolkit for YNAB register integration](https://github.com/toolkit-for-ynab/toolkit-for-ynab/blob/main/src/extension/features/accounts/reconciled-text-color/index.js).
This is supporting source evidence, not verification of the owner's current DOM.

## Findings addressed

1. **Repeated categories and identical lines:** replaced category-keyed merging
   with review-row output. Response verification compares category, amount and
   memo collections with duplicate counts, independent of response order.
2. **Stale memo approval:** preserve the original parent memo baseline, reject
   external changes, and include edited memos in the consumed immutable grant.
   UI edits revoke prepared approval. Overlong text blocks preparation.
3. **Lookup-to-review continuity:** full-window searching can leave Payments on
   an older page. Restore and freshly verify the chosen order's page before
   opening it; review prefers that dedicated tab when other Payments tabs exist.
4. **Pagination/cancellation:** fixed nested pagination controls, normalized page
   fingerprints, required readable card funding, and rechecked cancellation after
   awaited page reads. Sign-in resume restarts coverage rather than mixing sessions.
5. **Preserved duplicate source files:** exclude stray numbered copies from WXT
   scanning and coverage without deleting them or lowering coverage thresholds.
   Rehearsal packaging accepts only explicit reviewed new files, rejects unsafe
   paths/symlinks, and keeps normal release candidates restricted to tracked files.

## Verification and remaining gates

The synthetic extension suite covers old workflows plus register/API lookup,
pagination, dates, ambiguous orders, sign-in, cancellation, segment limits, memos,
repeated categories/lines, immutable previews and UI approval revocation.
Recorded command results and independent-rebuild evidence belong in PLAN.md,
HANDOFF.md and the development rehearsal's REPORT.json/logs.

No release-blocking defect remains identified by this static/synthetic review.
Release acceptance is still pending for actual YNAB/Amazon layouts, signed update
permission presentation, owner-approved memo saves and installation persistence.
The Firefox build retains the existing Transformers import.meta/IIFE warning;
local model accuracy, memory use and first-use latency are unbenchmarked.

The retained landing page still uses upstream branding/store links and Web3Forms
routing; the retained worker still describes the upstream OAuth service. They
must receive a separate identity/security review before any fork deployment.
Their deployment jobs remain disabled. The extension manifest guard rejects the
retired auth/feedback destinations in its built JavaScript.

Fresh YNAB reads cannot eliminate edits made concurrently by another client;
there is no server-side lock or durable exactly-once guarantee. Unconfirmed saves
still require manual inspection and must not be automatically retried.

## Targeted lookup follow-up — October 30, 2026

Development 1.9.4 moves lookup controls into the sidebar without expanding the
financial message interface. Reviewed exact sender checks, same-window tab reuse,
full navigation readiness, cancellation, segment deadlines, returned-order focus
and accessible pagination labels. Link and submit destinations are checked against
the canonical Amazon.ca Payments path, including document-base URL effects.
Closed error explanations expose no raw exceptions. No extra permissions or
financial-write commands were introduced.

The 809-test suite, typecheck, Firefox build and manifest guard pass. Read-only
Firefox checks found an order after three Payments pages, selected its order tab
and reused the same Payments/order tabs on repetition. This targeted follow-up
does not replace the remaining owner acceptance or signing/release gates above.

## Targeted review-interface follow-up — October 30, 2026

Development 1.9.5 exposes collapsed line memo drafts before price confirmation
and puts instructional text behind hover/focus/click information controls.
Required confirmations, validation errors and complete approval previews remain
visible. Price confirmation and all financial-save gates remain required.

The separate read-only lookup interface accepts a presentation-only dismissal
after review starts, guarded by the existing exact extension-page sender checks.
Only completed, opened results can be hidden; active search controls stay visible.
The result's payment evidence is retained, and each new lookup resets dismissal.
Verified 815 tests / 56 files, typecheck, Firefox build and manifest guard. This
follow-up does not replace full owner acceptance or release preparation.
