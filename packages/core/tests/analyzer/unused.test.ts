import { describe, expect, it } from 'vitest'

import { analyzeUnused } from '../../src/analyzer/unused.js'
import type { CssParseResult } from '../../src/types.js'

function createCssResult(): CssParseResult {
  return new Map([
    [
      'card',
      [
        {
          name: 'card',
          selector: '.card',
          file: '/virtual/styles.scss',
          line: 1,
          column: 1,
          specificity: [0, 1, 0],
          properties: ['padding'],
        },
      ],
    ],
    [
      'active',
      [
        {
          name: 'active',
          selector: '.active',
          file: '/virtual/styles.scss',
          line: 2,
          column: 1,
          specificity: [0, 1, 0],
          properties: ['color'],
        },
      ],
    ],
    [
      'is-loading',
      [
        {
          name: 'is-loading',
          selector: '.is-loading',
          file: '/virtual/styles.scss',
          line: 3,
          column: 1,
          specificity: [0, 1, 0],
          properties: ['opacity'],
        },
      ],
    ],
    [
      'ghost',
      [
        {
          name: 'ghost',
          selector: '.ghost',
          file: '/virtual/styles.scss',
          line: 4,
          column: 1,
          specificity: [0, 1, 0],
          properties: ['display'],
        },
      ],
    ],
  ])
}

describe('analyzeUnused', () => {
  it('should classify unused classes while honoring used, uncertain and safelist rules', () => {
    const result = analyzeUnused(
      createCssResult(),
      new Set(['card']),
      new Set(['is-loading']),
      ['active', /^js-/, /^is-/],
    )

    expect(result.unused.map((item) => item.name)).toEqual(['ghost'])
    expect(result.skipped).toEqual(['active', 'is-loading'])
    expect(result.stats).toEqual({
      totalCssClasses: 4,
      usedClasses: 1,
      unusedClasses: 1,
      uncertainClasses: 1,
      safelistedClasses: 1,
    })
  })
})
