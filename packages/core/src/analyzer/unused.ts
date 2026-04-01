import type {
  CssParseResult,
  SafelistPattern,
  UnusedAnalysisResult,
  UnusedClass,
} from '../types.js'

function isSafelisted(className: string, safelist: SafelistPattern[]): boolean {
  for (const rule of safelist) {
    if (typeof rule === 'string' && className === rule) {
      return true
    }

    if (rule instanceof RegExp && rule.test(className)) {
      return true
    }
  }

  return false
}

export function analyzeUnused(
  cssResult: CssParseResult,
  usedClasses: Set<string>,
  uncertainClasses: Set<string>,
  safelist: SafelistPattern[],
): UnusedAnalysisResult {
  const unused: UnusedClass[] = []
  const skipped: string[] = []

  let safelistedClasses = 0

  for (const [className, definitions] of cssResult.entries()) {
    if (usedClasses.has(className)) {
      continue
    }

    if (uncertainClasses.has(className)) {
      skipped.push(className)
      continue
    }

    if (isSafelisted(className, safelist)) {
      safelistedClasses += 1
      skipped.push(className)
      continue
    }

    unused.push({
      name: className,
      definitions,
    })
  }

  return {
    unused,
    skipped,
    stats: {
      totalCssClasses: cssResult.size,
      usedClasses: usedClasses.size,
      unusedClasses: unused.length,
      uncertainClasses: uncertainClasses.size,
      safelistedClasses,
    },
  }
}
