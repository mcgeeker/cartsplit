# Original lineitem source review — October 22, 2026

**Historical review of the upstream project before CartSplit's changes.**
It covers version **1.4.0**, commit
`e358b565addbe433673eaff6b6f5f12cbc88ed9a`. Its OAuth, storage and retailer
findings do not describe the current fork.

Read [Technical design and privacy](architecture.md) for CartSplit's current
boundaries, or the [October 25 fork review](security-review-2026-10-25.md) for
subsequent remediation.

## Assessment at the reviewed commit

The first-party code reviewed showed no evidence of covert bulk uploading of
shopping history, budgets, passwords or browsing history. It did deliberately
route reusable YNAB credentials through the developer's service and had several
privacy and control gaps.

This was a static source review, not verification of an installed signed add-on,
the deployed service or every dependency.

## Main findings

| Finding | Why it mattered |
| --- | --- |
| OAuth relay handled reusable credentials | `auth.lineitem.dev` received refresh tokens and token responses. The source did not show extra recipients or token persistence, but the deployed operator could change its service independently. |
| Disconnect did not revoke or erase everything | Local disconnection did not revoke YNAB access, clear learned history or cancel existing work. Policy wording overstated the effect. |
| Feedback and images disclosed metadata | Issue reports included browser/extension versions; sidebar image URLs caused ordinary remote requests. No token-bearing tracking URL was found. |
| Credential access was too broad | Privileged messages lacked adequate sender checks and returned full settings. This increased risk from a compromised extension context; no ordinary webpage bridge was found. |
| Model downloads were not revision-pinned | Model loading used a mutable revision and began at startup. Text inference itself ran locally. |

Approved writes in that upstream version included product-title memos sent to
YNAB. That behavior is distinct from CartSplit's current narrow category/split writer.

## Method and limits

The review inspected 115 first-party text files plus relevant Transformers.js
3.8.1 loading and inference code. It traced external requests, OAuth, storage,
messaging, image rendering and transaction updates.

No packages were installed or executed for that review, and no personal account
was connected. It did not capture runtime traffic, compare the signed XPI with a
source build, inspect all transitive code or verify the deployed worker.

The [full original report](https://github.com/mcgeeker/cartsplit/blob/0486e1962e54309a81fd77310d1d40c23b04fc4c/docs/upstream-security-review.md)
retains source-line links, detailed findings and supporting references.
The [original source](https://github.com/michael-bachmann/lineitem/tree/e358b565addbe433673eaff6b6f5f12cbc88ed9a)
is pinned to the reviewed commit.
