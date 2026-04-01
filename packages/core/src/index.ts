export { defineConfig } from "./config.js";
export { loadConfig } from "./config/loader.js";
export { ConfigSchema, normalizeConfig } from "./config/schema.js";
export type { RecssCoreConfig } from "./config/schema.js";
export {
  analyzeProject,
  analyzeSpecificity,
  analyzeUnused,
} from "./analyzer/index.js";
export { renderConsoleReport, renderJsonReport } from "./reporter/index.js";
export {
  parseCssCode,
  parseCssFile,
  parseCssFiles,
} from "./parser/css-parser.js";
export { parseAll } from "./parser/index.js";
export { parseHtmlCode, parseHtmlFile } from "./parser/html-parser.js";
export { parseJsxCode, parseJsxFile } from "./parser/jsx-parser.js";
export { parseVueCode, parseVueFile } from "./parser/vue-parser.js";
export { scanFiles } from "./scanner/index.js";
export type {
  AnalysisResult,
  AnalyzeOptions,
  ClassDeclaration,
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
  SpecificityAnalysisResult,
  SpecificityConflict,
  SpecificityConflictEntry,
  SourceScanResult,
  UnusedAnalysisResult,
  UnusedClass,
} from "./types.js";
