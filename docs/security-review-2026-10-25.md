# Security and privacy review — October 25, 2026

**Dated review of the CartSplit fork.** The source and synthetic checks recorded
here passed on that date. This is not a security certification or evidence that
every later build has been reviewed.

For today's behavior, read [Technical design and privacy](architecture.md).
For later recorded checks, read the [developer guide](development.md).

## What was reviewed?

The review traced authentication, sidebar messaging, page parsing, YNAB selection
and writes, approvals, cancellation, learning, local storage, dependencies, build
permissions and release/deployment triggers. The retained worker and landing-site
checks were also run because workspace dependency overrides affected them.

No real token, private page, authenticated YNAB operation or financial write was
used for the review. Original licence attribution and existing user records were
preserved.

## Main findings and fixes

| Area | Recorded result |
| --- | --- |
| Dependencies | Updated affected tools and pinned dependency overrides. The final October 25 advisory scan reported zero known advisories. |
| Destination and responses | Fresh destination checks, runtime validation of category responses, and verification of saved transaction fields. |
| Sidebar and network access | Restricted privileged commands to the sidebar, narrowed reader permissions and outbound policy, removed relay/feedback runtime paths and pinned the model revision. |
| Storage and cancellation | Tagged category caches by plan; removed startup adoption of old history; hardened database failures, order keys, cancellation and safe error messages. |
| Retired features and releases | Removed 127 obsolete source/test/story files; disabled release and worker-deployment jobs and extension Storybook telemetry. |

The [removed-file inventory](retired-code-2026-10-25.txt) preserves the path list.
The [full original report](https://github.com/mcgeeker/cartsplit/blob/0486e1962e54309a81fd77310d1d40c23b04fc4c/docs/security-review-2026-10-25.md)
retains individual findings, advisory links and detailed coverage figures.

## Recorded verification

| Check | October 25 result |
| --- | --- |
| Extension typecheck, unused-symbol checks and tests | Passed; **604 tests / 47 files**, configured coverage thresholds passed |
| Firefox build and manifest inspection | Passed; **22.97 MB** output |
| Extension Storybook | Passed |
| Retained worker and landing site | Worker typecheck / **12 tests**; landing typecheck/build passed |
| Dependency audit and whitespace | Zero known advisories in the reported 623-package graph; whitespace passed |

Coverage applies to the configured instrumented files, not every browser, UI or
network behavior. The nonfatal Transformers.js `import.meta`/IIFE warning remained.

## What changed after this review?

On October 27, the owner authorized their selected CAD plan instead of the earlier
Test Plan-only destination. Open on-budget bank/card accounts and imported/matched
purchases became eligible. Matching gained an inclusive **±2-day** bank posting-date
window while preserving the YNAB date and refusing multiple candidates.

The owner reported that workflow worked in Firefox. Later automated results are
recorded separately; this summary does not extend the October 25 audit to them.
Source publication has since occurred. Signed installation and store submission
remain separate, unfinished work.

## Remaining limits

- Local profile data and vectors are personal data, not anonymized or encrypted.
- Model downloads disclose ordinary network metadata; this review did not capture
  all real-browser traffic or benchmark model quality, latency or memory.
- A concurrent YNAB edit can race a write. A lost response does not prove failure;
  unconfirmed saves require manual inspection and no retry.
- The clean dependency scan was dated evidence. It does not cover future
  advisories, every transitive artifact or a compromised browser.
- Existing packages need fresh verification before an authorized signing decision.

These are evidence limits, not instructions to repeat already accepted financial tests.
