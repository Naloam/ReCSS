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
const DOM_CLASS_LIST_METHODS = new Set([
  "add",
  "remove",
  "toggle",
  "contains",
  "replace",
]);
const ARRAY_CLASS_PASSTHROUGH_METHODS = new Set([
  "filter",
  "flat",
  "join",
  "slice",
]);
const ARRAY_CLASS_COMBINE_METHODS = new Set(["concat"]);
const REACT_FACTORY_METHODS = new Set(["createElement", "cloneElement"]);

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

function getStaticName(node: AstNode | undefined): string | undefined {
  if (!node) {
    return undefined;
  }

  if (node.type === "Identifier" && typeof node.name === "string") {
    return node.name;
  }

  if (node.type === "StringLiteral" && typeof node.value === "string") {
    return node.value;
  }

  return undefined;
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

function collectReactImportBindings(
  importNode: AstNode,
  reactNamespaces: Set<string>,
  reactFactories: Set<string>,
): void {
  const source = importNode.source as { value?: unknown } | undefined;
  const importSource = typeof source?.value === "string" ? source.value : "";
  if (importSource !== "react") {
    return;
  }

  const specifiers = Array.isArray(importNode.specifiers)
    ? (importNode.specifiers as AstNode[])
    : [];

  for (const specifier of specifiers) {
    const local = specifier.local as { name?: unknown } | undefined;
    const localName = typeof local?.name === "string" ? local.name : undefined;
    if (!localName) {
      continue;
    }

    if (
      specifier.type === "ImportDefaultSpecifier" ||
      specifier.type === "ImportNamespaceSpecifier"
    ) {
      reactNamespaces.add(localName);
      continue;
    }

    if (specifier.type !== "ImportSpecifier") {
      continue;
    }

    const importedName = getStaticName(
      specifier.imported as AstNode | undefined,
    );
    if (importedName && REACT_FACTORY_METHODS.has(importedName)) {
      reactFactories.add(localName);
    }
  }
}

function collectRequireClassHelper(
  variableDeclarator: AstNode,
  helpers: Set<string>,
): void {
  const id = variableDeclarator.id as AstNode | undefined;
  const init = variableDeclarator.init as AstNode | undefined;
  if (!id || !init || id.type !== "Identifier") {
    return;
  }

  const requireSource = getRequireCallSource(init);
  if (requireSource === "clsx" || requireSource === "classnames") {
    helpers.add(id.name ?? "");
  }
}

function getRequireCallSource(node: AstNode | undefined): string | undefined {
  if (!node || node.type !== "CallExpression") {
    return undefined;
  }

  const callee = node.callee as AstNode | undefined;
  const args = Array.isArray(node.arguments) ? (node.arguments as AstNode[]) : [];
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

function collectClassHelperAliases(
  variableDeclarator: AstNode,
  helpers: Set<string>,
): void {
  const id = variableDeclarator.id as AstNode | undefined;
  const init = variableDeclarator.init as AstNode | undefined;
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

  const callee = init.callee as AstNode | undefined;
  if (!callee || callee.type !== "MemberExpression") {
    return;
  }

  const objectNode = callee.object as AstNode | undefined;
  if (
    objectNode?.type === "Identifier" &&
    helpers.has(objectNode.name ?? "") &&
    getMemberPropertyName(callee) === "bind"
  ) {
    helpers.add(id.name);
  }
}

function getObjectPatternBindingName(property: AstNode): string | undefined {
  if (property.type !== "ObjectProperty") {
    return undefined;
  }

  const valueNode = property.value as AstNode | undefined;
  if (!valueNode) {
    return undefined;
  }

  if (valueNode.type === "Identifier" && typeof valueNode.name === "string") {
    return valueNode.name;
  }

  if (valueNode.type !== "AssignmentPattern") {
    return undefined;
  }

  const leftNode = valueNode.left as AstNode | undefined;
  return leftNode?.type === "Identifier" && typeof leftNode.name === "string"
    ? leftNode.name
    : undefined;
}

function collectReactRequireBindings(
  variableDeclarator: AstNode,
  reactNamespaces: Set<string>,
  reactFactories: Set<string>,
): void {
  const init = variableDeclarator.init as AstNode | undefined;
  if (getRequireCallSource(init) !== "react") {
    return;
  }

  const id = variableDeclarator.id as AstNode | undefined;
  if (!id) {
    return;
  }

  if (id.type === "Identifier" && typeof id.name === "string") {
    reactNamespaces.add(id.name);
    return;
  }

  if (id.type !== "ObjectPattern") {
    return;
  }

  const properties = Array.isArray(id.properties)
    ? (id.properties as AstNode[])
    : [];
  for (const property of properties) {
    if (Boolean(property.computed)) {
      continue;
    }

    const importedName = getStaticName(property.key as AstNode | undefined);
    const localName = getObjectPatternBindingName(property);
    if (
      importedName &&
      localName &&
      REACT_FACTORY_METHODS.has(importedName)
    ) {
      reactFactories.add(localName);
    }
  }
}

function collectReactAliasBindings(
  variableDeclarator: AstNode,
  reactNamespaces: Set<string>,
  reactFactories: Set<string>,
): void {
  const id = variableDeclarator.id as AstNode | undefined;
  const init = variableDeclarator.init as AstNode | undefined;
  if (!id || !init) {
    return;
  }

  if (id.type === "Identifier" && typeof id.name === "string") {
    if (init.type === "Identifier") {
      if (reactNamespaces.has(init.name ?? "")) {
        reactNamespaces.add(id.name);
        return;
      }

      if (reactFactories.has(init.name ?? "")) {
        reactFactories.add(id.name);
      }
      return;
    }

    if (init.type !== "MemberExpression") {
      return;
    }

    const objectNode = init.object as AstNode | undefined;
    const propertyName = getMemberPropertyName(init);
    if (
      objectNode?.type === "Identifier" &&
      reactNamespaces.has(objectNode.name ?? "") &&
      REACT_FACTORY_METHODS.has(propertyName ?? "")
    ) {
      reactFactories.add(id.name);
    }
    return;
  }

  if (id.type !== "ObjectPattern" || init.type !== "Identifier") {
    return;
  }

  if (!reactNamespaces.has(init.name ?? "")) {
    return;
  }

  const properties = Array.isArray(id.properties)
    ? (id.properties as AstNode[])
    : [];
  for (const property of properties) {
    if (Boolean(property.computed)) {
      continue;
    }

    const importedName = getStaticName(property.key as AstNode | undefined);
    const localName = getObjectPatternBindingName(property);
    if (
      importedName &&
      localName &&
      REACT_FACTORY_METHODS.has(importedName)
    ) {
      reactFactories.add(localName);
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
    case "CallExpression":
    case "OptionalCallExpression": {
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

      if (
        collectFromArrayClassCall(
          sourceCode,
          expression,
          used,
          uncertain,
          classHelpers,
        )
      ) {
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

function getMemberPropertyName(node: AstNode | undefined): string | undefined {
  if (
    !node ||
    (node.type !== "MemberExpression" &&
      node.type !== "OptionalMemberExpression")
  ) {
    return undefined;
  }

  const property = node.property as AstNode | undefined;
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

function isClassListAccess(node: AstNode | undefined): boolean {
  return getMemberPropertyName(node) === "classList";
}

function collectFromArrayClassCall(
  sourceCode: string,
  callNode: AstNode,
  used: Set<string>,
  uncertain: Set<string>,
  classHelpers: Set<string>,
): boolean {
  const callee = callNode.callee as AstNode | undefined;
  if (
    !callee ||
    (callee.type !== "MemberExpression" &&
      callee.type !== "OptionalMemberExpression")
  ) {
    return false;
  }

  const methodName = getMemberPropertyName(callee);
  const objectNode = callee.object as AstNode | undefined;
  if (!methodName || !objectNode) {
    return false;
  }

  if (ARRAY_CLASS_PASSTHROUGH_METHODS.has(methodName)) {
    collectExpressionClasses(
      sourceCode,
      objectNode,
      used,
      uncertain,
      classHelpers,
    );
    return true;
  }

  if (!ARRAY_CLASS_COMBINE_METHODS.has(methodName)) {
    return false;
  }

  collectExpressionClasses(
    sourceCode,
    objectNode,
    used,
    uncertain,
    classHelpers,
  );

  const args = Array.isArray(callNode.arguments)
    ? (callNode.arguments as Array<AstNode | null>)
    : [];
  for (const arg of args) {
    if (arg && arg.type !== "SpreadElement") {
      collectExpressionClasses(
        sourceCode,
        arg,
        used,
        uncertain,
        classHelpers,
      );
    }
  }

  return true;
}

function collectFromDomClassCall(
  sourceCode: string,
  callNode: AstNode,
  used: Set<string>,
  uncertain: Set<string>,
  classHelpers: Set<string>,
): void {
  const callee = callNode.callee as AstNode | undefined;
  if (
    !callee ||
    (callee.type !== "MemberExpression" &&
      callee.type !== "OptionalMemberExpression")
  ) {
    return;
  }

  const methodName = getMemberPropertyName(callee);
  if (!methodName) {
    return;
  }

  const args = Array.isArray(callNode.arguments)
    ? (callNode.arguments as Array<AstNode | null>)
    : [];

  if (DOM_CLASS_LIST_METHODS.has(methodName) && isClassListAccess(callee.object as AstNode | undefined)) {
    const relevantArgs =
      methodName === "replace" ? args.slice(0, 2) : args;

    for (const arg of relevantArgs) {
      if (arg && arg.type !== "SpreadElement") {
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

  if (methodName !== "setAttribute" || args.length < 2) {
    return;
  }

  const nameArg = args[0];
  const valueArg = args[1];
  if (
    !nameArg ||
    nameArg.type !== "StringLiteral" ||
    (nameArg.value !== "class" && nameArg.value !== "className") ||
    !valueArg ||
    valueArg.type === "SpreadElement"
  ) {
    return;
  }

  collectExpressionClasses(
    sourceCode,
    valueArg,
    used,
    uncertain,
    classHelpers,
  );
}

function collectFromDomClassAssignment(
  sourceCode: string,
  assignmentNode: AstNode,
  used: Set<string>,
  uncertain: Set<string>,
  classHelpers: Set<string>,
): void {
  const left = assignmentNode.left as AstNode | undefined;
  const right = assignmentNode.right as AstNode | undefined;
  if (!left || left.type !== "MemberExpression" || !right) {
    return;
  }

  if (getMemberPropertyName(left) !== "className") {
    return;
  }

  collectExpressionClasses(sourceCode, right, used, uncertain, classHelpers);
}

function isReactFactoryCall(
  callNode: AstNode,
  reactNamespaces: Set<string>,
  reactFactories: Set<string>,
): boolean {
  const callee = callNode.callee as AstNode | undefined;
  if (!callee) {
    return false;
  }

  if (callee.type === "Identifier") {
    return reactFactories.has(callee.name ?? "");
  }

  if (
    callee.type !== "MemberExpression" &&
    callee.type !== "OptionalMemberExpression"
  ) {
    return false;
  }

  const objectNode = callee.object as AstNode | undefined;
  return (
    objectNode?.type === "Identifier" &&
    reactNamespaces.has(objectNode.name ?? "") &&
    REACT_FACTORY_METHODS.has(getMemberPropertyName(callee) ?? "")
  );
}

function collectFromReactPropsObject(
  sourceCode: string,
  objectNode: AstNode,
  used: Set<string>,
  uncertain: Set<string>,
  classHelpers: Set<string>,
): void {
  const properties = Array.isArray(objectNode.properties)
    ? (objectNode.properties as AstNode[])
    : [];

  for (const property of properties) {
    if (property.type !== "ObjectProperty" || Boolean(property.computed)) {
      continue;
    }

    const key = property.key as AstNode | undefined;
    const value = property.value as AstNode | undefined;
    if (!key || !value) {
      continue;
    }

    const propertyName =
      key.type === "Identifier"
        ? key.name
        : key.type === "StringLiteral" && typeof key.value === "string"
          ? key.value
          : undefined;
    if (propertyName !== "className") {
      continue;
    }

    collectExpressionClasses(
      sourceCode,
      value,
      used,
      uncertain,
      classHelpers,
    );
  }
}

function collectFromReactFactoryCall(
  sourceCode: string,
  callNode: AstNode,
  used: Set<string>,
  uncertain: Set<string>,
  classHelpers: Set<string>,
  reactNamespaces: Set<string>,
  reactFactories: Set<string>,
): void {
  if (!isReactFactoryCall(callNode, reactNamespaces, reactFactories)) {
    return;
  }

  const args = Array.isArray(callNode.arguments)
    ? (callNode.arguments as AstNode[])
    : [];
  const propsArg = args[1];
  if (!propsArg || propsArg.type !== "ObjectExpression") {
    return;
  }

  collectFromReactPropsObject(
    sourceCode,
    propsArg,
    used,
    uncertain,
    classHelpers,
  );
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
    const reactNamespaces = new Set<string>(["React"]);
    const reactFactories = new Set<string>();

    walkAst(ast, (node) => {
      if (node.type === "ImportDeclaration") {
        collectClassHelpers(node, classHelpers);
        collectReactImportBindings(node, reactNamespaces, reactFactories);
      }

      if (node.type === "VariableDeclarator") {
        collectRequireClassHelper(node, classHelpers);
        collectClassHelperAliases(node, classHelpers);
        collectReactRequireBindings(node, reactNamespaces, reactFactories);
        collectReactAliasBindings(node, reactNamespaces, reactFactories);
      }

      if (
        node.type === "CallExpression" ||
        node.type === "OptionalCallExpression"
      ) {
        collectFromDomClassCall(
          sourceCode,
          node,
          result.used,
          result.uncertain,
          classHelpers,
        );
        collectFromReactFactoryCall(
          sourceCode,
          node,
          result.used,
          result.uncertain,
          classHelpers,
          reactNamespaces,
          reactFactories,
        );
      }

      if (node.type === "AssignmentExpression") {
        collectFromDomClassAssignment(
          sourceCode,
          node,
          result.used,
          result.uncertain,
          classHelpers,
        );
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
