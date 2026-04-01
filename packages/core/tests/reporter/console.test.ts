import { describe, expect, it } from 'vitest'

import { renderConsoleReport } from '../../src/reporter/console.js'

describe('renderConsoleReport', () => {
  it('should render summary and file-grouped unused classes', () => {
    const output = renderConsoleReport('/workspace', {
      unused: {
        unused: [
          {
            name: 'card-ghost',
            definitions: [
              {
                name: 'card-ghost',
                selector: '.card-ghost',
                file: '/workspace/src/styles/card.scss',
                line: 12,
                column: 1,
                specificity: [0, 1, 0],
                properties: ['display'],
              },
            ],
          },
        ],
        skipped: ['active'],
        stats: {
          totalCssClasses: 3,
          usedClasses: 1,
          unusedClasses: 1,
          uncertainClasses: 1,
          safelistedClasses: 0,
        },
      },
    })

    expect(output).toContain('ReCSS Analysis Report')
    expect(output).toContain('src/styles/card.scss')
    expect(output).toContain('.card-ghost')
    expect(output).toContain('Unused classes')
  })
})
