import { resolve } from "node:path";

import { parseAll } from "../parser/index.js";
import { scanFiles } from "../scanner/index.js";

import { analyzeUnused } from "./unused.js";

import type {
  AnalysisResult,
  AnalyzeOptions,
  RecssFramework,
} from "../types.js";

export { analyzeUnused } from "./unused.js";
export { analyzeSpecificity } from "./specificity.js";

function getSourceIncludeByFramework(framework: RecssFramework): string[] {
  if (framework === "vue") {
    return ["**/*.vue"];
  }

  if (framework === "react") {
    return ["**/*.{tsx,jsx}"];
  }

  if (framework === "html") {
    return ["**/*.html"];
  }

  return ["**/*.{vue,tsx,jsx,html}"];
}

export async function analyzeProject(
  options: AnalyzeOptions,
): Promise<AnalysisResult> {
  const root = resolve(options.root);
  const framework = options.framework ?? "auto";
  const safelist = options.safelist ?? [];
  const cssInclude = options.cssInclude ?? ["**/*.{css,scss}"];
  const cssExclude = options.cssExclude ?? ["**/*.module.{css,scss}"];
  const sourceInclude =
    options.sourceInclude ?? getSourceIncludeByFramework(framework);
  const sourceExclude = options.sourceExclude ?? ["**/*.test.*", "**/*.spec.*"];

  const scanResult = await scanFiles({
    root,
    cssInclude,
    cssExclude,
    sourceInclude,
    sourceExclude,
  });

  const parsed = await parseAll(scanResult);

  const unused = analyzeUnused(
    parsed.cssResult,
    parsed.usedClasses,
    parsed.uncertainClasses,
    safelist,
  );

  return {
    unused,
  };
}
