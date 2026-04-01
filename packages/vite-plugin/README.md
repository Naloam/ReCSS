# @recss/vite-plugin

Vite development plugin for ReCSS.

## Install

```bash
pnpm add -D @recss/vite-plugin
```

## Usage

```ts
import { defineConfig } from "vite";
import { recssVitePlugin } from "@recss/vite-plugin";

export default defineConfig({
  plugins: [recssVitePlugin()],
});
```

The plugin analyzes CSS usage on HMR updates and prints warnings when unused classes are detected.
