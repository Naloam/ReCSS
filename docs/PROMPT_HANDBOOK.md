# ReCSS AI Prompt Handbook (11 Rounds)

This handbook is extracted from the master plan and normalized for practical execution.

## Round 0 - Bootstrap
Initialize pnpm monorepo with packages/core, packages/cli, packages/vite-plugin and base configs.

## Round 1 - CSS Parser
Implement css-parser with PostCSS and tests for nested/scoped selectors.

## Round 2 - Vue Parser
Implement Vue SFC class extraction with used/uncertain distinction.

## Round 3 - JSX Parser
Implement JSX/TSX class extraction, including clsx/cn/classnames patterns.

## Round 4 - HTML + Scanner
Implement html parser, file scanner, and parser aggregation entry.

## Round 5 - Analyzer
Implement the unused analyzer first; add specificity analysis after MVP.

## Round 6 - Reporter
Implement console/json report outputs first; keep HTML for later.

## Round 7 - CLI
Implement `analyze` via citty first; add `check` and `init` after MVP.

## Round 8 - Config Loader
Implement zod schema + config resolution from files and package.json.

## Round 9 - Fixtures + E2E
Build the Vue fixture project and end-to-end tests for unused-class detection.

## Round 10 - Release Prep
Complete README, package metadata, CI workflow, and changeset config.

## Round 11 - Optional Vite Plugin
Development-mode warning integration via Vite HMR.

## Usage Tip
Work in order, one round per PR. Keep each round independently testable.
