import { readFile } from "node:fs/promises";

import { parse as parseBabel, parseExpression } from "@babel/parser";
import { parse } from "@vue/compiler-sfc";

import type { SourceScanResult } from "../types.js";

type BabelNode = {
  [key: string]: unknown;
  end?: number;
  name?: string;
  start?: number;
  type: string;
  value?: unknown;
};

const KNOWN_CLASS_HELPERS = new Set(["clsx", "cn", "classnames"]);
const ARRAY_CLASS_PASSTHROUGH_METHODS = new Set([
  "filter",
  "flat",
  "join",
  "slice",
]);
const ARRAY_CLASS_COMBINE_METHODS = new Set(["concat"]);

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

function walkAst(node: unknown, visit: (node: BabelNode) => void): void {
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

  const astNode = node as BabelNode;
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

function getRequireCallSource(node: BabelNode | undefined): string | undefined {
  if (!node || node.type !== "CallExpression") {
    return undefined;
  }

  const callee = node.callee as BabelNode | undefined;
  const args = Array.isArray(node.arguments) ? (node.arguments as BabelNode[]) : [];
  if (
    callee?.type !== "Identifier" ||
    callee.name !== "require" ||
    args[0]?.type !== "StringLiteral" ||
    typeof args[0].value !== "string"
  ) {
    return undefined;
  }

  return args[0].value;
}

function getMemberPropertyName(node: BabelNode | undefined): string | undefined {
  if (
    !node ||
    (node.type !== "MemberExpression" &&
      node.type !== "OptionalMemberExpression")
  ) {
    return undefined;
  }

  const property = node.property as BabelNode | undefined;
  if (!property) {
    return undefined;
  }

  if (property.type === "Identifier" && typeof property.name === "string") {
    return property.name;
  }

  if (property.type === "StringLiteral" && typeof property.value === "string") {
    return property.value;
  }

  return undefined;
}

function collectImportedClassHelpers(
  importNode: BabelNode,
  helpers: Set<string>,
): void {
  const source = importNode.source as { value?: unknown } | undefined;
  const importSource = typeof source?.value === "string" ? source.value : "";
  const specifiers = Array.isArray(importNode.specifiers)
    ? (importNode.specifiers as BabelNode[])
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

    if (specifier.type !== "ImportSpecifier") {
      continue;
    }

    const imported = specifier.imported as { name?: unknown } | undefined;
    if (
      typeof imported?.name === "string" &&
      KNOWN_CLASS_HELPERS.has(imported.name)
    ) {
      helpers.add(localName);
    }
  }
}

function collectRequiredClassHelpers(
  variableDeclarator: BabelNode,
  helpers: Set<string>,
): void {
  const id = variableDeclarator.id as BabelNode | undefined;
  const init = variableDeclarator.init as BabelNode | undefined;
  if (
    !id ||
    !init ||
    id.type !== "Identifier" ||
    typeof id.name !== "string"
  ) {
    return;
  }

  const requireSource = getRequireCallSource(init);
  if (requireSource === "clsx" || requireSource === "classnames") {
    helpers.add(id.name);
  }
}

function collectClassHelperAliases(
  variableDeclarator: BabelNode,
  helpers: Set<string>,
): void {
  const id = variableDeclarator.id as BabelNode | undefined;
  const init = variableDeclarator.init as BabelNode | undefined;
  if (
    !id ||
    !init ||
    id.type !== "Identifier" ||
    typeof id.name !== "string"
  ) {
    return;
  }

  if (init.type === "Identifier" && helpers.has(init.name ?? "")) {
    helpers.add(id.name);
    return;
  }

  if (init.type !== "CallExpression") {
    return;
  }

  const callee = init.callee as BabelNode | undefined;
  if (!callee || callee.type !== "MemberExpression") {
    return;
  }

  const objectNode = callee.object as BabelNode | undefined;
  if (
    objectNode?.type === "Identifier" &&
    helpers.has(objectNode.name ?? "") &&
    getMemberPropertyName(callee) === "bind"
  ) {
    helpers.add(id.name);
  }
}

function collectClassHelpersFromScript(sourceCode: string): Set<string> {
  const helpers = new Set<string>(KNOWN_CLASS_HELPERS);

  try {
    const ast = parseBabel(sourceCode, {
      sourceType: "module",
      plugins: ["typescript"],
    });

    walkAst(ast, (node) => {
      if (node.type === "ImportDeclaration") {
        collectImportedClassHelpers(node, helpers);
        return;
      }

      if (node.type === "VariableDeclarator") {
        collectRequiredClassHelpers(node, helpers);
        collectClassHelperAliases(node, helpers);
      }
    });
  } catch {
    return helpers;
  }

  return helpers;
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
  classHelpers: Set<string>,
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
        collectFromExpression(expression, child, used, uncertain, classHelpers);
      }
      return;
    }
    case "ArrayExpression": {
      const elements = Array.isArray(node.elements)
        ? (node.elements as Array<BabelNode | null>)
        : [];
      for (const element of elements) {
        if (element) {
          collectFromExpression(
            expression,
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
            collectFromExpression(
              expression,
              valueNode,
              used,
              uncertain,
              classHelpers,
            );
          }
        } else if (property.type === "SpreadElement") {
          const argument = property.argument as BabelNode | undefined;
          if (argument) {
            collectFromExpression(
              expression,
              argument,
              used,
              uncertain,
              classHelpers,
            );
          }
        }
      }
      return;
    }
    case "ConditionalExpression": {
      const consequent = node.consequent as BabelNode | undefined;
      const alternate = node.alternate as BabelNode | undefined;
      if (consequent) {
        collectFromExpression(
          expression,
          consequent,
          used,
          uncertain,
          classHelpers,
        );
      }
      if (alternate) {
        collectFromExpression(
          expression,
          alternate,
          used,
          uncertain,
          classHelpers,
        );
      }
      return;
    }
    case "LogicalExpression": {
      const left = node.left as BabelNode | undefined;
      const right = node.right as BabelNode | undefined;
      if (left) {
        collectFromExpression(expression, left, used, uncertain, classHelpers);
      }
      if (right) {
        collectFromExpression(expression, right, used, uncertain, classHelpers);
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
    case "OptionalMemberExpression": {
      uncertain.add(getNodeSource(expression, node));
      return;
    }
    case "CallExpression":
    case "OptionalCallExpression": {
      const callee = node.callee as BabelNode | undefined;
      if (
        callee?.type === "Identifier" &&
        typeof callee.name === "string" &&
        classHelpers.has(callee.name)
      ) {
        const args = Array.isArray(node.arguments)
          ? (node.arguments as Array<BabelNode | null>)
          : [];
        for (const arg of args) {
          if (arg && arg.type !== "SpreadElement") {
            collectFromExpression(
              expression,
              arg,
              used,
              uncertain,
              classHelpers,
            );
          }
        }
        return;
      }

      if (
        collectFromArrayClassCall(
          expression,
          node,
          used,
          uncertain,
          classHelpers,
        )
      ) {
        return;
      }

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
              classHelpers,
            );
          } else if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === "object" && "type" in item) {
                collectFromExpression(
                  expression,
                  item as BabelNode,
                  used,
                  uncertain,
                  classHelpers,
                );
              }
            }
        }
      }
    }
  }
}

function collectFromArrayClassCall(
  expression: string,
  node: BabelNode,
  used: Set<string>,
  uncertain: Set<string>,
  classHelpers: Set<string>,
): boolean {
  const callee = node.callee as BabelNode | undefined;
  if (
    !callee ||
    (callee.type !== "MemberExpression" &&
      callee.type !== "OptionalMemberExpression")
  ) {
    return false;
  }

  const methodName = getMemberPropertyName(callee);
  const objectNode = callee.object as BabelNode | undefined;
  if (!methodName || !objectNode) {
    return false;
  }

  if (ARRAY_CLASS_PASSTHROUGH_METHODS.has(methodName)) {
    collectFromExpression(expression, objectNode, used, uncertain, classHelpers);
    return true;
  }

  if (!ARRAY_CLASS_COMBINE_METHODS.has(methodName)) {
    return false;
  }

  collectFromExpression(expression, objectNode, used, uncertain, classHelpers);

  const args = Array.isArray(node.arguments)
    ? (node.arguments as Array<BabelNode | null>)
    : [];
  for (const arg of args) {
    if (arg && arg.type !== "SpreadElement") {
      collectFromExpression(expression, arg, used, uncertain, classHelpers);
    }
  }

  return true;
}

function collectTemplateClasses(
  templateContent: string,
  result: SourceScanResult,
  classHelpers: Set<string>,
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
            classHelpers,
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

    if (
      Array.isArray(sfc.descriptor.styles) &&
      sfc.descriptor.styles.some((styleBlock) => Boolean(styleBlock?.module))
    ) {
      return result;
    }

    const scriptContents = [
      sfc.descriptor.script?.content,
      sfc.descriptor.scriptSetup?.content,
    ].filter((value): value is string => typeof value === "string");
    if (scriptContents.some((content) => /\buseCssModule\s*\(/.test(content))) {
      return result;
    }

    const classHelpers = new Set<string>(KNOWN_CLASS_HELPERS);
    for (const scriptContent of scriptContents) {
      for (const helper of collectClassHelpersFromScript(scriptContent)) {
        classHelpers.add(helper);
      }
    }

    const templateContent = sfc.descriptor.template?.content;
    if (templateContent) {
      collectTemplateClasses(templateContent, result, classHelpers);
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
