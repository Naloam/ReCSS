# ReCSS Project - Claude Code Instructions

## Project Overview

ReCSS is a TypeScript CSS health analyzer. It statically analyzes projects to find unused CSS classes and specificity conflicts.

Monorepo structure:

- packages/core - Analysis engine (pure TypeScript, no side effects)
- packages/cli - CLI tool using citty
- packages/vite-plugin - Vite integration (Phase 2)

## Tech Stack

| Purpose               | Library                         |
| --------------------- | ------------------------------- |
| CSS/SCSS parsing      | postcss + postcss-scss          |
| CSS selector analysis | css-tree                        |
| Vue SFC parsing       | @vue/compiler-sfc               |
| JSX/TSX parsing       | @babel/parser + @babel/traverse |
| HTML parsing          | node-html-parser                |
| Specificity           | specificity                     |
| File scanning         | fast-glob                       |
| CLI                   | citty                           |
| Config validation     | zod                             |
| Build                 | tsup                            |
| Test                  | vitest                          |
| Package manager       | pnpm                            |

## Code Conventions

### TypeScript

- Strict mode enabled. No any unless absolutely necessary; use unknown + type guards.
- Prefer type over interface for pure data shapes; use interface for extendable contracts.
- All public functions must have explicit return type annotations.
- Use async/await over .then() chains.

### Error Handling

- Parsing errors should never crash the process. Catch, console.warn, and return an empty result.
- Use try/catch and avoid uncaught promises.

### File/Module Organization

- Each module has a single responsibility.
- index.ts files only re-export and contain no logic.
- Shared types live in src/types.ts at the package level.

### Testing

- Test files live in tests/ mirroring src/.
- Use inline string fixtures for parser tests (no file I/O in unit tests).
- E2E tests use fixture projects in tests/fixtures/.
- Test names follow: should [do X] when [condition Y].

### Performance

- Always use Promise.all for parallel file processing.
- Avoid synchronous file reads in hot paths.

## Key Design Decisions

1. Conservative handling of dynamic classes: uncertain classes are never reported as unused.
2. CSS Modules are out of scope in MVP: if module syntax is detected, skip silently.
3. No auto-delete for unused classes: report only.
4. Safelist supports exact strings and RegExp.

## Common Patterns

### Adding a new parser

1. Create src/parser/xxx-parser.ts.
2. Implement parseXxxFile(filePath: string): Promise<SourceScanResult>.
3. Wire it into src/parser/index.ts parseAll().
4. Add file extension in src/scanner/index.ts include patterns.

### Adding a new analyzer

1. Create src/analyzer/xxx.ts.
2. Define I/O types in src/types.ts.
3. Export from src/analyzer/index.ts.

## Do NOT

- Do not install chalk, ora, or inquirer; keep dependencies minimal.
- Do not use fs.readFileSync in parsers; use fs.promises.readFile.
- Do not mutate function parameters; return new values.
- Do not use console.log in packages/core; reporter system handles output.
- Do not call process.exit() in packages/core; only packages/cli can do that.
