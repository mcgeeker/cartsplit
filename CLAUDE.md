# CartSplit contributor notes

Start with the [project overview](README.md) and
[developer guide](docs/development.md). Current behavior and trust boundaries are
documented in [Technical design and privacy](docs/architecture.md).

## Scope

CartSplit is a personal Firefox fork for English Amazon.ca pages and selected CAD
YNAB plans. Authentication uses a locally entered Personal Access Token. There is
no OAuth relay, unattended sync or bulk approval in the extension runtime.

## Working rules

1. **Make the requested change.** Use existing patterns and avoid unrelated refactors
   or speculative abstractions.
2. **Protect private data.** Use synthetic fixtures and mocked APIs. Never put real
   tokens, purchase records or Firefox profiles in source, logs or archives.
3. **Preserve approval boundaries.** Review and preparation are read-only. Each
   transaction needs its own final approval; uncertain writes must not be retried.
4. **Verify appropriately.** Inspect package scripts, use the pinned package manager
   and run checks relevant to the change. Documentation edits need link and
   accuracy checks; runtime changes need applicable tests and build checks.
5. **Record the result clearly.** Explain what changed, what was checked and any
   remaining limits. Keep ordinary guides separate from dated test records.

Original MIT attribution stays intact. The retained worker/site are separate
upstream projects. Release and worker-deployment jobs remain disabled; signing,
store submission and deployment require a separate scope decision.
