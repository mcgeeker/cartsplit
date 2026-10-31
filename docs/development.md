# Build and develop CartSplit

Build the Firefox extension from the repository root. For everyday use, read
[Purchase review](purchase-review.md); for data and security boundaries, read
[Technical design and privacy](architecture.md).

The signed 1.9.6 prerelease includes register lookup and editable memos. Use
[the trial and 2.0 acceptance guide](2.0-development.md) for those workflows.
Development builds increment through 1.9.x while the owner tries the extension;
2.0.0 remains pending until the acceptance/review gate passes.

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

**CI runs on pull requests and pushes to `personal-token-auth` or `main`.**
Path filters run the extension checks when extension code, shared UI, dependency
inputs or the CI workflow changes; documentation-only changes skip those jobs.
Checks include typechecking, tests with coverage, a Firefox build and manifest
boundary verification. The workflow only uploads an unsigned build artifact.


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

## Prepare a release with one command

Development rehearsals can explicitly include individual newly authored source
files without staging or sweeping unrelated untracked files into a package:
`--rehearsal --include-source apps/extension/path/to/new.ts` (repeat for each
reviewed file). This option is refused for release candidates; normal releases
still require intentionally added source files to be tracked by Git.

Fetch origin and tags first (`git fetch origin`), review the intended changes, and
increase `apps/extension/package.json` to a version higher than all local release
tags. Stage intentionally added source files with Git before preparing: the helper
copies tracked working files and excludes ignored/untracked files, including stray
copies. Uncommitted tracked edits are included and noted in the report.

```sh
corepack pnpm release:prepare --output artifacts/release-VERSION
```

Choose a new output directory each time; existing candidates are never overwritten.
The command installs frozen dependencies with hooks disabled, explicitly prepares
WXT, typechecks, tests, builds Firefox and runs the manifest guard in a temporary
snapshot outside the checkout. It packages unsigned/matching-source ZIPs, extracts
the sources into another independent directory, repeats the checks and requires
all built files to match byte for byte. Your working build output stays untouched.

The output contains `packages/`, SHA-256 sums and build-file hashes, per-step logs,
`REPORT.json`, `VERIFICATION.md` and a release-notes template to edit. A failed run
has status `failed`; inspect its logs and use a new directory after correcting the
cause. Only `ready-for-signing` means preparation passed. Package retrieval needs
network access or a populated pnpm cache; add `--offline` to prohibit retrieval.
Allow approximately 3–10 minutes with cached dependencies; downloading can add time.

To exercise the tooling without increasing or releasing the installed version:

```sh
corepack pnpm release:prepare --rehearsal --offline --output artifacts/release-rehearsal
python3 -m unittest discover -s scripts -p 'test_prepare_release.py'
```

Rehearsals report `rehearsal-passed` and must not be submitted. The helper does not
change the version, sign, upload, install, publish, push Git commits or access YNAB.
Review notes and sources before separately authorized Mozilla signing; compare the
signed package against `BUILD-FILES.json`, then install and accept it before a
separately authorized GitHub release. Keep the signed XPI and matching sources.
