# Original lineitem documentation

**Historical reference.** CartSplit is a personal fork of
[michael-bachmann/lineitem](https://github.com/michael-bachmann/lineitem), starting
from version **1.4.0**, commit
`e358b565addbe433673eaff6b6f5f12cbc88ed9a`.

Read the [CartSplit overview](../README.md) and
[current guides](README.md) for this fork.

## How the projects differ

| Area | Upstream at the starting commit | Current CartSplit |
| --- | --- | --- |
| Retailers and browser | Amazon.com / Target; Chrome and Firefox builds | English Amazon.ca pages in Firefox |
| Authentication | YNAB OAuth through a hosted relay | Direct Personal Access Token connection |
| Workflow | Queue, sync and backfill features | Selected-order review; separate approval for each payment |
| Distribution | Upstream website and store-release process | Personal development build; signed installation pending |

Upstream deployment commands, OAuth client settings, store identities, privacy
statements and support links are not CartSplit setup instructions. The retained
worker and marketing site are outside the extension runtime.

## Source and attribution

The complete [original README at the starting commit](https://github.com/michael-bachmann/lineitem/blob/e358b565addbe433673eaff6b6f5f12cbc88ed9a/README.md)
remains available with its original instructions and context.
The [copy previously retained in this fork](https://github.com/mcgeeker/cartsplit/blob/0486e1962e54309a81fd77310d1d40c23b04fc4c/docs/upstream-readme.md)
is also preserved in Git history.

The original MIT licence and Michael Bachmann attribution remain in
[LICENSE](../LICENSE).
