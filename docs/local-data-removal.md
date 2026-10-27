# Remove local CartSplit data

Local cleanup is optional. It removes cached application data from this Firefox
profile without changing YNAB transactions.

## What is removed

The preview lists counts for four local stores: cached orders, learned product
choices, product title/vector records and cached categories. Cleanup covers all
plans in this profile, including dormant records from earlier versions.

The connection database is separate: disconnect from YNAB before using cleanup.
Removal does not revoke the token at YNAB, delete YNAB transactions, remove the
local model cache, clear browser history or affect another Firefox profile.

## Preview and confirm

1. Disconnect YNAB in CartSplit, then open **Local data** on the connection screen.
2. Select **Preview local data removal** and inspect the displayed counts.
3. If you want to remove those records, tick the explicit deletion confirmation
   and select **Delete these local records**. Otherwise cancel the preview.

Opening Local data or previewing counts deletes nothing. The preview makes no
network request and returns no purchase titles, record keys or credentials. Its
approval expires after five minutes and can be used only once.

Before deletion, CartSplit checks that it is still disconnected and that the
record keys still match the preview. Changed records require a new preview.
All four stores are cleared in one transaction; failure before commit does not
leave a partial clear. Completed deletion cannot be undone. If the response is
lost, preview the current counts again before deciding what to do next.

## Technical details

Cleanup uses the extension's existing `lineitem` application database. It does not
remove the separate `cartsplit-connection` credential database or browser-managed
model files. Confirmation, expiry, cancellation, changed-key rejection and atomic
rollback are covered by synthetic tests. See the [architecture](architecture.md)
and [development guide](development.md) for storage boundaries and verification.
