import { defineCommand } from 'citty'

const supportedFrameworks = ['auto', 'vue', 'react', 'html'] as const
const supportedOutputs = ['console', 'json'] as const

type AnalyzeFramework = (typeof supportedFrameworks)[number]
type AnalyzeOutput = (typeof supportedOutputs)[number]

function isAnalyzeFramework(value: string): value is AnalyzeFramework {
  return supportedFrameworks.includes(value as AnalyzeFramework)
}

function isAnalyzeOutput(value: string): value is AnalyzeOutput {
  return supportedOutputs.includes(value as AnalyzeOutput)
}

export const analyzeCommand = defineCommand({
  meta: {
    name: 'analyze',
    description: 'Run the Phase 1 unused-class analysis scaffold.',
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
    output: {
      type: 'string',
      default: 'console',
      description: 'Output format: console or json.',
    },
  },
  async run({ args }): Promise<void> {
    const directory = typeof args.dir === 'string' ? args.dir : '.'
    const framework =
      typeof args.framework === 'string' && isAnalyzeFramework(args.framework)
        ? args.framework
        : 'auto'
    const output =
      typeof args.output === 'string' && isAnalyzeOutput(args.output)
        ? args.output
        : 'console'

    const payload = {
      command: 'analyze',
      framework,
      output,
      status: 'ready',
      targetDir: directory,
      message:
        'ReCSS scaffold is wired for Phase 1. Next implementation step is the core analyzer pipeline.',
    }

    if (output === 'json') {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
      return
    }

    process.stdout.write(
      [
        'ReCSS scaffold is ready.',
        `Target: ${payload.targetDir}`,
        `Framework: ${payload.framework}`,
        `Output: ${payload.output}`,
        payload.message,
      ].join('\n') + '\n',
    )
  },
})
