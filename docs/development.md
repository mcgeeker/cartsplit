# Build and develop CartSplit

Build the Firefox extension from the repository root. For everyday use, read
[Purchase review](purchase-review.md); for data and security boundaries, read
[Technical design and privacy](architecture.md).

## Build and load a development copy

1. **Install the pinned dependencies.** Use the package manager recorded in
   `package.json`. Installation hooks stay disabled; run WXT setup explicitly.

   ```sh
   corepack pnpm install --frozen-lockfile --ignore-scripts
   corepack pnpm --filter extension exec wxt prepare
   ```

2. **Check the source.** These tests use synthetic data and mocked APIs.

   ```sh
   corepack pnpm --filter extension compile
   corepack pnpm --filter extension test:run
   ```

3. **Build and inspect the Firefox output.**

   ```sh
   corepack pnpm --filter extension build:firefox
   python3 scripts/verify-personal-build.py
   ```

   The inspector checks the built identity, permissions, page readers, network
   policy and packaged WebAssembly runtime. It does not test a live connection.

4. **Create or choose a separate Firefox profile.** Follow the
   [profile setup steps](personal-installation.md#create-or-choose-a-profile), then open
   `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on** and
   select `apps/extension/.output/firefox-mv2/manifest.json`.

5. **Review the visible workflow locally.** Enter credentials only in CartSplit's
   connection screen. Select a CAD plan and use the [purchase guide](purchase-review.md).
   Use a new, eligible uncategorized purchase for a manual check, and inspect each
   successful save in YNAB.

A temporary add-on is removed when Firefox restarts. For the available signed release and permanent installation
instructions, see [Installation and maintenance](personal-installation.md).

## Toolchain

| Item | Recorded configuration |
| --- | --- |
| Package manager | pnpm **10.33.3**, pinned in `package.json` |
| Local verification environment | macOS / Apple Silicon; Node **24.19.0**, Corepack **0.35.0**, Python **3.9.6** |
| CI Node version | **22**, as configured in `.github/workflows/ci.yml` |
| Dependency resolution | `pnpm-lock.yaml` with `--frozen-lockfile` |

The local versions describe the verified environment, not a compatibility guarantee
for every platform. Do not replace pinned dependencies as part of an ordinary build.

## Where to make changes

| Area | Path |
| --- | --- |
| Sidebar and user controls | `apps/extension/components/` and `apps/extension/entrypoints/sidepanel/` |
| Review, approval, connection and learning | `apps/extension/background/` |
| YNAB access, storage and shared calculations | `apps/extension/lib/` |
| Amazon.ca page readers | `apps/extension/retailers/amazon/` and `apps/extension/entrypoints/amazon-ca.content.ts` |
| Shared UI and manifest/build settings | `packages/ui/` and `apps/extension/wxt.config.ts` |

All paths above are relative to the repository root. The retained worker and
marketing site are separate workspace packages.

## Additional checks

For unused symbols and coverage, run:

```sh
corepack pnpm --filter extension exec tsc --noEmit --noUnusedLocals --noUnusedParameters
corepack pnpm --filter extension test:coverage
```

Changes to shared dependencies also warrant the retained worker and landing-site
checks. Inspect their package scripts before running them.

**CI currently runs on pull requests and pushes to `main`.** Changing GitHub's
default branch to `personal-token-auth` did not change that filter. Direct pushes
to the current default branch do not trigger this workflow. Its path filters also
skip extension jobs for documentation-only changes. Local checks remain necessary.

The release and worker-deployment jobs are explicitly disabled. Building locally
does not authorize signing, submission or deployment.

## Verification on record

The October 27 source checkpoint passed typecheck, **683 tests across 48 files**,
the Firefox build and manifest inspection. The owner accepted the selected-plan
workflow and ±2-day posting-date matching in Firefox. This documentation review
does not rerun those checks.

The existing Transformers.js `import.meta`/IIFE warning is nonfatal. Numerical
suggestion quality, first-use latency and memory use have not been benchmarked.
Keep real tokens, purchase records and Firefox profiles out of fixtures and archives.
