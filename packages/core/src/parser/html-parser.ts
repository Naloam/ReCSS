import { readFile } from "node:fs/promises";

import { parse } from "node-html-parser";

import type { SourceScanResult } from "../types.js";

function createEmptyResult(): SourceScanResult {
  return {
    used: new Set<string>(),
    uncertain: new Set<string>(),
  };
}

function addClasses(target: Set<string>, classValue: string): void {
  for (const className of classValue.split(/\s+/)) {
    const normalized = className.trim();
    if (normalized.length > 0) {
      target.add(normalized);
    }
  }
}

export function parseHtmlCode(sourceCode: string): SourceScanResult {
  const result = createEmptyResult();

  try {
    const root = parse(sourceCode);
    const nodes = root.querySelectorAll("[class]");

    for (const node of nodes) {
      const value = node.getAttribute("class");
      if (typeof value === "string") {
        addClasses(result.used, value);
      }
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[recss] failed to parse HTML source: ${message}`);
    return createEmptyResult();
  }
}

export async function parseHtmlFile(
  filePath: string,
): Promise<SourceScanResult> {
  try {
    const sourceCode = await readFile(filePath, "utf8");
    return parseHtmlCode(sourceCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[recss] failed to read HTML file ${filePath}: ${message}`);
    return createEmptyResult();
  }
}
