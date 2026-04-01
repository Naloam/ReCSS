import {
  analyzeSpecificity,
  parseAll,
  scanFiles,
  type RecssFramework,
} from '@recss/core'
import { defineCommand } from 'citty'

const supportedFrameworks = ['auto', 'vue', 'react', 'html'] as const

type CheckFramework = (typeof supportedFrameworks)[number]

function isCheckFramework(value: string): value is CheckFramework {
  return supportedFrameworks.includes(value as CheckFramework)
}

function getSourceIncludeByFramework(framework: RecssFramework): string[] {
  if (framework === 'vue') {
    return ['**/*.vue']
  }

  if (framework === 'react') {
    return ['**/*.{tsx,jsx}']
  }

  if (framework === 'html') {
    return ['**/*.html']
  }

  return ['**/*.{vue,tsx,jsx,html}']
}

export const checkCommand = defineCommand({
  meta: {
    name: 'check',
    description: 'Detect CSS specificity conflicts.',
  },
  args: {
    dir: {
      type: 'positional',
      default: '.',
      description: 'Directory to analyze.',
      required: false,
    },
    framework: {
      type: 'string',
      default: 'auto',
      description: 'Target framework: auto, vue, react, or html.',
    },
    threshold: {
      type: 'string',
      default: '0',
      description: 'Fail only when conflicts exceed this threshold.',
    },
  },
  async run({ args }): Promise<void> {
    const directory = typeof args.dir === 'string' ? args.dir : '.'
    const framework =
      typeof args.framework === 'string' && isCheckFramework(args.framework)
        ? args.framework
        : 'auto'
    const thresholdValue = typeof args.threshold === 'string' ? Number(args.threshold) : 0
    const threshold = Number.isFinite(thresholdValue) ? Math.max(0, thresholdValue) : 0

    const scanResult = await scanFiles({
      root: directory,
      cssInclude: ['**/*.{css,scss}'],
      cssExclude: ['**/*.module.{css,scss}'],
      sourceInclude: getSourceIncludeByFramework(framework),
      sourceExclude: ['**/*.test.*', '**/*.spec.*'],
    })

    const parsed = await parseAll(scanResult)
    const specificity = analyzeSpecificity(parsed.cssResult)

    if (specificity.conflicts.length === 0) {
      process.stdout.write('No specificity conflicts found.\n')
      return
    }

    process.stdout.write(
      `Detected ${specificity.conflicts.length} specificity conflicts (threshold: ${threshold}).\n`,
    )

    for (const conflict of specificity.conflicts) {
      process.stdout.write(`- .${conflict.className} -> ${conflict.property}\n`)
      for (const definition of conflict.definitions) {
        const important = definition.isImportant ? ' !important' : ''
        process.stdout.write(
          `  [${definition.specificity.join(',')}] ${definition.file}:${definition.line} ${definition.value}${important}\n`,
        )
      }
    }

    if (specificity.conflicts.length > threshold) {
      process.exitCode = 1
    }
  },
})
