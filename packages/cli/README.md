# recss

CLI package for ReCSS.

## Install

```bash
pnpm add -D recss
```

## Usage

```bash
recss analyze .
recss check .
recss init .
recss migrate ./src/components/card
```

## `recss migrate`

Suggests CSS Modules migration for a component directory. Pass `--apply` to execute the migration:

- Copies plain `.css`/`.scss` files to `.module.css`/`.module.scss`
- Rewrites class references in React and Vue source files

### Supported React className patterns

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
| Wrapper function calls           | `className={mergeClasses(clsx("card"), active ? "active" : "")}`   |

### Supported Vue SFC patterns

| Pattern                   | Example                                    |
| ------------------------- | ------------------------------------------ |
| Static `class` attribute  | `<div class="card">`                       |
| Object `:class` binding   | `:class="{ active: isActive }"`            |
| Array `:class` binding    | `:class="['foo', cond ? 'bar' : '']"`      |
| Mixed static + dynamic    | `<div class="card" :class="{ active }">`   |
| Custom style module alias | `<style module="classes">` uses `$classes` |
| `useCssModule()` accessors | `<script setup>const styles = useCssModule()</script>` |
| Wrapper function calls    | `:class="mergeClasses(['card'], isActive && 'active')"` |

### Limitations

- Not a general-purpose AST auto-migration tool — only the common patterns above are rewritten.
- Dynamic variable references and complex member expressions are left untouched.
- Wrapper calls can still be rewritten when their nested arguments match supported class patterns.
- Existing CSS Modules imports are reused, and duplicate side-effect style imports are removed during migration.
