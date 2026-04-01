import { defineCommand, runMain } from 'citty'

import { analyzeCommand } from './commands/analyze.js'

const main = defineCommand({
  meta: {
    name: 'recss',
    version: '0.1.0',
    description: 'Focused CSS health analyzer scaffold.',
  },
  subCommands: {
    analyze: analyzeCommand,
  },
})

runMain(main)
