# Decision 0001: page-owned readiness for multi-page scraping

**Status: retired in CartSplit on October 25, 2026.**
Originally accepted upstream on June 21, 2026.

This record explains an earlier multi-page scraper. It is not the design of the
current selected-order workflow. Read [Technical design and privacy](../architecture.md)
for the active implementation.

## Original problem

The upstream extension walked retailer transaction lists and order pages.
Navigation destroyed the content script, so a background request waiting for that
script's reply could hang. Amazon reloads and Target sign-in checks exposed this.

## Original decision

The page detected its own readiness, parsed its contents and sent a semantic
`PAGE_RESULT`. A background coordinator triggered navigation and waited for the
next matching result. A one-result buffer handled replies arriving before the
waiter was ready.

This kept readiness knowledge in the page and allowed sign-in/step-up responses
to return partial results rather than leave the walk waiting indefinitely.
The trade-off was a coordinator, waiter map and buffering state.

## Why it is historical here

CartSplit removed the automated multi-page walk, its coordinator and related
adapters during the October 25 cleanup. The current reader waits for an explicit
sidebar action and returns the selected order/payment page data. Background
requests have a ten-second deadline and their replies are validated.

The original design's Chrome background-lifetime follow-up is not a current
CartSplit feature commitment.

For the full decision, alternatives and implementation notes, see the
[upstream record at the starting commit](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/docs/adr/0001-page-owned-readiness-scraping.md).
