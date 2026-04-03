import { relative } from "node:path";

import type { AnalysisResult } from "../types.js";
import { getDisplayStats } from "./stats.js";

export function renderMarkdownReport(
  root: string,
  result: AnalysisResult,
): string {
  const { unused } = result.unused;
  const stats = getDisplayStats(result.unused.stats);

  const lines: string[] = [
    "# ReCSS Analysis Report",
    "",
    "## Summary",
    "",
    `- Total CSS classes: ${stats.totalCssClasses}`,
    `- Referenced classes: ${stats.referencedClasses}`,
    `- Used CSS classes: ${stats.usedCssClasses}`,
    `- Unused CSS classes: ${stats.unusedClasses}`,
    `- Uncertain references: ${stats.uncertainReferences}`,
    `- Uncertain CSS classes: ${stats.uncertainCssClasses}`,
    `- Safelisted classes: ${stats.safelistedClasses}`,
    "",
    "## Unused Classes",
    "",
  ];

  if (unused.length === 0) {
    lines.push("No unused classes found.");
    return lines.join("\n");
  }

  lines.push(
    "| File | Line | Class | Selector |",
    "| --- | ---: | --- | --- |",
  );

  for (const item of unused) {
    for (const definition of item.definitions) {
      const file = relative(root, definition.file) || definition.file;
      lines.push(
        `| ${file} | ${definition.line} | .${item.name} | ${definition.selector} |`,
      );
    }
  }

  return lines.join("\n");
}
