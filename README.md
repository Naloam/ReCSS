# ReCSS

ReCSS is a focused TypeScript tool for CSS health analysis in large codebases. It starts with a small, source-level MVP for unused class detection and leaves heavier refactor workflows for later.

## Why ReCSS

- Source-level analysis instead of production bundle trimming
- Conservative logic to reduce false positives
- CLI-first workflow for local use and CI gates
- A deliberately small Phase 1 scope that can ship quickly

## Current Status

Scaffold baseline is ready. Phase 1 is scoped to `recss analyze` for Vue-first unused class detection, with `check`, `migrate`, and editor/build-tool integrations deferred.

## Current MVP Boundary

- Detect unused CSS and SCSS class selectors from Vue source references
- Keep dynamic classes conservative and out of unused reports
- Support `console` and `json` output targets
- Reserve specificity checks, migration helpers, and Vite integration for later phases

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

## Name Note

Current name remains ReCSS, which is short and intention-revealing.
Alternative optional names:
- StyleDebt
- ClassAudit
- CascadeGuard
