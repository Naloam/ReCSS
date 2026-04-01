import { parseCssFiles } from "./css-parser.js";
import { parseHtmlFile } from "./html-parser.js";
import { parseJsxFile } from "./jsx-parser.js";
import { parseVueFile } from "./vue-parser.js";

import type { ParseAllResult, ScanResult, SourceScanResult } from "../types.js";

function mergeSourceScanResults(results: SourceScanResult[]): {
  usedClasses: Set<string>;
  uncertainClasses: Set<string>;
} {
  const usedClasses = new Set<string>();
  const uncertainClasses = new Set<string>();

  for (const result of results) {
    for (const className of result.used) {
      usedClasses.add(className);
    }

    for (const className of result.uncertain) {
      uncertainClasses.add(className);
    }
  }

  return {
    usedClasses,
    uncertainClasses,
  };
}

export async function parseAll(
  scanResult: ScanResult,
): Promise<ParseAllResult> {
  const sourceTasks: Array<Promise<SourceScanResult>> = [];

  for (const filePath of scanResult.vueFiles) {
    sourceTasks.push(parseVueFile(filePath));
  }

  for (const filePath of scanResult.jsxFiles) {
    sourceTasks.push(parseJsxFile(filePath));
  }

  for (const filePath of scanResult.htmlFiles) {
    sourceTasks.push(parseHtmlFile(filePath));
  }

  const [cssResult, sourceResults] = await Promise.all([
    parseCssFiles(scanResult.cssFiles),
    Promise.all(sourceTasks),
  ]);

  const merged = mergeSourceScanResults(sourceResults);

  return {
    cssResult,
    usedClasses: merged.usedClasses,
    uncertainClasses: merged.uncertainClasses,
  };
}
