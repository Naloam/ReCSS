import { readFile } from "node:fs/promises";

import * as cssTree from "css-tree";
import type { Rule } from "postcss";
import scss from "postcss-scss";
import { calculate } from "specificity";

import type { ClassDefinition, CssParseResult } from "../types.js";

type RuleLike = {
  parent?: unknown;
  selector: string;
};

function isModuleStyleFile(filePath: string): boolean {
  return filePath.endsWith(".module.css") || filePath.endsWith(".module.scss");
}

function splitSelectors(selector: string): string[] {
  return selector
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isInSkippedAtRule(rule: Rule): boolean {
  let parent: unknown = rule.parent;

  while (parent && typeof parent === "object") {
    const node = parent as { name?: string; parent?: unknown; type?: string };
    if (node.type === "atrule") {
      const name = (node.name ?? "").toLowerCase();
      if (name === "keyframes" || name === "font-face") {
        return true;
      }
    }
    parent = node.parent;
  }

  return false;
}

function resolveSelectors(rule: RuleLike): string[] {
  const currentSelectors = splitSelectors(rule.selector);
  const parent = rule.parent;

  if (!parent || typeof parent !== "object") {
    return currentSelectors;
  }

  const parentRule = parent as {
    parent?: unknown;
    selector?: string;
    type?: string;
  };
  if (parentRule.type !== "rule" || typeof parentRule.selector !== "string") {
    return currentSelectors;
  }

  const parentSelectors = resolveSelectors({
    parent: parentRule.parent,
    selector: parentRule.selector,
  });

  const resolved: string[] = [];
  for (const parentSelector of parentSelectors) {
    for (const currentSelector of currentSelectors) {
      if (currentSelector.includes("&")) {
        resolved.push(currentSelector.replaceAll("&", parentSelector));
      } else {
        resolved.push(`${parentSelector} ${currentSelector}`);
      }
    }
  }

  return resolved;
}

function extractClassNames(selector: string): string[] {
  try {
    cssTree.parse(selector, { context: "selector" });
  } catch {
    return [];
  }

  const names = new Set<string>();
  const matches = selector.match(/\.([_a-zA-Z]+[_a-zA-Z0-9-]*)/g);
  if (!matches) {
    return [];
  }

  for (const match of matches) {
    names.add(match.slice(1));
  }

  return [...names];
}

function collectDeclarations(rule: Rule): ClassDefinition["declarations"] {
  const declarations: ClassDefinition["declarations"] = [];

  for (const node of rule.nodes ?? []) {
    if (node.type === "decl") {
      declarations.push({
        property: node.prop,
        value: node.value,
        important: Boolean(node.important),
      });
    }
  }

  return declarations;
}

function getSpecificity(selector: string): [number, number, number] {
  try {
    const result = calculate(selector);
    return [result.A, result.B, result.C];
  } catch {
    return [0, 0, 0];
  }
}

function addDefinition(
  map: CssParseResult,
  className: string,
  definition: ClassDefinition,
): void {
  const existing = map.get(className);
  if (existing) {
    existing.push(definition);
    return;
  }

  map.set(className, [definition]);
}

export async function parseCssCode(
  filePath: string,
  sourceCode: string,
): Promise<CssParseResult> {
  const result: CssParseResult = new Map();

  if (isModuleStyleFile(filePath)) {
    return result;
  }

  try {
    const root = scss.parse(sourceCode, { from: filePath });

    root.walkRules((rule) => {
      if (isInSkippedAtRule(rule)) {
        return;
      }

      const resolvedSelectors = resolveSelectors(rule);
      const declarations = collectDeclarations(rule);
      const properties = [
        ...new Set(declarations.map((item) => item.property)),
      ];
      const line = rule.source?.start?.line ?? 0;
      const column = rule.source?.start?.column ?? 0;

      for (const selector of resolvedSelectors) {
        const classNames = extractClassNames(selector);
        if (classNames.length === 0) {
          continue;
        }

        const specificity = getSpecificity(selector);
        for (const className of classNames) {
          addDefinition(result, className, {
            name: className,
            selector,
            file: filePath,
            line,
            column,
            specificity,
            properties,
            declarations,
          });
        }
      }
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[recss] failed to parse CSS file ${filePath}: ${message}`);
    return new Map();
  }
}

export async function parseCssFile(filePath: string): Promise<CssParseResult> {
  try {
    const sourceCode = await readFile(filePath, "utf8");
    return parseCssCode(filePath, sourceCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[recss] failed to read CSS file ${filePath}: ${message}`);
    return new Map();
  }
}

export async function parseCssFiles(
  filePaths: string[],
): Promise<CssParseResult> {
  const entries = await Promise.all(
    filePaths.map((filePath) => parseCssFile(filePath)),
  );
  const merged: CssParseResult = new Map();

  for (const entry of entries) {
    for (const [className, definitions] of entry.entries()) {
      const existing = merged.get(className);
      if (existing) {
        existing.push(...definitions);
      } else {
        merged.set(className, [...definitions]);
      }
    }
  }

  return merged;
}
