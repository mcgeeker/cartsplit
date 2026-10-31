# CartSplit documentation

**Start with the guide for what you want to do.** CartSplit currently supports
Firefox, English Amazon.ca pages and a selected CAD YNAB plan. Each transaction
needs review and final approval.

## Current guides

| I want to… | Read |
| --- | --- |
| Review a purchase and save categories | [Purchase review](purchase-review.md) |
| Install CartSplit, share it or manage updates | [Installation and maintenance](personal-installation.md) |
| Understand privacy, storage and transaction safeguards | [Technical design and privacy](architecture.md) |
| Remove cached or learned data from this Firefox profile | [Local-data removal](local-data-removal.md) |
| Build or change the extension | [Developer guide](development.md) |

[CartSplit 1.9.6 is available as a Mozilla-signed Firefox prerelease](https://github.com/mcgeeker/cartsplit/releases/tag/v1.9.6).
Use the installation guide for everyday use; temporary loading is for development.
Updates are installed manually.

The prerelease includes register lookup and editable memos. Use the
[trial and 2.0 acceptance guide](2.0-development.md) for these features.
The owner is trying 1.9.6 before finalizing 2.0.0.

## Historical records

These explain earlier work. They are not current installation or testing instructions.

| Record | What it covers |
| --- | --- |
| [October 25 security review](security-review-2026-10-25.md) | Dated findings, fixes and verification of the fork |
| [Original source review](upstream-security-review.md) | The upstream extension before CartSplit's changes |
| [Upstream README](upstream-readme.md) | Original project and its documentation |
| [Retired design decision](adr/0001-page-owned-readiness-scraping.md) | The multi-page scraper replaced in this fork |
| [Removed-file inventory](retired-code-2026-10-25.txt) | Paths removed during the October 25 cleanup |

The retained [landing site](../apps/landing/README.md) and OAuth worker belong to
the upstream project. They are not needed to build or run CartSplit.

Return to the [project overview](../README.md).
