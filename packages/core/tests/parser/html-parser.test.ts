import { describe, expect, it } from 'vitest'

import { parseHtmlCode } from '../../src/parser/html-parser.js'

describe('parseHtmlCode', () => {
  it('should extract class names from html class attributes', () => {
    const result = parseHtmlCode(
      [
        '<main class="app shell">',
        '  <button class="btn btn-primary">Save</button>',
        '</main>',
      ].join('\n'),
    )

    expect(result.used.has('app')).toBe(true)
    expect(result.used.has('shell')).toBe(true)
    expect(result.used.has('btn')).toBe(true)
    expect(result.used.has('btn-primary')).toBe(true)
    expect(result.uncertain.size).toBe(0)
  })
})
