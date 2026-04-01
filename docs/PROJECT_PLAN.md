# ReCSS Project Plan

Version: v1.2  
Status: Ready for Phase 1 implementation

## 1. Project Overview

### Positioning
ReCSS is a focused CSS health analyzer for large front-end repositories. It favors static analysis, actionable reports, and a tightly scoped MVP over broad platform ambitions.

### Scope
In scope for the current baseline:
- Detect unused CSS and SCSS class selectors from source code references
- Provide a Vue-first `recss analyze` workflow
- Generate console and json reports
- Preserve a typed `defineConfig()` entry for future config loading

Out of scope for Phase 1:
- Production CSS tree-shaking (PurgeCSS territory)
- CSS-in-JS (styled-components, emotion)
- Less support
- Specificity conflict detection
- CSS Modules migration automation
- Vite and IDE integrations

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
- fast-glob
- zod

Deferred to later phases:
- @babel/parser + @babel/traverse
- node-html-parser
- specificity

## 3. Features and Boundaries

### F1: Unused Class Detection
- Output by file with line info
- Support static extraction from Vue SFC templates first
- Dynamic classes are uncertain and excluded from unused reports
- Safelist supports string and RegExp entries in config
- CLI output supports `console` and `json`

### F2: Specificity Conflict Detection
- Deferred to Phase 2 after the unused-class pipeline is stable

### F3: CSS Modules Migration Assistant
- Deferred to the future backlog
- If implemented later, it stays component-scoped and diff-first

## 4. CLI Design

Current command:

```bash
recss analyze [dir]
```

Planned later:

```bash
recss check [dir]
recss init
recss migrate <component-dir>
```

## 5. Development Roadmap

### Phase 1 (2-3 weeks, MVP)
- Monorepo setup
- Typed config helper
- CSS parser
- Vue scanner
- Unused analyzer
- Console and json reporter
- `analyze` command
- Basic fixtures and tests

### Phase 2 (optional after MVP)
- React scanner
- Specificity analyzer and `check` command
- Config loader
- HTML report

### Future Backlog
- CSS Modules migration assistant
- Vite plugin
- VSCode extension

## 6. Acceptance Criteria

Example:

```bash
npx recss analyze ./examples/vue-demo --framework vue
```

Expected:
- Detect unused classes with line-level output
- Finish on medium project in reasonable time (seconds level)
- No crash on parser edge cases
