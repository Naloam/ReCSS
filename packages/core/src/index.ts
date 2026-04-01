export { defineConfig } from "./config.js";
export { analyzeUnused } from './analyzer/index.js'
export { renderConsoleReport, renderJsonReport } from './reporter/index.js'
export {
  parseCssCode,
  parseCssFile,
  parseCssFiles,
} from "./parser/css-parser.js";
export { parseAll } from './parser/index.js'
export { parseHtmlCode, parseHtmlFile } from './parser/html-parser.js'
export { parseJsxCode, parseJsxFile } from './parser/jsx-parser.js'
export { parseVueCode, parseVueFile } from './parser/vue-parser.js'
export { scanFiles } from './scanner/index.js'
export type {
  AnalysisResult,
  ClassDefinition,
  CssParseResult,
  ParseAllResult,
  RecssConfig,
  RecssFileMatch,
  RecssFramework,
  RecssReportFormat,
  RecssReportOptions,
  ScanOptions,
  ScanResult,
  SafelistPattern,
  SourceScanResult,
  UnusedAnalysisResult,
  UnusedClass,
} from "./types.js";
