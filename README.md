# CartSplit

**Split Amazon purchases into meaningful YNAB categories.**

One Amazon payment can cover groceries, household supplies and gifts. CartSplit
is a Firefox extension that connects the items in an Amazon.ca order with the
corresponding YNAB charges, helping you assign each purchase to the right categories.
All of CartSplit's purchase matching, category suggestions and data storage take
place locally in your browser.

## Designed for privacy and independence

**CartSplit does not share your YNAB information, Amazon purchase history, or
other personal information with its developer. It does not send that information
to advertisers, analytics providers or cloud AI services.**

CartSplit connects directly to YNAB using a **Personal Access Token** that you
create in YNAB and enter locally in the extension. This removes the need for an
additional authentication service: your YNAB credential does not pass through a
developer-operated server, and the connection does not depend on someone keeping
that server running. Your token is sent only to YNAB. There is no CartSplit
account to create.

**Category suggestions run on your device.** CartSplit remembers categories from
purchases you have saved, looks for similar purchases in your local history, and
uses a local AI model when history is insufficient. Your product descriptions and
category names are not sent to a cloud AI service. No cloud AI account or
subscription is needed.

Direct communication with YNAB is necessary to authenticate, read your budget
and save changes you approve. Public model files are downloaded from Hugging Face
and its CDNs on first use. Those downloads do not include your YNAB data, Amazon
purchase history or token, but the providers can see your IP address and ordinary
network metadata. CartSplit's runtime has no analytics or feedback-submission
service.

Your token is stored in your Firefox profile, so protecting that profile matters.
Disconnecting removes the local connection; revoke the token in YNAB if you want
to invalidate it. See the [privacy and security details](docs/architecture.md)
for storage, data retention and remaining limitations.

## What CartSplit helps with

- **Item-level categories:** divide an Amazon payment among your existing YNAB
  categories instead of treating the entire order as one type of spending.
- **Repeat purchases:** reuse earlier category choices while keeping every
  suggestion editable.
- **The full purchase cost:** account for discounts, gift-card payments, shipping,
  taxes and fees when reviewing how costs are shared among items.
- **Split shipments:** handle an order billed through several payments while
  keeping the corresponding YNAB transactions separate.
- **Simple purchases:** choose one category for a single-product order without
  working through unnecessary allocation controls.

## You approve every change

CartSplit finds the matching YNAB transaction and suggests a category breakdown.
You review the categories and amounts, make any corrections, and approve the
change before it is saved. If a suggestion is uncertain, you can choose manually.

It is an assisted review workflow: there is no unattended syncing or automatic
approval of financial changes.

## Availability

CartSplit is currently a **personal development project** for **Firefox,
Amazon.ca, English pages and CAD**. You choose the YNAB plan, and every financial
change requires review and approval. A signed, installable release is not yet available.

## Documentation

- [Developer guide](docs/development.md): build from source and load a development copy.
- [Purchase review guide](docs/purchase-review.md): detailed instructions for using the extension.
- [Technical design and privacy](docs/architecture.md): how data, local learning and approvals are handled.
- [Installation and maintenance](docs/personal-installation.md): installation plans, updates and token management.

## Credits and licence

CartSplit is maintained by [mcgeeker](https://github.com/mcgeeker) and is a personal
fork of [michael-bachmann/lineitem](https://github.com/michael-bachmann/lineitem).
The original MIT licence and attribution to Michael Bachmann are retained in
[LICENSE](LICENSE).

This is an independent project, not an official Amazon or YNAB extension.
