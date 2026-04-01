export type RecssFramework = "auto" | "vue" | "react" | "html";

export type RecssReportFormat = "console" | "json" | "html" | "markdown";

export type SafelistPattern = RegExp | string;

export type RecssFileMatch = {
  exclude?: string[];
  include?: string[];
};

export type RecssReportOptions = {
  format?: RecssReportFormat;
  minUnusedThreshold?: number;
  outfile?: string;
};

export type RecssConfig = {
  css?: RecssFileMatch;
  framework?: RecssFramework;
  report?: RecssReportOptions;
  root?: string;
  safelist?: SafelistPattern[];
  sources?: RecssFileMatch;
};

export type ClassDefinition = {
  name: string;
  selector: string;
  file: string;
  line: number;
  column: number;
  specificity: [number, number, number];
  properties: string[];
  declarations: ClassDeclaration[];
};

export type ClassDeclaration = {
  property: string;
  value: string;
  important: boolean;
};

export type CssParseResult = Map<string, ClassDefinition[]>;

export type SourceScanResult = {
  used: Set<string>;
  uncertain: Set<string>;
};

export type ScanOptions = {
  root: string;
  cssInclude: string[];
  cssExclude: string[];
  sourceInclude: string[];
  sourceExclude: string[];
};

export type ScanResult = {
  cssFiles: string[];
  vueFiles: string[];
  jsxFiles: string[];
  htmlFiles: string[];
};

export type ParseAllResult = {
  cssResult: CssParseResult;
  usedClasses: Set<string>;
  uncertainClasses: Set<string>;
};

export type UnusedClass = {
  name: string;
  definitions: ClassDefinition[];
};

export type UnusedAnalysisResult = {
  unused: UnusedClass[];
  skipped: string[];
  stats: {
    totalCssClasses: number;
    usedClasses: number;
    unusedClasses: number;
    uncertainClasses: number;
    safelistedClasses: number;
  };
};

export type AnalysisResult = {
  unused: UnusedAnalysisResult;
};

export type SpecificityConflictEntry = {
  value: string;
  specificity: [number, number, number];
  file: string;
  line: number;
  isImportant: boolean;
};

export type SpecificityConflict = {
  className: string;
  property: string;
  definitions: SpecificityConflictEntry[];
};

export type SpecificityAnalysisResult = {
  conflicts: SpecificityConflict[];
  importantUsage: ClassDefinition[];
  stats: {
    totalConflicts: number;
    importantCount: number;
  };
};

export type AnalyzeOptions = {
  root: string;
  framework?: RecssFramework;
  safelist?: SafelistPattern[];
  cssInclude?: string[];
  cssExclude?: string[];
  sourceInclude?: string[];
  sourceExclude?: string[];
};

export type MigrationSuggestion = {
  file: string;
  suggestedModuleFile: string;
  classNames: string[];
};

export type MigrationApplyResult = {
  copiedFiles: number;
  updatedSourceFiles: number;
};
