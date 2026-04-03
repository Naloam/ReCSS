import { relative } from "node:path";

import type { AnalysisResult, UnusedClass } from "../types.js";
import { getDisplayStats } from "./stats.js";

function colorRed(value: string): string {
  return `\u001b[31m${value}\u001b[39m`;
}

function colorYellow(value: string): string {
  return `\u001b[33m${value}\u001b[39m`;
}

function formatUnusedByFile(root: string, unused: UnusedClass[]): string[] {
  const grouped = new Map<string, UnusedClass[]>();

  for (const item of unused) {
    for (const definition of item.definitions) {
      const fileKey = relative(root, definition.file) || definition.file;
      const existing = grouped.get(fileKey);
      if (existing) {
        existing.push({
          name: item.name,
          definitions: [definition],
        });
      } else {
        grouped.set(fileKey, [
          {
            name: item.name,
            definitions: [definition],
          },
        ]);
      }
    }
  }

  const lines: string[] = [];

  for (const [file, classes] of grouped.entries()) {
    lines.push(file);
    for (const item of classes) {
      const definition = item.definitions[0];
      lines.push(
        `  Line ${String(definition.line).padStart(3)} | .${item.name} (selector: ${definition.selector})`,
      );
    }
    lines.push("");
  }

  if (lines.length === 0) {
    lines.push("No unused classes found.");
  }

  return lines;
}

export function renderConsoleReport(
  root: string,
  result: AnalysisResult,
): string {
  const stats = getDisplayStats(result.unused.stats);

  const summaryLines = [
    "ReCSS Analysis Report",
    "=====================",
    "",
    "Summary",
    "-------",
    `Total CSS classes:     ${stats.totalCssClasses}`,
    `Referenced classes:    ${stats.referencedClasses}`,
    `Used CSS classes:      ${stats.usedCssClasses}`,
    `Unused CSS classes:    ${colorRed(String(stats.unusedClasses))}`,
    `Uncertain references:  ${colorYellow(String(stats.uncertainReferences))}`,
    `Uncertain CSS classes: ${colorYellow(String(stats.uncertainCssClasses))}`,
    `Safelisted classes:    ${stats.safelistedClasses}`,
    "",
    "Unused Classes",
    "--------------",
  ];

  const fileLines = formatUnusedByFile(root, result.unused.unused);

  return [...summaryLines, ...fileLines].join("\n");
}
