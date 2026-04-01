import { describe, expect, it } from 'vitest'

import { renderJsonReport } from '../../src/reporter/json.js'

describe('renderJsonReport', () => {
  it('should stringify analysis result as pretty json', () => {
    const output = renderJsonReport({
      unused: {
        unused: [],
        skipped: [],
        stats: {
          totalCssClasses: 2,
          usedClasses: 1,
          unusedClasses: 1,
          uncertainClasses: 0,
          safelistedClasses: 0,
        },
      },
    })

    expect(() => JSON.parse(output)).not.toThrow()
    expect(output).toContain('"unusedClasses": 1')
  })
})
