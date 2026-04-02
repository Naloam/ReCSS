# @recss/vscode-extension

VSCode extension package for ReCSS.

## Current Scope

- Run ReCSS analysis for each workspace folder
- Surface unused CSS/SCSS class definitions as inline diagnostics
- Refresh on demand and on save for relevant files
- Respect `recss.config.*` and `package.json#recss`

The VSCode extension focuses on diagnostics only. For CSS Modules migration (rewriting React className and Vue `:class` patterns to module references), use the CLI command `recss migrate --apply`. See the root README for the full list of supported patterns.

## Commands

- `ReCSS: Refresh Analysis`

## Settings

- `recss.enabled`
- `recss.framework`
- `recss.runOnSave`
