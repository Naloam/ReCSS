import { readFile } from "node:fs/promises";

import { parse } from "@babel/parser";

import type { SourceScanResult } from "../types.js";

type AstNode = {
  [key: string]: unknown;
  end?: number;
  name?: string;
  start?: number;
  type: string;
};

const KNOWN_CLASS_HELPERS = new Set(["clsx", "cn", "classnames"]);

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

function getNodeSource(source: string, node: AstNode): string {
  if (typeof node.start === "number" && typeof node.end === "number") {
    return source.slice(node.start, node.end);
  }
  return source;
}

function walkAst(node: unknown, visit: (node: AstNode) => void): void {
  if (!node || typeof node !== "object") {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      walkAst(item, visit);
    }
    return;
  }

  if (!("type" in node)) {
    return;
  }

  const astNode = node as AstNode;
  visit(astNode);

  for (const value of Object.values(astNode)) {
    if (!value || typeof value !== "object") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const child of value) {
        walkAst(child, visit);
      }
      continue;
    }

    walkAst(value, visit);
  }
}

function collectClassHelpers(importNode: AstNode, helpers: Set<string>): void {
  const source = importNode.source as { value?: unknown } | undefined;
  const importSource = typeof source?.value === "string" ? source.value : "";
  const specifiers = Array.isArray(importNode.specifiers)
    ? (importNode.specifiers as AstNode[])
    : [];

  for (const specifier of specifiers) {
    const local = specifier.local as { name?: unknown } | undefined;
    const localName = typeof local?.name === "string" ? local.name : undefined;
    if (!localName) {
      continue;
    }

    if (KNOWN_CLASS_HELPERS.has(localName)) {
      helpers.add(localName);
    }

    if (
      specifier.type === "ImportDefaultSpecifier" &&
      (importSource === "clsx" || importSource === "classnames")
    ) {
      helpers.add(localName);
    }

    if (specifier.type === "ImportSpecifier") {
      const imported = specifier.imported as { name?: unknown } | undefined;
      if (
        typeof imported?.name === "string" &&
        KNOWN_CLASS_HELPERS.has(imported.name)
      ) {
        helpers.add(localName);
      }
    }
  }
}

function collectFromObjectExpression(
  objectNode: AstNode,
  used: Set<string>,
): void {
  const properties = Array.isArray(objectNode.properties)
    ? (objectNode.properties as AstNode[])
    : [];

  for (const property of properties) {
    if (property.type !== "ObjectProperty") {
      continue;
    }

    const computed = Boolean(property.computed);
    if (computed) {
      continue;
    }

    const key = property.key as AstNode | undefined;
    if (!key) {
      continue;
    }

    if (key.type === "Identifier" && typeof key.name === "string") {
      used.add(key.name);
    }

    if (key.type === "StringLiteral" && typeof key.value === "string") {
      addClasses(used, key.value);
    }
  }
}

function collectExpressionClasses(
  sourceCode: string,
  expression: AstNode,
  used: Set<string>,
  uncertain: Set<string>,
  classHelpers: Set<string>,
): void {
  switch (expression.type) {
    case "StringLiteral": {
      if (typeof expression.value === "string") {
        addClasses(used, expression.value);
      }
      return;
    }
    case "TemplateLiteral": {
      const quasis = Array.isArray(expression.quasis)
        ? (expression.quasis as AstNode[])
        : [];
      for (const quasi of quasis) {
        const value = quasi.value as { cooked?: unknown } | undefined;
        if (typeof value?.cooked === "string") {
          addClasses(used, value.cooked);
        }
      }

      const nestedExpressions = Array.isArray(expression.expressions)
        ? (expression.expressions as AstNode[])
        : [];
      for (const nestedExpression of nestedExpressions) {
        collectExpressionClasses(
          sourceCode,
          nestedExpression,
          used,
          uncertain,
          classHelpers,
        );
      }
      return;
    }
    case "ConditionalExpression": {
      const consequent = expression.consequent as AstNode | undefined;
      const alternate = expression.alternate as AstNode | undefined;
      if (consequent) {
        collectExpressionClasses(
          sourceCode,
          consequent,
          used,
          uncertain,
          classHelpers,
        );
      }
      if (alternate) {
        collectExpressionClasses(
          sourceCode,
          alternate,
          used,
          uncertain,
          classHelpers,
        );
      }
      return;
    }
    case "LogicalExpression": {
      const left = expression.left as AstNode | undefined;
      const right = expression.right as AstNode | undefined;
      if (left) {
        collectExpressionClasses(
          sourceCode,
          left,
          used,
          uncertain,
          classHelpers,
        );
      }
      if (right) {
        collectExpressionClasses(
          sourceCode,
          right,
          used,
          uncertain,
          classHelpers,
        );
      }
      return;
    }
    case "ArrayExpression": {
      const elements = Array.isArray(expression.elements)
        ? (expression.elements as Array<AstNode | null>)
        : [];
      for (const element of elements) {
        if (element && element.type !== "SpreadElement") {
          collectExpressionClasses(
            sourceCode,
            element,
            used,
            uncertain,
            classHelpers,
          );
        }
      }
      return;
    }
    case "ObjectExpression": {
      collectFromObjectExpression(expression, used);
      return;
    }
    case "CallExpression": {
      const callee = expression.callee as AstNode | undefined;
      if (
        callee?.type === "Identifier" &&
        typeof callee.name === "string" &&
        classHelpers.has(callee.name)
      ) {
        const args = Array.isArray(expression.arguments)
          ? (expression.arguments as AstNode[])
          : [];
        for (const arg of args) {
          if (arg.type !== "SpreadElement") {
            collectExpressionClasses(
              sourceCode,
              arg,
              used,
              uncertain,
              classHelpers,
            );
          }
        }
        return;
      }

      uncertain.add(getNodeSource(sourceCode, expression));
      return;
    }
    case "MemberExpression": {
      const objectNode = expression.object as AstNode | undefined;
      if (objectNode?.type === "Identifier" && objectNode.name === "styles") {
        return;
      }
      uncertain.add(getNodeSource(sourceCode, expression));
      return;
    }
    case "Identifier": {
      if (typeof expression.name === "string") {
        uncertain.add(expression.name);
      }
      return;
    }
    case "TSAsExpression":
    case "TSTypeAssertion": {
      const inner = expression.expression as AstNode | undefined;
      if (inner) {
        collectExpressionClasses(
          sourceCode,
          inner,
          used,
          uncertain,
          classHelpers,
        );
      }
      return;
    }
    default: {
      uncertain.add(getNodeSource(sourceCode, expression));
    }
  }
}

function collectFromClassNameAttribute(
  sourceCode: string,
  attributeNode: AstNode,
  used: Set<string>,
  uncertain: Set<string>,
  classHelpers: Set<string>,
): void {
  const valueNode = attributeNode.value as AstNode | undefined;
  if (!valueNode) {
    return;
  }

  if (
    valueNode.type === "StringLiteral" &&
    typeof valueNode.value === "string"
  ) {
    addClasses(used, valueNode.value);
    return;
  }

  if (valueNode.type !== "JSXExpressionContainer") {
    return;
  }

  const expressionNode = valueNode.expression as AstNode | undefined;
  if (!expressionNode || expressionNode.type === "JSXEmptyExpression") {
    return;
  }

  collectExpressionClasses(
    sourceCode,
    expressionNode,
    used,
    uncertain,
    classHelpers,
  );
}

export function parseJsxCode(
  filePath: string,
  sourceCode: string,
): SourceScanResult {
  const result = createEmptyResult();

  try {
    const ast = parse(sourceCode, {
      sourceType: "module",
      sourceFilename: filePath,
      plugins: ["typescript", "jsx"],
    }) as unknown as AstNode;

    const classHelpers = new Set<string>(KNOWN_CLASS_HELPERS);

    walkAst(ast, (node) => {
      if (node.type === "ImportDeclaration") {
        collectClassHelpers(node, classHelpers);
      }

      if (node.type === "JSXAttribute") {
        const nameNode = node.name as AstNode | undefined;
        if (
          nameNode?.type === "JSXIdentifier" &&
          nameNode.name === "className"
        ) {
          collectFromClassNameAttribute(
            sourceCode,
            node,
            result.used,
            result.uncertain,
            classHelpers,
          );
        }
      }
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[recss] failed to parse JSX file ${filePath}: ${message}`);
    return createEmptyResult();
  }
}

export async function parseJsxFile(
  filePath: string,
): Promise<SourceScanResult> {
  try {
    const sourceCode = await readFile(filePath, "utf8");
    return parseJsxCode(filePath, sourceCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[recss] failed to read JSX file ${filePath}: ${message}`);
    return createEmptyResult();
  }
}
