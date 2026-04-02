import { relative } from "node:path";

import type { AnalysisResult } from "../types.js";

export function renderMarkdownReport(
  root: string,
  result: AnalysisResult,
): string {
  const { stats, unused } = result.unused;

  const lines: string[] = [
    "# ReCSS Analysis Report",
    "",
    "## Summary",
    "",
    `- Total CSS classes: ${stats.totalCssClasses}`,
    `- Used classes: ${stats.usedClasses}`,
    `- Unused classes: ${stats.unusedClasses}`,
    `- Uncertain (skipped): ${stats.uncertainClasses}`,
    `- Safelisted (skipped): ${stats.safelistedClasses}`,
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
