import { readFile } from "node:fs/promises";

import { parseExpression } from "@babel/parser";
import { parse } from "@vue/compiler-sfc";

import type { SourceScanResult } from "../types.js";

type BabelNode = {
  [key: string]: unknown;
  end?: number;
  start?: number;
  type: string;
};

function createEmptyResult(): SourceScanResult {
  return {
    used: new Set<string>(),
    uncertain: new Set<string>(),
  };
}

function addClasses(target: Set<string>, value: string): void {
  for (const className of value.split(/\s+/)) {
    const normalized = className.trim();
    if (normalized) {
      target.add(normalized);
    }
  }
}

function getNodeSource(expression: string, node: BabelNode): string {
  if (typeof node.start === "number" && typeof node.end === "number") {
    return expression.slice(node.start, node.end);
  }
  return expression;
}

function isClassBindingDirective(node: unknown): node is {
  arg?: { content?: string };
  exp?: { content?: string };
  name: string;
  type: number;
} {
  if (!node || typeof node !== "object") {
    return false;
  }

  const candidate = node as {
    arg?: { content?: string };
    name?: string;
    type?: number;
  };
  return (
    candidate.type === 7 &&
    candidate.name === "bind" &&
    candidate.arg?.content === "class"
  );
}

function isStaticClassAttribute(node: unknown): node is {
  name: string;
  type: number;
  value?: { content?: string };
} {
  if (!node || typeof node !== "object") {
    return false;
  }

  const candidate = node as { name?: string; type?: number };
  return candidate.type === 6 && candidate.name === "class";
}

function collectFromExpression(
  expression: string,
  node: BabelNode,
  used: Set<string>,
  uncertain: Set<string>,
): void {
  switch (node.type) {
    case "StringLiteral": {
      const value = node.value;
      if (typeof value === "string") {
        addClasses(used, value);
      }
      return;
    }
    case "TemplateLiteral": {
      const quasis = Array.isArray(node.quasis)
        ? (node.quasis as Array<{ value?: { cooked?: string } }>)
        : [];
      for (const quasi of quasis) {
        if (typeof quasi.value?.cooked === "string") {
          addClasses(used, quasi.value.cooked);
        }
      }

      const expressions = Array.isArray(node.expressions)
        ? (node.expressions as BabelNode[])
        : [];
      for (const child of expressions) {
        collectFromExpression(expression, child, used, uncertain);
      }
      return;
    }
    case "ArrayExpression": {
      const elements = Array.isArray(node.elements)
        ? (node.elements as Array<BabelNode | null>)
        : [];
      for (const element of elements) {
        if (element) {
          collectFromExpression(expression, element, used, uncertain);
        }
      }
      return;
    }
    case "ObjectExpression": {
      const properties = Array.isArray(node.properties)
        ? (node.properties as BabelNode[])
        : [];
      for (const property of properties) {
        if (property.type === "ObjectProperty") {
          const key = property.key as BabelNode | undefined;
          const computed = Boolean(property.computed);

          if (!computed && key) {
            if (key.type === "Identifier" && typeof key.name === "string") {
              used.add(key.name);
            } else if (
              key.type === "StringLiteral" &&
              typeof key.value === "string"
            ) {
              addClasses(used, key.value);
            }
          } else if (computed && key) {
            uncertain.add(getNodeSource(expression, key));
          }

          const valueNode = property.value as BabelNode | undefined;
          if (valueNode) {
            collectFromExpression(expression, valueNode, used, uncertain);
          }
        } else if (property.type === "SpreadElement") {
          const argument = property.argument as BabelNode | undefined;
          if (argument) {
            collectFromExpression(expression, argument, used, uncertain);
          }
        }
      }
      return;
    }
    case "ConditionalExpression": {
      const consequent = node.consequent as BabelNode | undefined;
      const alternate = node.alternate as BabelNode | undefined;
      if (consequent) {
        collectFromExpression(expression, consequent, used, uncertain);
      }
      if (alternate) {
        collectFromExpression(expression, alternate, used, uncertain);
      }
      return;
    }
    case "LogicalExpression": {
      const left = node.left as BabelNode | undefined;
      const right = node.right as BabelNode | undefined;
      if (left) {
        collectFromExpression(expression, left, used, uncertain);
      }
      if (right) {
        collectFromExpression(expression, right, used, uncertain);
      }
      return;
    }
    case "Identifier": {
      if (typeof node.name === "string") {
        uncertain.add(node.name);
      }
      return;
    }
    case "MemberExpression":
    case "OptionalMemberExpression":
    case "CallExpression":
    case "OptionalCallExpression": {
      uncertain.add(getNodeSource(expression, node));
      return;
    }
    default: {
      const children = Object.values(node);
      for (const child of children) {
        if (child && typeof child === "object" && "type" in child) {
          collectFromExpression(
            expression,
            child as BabelNode,
            used,
            uncertain,
          );
        } else if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === "object" && "type" in item) {
              collectFromExpression(
                expression,
                item as BabelNode,
                used,
                uncertain,
              );
            }
          }
        }
      }
    }
  }
}

function collectTemplateClasses(
  templateContent: string,
  result: SourceScanResult,
): void {
  const sfc = parse(`<template>${templateContent}</template>`);
  const ast = sfc.descriptor.template?.ast;
  if (!ast) {
    return;
  }

  const stack: Array<{ children?: unknown[]; props?: unknown[] }> = [
    ast as { children?: unknown[] },
  ];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const props = Array.isArray(current.props) ? current.props : [];
    for (const prop of props) {
      if (isStaticClassAttribute(prop)) {
        const value = prop.value?.content;
        if (typeof value === "string") {
          addClasses(result.used, value);
        }
      }

      if (
        isClassBindingDirective(prop) &&
        typeof prop.exp?.content === "string"
      ) {
        try {
          const expressionAst = parseExpression(prop.exp.content, {
            plugins: ["typescript"],
          }) as unknown as BabelNode;
          collectFromExpression(
            prop.exp.content,
            expressionAst,
            result.used,
            result.uncertain,
          );
        } catch {
          result.uncertain.add(prop.exp.content);
        }
      }
    }

    const children = Array.isArray(current.children) ? current.children : [];
    for (const child of children) {
      if (child && typeof child === "object") {
        const candidate = child as {
          branches?: unknown[];
          children?: unknown[];
          props?: unknown[];
        };
        if (Array.isArray(candidate.branches)) {
          for (const branch of candidate.branches) {
            if (branch && typeof branch === "object") {
              stack.push(branch as { children?: unknown[]; props?: unknown[] });
            }
          }
        }
        stack.push(candidate);
      }
    }
  }
}

export function parseVueCode(
  filePath: string,
  sourceCode: string,
): SourceScanResult {
  const result = createEmptyResult();

  try {
    const sfc = parse(sourceCode, { filename: filePath });

    const scriptSetupContent = sfc.descriptor.scriptSetup?.content ?? "";
    if (/\buseCssModule\s*\(/.test(scriptSetupContent)) {
      return result;
    }

    const templateContent = sfc.descriptor.template?.content;
    if (templateContent) {
      collectTemplateClasses(templateContent, result);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[recss] failed to parse Vue file ${filePath}: ${message}`);
    return createEmptyResult();
  }
}

export async function parseVueFile(
  filePath: string,
): Promise<SourceScanResult> {
  try {
    const sourceCode = await readFile(filePath, "utf8");
    return parseVueCode(filePath, sourceCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[recss] failed to read Vue file ${filePath}: ${message}`);
    return createEmptyResult();
  }
}
