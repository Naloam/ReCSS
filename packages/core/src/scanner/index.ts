import { resolve } from 'node:path'

import fg from 'fast-glob'

import type { ScanOptions, ScanResult } from '../types.js'

const NODE_MODULES_GLOB = '**/node_modules/**'

function withDefaultExcludes(excludes: string[]): string[] {
  return excludes.includes(NODE_MODULES_GLOB)
    ? excludes
    : [...excludes, NODE_MODULES_GLOB]
}

function classifySourceFiles(files: string[]): Pick<ScanResult, 'vueFiles' | 'jsxFiles' | 'htmlFiles'> {
  const vueFiles: string[] = []
  const jsxFiles: string[] = []
  const htmlFiles: string[] = []

  for (const file of files) {
    if (file.endsWith('.vue')) {
      vueFiles.push(file)
      continue
    }

    if (file.endsWith('.jsx') || file.endsWith('.tsx')) {
      jsxFiles.push(file)
      continue
    }

    if (file.endsWith('.html')) {
      htmlFiles.push(file)
    }
  }

  return {
    vueFiles,
    jsxFiles,
    htmlFiles,
  }
}

export async function scanFiles(options: ScanOptions): Promise<ScanResult> {
  const root = resolve(options.root)

  const cssIgnore = withDefaultExcludes(options.cssExclude)
  const sourceIgnore = withDefaultExcludes(options.sourceExclude)

  const [cssFiles, sourceFiles] = await Promise.all([
    fg(options.cssInclude, {
      absolute: true,
      cwd: root,
      ignore: cssIgnore,
      onlyFiles: true,
    }),
    fg(options.sourceInclude, {
      absolute: true,
      cwd: root,
      ignore: sourceIgnore,
      onlyFiles: true,
    }),
  ])

  const sourceFileGroups = classifySourceFiles(sourceFiles)

  return {
    cssFiles,
    vueFiles: sourceFileGroups.vueFiles,
    jsxFiles: sourceFileGroups.jsxFiles,
    htmlFiles: sourceFileGroups.htmlFiles,
  }
}
