# CartSplit security, stability and privacy review — October 25, 2026

**Review and remediation completed for the current personal Firefox workflow.** The automated checks below pass. This is a source/dependency review with synthetic execution, not a security certification or a completed real-browser/network acceptance test. Signing, submission and publishing remain on hold.

## Scope and method

Traced the runtime from the sidebar/background/content entries through authentication, messaging, external requests, DOM parsing, transaction selection/allocation, approval consumption, response verification, cancellation, learning, IndexedDB and session state. Reviewed manifest permissions/CSP, source packaging and deployment/release triggers. Used static reference tracing and the compiler's unused-symbol checks to guide removal, then ran the applicable regression/build checks.

The extension and its shared UI were the primary scope. The full workspace dependency graph was scanned and patched. The retained upstream worker/site are outside the personal runtime and remain undeployed by this work; their checks were run because shared dependency overrides affect them. No real token, authenticated page, live YNAB API operation, browser storage seeding or financial write was used. Existing accepted transactions were not modified.

## Resolved findings and cleanup

| Area / priority | Location and cause | Result |
| --- | --- | --- |
| Dependency advisories / high | Resolved dependency paths included protobufjs, tar and native sharp advisories. The wider scan also found issues in Vite, Storybook, Vitest's mocker, happy-dom, js-yaml, source-map-js, brace-expansion and undici. | Targeted root overrides and updated development-tool minimums; pinned lockfile regenerated with install hooks disabled. Final full scan: zero known advisories. Node image/tar tooling is separate from Firefox's WASM execution path. |
| Destination identity / medium | A stored Test Plan display name could become stale if the plan was renamed in YNAB. | The reviewed writer freshly lists accessible plans and requires one exact target still named Test Plan before its target/context preflight. Missing, renamed and duplicate destinations cannot reach PUT. |
| Cache ownership / medium | Category-cache commit and connection-settings commit occur in separate databases. Cancellation/failure between them could show a new plan's categories under the old connection. | Category replacements carry a plan tag; active reads hide mismatched/untagged rows. No guessed migration or startup mutation. Fresh category IDs/names are still rechecked before saving. |
| External response validation / medium | Category JSON previously relied on a TypeScript cast, allowing malformed/duplicate choices to reach application code. | Runtime shape/flag/ID/name/count checks and a minimal projection reject malformed or ambiguous data. |
| Cancellation / medium | Awaiting an unfinished shared model download could hold the serialized review queue and delay disconnect. | Canceled callers stop waiting immediately. The public download may finish, but canceled work cannot infer, learn or restore UI results. Batches/text/tensor lengths and finite values are validated. |
| Permissions and network / defense in depth | The unused feedback path left a Web3Forms host and personal-communications permission. CSP allowed scripts but did not bound outbound connections. | Removed that host/data category; narrowed readers to two Canadian page patterns. CSP now bounds outbound hosts, blocks objects/forms/base changes, and permits only packaged scripts/WASM. Build verification checks the resulting manifest and absence of relay/feedback strings in JavaScript. |
| Retired privileged surface / defense in depth | Disabled queue/sync/backfill, old preview/dummy/fixed-save controls, and the old page-result coordinator remained in source/runtime routing. The coordinator lacked the current sender boundary and was unnecessary. | Removed their handlers/client routes/views/stories/tests, old general/test writers and coordinator listener. Only authenticated sidebar commands from one allowlist remain. Changing a mode flag cannot reactivate removed operations. |
| Historical learning / privacy | Startup adopted unscoped historical learning into the currently connected plan, although reviewed learning uses a separate namespace. | Removed startup adoption and its production helper. Historical stores/data stay intact and dormant, with existing confirmed cleanup available. Fixture writers moved to `test-support/`. |
| Error projection / privacy | Generic background catches could return arbitrary exception messages containing internal details. | Only controlled validation/API errors cross the boundary; storage/unhandled errors use fixed fallback text. Existing purchase stage diagnostics remain bounded and safe. |
| Local database / stability | A blocked open could wait indefinitely; cached handles were not reset on close/version change. | Blocked requests fail clearly, abandoned opens cannot become usable handles, closed handles reopen, and transaction writes still await atomic commit/abort. |
| Workspace state / stability | URL-derived order keys indexed a normal JavaScript object, so inherited names could be mistaken for loaded entries. | Own-property checks and a null-prototype initial map; tests cover `constructor`, `__proto__` and `toString`. |
| Supply chain and local tooling / maintenance | The model used mutable `main`; upstream worker deployment could trigger on a shared lockfile change; release submission remained available. Storybook announced default development telemetry. | Pin model revision; disable worker deployment and release jobs; disable Storybook telemetry. CI uses disabled install hooks, explicit setup, Firefox builds and manifest verification. Nothing was deployed or submitted. |

Dependency evidence came from `pnpm audit` and the corresponding advisories. Representative upstream records: [protobuf schema names](https://github.com/advisories/GHSA-f38q-mgvj-vph7), [protobuf option parser](https://github.com/advisories/GHSA-j3f2-48v5-ccww), [tar recursion](https://github.com/advisories/GHSA-r292-9mhp-454m), and [sharp/librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). The immutable model revision was checked against the [upstream model commit](https://huggingface.co/Xenova/bge-small-en-v1.5/commit/ea104dacec62c0de699686887e3f920caeb4f3e3).

Removed **127 orphan source/test/story files**: 64 implementation files, 45 test files and 18 stories. See [the path inventory](retired-code-2026-10-25.txt). Old exported APIs/types and unused dependency/debug helpers were also removed from retained modules. Retired test counts are not current feature coverage: the previous 1,164-test suite included removed upstream and verification-only features. Tests for current review/save, adjustments, quantities, split shipments, single-product entry, learning, navigation and financial uncertainty remain, with added security/stability regressions.

Shared parser/projection helpers that are directly exercised by tests remain available for isolated validation. The shared UI/site and historical worker sources are retained; absence from the personal runtime alone does not mean those separate workspace projects should be deleted. Original MIT attribution is preserved.

## Verification

| Check | Result |
| --- | --- |
| Extension TypeScript, including `--noUnusedLocals --noUnusedParameters` | Passed |
| Extension test suite with coverage | **604 tests / 47 files passed**; configured thresholds passed |
| Configured instrumented coverage | Statements 94.09%, branches 90.08%, functions 98.71%, lines 99.66% |
| Firefox build | Passed, **22.97 MB** |
| `python3 scripts/verify-personal-build.py` | Passed: identity, exact permissions/readers, CSP, local WASM and removed integrations |
| Extension Storybook build | Passed; final build uses explicit telemetry opt-out |
| Retained worker | Typecheck and **12 tests** passed; no deployment |
| Retained landing site | Typecheck and build passed; no deployment |
| Full workspace `pnpm audit --json` | **0 critical / 0 high / 0 moderate / 0 low / 0 informational**, 623 resolved packages reported |
| Whitespace/diff validation | Passed |

Coverage percentages apply to the configured instrumented domain files, not every source line, UI behavior, browser API, storage engine or network response. The transformer dependency still emits a nonfatal `import.meta`/IIFE build warning. Build success does not verify the real Firefox model path.

## Remaining limits and next bounded action

- **New browser acceptance remains pending:** tightened CSP, immutable model-file cache keys and packaged WASM need confirmation during the next natural isolated-profile review. Old completed browser/financial checks must not be repeated. Pinning the revision may require another public model download.
- **Local-only inference is not complete privacy:** downloads expose ordinary network metadata; profile IndexedDB is not encrypted; product/category IDs and embeddings are personal data. Historical rows may still contain titles until deliberately removed. Developer-tool/network traffic was not captured for this review.
- **Financial concurrency remains limited:** YNAB provides no application lock here; another editor can change a transaction between read and PUT. A timeout or lost response cannot prove rollback. Unconfirmed results require manual inspection; restart is not permission to retry.
- **Resource and model quality evidence is still limited:** mocked inference validates control flow, not actual suggestion accuracy, RAM, latency or download reliability. Running WASM inference is not forcibly interrupted. Partial/unconfirmed receipts are deliberately retained in memory rather than silently evicted.
- **A clean advisory scan is dated evidence:** it does not verify every transitive bundled/native artifact, future advisory, malicious package or browser compromise. Maintain the lockfile/overrides and recheck before any eventual signing decision. This review did not regenerate or approve release archives.

This is the dated audit snapshot, not a request to repeat completed browser or
financial checks. Later recorded verification is summarized in the
[development guide](development.md).

See [architecture and maintenance](architecture.md) for the precise trust
boundaries, storage lifetimes, cancellation and approval rules.
