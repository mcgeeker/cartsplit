# CartSplit development guide

This guide covers building and loading the current Firefox development copy.
For the purpose and design choices, start with the [README](../README.md).
For implementation boundaries and remaining limits, read the
[architecture](architecture.md) and [security review](security-review-2026-10-25.md).

## Toolchain

The recorded October 25, 2026 environment is macOS / Apple Silicon with
Node.js 24.19.0, Corepack 0.35.0, pnpm 10.33.3 and Python 3.9.6. These are verified
versions, not a claim that every other version or platform is incompatible.
Use the package manager pinned in package.json and the frozen lockfile.

## Install, check and build

From the repository root:

```sh
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm --filter extension exec wxt prepare
corepack pnpm --filter extension compile
corepack pnpm --filter extension test:run
corepack pnpm --filter extension build:firefox
python3 scripts/verify-personal-build.py
```

Install hooks remain disabled. WXT setup runs explicitly after installation.
The final checker inspects the built Firefox identity, permissions, CSP, reader
registration, bundled WASM and retired integration boundaries. For strict unused
symbol checks, run:

```sh
corepack pnpm --filter extension exec tsc --noEmit --noUnusedLocals --noUnusedParameters
```

## Load a development copy

Use an isolated Firefox profile. Open `about:debugging#/runtime/this-firefox`,
choose **Load Temporary Add-on**, and select:

```text
apps/extension/.output/firefox-mv2/manifest.json
```

Enter any needed token only in the extension's connection screen. Select the desired
CAD plan through **Connection settings → Change YNAB Plan**. The matcher accepts one
Amazon outflow with the exact amount and a date within 2 calendar days before or
after Amazon's payment date, in an open, on-budget Cash, Checking, Savings or Credit
Card account, including linked accounts and imported/matched purchases.
It still requires an uncategorized, unsplit, nonreconciled transaction without transfers.
Verify the actual plan/account and YNAB date in the prepared proposal before approving
each save. The Amazon date is also shown when different; the YNAB date is preserved.
Use synthetic data for automated checks; live-plan acceptance is performed locally
by the owner. Do not repeat accepted financial writes or seed live storage to test learning.

The add-on ID is `cartsplit@mcgeeker`, and its connection database is
`cartsplit-connection`. This is a separate identity from earlier installations;
credentials and learning are not automatically migrated. Temporary loading does
not establish durable installation. Signing and submission require separate
authorization; see [installation and maintenance](personal-installation.md).

## Project layout and verification

`apps/extension` contains the extension; `packages/ui` contains shared components
and styles. The retained upstream worker and landing site are not required for
the extension runtime. Release and worker-deployment jobs remain disabled.

The October 27 selected-plan development build passed strict typecheck,
683 tests across 48 files and the Firefox build, including inclusive ±2-day bank
posting-date matching and preservation of the original YNAB date. The earlier October 25
extracted-source build reproduced all 17 runtime files in the recorded toolchain;
that package evidence predates the selected-plan changes. The owner reported that
the actual-plan workflow and posting-date fix work well in Firefox. Fresh installation
packages and durable signed installation remain separate work.
The known nonfatal transformers import.meta/IIFE warning remains. These results
do not prove cross-platform reproducibility or numerical model accuracy.

Use synthetic fixtures and mocked APIs for automated tests. Never put real tokens,
purchase records or profile data in source, logs, screenshots or issues. Read the
[architecture](architecture.md) and [security review](security-review-2026-10-25.md)
for data boundaries and remaining limits. Historical preview/test-control guides
are records of earlier stages, not instructions to restore retired operations.
