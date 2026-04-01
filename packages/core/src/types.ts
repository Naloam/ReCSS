export type RecssFramework = 'auto' | 'vue' | 'react' | 'html'

export type RecssReportFormat = 'console' | 'json'

export type SafelistPattern = RegExp | string

export type RecssFileMatch = {
  exclude?: string[]
  include?: string[]
}

export type RecssReportOptions = {
  format?: RecssReportFormat
  minUnusedThreshold?: number
  outfile?: string
}

export type RecssConfig = {
  css?: RecssFileMatch
  framework?: RecssFramework
  report?: RecssReportOptions
  root?: string
  safelist?: SafelistPattern[]
  sources?: RecssFileMatch
}

export type ClassDefinition = {
  name: string
  selector: string
  file: string
  line: number
  column: number
  specificity: [number, number, number]
  properties: string[]
}

export type CssParseResult = Map<string, ClassDefinition[]>
