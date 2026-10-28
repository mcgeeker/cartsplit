# Install and maintain CartSplit

**[Download CartSplit 1.4.1](https://github.com/mcgeeker/cartsplit/releases/tag/v1.4.1)**
for permanent installation in Firefox. Choose **cartsplit-1.4.1-signed.xpi** under
Assets. Mozilla signs this unlisted add-on; it does not appear in public Add-ons
search results. You do not need a developer account or build tools to install it.

## Install the signed extension

1. Download [cartsplit-1.4.1-signed.xpi](https://github.com/mcgeeker/cartsplit/releases/download/v1.4.1/cartsplit-1.4.1-signed.xpi).
2. Open the Firefox profile where you want to use CartSplit. In `about:addons`,
   choose the gear menu → **Install Add-on From File**.
3. Select the signed XPI, review the permissions and choose **Add**.
4. Open CartSplit's sidebar, enter your own YNAB token locally and choose your CAD plan.
5. Restart Firefox and check that CartSplit and its connection remain available.
   No financial save is needed to check installation.

A **profile** has its own settings, connections and learning data. Installing in a
test profile does not install CartSplit in your everyday profile. Repeat these steps
in each profile where you want it; no connection or learning migration is provided.
Permanent installation survives browser restarts. Do not disable signature checks.
See [Mozilla's file-installation instructions](https://extensionworkshop.com/documentation/publish/install-self-distributed/).

Your token and approved category changes go directly to YNAB. Nothing is sent to
the CartSplit developer. Category learning stays in this Firefox profile. Model
downloads contact Hugging Face without sending your token or purchase details.
Firefox's standard data-collection wording includes transmission directly to YNAB;
it does not mean the developer receives that information.

## Share with a friend

Send the [release page](https://github.com/mcgeeker/cartsplit/releases/tag/v1.4.1)
or the signed XPI. The file contains code, not your token, profile or budget data.
Each person installs it using the steps above and enters their own token locally.
The supported scope remains Firefox, English Amazon.ca pages and CAD YNAB plans.

For the exact source used to build 1.4.1, use **cartsplit-1.4.1-sources.zip** in the
release's Assets. GitHub's automatic source archives for the existing v1.4.1 tag
refer to the earlier published baseline; the attached source ZIP includes the
accepted 1.4.1 privacy wording and build instructions.

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

## Updates and recovery

There is no CartSplit update server or manifest `update_url`. Check
[GitHub Releases](https://github.com/mcgeeker/cartsplit/releases) for new signed
versions and install them manually in the same profile, without uninstalling.
Publishing to GitHub does not automatically update installed copies. Mozilla also
supports updates through a configured update URL or a later listed AMO version.
See [self-distributed updates](https://extensionworkshop.com/documentation/publish/self-distribution/).

| Task | Approach |
| --- | --- |
| Prepare an update | Increase the version, keep the same add-on ID, rebuild and verify fresh packages before authorized signing. Current source version: **1.4.1**. |
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
