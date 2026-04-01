# ReCSS

ReCSS is a focused TypeScript tool for CSS health analysis in large codebases. It starts with a small, source-level MVP for unused class detection and leaves heavier refactor workflows for later.

## Why ReCSS

- Source-level analysis instead of production bundle trimming
- Conservative logic to reduce false positives
- CLI-first workflow for local use and CI gates
- A deliberately small Phase 1 scope that can ship quickly

## Current Status

Phase 1 is delivered and core Phase 2 capabilities are in place. You can run unused-class analysis, specificity checks, and config initialization from CLI.

## Current Scope

- Detect unused CSS/SCSS class selectors from Vue/React/HTML source references
- Keep dynamic classes conservative and out of unused reports
- Detect specificity conflicts with threshold-based CLI failure mode
- Support `console`, `json`, and `html` outputs
- Support config loading (`recss.config.ts/js/mjs` and `package.json#recss`)
- Provide `recss init` to bootstrap config

Deferred:

- CSS modules migration assistant
- Vite plugin integration
- VSCode extension

## Workspace

- packages/core: analysis engine
- packages/cli: command line interface and typed config entry
- packages/vite-plugin: future integration placeholder, not part of the current MVP
- docs: project plan and prompt handbook
- config/mcp: MCP setup examples
- .vscode: recommended local IDE setup
- examples/vue-demo: minimal target project for local CLI debugging

## Quick Start

```bash
pnpm install
pnpm -r build
pnpm -r test
```

## CLI

```bash
recss analyze [dir] [--framework auto|vue|react|html] [--output console|json|html] [--config <path>] [--safelist a,b] [--outfile report-path]
recss check [dir] [--framework auto|vue|react|html] [--threshold 0] [--config <path>]
recss init [dir]
```

## Release Prep

```bash
pnpm changeset
pnpm version-packages
pnpm release
```

GitHub Actions:

- CI workflow: `.github/workflows/ci.yml`
- Release workflow: `.github/workflows/release.yml` (requires `NPM_TOKEN` secret)

## Name Note

Current name remains ReCSS, which is short and intention-revealing.
Alternative optional names:

- StyleDebt
- ClassAudit
- CascadeGuard
