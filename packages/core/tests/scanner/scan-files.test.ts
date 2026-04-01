import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { scanFiles } from '../../src/scanner/index.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })))
  tempDirs.length = 0
})

describe('scanFiles', () => {
  it('should scan and classify css and source files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'recss-scan-'))
    tempDirs.push(root)

    await writeFile(join(root, 'a.scss'), '.a{}', 'utf8')
    await writeFile(join(root, 'Comp.vue'), '<template><div class="a"/></template>', 'utf8')
    await writeFile(join(root, 'Comp.tsx'), 'export const C = () => <div className="a" />', 'utf8')
    await writeFile(join(root, 'index.html'), '<div class="a"></div>', 'utf8')

    const result = await scanFiles({
      root,
      cssInclude: ['**/*.{css,scss}'],
      cssExclude: [],
      sourceInclude: ['**/*.{vue,tsx,jsx,html}'],
      sourceExclude: [],
    })

    expect(result.cssFiles).toHaveLength(1)
    expect(result.vueFiles).toHaveLength(1)
    expect(result.jsxFiles).toHaveLength(1)
    expect(result.htmlFiles).toHaveLength(1)
  })
})
