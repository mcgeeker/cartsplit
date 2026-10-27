# Review an Amazon.ca purchase

Use CartSplit to categorize an Amazon.ca order in your selected CAD YNAB plan.
**YNAB changes only when you approve a prepared proposal and save it.** Review
and preparation are read-only.

## Review and save

1. **Open the order.** Select its Amazon.ca **Order details** tab. Keep an Amazon
   **Transactions/Your Payments** tab open in the same Firefox window. If needed,
   use **Open Amazon Transactions/Payments**, then return to Order details.
2. **Read the purchase.** Click **Review selected order**. CartSplit reads the
   items and payments, finds the matching YNAB purchase and suggests categories.
3. **Check the categories and totals.** Correct any suggestions and fill in blank
   categories. For several products, confirm item totals where requested, review
   [adjustments](#adjustments-for-orders-with-several-products) and accept the
   displayed allocation policy. For one product, its category receives the full
   card payment, including all units and order adjustments.
4. **Prepare the proposal.** Click **Prepare changes**. Check the **plan, account,
   YNAB date, payment amount and category amounts**. If Amazon's payment date
   differs, both dates appear. Saving keeps the original YNAB date.
5. **Approve and save once.** If everything is correct, tick the separate final
   approval and click **Save approved changes once** within five minutes. After
   the verified success message, inspect the transaction in YNAB.

A save updates the selected transaction's category or split. Its total, account,
date and other existing transaction details stay unchanged. Lines with the same
category are combined; one resulting category produces a simple category update.

If the order has several card payments, follow
[Orders with several payments](#orders-with-several-payments) before preparing.

## What can CartSplit match?

Use English Amazon.ca pages and a **CAD YNAB plan**. Choose your actual plan or a
test plan under **Connection settings → Change YNAB Plan**; you do not need to
remove your saved token.

| Requirement | Supported purchases |
| --- | --- |
| Account | Open, on-budget **Cash, Checking, Savings or Credit Card** accounts. Linked accounts and imported/matched purchases are supported. |
| Transaction | An **Amazon/AMZN outflow** that is uncategorized, unsplit, not reconciled and not a transfer. |
| Amount and date | The **exact card amount**, dated up to **2 calendar days before or after** Amazon's payment date. |

There must be **one matching YNAB transaction per payment**. If several match,
CartSplit stops; it does not pick the closest date. Gift-card funding is checked
separately from the amount charged to your card.

## Adjustments for orders with several products

Open **Charge breakdown** to inspect tax, shipping, fees, discounts and gift
funding. Under **Adjustments**, choose where each detected adjustment belongs:

| Choice | Use it to… |
| --- | --- |
| **All items** | Share the amount across every product row. |
| **Selected items** | Share it across the product rows you check. Each row includes all its units. |
| **Separate category** | Give a positive fee or net shipping charge its own category. |

For shared amounts, choose **Equally** or **By item value**. Fees and net shipping
default to equal shares; coupons and gift funding default to item value.

Coupons reduce product cost before estimated tax. Gift funding reduces the amount
paid by card after tax. Free Shipping credit offsets shipping first, so only the
net shipping cost is allocated. Separate fee/shipping rows do not receive coupon
or gift reductions.

These are estimates of how costs are shared. Check the displayed category amounts
before accepting the policy. Inconsistent totals or invalid choices stop preparation.

## Orders with several payments

Amazon may charge separately for split shipments. CartSplit keeps those YNAB
transactions separate and saves **one payment at a time**.

1. **Assign the rows.** For several products, choose a **Payment** and category
   for each product and separate-category charge. Each payment needs at least one
   row. A product row includes all its units; you cannot divide those units
   between payments. Distributed adjustments follow their selected products.
2. **Choose one payment.** Select **Payment to prepare**, accept the displayed
   policy where shown, and click **Prepare selected payment**. For a single-product
   order, choose its category and one payment; no row assignments are needed.
3. **Review and save that payment.** Follow steps 4–5 above, then check it in YNAB
   before preparing the next payment. Each payment needs separate final approval.

Each payment's exact amount stays fixed. Its division among assigned rows is an
estimate, not proof of shipment-specific tax, coupon or gift amounts.

After the first verified save, assignments, categories and adjustment choices are
fixed for the remaining payments in that review. Already categorized or split
payments appear as **Preserved** and cannot be saved again.

## If CartSplit stops

| Message or situation | What to do |
| --- | --- |
| No matching YNAB purchase | Check the selected plan, account eligibility, exact card amount and ±2-day date window above. |
| More than one match | Inspect the matching purchases in YNAB. CartSplit cannot choose safely; do not change dates or amounts just to force a match. |
| Item totals or funding do not add up | Check quantities, prices and the complete Amazon payment details. CartSplit will not adjust a mismatched total to make it fit. |
| Review or approval expired | Start a fresh review after ten minutes; prepare again if the five-minute final approval expired. |

**Unconfirmed save: inspect YNAB and do not retry or reload to retry.** The request
may already have succeeded. Canceling or disconnecting cannot undo a request
already sent. Restarting Firefox or the extension clears its session warnings;
it does not establish whether the purchase saved.

If YNAB saving succeeded but local category learning failed, the purchase is still
saved. Do not save it again to teach the category.

## Canceling, switching orders and returning later

**Cancel review** stops a read or preparation and clears its choices without
disconnecting YNAB. Closing the sidebar cancels unfinished drafts. During a save,
cancellation requires the unconfirmed-save precautions above.

The sidebar follows the selected order. Switching away clears prepared approval;
return to the original order tab and prepare again. Navigation never saves anything
automatically. Saved or partially saved progress remains visible for the session.

**Saved to YNAB** is a receipt for this session's verified saves, not a fresh read
of YNAB. Receipts survive reopening the sidebar, but clear when Firefox or the
extension restarts. Check YNAB for the current transaction.

## Category suggestions and local data

Suggestions use these sources in order:

1. Your saved category for the same product in this plan.
2. Similar products you previously categorized through verified CartSplit saves.
3. A local model's comparison with your current category and group names.

Every suggestion is editable. Uncertain matches stay blank. Only a verified save
teaches future suggestions, and learning stays separate for each YNAB plan.

The model runs in Firefox and downloads public model files on first use, which can
make the first review slower. Product and category text is processed locally.
For storage and privacy details, see [Technical design and privacy](architecture.md).
To clear learned choices, follow [Remove local CartSplit data](local-data-removal.md).
