import { describe, expect, it } from 'vitest'

import { defineConfig } from '../../src/config.js'

describe('defineConfig', () => {
  it('should preserve regex and string safelist entries when config is defined', () => {
    const statePattern = /^is-/
    const config = defineConfig({
      framework: 'vue',
      report: {
        format: 'json',
      },
      safelist: [statePattern, 'active'],
    })

    expect(config.framework).toBe('vue')
    expect(config.report?.format).toBe('json')
    expect(config.safelist).toEqual([statePattern, 'active'])
  })
})
