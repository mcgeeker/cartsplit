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

Enter any needed token only in the extension's connection screen. Current writes
are restricted to **Test Plan → Lineitem Test**, an open, unlinked, on-budget Cash
account containing an eligible manual Amazon outflow that is uncategorized,
unsplit and not reconciled. Do not relax this guard for development convenience.
Do not repeat accepted financial writes or seed live storage to test learning.

The add-on ID is `cartsplit@mcgeeker`, and its connection database is
`cartsplit-connection`. This is a separate identity from earlier installations;
credentials and learning are not automatically migrated. Temporary loading does
not establish durable installation. Signing and submission require separate
authorization; see [installation and maintenance](personal-installation.md).

## Project layout and verification

`apps/extension` contains the extension; `packages/ui` contains shared components
and styles. The retained upstream worker and landing site are not required for
the extension runtime. Release and worker-deployment jobs remain disabled.

The latest recorded runtime verification on October 25 passed strict typecheck,
634 tests across 48 files, the Firefox build and manifest guard. A fresh
extracted-source build reproduced all 17 runtime files in the recorded toolchain.
The known nonfatal transformers import.meta/IIFE warning remains. These results
do not prove cross-platform reproducibility or numerical model accuracy.

Use synthetic fixtures and mocked APIs for automated tests. Never put real tokens,
purchase records or profile data in source, logs, screenshots or issues. Read the
[architecture](architecture.md) and [security review](security-review-2026-10-25.md)
for data boundaries and remaining limits. Historical preview/test-control guides
are records of earlier stages, not instructions to restore retired operations.
