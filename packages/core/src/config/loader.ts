import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import createJiti from 'jiti'

import { normalizeConfig, type RecssCoreConfig } from './schema.js'

const CONFIG_FILE_NAMES = ['recss.config.ts', 'recss.config.js', 'recss.config.mjs']

async function loadModuleConfig(filePath: string): Promise<unknown> {
  const extension = extname(filePath)

  if (extension === '.ts') {
    const jiti = createJiti(process.cwd(), {
      interopDefault: true,
    })
    return jiti(filePath)
  }

  const module = await import(pathToFileURL(filePath).href)
  return module.default ?? module
}

async function loadPackageJsonConfig(root: string): Promise<unknown | null> {
  const packageJsonPath = resolve(root, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return null
  }

  try {
    const content = await readFile(packageJsonPath, 'utf8')
    const parsed = JSON.parse(content) as { recss?: unknown }
    return parsed.recss ?? null
  } catch {
    return null
  }
}

async function loadFromPath(path: string): Promise<unknown | null> {
  if (!existsSync(path)) {
    return null
  }

  return loadModuleConfig(path)
}

export async function loadConfig(root: string, configPath?: string): Promise<RecssCoreConfig> {
  const resolvedRoot = resolve(root)

  if (configPath) {
    const absoluteConfigPath = resolve(resolvedRoot, configPath)
    const loaded = await loadFromPath(absoluteConfigPath)
    return normalizeConfig(loaded ?? {})
  }

  for (const fileName of CONFIG_FILE_NAMES) {
    const fullPath = resolve(resolvedRoot, fileName)
    const loaded = await loadFromPath(fullPath)
    if (loaded) {
      return normalizeConfig(loaded)
    }
  }

  const packageJsonConfig = await loadPackageJsonConfig(resolvedRoot)
  if (packageJsonConfig) {
    return normalizeConfig(packageJsonConfig)
  }

  return normalizeConfig({})
}
