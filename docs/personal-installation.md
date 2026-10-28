# Install and maintain CartSplit

**Use the temporary development copy for now.** No signed, permanently installable
CartSplit release is available. The source code is on
[GitHub](https://github.com/mcgeeker/cartsplit); fresh installation packages and
signing remain separate work.

## Load the current development build

Build from source using the [developer guide](development.md), then set up a
Firefox profile and load the extension as described below.

### Create or choose a profile

A Firefox **profile** has its own settings, sign-ins and extension data. Use a
separate profile for the development build to keep it apart from your everyday
browser setup. If you already have one for CartSplit, open that profile and skip
to [Load the extension](#load-the-extension).

To create one:

1. Open `about:profiles` in Firefox. Note the name of your everyday profile.
2. Click **Create a New Profile** and follow the wizard. A name such as
   **CartSplit Development** will help you recognize it.
3. If the new profile becomes the default, click **Set as default profile** under
   your everyday profile to keep your usual startup behavior.
4. Under the CartSplit profile, click **Launch profile in new browser**.

See [Mozilla's profile guide](https://support.mozilla.org/en-US/kb/profile-manager-create-remove-switch-firefox-profiles)
for more detail. Continue in the new profile's Firefox window.

### Load the extension

1. Go to `about:debugging#/runtime/this-firefox` and choose **Load Temporary Add-on**.
2. Select `apps/extension/.output/firefox-mv2/manifest.json`.
3. Enter your token only in CartSplit's connection screen and choose your CAD YNAB plan.

The path starts at the repository root. The build tool generates `firefox-mv2`
for **Firefox using Manifest Version 2**, the extension's configuration format.
Everyone building the current fork uses this relative path; the folder name does
not depend on your computer or Firefox profile.

When updating an already loaded development build, use **Reload** on that page.
Refresh the Amazon Order details and Transactions/Your Payments tabs after a
reader update. Temporary add-ons must be loaded again after Firefox restarts.
See [Mozilla's temporary-loading guide](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)
for the distinction between reloading and permanent installation.

CartSplit's add-on ID is `cartsplit@mcgeeker`. Firefox treats a different add-on ID
as a separate installation; no credential or learning migration is implemented.

## Permanent installation: planned

Normal Firefox release and beta installations require a Mozilla-signed add-on,
including unlisted self-distribution. An unlisted extension does not need a public
store listing. See [Mozilla's signing overview](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

Before submission, prepare a fresh unsigned extension and matching source package,
verify the source rebuild, then obtain authorization for signing. Mozilla requires
[readable source and build instructions](https://extensionworkshop.com/documentation/publish/source-code-submission/)
for bundled code. Use packages built and verified from the current source.

Once a verified signed XPI (Firefox add-on file) is available:

1. Open the Firefox profile where you want to use CartSplit.
2. Open `about:addons` and choose the gear menu → **Install Add-on From File**.
3. Select the signed XPI and review Firefox's permission request.
4. Connect locally and check persistence after restarting Firefox, without a financial save.

These are planned steps. Signing, permanent installation and transfer of existing
profile data have not been verified. Do not disable signature checks to make a
development build permanent. Mozilla documents
[installation from a file](https://extensionworkshop.com/documentation/publish/install-self-distributed/).

## Updates and recovery

There is no CartSplit update server or manifest `update_url`. The planned route is
manual installation of signed updates; Mozilla also supports updates through a
configured update URL or a later listed AMO version.
See [self-distributed updates](https://extensionworkshop.com/documentation/publish/self-distribution/).

| Task | Approach |
| --- | --- |
| Prepare an update | Increase the version, keep the same add-on ID, rebuild and verify fresh packages before authorized signing. Current source version: **1.4.0**. |
| Install a signed update | Use the same permanent profile without first uninstalling. Check storage compatibility as part of the update. |
| A new version fails | Disable CartSplit in `about:addons` and investigate. Keep the last working signed file and source package. |
| A save result is uncertain | Inspect YNAB. Disabling, restarting or reverting CartSplit cannot undo a sent write or make it safe to retry. |

A source/XPI backup preserves code, not YNAB history. Uninstalling or clearing
extension data can remove credentials and learning. Storage repair, profile restore
and downgrades need a separate recovery decision.

## Tokens and local data

The token is stored in this Firefox profile, not an encrypted credential vault.
**Disconnect YNAB** removes the local connection; it does not revoke the token at
YNAB. To invalidate a token, revoke it in YNAB's developer settings. Enter a
replacement only in CartSplit's local connection screen.

Cached categories and learned choices remain after disconnect. Use the optional,
confirmed [local-data removal](local-data-removal.md) if you want to erase them.
This does not change saved YNAB transactions.

For network destinations, storage details and remaining limits, read
[Technical design and privacy](architecture.md).
