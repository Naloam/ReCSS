import { describe, expect, it } from 'vitest'

import { analyzeProject } from '../../src/analyzer/index.js'

describe('analyzeProject', () => {
  it('should detect unused classes in vue fixture project', async () => {
    const result = await analyzeProject({
      root: './tests/fixtures/vue-basic',
      framework: 'vue',
      safelist: [],
    })

    const unusedNames = result.unused.unused.map((item) => item.name)

    expect(unusedNames).toContain('button--ghost')
    expect(unusedNames).not.toContain('button')
    expect(unusedNames).not.toContain('button--primary')
  })
})
