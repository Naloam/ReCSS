# @recss/core

Core analysis engine for ReCSS.

## Install

```bash
pnpm add @recss/core
```

## Purpose

- Parse CSS and source files
- Analyze unused classes and specificity conflicts
- Provide report renderers and config utilities
- Build and apply CSS Modules migration suggestions

## Migration API

The migration flow is exposed as two public functions:

- `buildMigrationSuggestions(root)` — scans a directory for plain CSS/SCSS files and returns migration suggestions (detected classes, suggested `.module` file paths).
- `applyMigrationSuggestions(root, suggestions)` — copies style files to `.module` equivalents and rewrites class references in React and Vue source files.

### React className rewrite patterns

Supported: string literals, template literals, clsx/cn/classnames calls, array literals, `.filter(Boolean).join(" ")`, `.concat()` chains, binary string concatenation (`"a " + b`), and conditional/logical expressions.

### Vue SFC rewrite patterns

Supported: static `class`, object `:class`, array `:class`, mixed static + dynamic bindings, and custom `<style module="alias">` references.

### Limitations

This is a targeted migration helper, not a general AST transformer. Dynamic variable references, function calls, and complex member expressions are left untouched.
