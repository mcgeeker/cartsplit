# CartSplit personal installation and maintenance

Status: development build. Source publication is separate from signing or
distributing an installable extension. Signing, store submission, signed-package
distribution and release jobs remain on hold. No permanently installable signed
XPI has been produced.

## What is prepared

Locally generated candidate directories under `artifacts/milestone-5/` contain an unsigned
extension ZIP, source ZIP, SHA256 checksums, built-file hashes and a verification
report. Older archives directly under `artifacts/milestone-5/` are historical drafts
and must not be submitted. These generated packages are not tracked in Git.
The source archive's `BUILD-README.md` contains the
pinned tool versions and exact build commands. It includes the extension, shared
UI, lockfile, licence and verification scripts; it excludes profiles, credentials,
dependencies, model caches and generated output. See the adjacent verification
report for actual rebuild evidence rather than assuming cross-platform identity.

Runtime scope is **Amazon.ca, English pages, CAD and the explicitly selected YNAB plan**.
The owner has accepted the selected-plan workflow and posting-date allowance in
Firefox. Fresh installation packages remain pending. Each save still requires an eligible target,
review and deliberate approval. Unattended sync remains disabled.
The extension keeps its own Firefox ID, `cartsplit@mcgeeker`.

The October 25 rename introduced a new Firefox identity.
Its connection database is `cartsplit-connection`. Firefox treats this identity as
a separate extension: existing credentials, learning and session state are not
automatically transferred from an earlier installation. The existing profile's
data and YNAB transactions are untouched. No credential migration is implemented.
The repository is [mcgeeker/cartsplit](https://github.com/mcgeeker/cartsplit).
Commands and file paths in this guide are relative to the checkout root.

## Current temporary installation

The existing isolated test profile remains the development environment. Do not
remove/reinstall it just to repeat accepted checks. When a new development build
actually needs loading, use `about:debugging` → This Firefox → Load Temporary
Add-on and choose `apps/extension/.output/firefox-mv2/manifest.json`. This is a
development installation, separate from the planned signed installation. Never
disable Firefox signature checks to make this candidate permanent.

## Planned signed installation — requires separate authorization

Mozilla signing is required for normal Firefox distribution, including
self-distributed extensions. The proposed route is unlisted self-distribution,
with source and build instructions supplied for review; it does not require a
public store listing. Uploading either ZIP is an external submission and remains
unauthorized. See [Mozilla signing overview](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)
and [source review requirements](https://extensionworkshop.com/documentation/publish/source-code-submission/).

After explicit authorization and receipt of a signed XPI:

1. Keep the verified unsigned/source pair, checksums and returned signed XPI
   together. Confirm the returned manifest still has the expected name, version
   and ID before installation; signing changes the archive, so its hash differs.
2. Use a dedicated permanent-installation Firefox profile for the first install.
   This avoids relying on a temporary-to-permanent storage migration that has not
   been verified. Keep the existing test profile intact; do not copy its token,
   cache or purchase records into a release archive or another profile.
3. Open `about:addons`, choose the gear menu → Install Add-on From File, select
   the signed XPI, and review Firefox's permissions. Mozilla documents
   [installation from file](https://support.mozilla.org/en-US/kb/find-and-install-add-ons-add-features-to-firefox).
4. Enter any needed credential only in CartSplit's local connection screen.
   Existing learning in the test profile will not appear in a new profile. Do not
   seed data or repeat accepted transactions to populate it. A future installation
   check should verify persistence after a Firefox restart without a financial save.

These are planned steps, not evidence that signing, migration or permanent
installation has passed. Each financial save still requires review and explicit
final consent in the selected plan. The prepared proposal identifies its plan and account.

## Updates

No private update server or `update_url` is configured. Plan manual installation
of separately authorized, signed updates. Mozilla explains that self-distributed
updates need an update URL, a higher listed AMO version, or manual distribution:
[self-distribution and updates](https://extensionworkshop.com/documentation/publish/self-distribution/).

For a future update, increase the extension package version, keep the same add-on
ID, build a new dated candidate, verify its extracted-source rebuild and obtain
signing authorization. Preserve the last known working signed XPI and source pair.
Install an update in the same permanent profile without uninstalling CartSplit.
Treat storage compatibility as part of the update review; same identity alone
does not prove a migration safe. Current candidate version is 1.4.0.

## Recovery and rollback

If a new version fails, stop using Review/Prepare/Save and disable CartSplit in
`about:addons` while investigating. Do not uninstall or clear extension data as a
first fix: doing so can remove the local credential and learning. Keep private
profile backups protected outside this public repository; no profile backup has
been created or inspected as part of this preparation.

A saved source/XPI pair preserves code, not YNAB history. Prefer a reviewed fix
with a higher version number based on the last working source; do not assume
Firefox will accept a downgrade or that old code can read newer storage. Any
destructive storage repair or profile restore needs an explicit scope decision.

Disabling, reinstalling or reverting code cannot undo a YNAB write. If a save was
sent but its result was uncertain, inspect YNAB manually before taking further
action. Do not retry it after restarting simply because the session receipt is
gone. Preserve existing accepted transactions.

## Token and local data maintenance

The token is stored in extension-origin IndexedDB, protected by Firefox's profile
boundary rather than an encrypted credential vault. Never include it in chat,
screenshots, shell commands, logs, source packages or issue reports. Disconnect
removes the local connection but does not revoke the token at YNAB. To replace a
token, disconnect locally, revoke the old token through YNAB's developer settings,
then enter a replacement locally. See [YNAB API authentication](https://api.ynab.com/).

Local-data cleanup is a separate, confirmed operation. Read
[local-data removal](local-data-removal.md) before using it. It does not undo saved
YNAB categories or revoke a YNAB token. Product/history vectors are personal data
even though new learning does not store raw product titles.

The extension connects directly to YNAB for authenticated operations. Initial
local-model use downloads pinned public files from Hugging Face/CDN and discloses
ordinary network metadata; product titles and category names are processed on the
device. Model memory use and first-use latency have not been benchmarked in the
real profile. See [architecture](architecture.md) and the
[October 25 review](security-review-2026-10-25.md) for limits.
