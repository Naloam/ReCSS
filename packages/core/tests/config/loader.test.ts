import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadConfig } from '../../src/config/loader.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })))
  tempDirs.length = 0
})

describe('loadConfig', () => {
  it('should load recss.config.mjs from root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'recss-config-'))
    tempDirs.push(root)

    await writeFile(
      join(root, 'recss.config.mjs'),
      `export default { framework: 'vue', report: { format: 'json' }, safelist: ['active'] }`,
      'utf8',
    )

    const config = await loadConfig(root)

    expect(config.framework).toBe('vue')
    expect(config.report.format).toBe('json')
    expect(config.safelist).toEqual(['active'])
  })

  it('should fallback to package.json recss field', async () => {
    const root = await mkdtemp(join(tmpdir(), 'recss-pkg-'))
    tempDirs.push(root)

    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ recss: { framework: 'html', report: { format: 'console' } } }),
      'utf8',
    )

    const config = await loadConfig(root)

    expect(config.framework).toBe('html')
    expect(config.report.format).toBe('console')
  })

  it('should use explicit configPath when provided', async () => {
    const root = await mkdtemp(join(tmpdir(), 'recss-explicit-'))
    tempDirs.push(root)

    await writeFile(
      join(root, 'custom.mjs'),
      `export default { framework: 'react', report: { format: 'json' } }`,
      'utf8',
    )

    const config = await loadConfig(root, './custom.mjs')

    expect(config.framework).toBe('react')
    expect(config.report.format).toBe('json')
  })
})
