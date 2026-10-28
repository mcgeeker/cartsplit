# Remove local CartSplit data

**Cleanup is optional and cannot be undone.** It removes cached and learned
records from this Firefox profile, across all YNAB plans. It does not change
transactions stored in YNAB.

## Preview before deleting

1. Click **Disconnect YNAB**, then open **Local data** on the connection screen.
2. Click **Preview local data removal** and inspect the counts.
3. To proceed, tick the deletion confirmation and click **Delete these local records**.
   Otherwise, choose **Cancel removal preview**.

Opening Local data or previewing counts deletes nothing. The preview makes no
network request. It expires after five minutes; changed records require a new preview.

## What the counts mean

| Displayed label | Records removed |
| --- | --- |
| Cached orders | Historical local transaction/order records |
| Learned product choices | Saved product-to-category choices |
| Product title records | Locally stored product vectors and any older title records |
| Cached categories | Cached YNAB categories |

Cleanup clears all four stores together. If removal cannot be confirmed, preview
the counts again before deciding what to do next.

## What cleanup does not affect

**Transactions stored in YNAB remain unchanged**, including categories and splits
you have already saved there. Cached transaction/order records in CartSplit's
local application database are deleted during cleanup.

The downloaded model, browser history and other Firefox profiles are unaffected.
Disconnecting does not revoke the token at YNAB; revoke it there separately if needed.

For storage boundaries and retention, see [Technical design and privacy](architecture.md).
