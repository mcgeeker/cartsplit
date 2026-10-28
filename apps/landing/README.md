# Retained upstream landing site

This directory contains the original lineitem marketing site, a Vite + React
single-page app. It retains upstream branding, privacy text and feedback
integrations. **It is not CartSplit's website or current privacy documentation.**

For CartSplit, start with the [project README](../../README.md) or
[documentation index](../../docs/README.md). The extension does not need this site
or the upstream OAuth worker to run.

## Local development

After dependency setup in the [developer guide](../../docs/development.md), run
these commands from the repository root:

| Task | Command |
| --- | --- |
| Development server | `corepack pnpm --filter landing dev` |
| Component workbench, port 6007 | `corepack pnpm --filter landing storybook` |
| Typecheck | `corepack pnpm --filter landing compile` |
| Production build | `corepack pnpm --filter landing build` |

The build output is `apps/landing/dist/`. Shared components and design tokens come
from `packages/ui/`; sharing them does not make the two products' content identical.

## Deployment status

The retained `wrangler.toml` and package deployment script describe the upstream
Cloudflare setup. They do not establish that this fork controls or deploys
`lineitem.dev`. No site deployment is part of the CartSplit workflow.

Upstream domain, form-key and deployment details are historical configuration,
not instructions to publish CartSplit under the original developer's identity.
