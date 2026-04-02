# @recss/vscode-extension

VSCode extension package for ReCSS.

## Current Scope

- Run ReCSS analysis for each workspace folder
- Surface unused CSS/SCSS class definitions as inline diagnostics
- Refresh on demand and on save for relevant files
- Refresh only the affected workspace folder after relevant saves
- Write refresh summaries and failures to the `ReCSS` output channel
- Respect `recss.config.*` and `package.json#recss`

## Commands

- `ReCSS: Refresh Analysis`
- `ReCSS: Clear Diagnostics`

## Settings

- `recss.enabled`
- `recss.framework`
- `recss.runOnSave`
