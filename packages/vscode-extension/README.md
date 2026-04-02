# @recss/vscode-extension

VSCode extension package for ReCSS.

## Current Scope

- Run ReCSS analysis for each workspace folder
- Surface unused CSS/SCSS class definitions as inline diagnostics
- Refresh on demand and on save for relevant files
- Refresh only the affected workspace folder after relevant saves
- Write refresh summaries and failures to the `ReCSS` output channel
- Expose quick-fix actions on ReCSS diagnostics for refresh and clear flows
- Respect `recss.config.*` and `package.json#recss`

The VSCode extension focuses on diagnostics only. For CSS Modules migration (rewriting React className and Vue `:class` patterns to module references), use the CLI command `recss migrate --apply`. See the root README for the full list of supported patterns.

## Commands

- `ReCSS: Refresh Analysis`
- `ReCSS: Clear Diagnostics`

## Settings

- `recss.enabled`
- `recss.framework`
- `recss.runOnSave`
