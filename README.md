# ReCSS

ReCSS is a focused TypeScript tool for CSS health analysis in large codebases. It starts with a small, source-level MVP for unused class detection and leaves heavier refactor workflows for later.

## Why ReCSS

- Source-level analysis instead of production bundle trimming
- Conservative logic to reduce false positives
- CLI-first workflow for local use and CI gates
- A deliberately small Phase 1 scope that can ship quickly

## Current Status

Phase 1 and Phase 2 are delivered. Phase 3 ecosystem work is now underway with migration flow, Vite integration, and a VSCode extension baseline with initial diagnostic quick fixes.

## Current Scope

- Detect unused CSS/SCSS class selectors from Vue/React/HTML source references
- Keep dynamic classes conservative and out of unused reports
- Detect specificity conflicts with threshold-based CLI failure mode
- Support `console`, `json`, and `html` outputs
- Support config loading (`recss.config.ts/js/mjs` and `package.json#recss`)
- Provide `recss init` to bootstrap config
- Provide `recss migrate` for CSS Modules migration suggestions and apply flow
- Provide `@recss/vite-plugin` for HMR-time warnings
- Provide `@recss/vscode-extension` for inline unused-class diagnostics and basic diagnostic quick fixes

### `recss migrate --apply` support scope

`recss migrate --apply` copies plain CSS/SCSS files to `.module` equivalents and rewrites class references in source files. The current rewrite coverage:

**React className patterns:**

| Pattern                          | Example                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| String literal                   | `className="card active"`                                          |
| Template literal                 | ``className={`btn ${active ? 'active' : ''}`}``                    |
| clsx / cn / classnames call      | `className={clsx('btn', { active })}`                              |
| Array literal                    | `className={["card", active && "active"]}`                         |
| `.filter(Boolean).join(" ")`     | `className={["card", cond && "active"].filter(Boolean).join(" ")}` |
| `.concat()` chain                | `className={["card"].concat(cond ? ["active"] : [])}`              |
| Binary string concatenation      | `className={"card " + (active ? "active" : "")}`                   |
| Conditional / logical expression | `className={active ? "on" : "off"}`                                |

**Vue SFC patterns:**

| Pattern                   | Example                                    |
| ------------------------- | ------------------------------------------ |
| Static `class` attribute  | `<div class="card">`                       |
| Object `:class` binding   | `:class="{ active: isActive }"`            |
| Array `:class` binding    | `:class="['foo', cond ? 'bar' : '']"`      |
| Mixed static + dynamic    | `<div class="card" :class="{ active }">`   |
| Custom style module alias | `<style module="classes">` uses `$classes` |

**Limitations:**

- This is **not** a general-purpose AST auto-migration tool. It covers the most common className patterns listed above.
- Dynamic variable references (e.g., `className={someVar}`), function calls, and complex member expressions are detected as uncertain and left untouched.
- Files that already use CSS Modules (`styles.xxx`) are skipped.
- Vue files using `useCssModule()` are skipped.
- Spread operators and deeply nested expressions may not be fully rewritten.
- Only `.css` and `.scss` source files are processed.

Deferred:

- Deeper CSS Modules auto-rewrite coverage beyond the patterns above
- Deeper VSCode source-editing quick fixes and code actions

## Workspace

- packages/core: analysis engine
- packages/cli: command line interface and typed config entry
- packages/vite-plugin: Vite integration for HMR-time warnings
- packages/vscode-extension: VSCode extension for inline diagnostics
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
recss migrate [component-dir]
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
- Detailed guide: `docs/RELEASE.md`

## Name Note

Current name remains ReCSS, which is short and intention-revealing.
Alternative optional names:

- StyleDebt
- ClassAudit
- CascadeGuard
