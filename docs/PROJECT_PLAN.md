# ReCSS Project Plan

Version: v1.5  
Status: Phase 2 delivered, Phase 3 ecosystem baseline delivered with initial VSCode quick fixes

## 1. Project Overview

### Positioning

ReCSS is a focused CSS health analyzer for large front-end repositories. It favors static analysis, actionable reports, and a tightly scoped MVP over broad platform ambitions.

### Scope

In scope for the current baseline:

- Detect unused CSS and SCSS class selectors from source code references
- Provide `recss analyze` workflow with config support
- Provide `recss check` workflow for specificity conflict checks
- Provide `recss init` config scaffold command
- Generate console, json, and html reports
- Support `defineConfig()` + config loading from config files and package.json

Out of scope for current implementation:

- Production CSS tree-shaking (PurgeCSS territory)
- CSS-in-JS (styled-components, emotion)
- Less support
- Deep CSS Modules migration automation
- Deep IDE-assisted source-edit quick-fix workflows

### Users

- Engineers inheriting legacy front-end projects
- Tech leads paying down style debt
- Teams that want a safe first pass before deeper CSS refactors

## 2. Architecture

```text
File Scanner -> AST Parsers -> Analyzer Engine -> Reporters -> CLI
                   |               |
                 CSS/Vue         Unused Classes
```

Key libraries:

- postcss + postcss-scss
- css-tree
- @vue/compiler-sfc
- @babel/parser
- fast-glob
- zod
- specificity

Delivered or in progress in later phases:

- Vite plugin: delivered
- VSCode extension MVP + diagnostic quick actions: delivered

## 3. Features and Boundaries

### F1: Unused Class Detection

- Output by file with line info
- Support static extraction from Vue SFC templates first
- Dynamic classes are uncertain and excluded from unused reports
- Safelist supports string and RegExp entries in config
- CLI output supports `console`, `json`, and `html`

### F2: Specificity Conflict Detection

- Implemented via `recss check`
- Includes `!important` usage reporting and threshold-based exit code

### F3: CSS Modules Migration Assistant

- Component-scoped suggestion and apply flow is delivered
- Deeper syntax rewrites remain in the future backlog

### F4: VSCode Diagnostics and Actions

- Inline unused-class diagnostics are delivered
- Refresh and clear diagnostic quick actions are delivered
- Source-editing quick fixes remain in the future backlog

## 4. CLI Design

Current command:

```bash
recss analyze [dir]
recss check [dir]
recss init [dir]
recss migrate <component-dir>
```

## 5. Development Roadmap

### Phase 1 (delivered)

- Monorepo setup
- Typed config helper
- CSS parser
- Vue scanner
- Unused analyzer
- Console and json reporter
- `analyze` command
- Basic fixtures and tests

### Phase 2 (delivered)

- React scanner: delivered
- Specificity analyzer and `check` command: delivered
- Config loader: delivered
- HTML report: delivered

### Future Backlog

- Richer CSS Modules rewrite coverage
- Deeper VSCode source-editing quick fixes and code actions
- Reporter formats beyond console/json

## 6. Acceptance Criteria

Example:

```bash
npx recss analyze ./examples/vue-demo --framework vue
```

Expected:

- Detect unused classes with line-level output
- Finish on medium project in reasonable time (seconds level)
- No crash on parser edge cases

## 7. Delivery Snapshot

Delivered commands:

- `recss analyze`
- `recss check`
- `recss init`
- `recss migrate`
- `ReCSS: Refresh Analysis`
- `ReCSS: Clear Diagnostics`

Delivered analysis modules:

- Unused class analyzer
- Specificity conflict analyzer

Delivered validation baseline:

- Unit tests + parser tests + e2e fixture tests
- `core` and `cli` build/lint/test green before each step commit

Release prep snapshot (Round 10, delivered):

- CI workflow added for lint/test/build gates
- Changeset config added for package versioning and publish flow
- Release workflow added to automate version PR/publish
