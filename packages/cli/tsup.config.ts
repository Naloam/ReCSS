import { defineConfig } from 'tsup'

export default [
  defineConfig({
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm'],
    target: 'node18',
    sourcemap: true,
    clean: true,
    dts: true,
  }),
  defineConfig({
    entry: {
      bin: 'src/bin.ts',
    },
    format: ['esm'],
    target: 'node18',
    sourcemap: true,
    clean: false,
    dts: false,
    banner: {
      js: '#!/usr/bin/env node',
    },
  }),
]
