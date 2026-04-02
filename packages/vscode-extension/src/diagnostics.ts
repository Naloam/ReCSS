import { readFile } from "node:fs/promises";

import type { AnalysisResult, ClassDefinition } from "@recss/core";

export const RECSS_DIAGNOSTIC_CODE = "unused-class";

export type DiagnosticRecord = {
  className: string;
  code: typeof RECSS_DIAGNOSTIC_CODE;
  endColumn: number;
  file: string;
  line: number;
  message: string;
  selector: string;
  source: "recss";
  startColumn: number;
};

type RangeLike = {
  endColumn: number;
  line: number;
  startColumn: number;
};

export function buildDiagnosticMessage(className: string): string {
  return `Unused CSS class ".${className}" is not referenced in scanned source files.`;
}

export function resolveDefinitionRange(
  content: string,
  definition: Pick<ClassDefinition, "column" | "line" | "name" | "selector">,
): RangeLike {
  const lines = content.length > 0 ? content.split(/\r?\n/u) : [""];
  const lineIndex = Math.max(0, definition.line - 1);
  const lineText = lines[lineIndex] ?? "";
  const fallbackStart = clamp(definition.column - 1, 0, lineText.length);
  const marker = `.${definition.name}`;

  const exactMatchFromColumn = lineText.indexOf(marker, fallbackStart);
  const exactMatchAnywhere =
    exactMatchFromColumn >= 0 ? exactMatchFromColumn : lineText.indexOf(marker);
  const startColumn =
    exactMatchAnywhere >= 0 ? exactMatchAnywhere : fallbackStart;
  const fallbackWidth = Math.max(marker.length, definition.selector.length, 1);
  const endColumn = clamp(
    startColumn + (exactMatchAnywhere >= 0 ? marker.length : fallbackWidth),
    startColumn + 1,
    Math.max(lineText.length, startColumn + 1),
  );

  return {
    line: lineIndex,
    startColumn,
    endColumn,
  };
}

export async function createDiagnosticRecords(
  result: AnalysisResult,
): Promise<Map<string, DiagnosticRecord[]>> {
  const definitions = result.unused.unused.flatMap((item) =>
    item.definitions.map((definition) => ({
      className: item.name,
      definition,
    })),
  );
  const uniqueFiles = [...new Set(definitions.map((item) => item.definition.file))];
  const contents = new Map(
    await Promise.all(
      uniqueFiles.map(async (file) => [file, await loadFileContent(file)] as const),
    ),
  );
  const diagnosticsByFile = new Map<string, DiagnosticRecord[]>();

  for (const item of definitions) {
    const content = contents.get(item.definition.file) ?? "";
    const range = resolveDefinitionRange(content, item.definition);
    const records = diagnosticsByFile.get(item.definition.file) ?? [];

    records.push({
      className: item.className,
      code: RECSS_DIAGNOSTIC_CODE,
      file: item.definition.file,
      line: range.line,
      startColumn: range.startColumn,
      endColumn: range.endColumn,
      message: buildDiagnosticMessage(item.className),
      selector: item.definition.selector,
      source: "recss",
    });

    diagnosticsByFile.set(item.definition.file, records);
  }

  return diagnosticsByFile;
}

async function loadFileContent(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return "";
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
