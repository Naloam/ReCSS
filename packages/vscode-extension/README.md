# recss-vscode-extension

VSCode extension package for ReCSS.

## Current Scope

- Run ReCSS analysis for each workspace folder
- Surface unused CSS/SCSS class definitions as inline diagnostics
- Refresh on demand and on save for relevant files
- Refresh only the affected workspace folder after relevant saves
- Write refresh summaries and failures to the `ReCSS` output channel
- Expose quick-fix actions on ReCSS diagnostics for refresh, clear, and simple unused-selector removal flows
- Expose a file-level source fix-all action for bulk removal of simple unused selectors
- Respect `recss.config.*` and `package.json#recss`

The VSCode extension focuses on diagnostics first, with conservative source-edit actions for deleting simple unused selectors and running file-level fix-all cleanup for the same simple cases. For CSS Modules migration (rewriting React className and Vue `:class` patterns to module references), use the CLI command `recss migrate --apply`. See the root README for the full list of supported patterns.

## Commands

- `ReCSS: Refresh Analysis`
- `ReCSS: Clear Diagnostics`

## Quick Fixes

- `ReCSS: Remove Unused Class Rule` for simple selectors like `.card { ... }`
- `ReCSS: Remove Unused Class Selector` for simple selector-list entries like `.card, .card-title { ... }`
- `ReCSS: Remove All Simple Unused Selectors` for bulk quick-fix cleanup when multiple simple removals are available
- `ReCSS: Refresh Analysis`
- `ReCSS: Clear Diagnostics`

## Source Actions

- `ReCSS: Fix All Simple Unused Selectors in File` via `source.fixAll.recss`

## Settings

- `recss.enabled`
- `recss.framework`
- `recss.runOnSave`
