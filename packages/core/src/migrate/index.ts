import { copyFile, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";

import { parse as parseBabel, parseExpression } from "@babel/parser";
import { parse as parseVueSfc } from "@vue/compiler-sfc";
import * as cssTree from "css-tree";
import scss from "postcss-scss";

import { shouldSkipGeneratedDirectory } from "../generated-dirs.js";
import type { MigrationSuggestion } from "../types.js";

const STYLE_EXTENSIONS = new Set([".css", ".scss"]);
const KNOWN_CLASS_HELPERS = new Set(["clsx", "cn", "classnames"]);
const REACT_SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".tsx"]);
const SOURCE_EXTENSIONS = new Set([
  ".vue",
  ".tsx",
  ".jsx",
  ".ts",
  ".js",
  ".html",
]);

type ReactAstNode = {
  [key: string]: unknown;
  end?: number;
  name?: string;
  start?: number;
  type: string;
};

type Replacement = {
  end: number;
  start: number;
  value: string;
};

type RewriteResult = {
  changed: boolean;
  code: string;
};

type ReactExpressionKind =
  | "array"
  | "call"
  | "member"
  | "other"
  | "string"
  | "template";

function isModuleStyleFile(path: string): boolean {
  return path.endsWith(".module.css") || path.endsWith(".module.scss");
}

type StyleRuleLike = {
  parent?: unknown;
  selector: string;
};

export async function collectStyleFiles(directory: string): Promise<string[]> {
  const queue: string[] = [directory];
  const files: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipGeneratedDirectory(entry.name)) {
          queue.push(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = extname(entry.name);
      if (!STYLE_EXTENSIONS.has(extension) || isModuleStyleFile(entry.name)) {
        continue;
      }

      files.push(fullPath);
    }
  }

  return files;
}

function splitSelectors(selector: string): string[] {
  return selector
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function resolveStyleSelectors(rule: StyleRuleLike): string[] {
  const currentSelectors = splitSelectors(rule.selector);
  const parent = rule.parent;

  if (!parent || typeof parent !== "object") {
    return currentSelectors;
  }

  const parentRule = parent as StyleRuleLike & {
    type?: string;
  };
  if (parentRule.type !== "rule" || typeof parentRule.selector !== "string") {
    return currentSelectors;
  }

  const parentSelectors = resolveStyleSelectors({
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

function extractSelectorClassNames(selector: string): string[] {
  try {
    cssTree.parse(selector, { context: "selector" });
  } catch {
    return [];
  }

  const matches = selector.match(/\.([_a-zA-Z]+[_a-zA-Z0-9-]*)/gu);
  if (!matches) {
    return [];
  }

  return [...new Set(matches.map((match) => match.slice(1)))];
}

export function extractClassNames(css: string): string[] {
  try {
    const root = scss.parse(css);
    const classSet = new Set<string>();

    root.walkRules((rule) => {
      for (const selector of resolveStyleSelectors(rule)) {
        for (const className of extractSelectorClassNames(selector)) {
          classSet.add(className);
        }
      }
    });

    return [...classSet].sort();
  } catch {
    return [];
  }
}

export async function buildMigrationSuggestions(
  directory: string,
): Promise<MigrationSuggestion[]> {
  const files = await collectStyleFiles(directory);
  const suggestions: MigrationSuggestion[] = [];

  for (const file of files) {
    const css = await readFile(file, "utf8");
    const classNames = extractClassNames(css);

    suggestions.push({
      file,
      suggestedModuleFile: file.replace(/\.(css|scss)$/u, ".module.$1"),
      classNames,
    });
  }

  return suggestions;
}

export type MigrationApplyResult = {
  copiedFiles: number;
  updatedSourceFiles: number;
};

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toImportPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.startsWith(".")) {
    return normalized;
  }

  return `./${normalized}`;
}

function toStyleAccess(alias: string, className: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(className)) {
    return `${alias}.${className}`;
  }

  return `${alias}["${className}"]`;
}

function replaceQuotedPath(
  content: string,
  fromPath: string,
  toPath: string,
): string {
  const escaped = escapeRegExp(fromPath);
  const singleQuoted = new RegExp(`'${escaped}'`, "g");
  const doubleQuoted = new RegExp(`\"${escaped}\"`, "g");

  return content
    .replace(singleQuoted, `'${toPath}'`)
    .replace(doubleQuoted, `"${toPath}"`);
}

function hasQuotedPathReference(content: string, path: string): boolean {
  return content.includes(`"${path}"`) || content.includes(`'${path}'`);
}

async function collectSourceFiles(root: string): Promise<string[]> {
  const queue: string[] = [root];
  const files: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipGeneratedDirectory(entry.name)) {
          queue.push(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = extname(entry.name);
      if (SOURCE_EXTENSIONS.has(extension)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function buildUnusedAlias(content: string): string {
  let index = 1;
  let alias = "styles";

  while (new RegExp(`\\b${escapeRegExp(alias)}\\b`, "u").test(content)) {
    index += 1;
    alias = `styles${index}`;
  }

  return alias;
}

function toVueStyleAccess(moduleAccessor: string, className: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(className)) {
    return `${moduleAccessor}.${className}`;
  }

  return `${moduleAccessor}["${className}"]`;
}

function registerClassExpression(
  classToExpr: Map<string, string>,
  ambiguousClasses: Set<string>,
  className: string,
  expression: string,
): void {
  if (ambiguousClasses.has(className)) {
    return;
  }

  const existingExpression = classToExpr.get(className);
  if (!existingExpression) {
    classToExpr.set(className, expression);
    return;
  }

  if (existingExpression !== expression) {
    classToExpr.delete(className);
    ambiguousClasses.add(className);
  }
}

function removeSideEffectImport(content: string, importPath: string): string {
  const escapedPath = escapeRegExp(importPath);
  const sideEffectImportPattern = new RegExp(
    `(^|\\n)[\\t ]*import\\s+["']${escapedPath}["'];?[\\t ]*(?=\\n|$)`,
    "gu",
  );

  return content.replace(sideEffectImportPattern, "$1");
}

function removeSideEffectRequire(content: string, importPath: string): string {
  const escapedPath = escapeRegExp(importPath);
  const sideEffectRequirePattern = new RegExp(
    `(^|\\n)([\\t ]*)require\\(\\s*["']${escapedPath}["']\\s*\\);?[\\t ]*(?=\\n|$)`,
    "gu",
  );

  return content.replace(sideEffectRequirePattern, "$1");
}

function ensureModuleImportAlias(
  content: string,
  importPath: string,
): { content: string; alias: string | undefined } {
  const escapedPath = escapeRegExp(importPath);
  const importAliasPattern = new RegExp(
    `import\\s+([A-Za-z_$][A-Za-z0-9_$]*)\\s+from\\s+["']${escapedPath}["']`,
    "u",
  );
  const aliasMatch = content.match(importAliasPattern);
  if (aliasMatch?.[1]) {
    return {
      content: removeSideEffectImport(content, importPath),
      alias: aliasMatch[1],
    };
  }

  const requireAliasPattern = new RegExp(
    `(?:const|let|var)\\s+([A-Za-z_$][A-Za-z0-9_$]*)\\s*=\\s*require\\(\\s*["']${escapedPath}["']\\s*\\)`,
    "u",
  );
  const requireAliasMatch = content.match(requireAliasPattern);
  if (requireAliasMatch?.[1]) {
    return {
      content: removeSideEffectRequire(content, importPath),
      alias: requireAliasMatch[1],
    };
  }

  const sideEffectImportPattern = new RegExp(
    `import\\s+["']${escapedPath}["'];?`,
    "u",
  );
  if (sideEffectImportPattern.test(content)) {
    const alias = buildUnusedAlias(content);
    return {
      content: content.replace(
        sideEffectImportPattern,
        `import ${alias} from "${importPath}";`,
      ),
      alias,
    };
  }

  const sideEffectRequirePattern = new RegExp(
    `(^|\\n)([\\t ]*)require\\(\\s*["']${escapedPath}["']\\s*\\);?`,
    "u",
  );
  const sideEffectRequireMatch = content.match(sideEffectRequirePattern);
  if (sideEffectRequireMatch) {
    const alias = buildUnusedAlias(content);
    const prefix = sideEffectRequireMatch[1] ?? "";
    const indentation = sideEffectRequireMatch[2] ?? "";
    return {
      content: content.replace(
        sideEffectRequirePattern,
        `${prefix}${indentation}const ${alias} = require("${importPath}");`,
      ),
      alias,
    };
  }

  return { content, alias: undefined };
}

function rewriteReactClassNameLiterals(
  content: string,
  classToExpr: Map<string, string>,
): string {
  if (classToExpr.size === 0) {
    return content;
  }

  const pattern = /className\s*=\s*("([^"]+)"|'([^']+)')/g;
  return content.replace(pattern, (full, quoted, doubleBody, singleBody) => {
    const raw = (doubleBody ?? singleBody ?? "").trim();
    if (raw.length === 0) {
      return full;
    }

    const tokens = raw.split(/\s+/u);
    const mapped = tokens.map((token: string) => classToExpr.get(token));
    if (!mapped.some((value: string | undefined) => value !== undefined)) {
      return full;
    }

    const parts = tokens.map(
      (token: string, index: number) => mapped[index] ?? `"${token}"`,
    );
    if (parts.length === 1) {
      return `className={${parts[0]}}`;
    }

    return `className={[${parts.join(", ")}].join(" ")}`;
  });
}

function splitClassTokens(value: string): string[] {
  return value
    .trim()
    .split(/\s+/u)
    .filter((token) => token.length > 0);
}

function buildClassTokenExpression(
  value: string,
  classToExpr: Map<string, string>,
): RewriteResult | undefined {
  const tokens = splitClassTokens(value);
  if (tokens.length === 0) {
    return undefined;
  }

  const parts = tokens.map((token) => classToExpr.get(token) ?? `"${token}"`);
  const changed = tokens.some((token) => classToExpr.has(token));
  if (!changed) {
    return undefined;
  }

  return {
    changed: true,
    code: parts.length === 1 ? parts[0] : `[${parts.join(", ")}].join(" ")`,
  };
}

function getReactNodeSource(source: string, node: ReactAstNode): string {
  if (typeof node.start === "number" && typeof node.end === "number") {
    return source.slice(node.start, node.end);
  }

  return source;
}

function preserveReactNode(
  source: string,
  node: ReactAstNode,
): RewriteResult {
  return {
    changed: false,
    code: getReactNodeSource(source, node),
  };
}

function walkReactAst(
  node: unknown,
  visit: (node: ReactAstNode) => void,
): void {
  if (!node || typeof node !== "object") {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      walkReactAst(item, visit);
    }
    return;
  }

  if (!("type" in node)) {
    return;
  }

  const astNode = node as ReactAstNode;
  visit(astNode);

  for (const value of Object.values(astNode)) {
    if (!value || typeof value !== "object") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const child of value) {
        walkReactAst(child, visit);
      }
      continue;
    }

    walkReactAst(value, visit);
  }
}

function collectReactClassHelpers(
  importNode: ReactAstNode,
  helpers: Set<string>,
): void {
  const source = importNode.source as { value?: unknown } | undefined;
  const importSource = typeof source?.value === "string" ? source.value : "";
  const specifiers = Array.isArray(importNode.specifiers)
    ? (importNode.specifiers as ReactAstNode[])
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

function collectRequireClassHelper(
  variableDeclarator: ReactAstNode,
  helpers: Set<string>,
): void {
  const id = variableDeclarator.id as ReactAstNode | undefined;
  const init = variableDeclarator.init as ReactAstNode | undefined;
  if (!id || !init || id.type !== "Identifier") {
    return;
  }

  if (init.type !== "CallExpression") {
    return;
  }

  const callee = init.callee as ReactAstNode | undefined;
  const args = Array.isArray(init.arguments)
    ? (init.arguments as ReactAstNode[])
    : [];
  if (
    callee?.type !== "Identifier" ||
    callee.name !== "require" ||
    args[0]?.type !== "StringLiteral" ||
    typeof args[0].value !== "string"
  ) {
    return;
  }

  if (args[0].value === "clsx" || args[0].value === "classnames") {
    helpers.add(id.name ?? "");
  }
}

function collectClassHelpersFromModule(source: string): Set<string> {
  const helpers = new Set(KNOWN_CLASS_HELPERS);

  try {
    const ast = parseBabel(source, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    walkReactAst(ast, (node) => {
      if (node.type === "ImportDeclaration") {
        collectReactClassHelpers(node, helpers);
        return;
      }

      if (node.type === "VariableDeclarator") {
        collectRequireClassHelper(node, helpers);
      }
    });
  } catch {
    return helpers;
  }

  return helpers;
}

function collectUseCssModuleAccessorFromModule(
  source: string,
  moduleName: string,
): string | undefined {
  try {
    const ast = parseBabel(source, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    let accessor: string | undefined;

    walkReactAst(ast, (node) => {
      if (accessor || node.type !== "VariableDeclarator") {
        return;
      }

      const id = node.id as ReactAstNode | undefined;
      const init = node.init as ReactAstNode | undefined;
      if (!id || !init || id.type !== "Identifier") {
        return;
      }

      if (init.type !== "CallExpression") {
        return;
      }

      const callee = init.callee as ReactAstNode | undefined;
      const args = Array.isArray(init.arguments)
        ? (init.arguments as ReactAstNode[])
        : [];
      if (callee?.type !== "Identifier" || callee.name !== "useCssModule") {
        return;
      }

      const requestedModuleName =
        args[0]?.type === "StringLiteral" && typeof args[0].value === "string"
          ? args[0].value
          : "default";

      if (requestedModuleName === moduleName) {
        accessor = id.name;
      }
    });

    return accessor;
  } catch {
    return undefined;
  }
}

function escapeTemplateText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("${", "\\${");
}

function rewriteTemplateText(
  value: string,
  classToExpr: Map<string, string>,
): RewriteResult {
  const segments = value.split(/(\s+)/u);
  let changed = false;
  let code = "";

  for (const segment of segments) {
    if (segment.length === 0) {
      continue;
    }

    if (/^\s+$/u.test(segment)) {
      code += escapeTemplateText(segment);
      continue;
    }

    const mapped = classToExpr.get(segment);
    if (mapped) {
      code += `\${${mapped}}`;
      changed = true;
      continue;
    }

    code += escapeTemplateText(segment);
  }

  return {
    changed,
    code,
  };
}

function flattenReactBinaryExpression(node: ReactAstNode): ReactAstNode[] {
  if (node.type !== "BinaryExpression" || node.operator !== "+") {
    return [node];
  }

  const left = node.left as ReactAstNode | undefined;
  const right = node.right as ReactAstNode | undefined;
  if (!left || !right) {
    return [node];
  }

  return [
    ...flattenReactBinaryExpression(left),
    ...flattenReactBinaryExpression(right),
  ];
}

function getStaticPropertyKey(node: ReactAstNode): string | undefined {
  if (node.type === "Identifier" && typeof node.name === "string") {
    return node.name;
  }

  if (node.type === "StringLiteral" && typeof node.value === "string") {
    return node.value;
  }

  return undefined;
}

function getReactClassValueKind(expression: ReactAstNode): ReactExpressionKind {
  switch (expression.type) {
    case "ParenthesizedExpression": {
      const nestedExpression = expression.expression as ReactAstNode | undefined;
      return nestedExpression
        ? getReactClassValueKind(nestedExpression)
        : "other";
    }
    case "ArrayExpression":
      return "array";
    case "StringLiteral":
      return "string";
    case "TemplateLiteral":
      return "template";
    case "ConditionalExpression": {
      const consequent = expression.consequent as ReactAstNode | undefined;
      const alternate = expression.alternate as ReactAstNode | undefined;
      if (!consequent || !alternate) {
        return "other";
      }

      const consequentKind = getReactClassValueKind(consequent);
      const alternateKind = getReactClassValueKind(alternate);
      if (consequentKind === alternateKind) {
        return consequentKind;
      }

      if (
        (consequentKind === "array" && alternateKind === "other") ||
        (consequentKind === "other" && alternateKind === "array")
      ) {
        return "array";
      }

      return "other";
    }
    case "LogicalExpression": {
      const right = expression.right as ReactAstNode | undefined;
      return right ? getReactClassValueKind(right) : "other";
    }
    case "CallExpression": {
      const callee = expression.callee as ReactAstNode | undefined;
      if (!callee) {
        return "other";
      }

      if (callee.type === "Identifier") {
        return KNOWN_CLASS_HELPERS.has(callee.name ?? "") ? "string" : "other";
      }

      if (
        callee.type !== "MemberExpression" &&
        callee.type !== "OptionalMemberExpression"
      ) {
        return "other";
      }

      const propertyName = getStaticPropertyKey(
        callee.property as ReactAstNode,
      );
      const objectKind = getReactClassValueKind(callee.object as ReactAstNode);

      if (propertyName === "join") {
        return "string";
      }

      if (
        objectKind === "array" &&
        ["concat", "filter", "flat", "flatMap", "map", "slice"].includes(
          propertyName ?? "",
        )
      ) {
        return "array";
      }

      return "other";
    }
    default:
      return "other";
  }
}

function formatReactClassNameCode(
  expression: ReactAstNode,
  rewrittenCode: string,
): string {
  if (getReactClassValueKind(expression) !== "array") {
    return rewrittenCode;
  }

  if (expression.type === "CallExpression") {
    const callee = expression.callee as ReactAstNode | undefined;
    if (
      callee &&
      (callee.type === "MemberExpression" ||
        callee.type === "OptionalMemberExpression")
    ) {
      const propertyName = getStaticPropertyKey(
        callee.property as ReactAstNode,
      );
      if (propertyName === "filter") {
        return `${rewrittenCode}.join(" ")`;
      }
    }
  }

  return `${rewrittenCode}.filter(Boolean).join(" ")`;
}

function rewriteReactObjectProperty(
  source: string,
  property: ReactAstNode,
  classToExpr: Map<string, string>,
  classHelpers: Set<string>,
): RewriteResult {
  const keyNode = property.key as ReactAstNode | undefined;
  const valueNode = property.value as ReactAstNode | undefined;
  if (!keyNode || !valueNode) {
    return preserveReactNode(source, property);
  }

  const computed = Boolean(property.computed);
  let changed = false;
  let keyCode = getReactNodeSource(source, keyNode);

  if (!computed) {
    const staticKey = getStaticPropertyKey(keyNode);
    if (staticKey) {
      const mapped = classToExpr.get(staticKey);
      if (mapped) {
        keyCode = `[${mapped}]`;
        changed = true;
      }
    }
  } else {
    const rewrittenKey = rewriteReactExpression(
      source,
      keyNode,
      classToExpr,
      classHelpers,
      false,
    );
    keyCode = `[${rewrittenKey.code}]`;
    changed ||= rewrittenKey.changed;
  }

  const rewrittenValue = rewriteReactExpression(
    source,
    valueNode,
    classToExpr,
    classHelpers,
    false,
  );
  changed ||= rewrittenValue.changed;

  if (!changed) {
    return preserveReactNode(source, property);
  }

  return {
    changed: true,
    code: `${keyCode}: ${rewrittenValue.code}`,
  };
}

function rewriteReactExpression(
  source: string,
  expression: ReactAstNode,
  classToExpr: Map<string, string>,
  classHelpers: Set<string>,
  stringContext = false,
): RewriteResult {
  switch (expression.type) {
    case "StringLiteral": {
      if (typeof expression.value !== "string") {
        return preserveReactNode(source, expression);
      }

      return (
        buildClassTokenExpression(expression.value, classToExpr) ??
        preserveReactNode(source, expression)
      );
    }
    case "TemplateLiteral": {
      const quasis = Array.isArray(expression.quasis)
        ? (expression.quasis as ReactAstNode[])
        : [];
      const expressions = Array.isArray(expression.expressions)
        ? (expression.expressions as ReactAstNode[])
        : [];
      let changed = false;
      let code = "`";

      for (const [index, quasi] of quasis.entries()) {
        const value = quasi.value as { cooked?: unknown } | undefined;
        const rewrittenQuasi = rewriteTemplateText(
          typeof value?.cooked === "string" ? value.cooked : "",
          classToExpr,
        );
        code += rewrittenQuasi.code;
        changed ||= rewrittenQuasi.changed;

        const nestedExpression = expressions[index];
        if (nestedExpression) {
          const rewrittenExpression = rewriteReactExpression(
            source,
            nestedExpression,
            classToExpr,
            classHelpers,
            true,
          );
          code += `\${${rewrittenExpression.code}}`;
          changed ||= rewrittenExpression.changed;
        }
      }

      code += "`";

      return changed ? { changed: true, code } : preserveReactNode(source, expression);
    }
    case "ConditionalExpression": {
      const test = expression.test as ReactAstNode | undefined;
      const consequent = expression.consequent as ReactAstNode | undefined;
      const alternate = expression.alternate as ReactAstNode | undefined;
      if (!test || !consequent || !alternate) {
        return preserveReactNode(source, expression);
      }

      const rewrittenConsequent = rewriteReactExpression(
        source,
        consequent,
        classToExpr,
        classHelpers,
        stringContext,
      );
      const rewrittenAlternate = rewriteReactExpression(
        source,
        alternate,
        classToExpr,
        classHelpers,
        stringContext,
      );

      if (!rewrittenConsequent.changed && !rewrittenAlternate.changed) {
        return preserveReactNode(source, expression);
      }

      return {
        changed: true,
        code: `${getReactNodeSource(source, test)} ? ${rewrittenConsequent.code} : ${rewrittenAlternate.code}`,
      };
    }
    case "BinaryExpression": {
      if (expression.operator !== "+") {
        return preserveReactNode(source, expression);
      }

      const operands = flattenReactBinaryExpression(expression);
      let changed = false;
      let code = "`";

      for (const operand of operands) {
        if (
          operand.type === "StringLiteral" &&
          typeof operand.value === "string"
        ) {
          const rewrittenText = rewriteTemplateText(operand.value, classToExpr);
          code += rewrittenText.code;
          changed ||= rewrittenText.changed;
          continue;
        }

        const rewrittenOperand = rewriteReactExpression(
          source,
          operand,
          classToExpr,
          classHelpers,
          true,
        );
        code += `\${${rewrittenOperand.code}}`;
        changed ||= rewrittenOperand.changed;
      }

      code += "`";

      return changed ? { changed: true, code } : preserveReactNode(source, expression);
    }
    case "LogicalExpression": {
      const left = expression.left as ReactAstNode | undefined;
      const right = expression.right as ReactAstNode | undefined;
      const operator =
        typeof expression.operator === "string" ? expression.operator : "&&";
      if (!left || !right) {
        return preserveReactNode(source, expression);
      }

      const rewrittenLeft = rewriteReactExpression(
        source,
        left,
        classToExpr,
        classHelpers,
        false,
      );
      const rewrittenRight = rewriteReactExpression(
        source,
        right,
        classToExpr,
        classHelpers,
        stringContext,
      );

      if (!rewrittenLeft.changed && !rewrittenRight.changed) {
        return preserveReactNode(source, expression);
      }

      return {
        changed: true,
        code: `${rewrittenLeft.code} ${operator} ${rewrittenRight.code}`,
      };
    }
    case "ArrayExpression": {
      const elements = Array.isArray(expression.elements)
        ? (expression.elements as Array<ReactAstNode | null>)
        : [];
      const rewrittenElements: string[] = [];
      let changed = false;

      for (const element of elements) {
        if (!element) {
          return preserveReactNode(source, expression);
        }

        if (element.type === "SpreadElement") {
          const argument = element.argument as ReactAstNode | undefined;
          if (!argument) {
            return preserveReactNode(source, expression);
          }

          const rewrittenArgument = rewriteReactExpression(
            source,
            argument,
            classToExpr,
            classHelpers,
            false,
          );
          rewrittenElements.push(`...${rewrittenArgument.code}`);
          changed ||= rewrittenArgument.changed;
          continue;
        }

        const rewrittenElement = rewriteReactExpression(
          source,
          element,
          classToExpr,
          classHelpers,
          false,
        );
        rewrittenElements.push(rewrittenElement.code);
        changed ||= rewrittenElement.changed;
      }

      const code = `[${rewrittenElements.join(", ")}]`;
      if (!changed && !stringContext) {
        return preserveReactNode(source, expression);
      }

      return {
        changed,
        code: stringContext
          ? formatReactClassNameCode(expression, code)
          : code,
      };
    }
    case "ObjectExpression": {
      const properties = Array.isArray(expression.properties)
        ? (expression.properties as ReactAstNode[])
        : [];
      const rewrittenProperties: string[] = [];
      let changed = false;

      for (const property of properties) {
        if (property.type === "SpreadElement") {
          const argument = property.argument as ReactAstNode | undefined;
          if (!argument) {
            return preserveReactNode(source, expression);
          }

          const rewrittenArgument = rewriteReactExpression(
            source,
            argument,
            classToExpr,
            classHelpers,
            false,
          );
          rewrittenProperties.push(`...${rewrittenArgument.code}`);
          changed ||= rewrittenArgument.changed;
          continue;
        }

        if (property.type !== "ObjectProperty") {
          return preserveReactNode(source, expression);
        }

        const rewrittenProperty = rewriteReactObjectProperty(
          source,
          property,
          classToExpr,
          classHelpers,
        );
        rewrittenProperties.push(rewrittenProperty.code);
        changed ||= rewrittenProperty.changed;
      }

      if (!changed) {
        return preserveReactNode(source, expression);
      }

      return {
        changed: true,
        code: `{ ${rewrittenProperties.join(", ")} }`,
      };
    }
    case "CallExpression": {
      const callee = expression.callee as ReactAstNode | undefined;
      const args = Array.isArray(expression.arguments)
        ? (expression.arguments as ReactAstNode[])
        : [];
      if (!callee) {
        return preserveReactNode(source, expression);
      }

      if (
        callee?.type === "Identifier" &&
        typeof callee.name === "string" &&
        classHelpers.has(callee.name)
      ) {
        const rewrittenArgs = args.map((arg) =>
          rewriteReactExpression(source, arg, classToExpr, classHelpers, false),
        );
        if (!rewrittenArgs.some((result) => result.changed)) {
          return preserveReactNode(source, expression);
        }

        const rewrittenCall = rewriteCallExpressionArguments(
          source,
          expression,
          args,
          rewrittenArgs,
        );

        return {
          changed: true,
          code:
            rewrittenCall ??
            `${getReactNodeSource(source, callee)}(${rewrittenArgs.map((result) => result.code).join(", ")})`,
        };
      }

      if (
        callee?.type === "MemberExpression" ||
        callee?.type === "OptionalMemberExpression"
      ) {
        const objectNode = callee.object as ReactAstNode | undefined;
        const propertyNode = callee.property as ReactAstNode | undefined;
        if (!objectNode || !propertyNode) {
          return preserveReactNode(source, expression);
        }

        const rewrittenObject = rewriteReactExpression(
          source,
          objectNode,
          classToExpr,
          classHelpers,
          false,
        );
        const rewrittenArgs = args.map((arg) =>
          rewriteReactExpression(source, arg, classToExpr, classHelpers, false),
        );
        let changed =
          rewrittenObject.changed ||
          rewrittenArgs.some((result) => result.changed);
        let propertyCode = getReactNodeSource(source, propertyNode);

        if (Boolean(callee.computed)) {
          const rewrittenProperty = rewriteReactExpression(
            source,
            propertyNode,
            classToExpr,
            classHelpers,
            false,
          );
          propertyCode = rewrittenProperty.code;
          changed ||= rewrittenProperty.changed;
        }

        const accessor = Boolean(callee.computed)
          ? `[${propertyCode}]`
          : `${Boolean(callee.optional) ? "?." : "."}${propertyCode}`;

        const code = `${rewrittenObject.code}${accessor}(${rewrittenArgs.map((result) => result.code).join(", ")})`;
        if (!changed && !stringContext) {
          return preserveReactNode(source, expression);
        }

        return {
          changed,
          code:
            stringContext && getReactClassValueKind(expression) === "array"
              ? formatReactClassNameCode(expression, code)
              : code,
        };
      }

      const rewrittenArgs = args.map((arg) =>
        rewriteReactExpression(source, arg, classToExpr, classHelpers, false),
      );
      if (!rewrittenArgs.some((result) => result.changed)) {
        return preserveReactNode(source, expression);
      }

      const rewrittenCall = rewriteCallExpressionArguments(
        source,
        expression,
        args,
        rewrittenArgs,
      );

      return {
        changed: true,
        code:
          rewrittenCall ??
          `${getReactNodeSource(source, callee)}(${rewrittenArgs.map((result) => result.code).join(", ")})`,
      };
    }
    case "MemberExpression":
    case "OptionalMemberExpression": {
      const objectNode = expression.object as ReactAstNode | undefined;
      const propertyNode = expression.property as ReactAstNode | undefined;
      if (!objectNode || !propertyNode) {
        return preserveReactNode(source, expression);
      }

      const rewrittenObject = rewriteReactExpression(
        source,
        objectNode,
        classToExpr,
        classHelpers,
        false,
      );
      let changed = rewrittenObject.changed;
      let propertyCode = getReactNodeSource(source, propertyNode);

      if (Boolean(expression.computed)) {
        const rewrittenProperty = rewriteReactExpression(
          source,
          propertyNode,
          classToExpr,
          classHelpers,
          false,
        );
        propertyCode = rewrittenProperty.code;
        changed ||= rewrittenProperty.changed;
      }

      if (!changed) {
        return preserveReactNode(source, expression);
      }

      const accessor = Boolean(expression.computed)
        ? `[${propertyCode}]`
        : `${Boolean(expression.optional) ? "?." : "."}${propertyCode}`;

      return {
        changed: true,
        code: `${rewrittenObject.code}${accessor}`,
      };
    }
    case "ParenthesizedExpression": {
      const nestedExpression = expression.expression as ReactAstNode | undefined;
      if (!nestedExpression) {
        return preserveReactNode(source, expression);
      }

      const rewrittenExpression = rewriteReactExpression(
        source,
        nestedExpression,
        classToExpr,
        classHelpers,
        stringContext,
      );
      if (!rewrittenExpression.changed) {
        return preserveReactNode(source, expression);
      }

      return {
        changed: true,
        code: `(${rewrittenExpression.code})`,
      };
    }
    default: {
      return preserveReactNode(source, expression);
    }
  }
}

function buildClassNameReplacement(
  source: string,
  valueNode: ReactAstNode,
  classToExpr: Map<string, string>,
  classHelpers: Set<string>,
): Replacement | undefined {
  if (typeof valueNode.start !== "number" || typeof valueNode.end !== "number") {
    return undefined;
  }

  if (
    valueNode.type === "StringLiteral" &&
    typeof valueNode.value === "string"
  ) {
    const rewritten = buildClassTokenExpression(valueNode.value, classToExpr);
    if (!rewritten) {
      return undefined;
    }

    return {
      start: valueNode.start,
      end: valueNode.end,
      value: `{${rewritten.code}}`,
    };
  }

  if (valueNode.type !== "JSXExpressionContainer") {
    return undefined;
  }

  const expression = valueNode.expression as ReactAstNode | undefined;
  if (!expression) {
    return undefined;
  }

  const rewritten = rewriteReactExpression(
    source,
    expression,
    classToExpr,
    classHelpers,
    true,
  );
  if (!rewritten.changed) {
    return undefined;
  }

  return {
    start: valueNode.start,
    end: valueNode.end,
    value: `{${rewritten.code}}`,
  };
}

function applyReplacements(content: string, replacements: Replacement[]): string {
  return [...replacements]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (current, replacement) =>
        `${current.slice(0, replacement.start)}${replacement.value}${current.slice(replacement.end)}`,
      content,
    );
}

function applyReplacementSlice(
  source: string,
  start: number,
  end: number,
  replacements: Replacement[],
): string {
  const relativeReplacements = replacements.map((replacement) => ({
    start: replacement.start - start,
    end: replacement.end - start,
    value: replacement.value,
  }));

  return applyReplacements(source.slice(start, end), relativeReplacements);
}

function rewriteCallExpressionArguments(
  source: string,
  expression: ReactAstNode,
  args: ReactAstNode[],
  rewrittenArgs: RewriteResult[],
): string | undefined {
  if (
    typeof expression.start !== "number" ||
    typeof expression.end !== "number" ||
    args.length !== rewrittenArgs.length
  ) {
    return undefined;
  }

  const replacements: Replacement[] = [];

  for (const [index, arg] of args.entries()) {
    if (!rewrittenArgs[index]?.changed) {
      continue;
    }

    if (typeof arg.start !== "number" || typeof arg.end !== "number") {
      return undefined;
    }

    replacements.push({
      start: arg.start,
      end: arg.end,
      value: rewrittenArgs[index].code,
    });
  }

  if (replacements.length === 0) {
    return undefined;
  }

  return applyReplacementSlice(
    source,
    expression.start,
    expression.end,
    replacements,
  );
}

function rewriteReactClassNames(
  content: string,
  classToExpr: Map<string, string>,
): string {
  if (classToExpr.size === 0) {
    return content;
  }

  try {
    const ast = parseBabel(content, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
    const classHelpers = collectClassHelpersFromModule(content);
    const replacements: Replacement[] = [];

    walkReactAst(ast, (node) => {
      if (node.type !== "JSXAttribute") {
        return;
      }

      const name = node.name as { name?: unknown; type?: unknown } | undefined;
      if (name?.type !== "JSXIdentifier" || name.name !== "className") {
        return;
      }

      const valueNode = node.value as ReactAstNode | undefined;
      if (!valueNode) {
        return;
      }

      const replacement = buildClassNameReplacement(
        content,
        valueNode,
        classToExpr,
        classHelpers,
      );
      if (replacement) {
        replacements.push(replacement);
      }
    });

    if (replacements.length === 0) {
      return content;
    }

    return applyReplacements(content, replacements);
  } catch {
    return rewriteReactClassNameLiterals(content, classToExpr);
  }
}

type VueTemplateNode = {
  branches?: unknown[];
  children?: unknown[];
  props?: unknown[];
};

type VueStaticClassAttribute = {
  loc?: {
    end?: { offset?: number };
    start?: { offset?: number };
  };
  name: string;
  type: number;
  value?: {
    content?: string;
  };
};

type VueClassBindingDirective = {
  arg?: {
    content?: string;
  };
  exp?: {
    content?: string;
  };
  loc?: {
    end?: { offset?: number };
    start?: { offset?: number };
  };
  name: string;
  type: number;
};

function isVueStaticClassAttribute(
  node: unknown,
): node is VueStaticClassAttribute {
  if (!node || typeof node !== "object") {
    return false;
  }

  const candidate = node as { name?: string; type?: number };
  return candidate.type === 6 && candidate.name === "class";
}

function isVueClassBindingDirective(
  node: unknown,
): node is VueClassBindingDirective {
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

function buildVueStaticClassExpression(
  value: string,
  classToExpr: Map<string, string>,
): RewriteResult | undefined {
  const tokens = splitClassTokens(value);
  if (tokens.length === 0) {
    return undefined;
  }

  const parts = tokens.map((token) => classToExpr.get(token) ?? `"${token}"`);
  const changed = tokens.some((token) => classToExpr.has(token));
  if (!changed) {
    return undefined;
  }

  return {
    changed: true,
    code: parts.length === 1 ? parts[0] : `[${parts.join(", ")}]`,
  };
}

function wrapVueBindingExpression(expression: string): string {
  if (!expression.includes('"')) {
    return `"${expression}"`;
  }

  if (!expression.includes("'")) {
    return `'${expression}'`;
  }

  return `"${expression.replaceAll('"', "&quot;")}"`;
}

function getVueAttributeRange(
  content: string,
  node:
    | VueClassBindingDirective
    | VueStaticClassAttribute,
): { end: number; start: number } | undefined {
  const startOffset = node.loc?.start?.offset;
  const endOffset = node.loc?.end?.offset;
  if (typeof startOffset !== "number" || typeof endOffset !== "number") {
    return undefined;
  }

  let start = startOffset;
  if (start > 0 && /\s/u.test(content[start - 1] ?? "")) {
    start -= 1;
  }

  return {
    start,
    end: endOffset,
  };
}

function ensureVueModuleStyleBlock(content: string): string {
  return content.replace(/<style\b([^>]*)>/gu, (full, attrs: string) => {
    if (/(?:^|\s)module(?:\s|=|$)/u.test(attrs)) {
      return full;
    }

    if (!/\bsrc=(["'])[^"'<>]+\.module\.(?:css|scss)\1/u.test(attrs)) {
      return full;
    }

    return `<style module${attrs}>`;
  });
}

function hasVueModuleStyleBlock(content: string): boolean {
  const styleTags = content.match(/<style\b[^>]*>/gu) ?? [];

  return styleTags.some(
    (tag) =>
      /(?:^|\s)module(?:\s|=|>)/u.test(tag) &&
      /\bsrc=(["'])[^"'<>]+\.module\.(?:css|scss)\1/u.test(tag),
  );
}

function getVueStyleModuleName(
  content: string,
  importPath: string,
): string | undefined {
  const escapedImportPath = escapeRegExp(importPath);
  const styleTagPattern = new RegExp(
    `<style\\b([^>]*)\\bsrc=(["'])${escapedImportPath}\\2[^>]*>`,
    "u",
  );
  const match = content.match(styleTagPattern);
  if (!match) {
    return undefined;
  }

  const attributes = match[1] ?? "";
  const aliasMatch = attributes.match(
    /\bmodule(?:\s*=\s*(["'])([^"']+)\1)?/u,
  );
  if (aliasMatch?.[2]) {
    return aliasMatch[2];
  }

  return "default";
}

function getVueModuleAccessor(
  content: string,
  importPath: string,
): string | undefined {
  const moduleName = getVueStyleModuleName(content, importPath);
  if (!moduleName) {
    return undefined;
  }

  try {
    const sfc = parseVueSfc(content);
    const scriptContents = [
      sfc.descriptor.script?.content,
      sfc.descriptor.scriptSetup?.content,
    ].filter((value): value is string => typeof value === "string");

    for (const scriptContent of scriptContents) {
      const accessor = collectUseCssModuleAccessorFromModule(
        scriptContent,
        moduleName,
      );
      if (accessor) {
        return accessor;
      }
    }
  } catch {
    return moduleName === "default" ? "$style" : `$${moduleName}`;
  }

  return moduleName === "default" ? "$style" : `$${moduleName}`;
}

function rewriteVueBindingExpression(
  expression: string,
  classToExpr: Map<string, string>,
  classHelpers: Set<string>,
): RewriteResult {
  try {
    const ast = parseExpression(expression, {
      plugins: ["typescript"],
    }) as unknown as ReactAstNode;

    return rewriteReactExpression(expression, ast, classToExpr, classHelpers);
  } catch {
    return {
      changed: false,
      code: expression,
    };
  }
}

function collectVueClassHelpers(content: string): Set<string> {
  const helpers = new Set(KNOWN_CLASS_HELPERS);

  try {
    const sfc = parseVueSfc(content);
    const scriptContents = [
      sfc.descriptor.script?.content,
      sfc.descriptor.scriptSetup?.content,
    ].filter((value): value is string => typeof value === "string");

    for (const scriptContent of scriptContents) {
      for (const helper of collectClassHelpersFromModule(scriptContent)) {
        helpers.add(helper);
      }
    }
  } catch {
    return helpers;
  }

  return helpers;
}

function rewriteVueClassBindings(
  content: string,
  classToExpr: Map<string, string>,
): string {
  if (classToExpr.size === 0 || !hasVueModuleStyleBlock(content)) {
    return content;
  }

  try {
    const sfc = parseVueSfc(content);
    const ast = sfc.descriptor.template?.ast as VueTemplateNode | undefined;
    if (!ast) {
      return content;
    }

    const classHelpers = collectVueClassHelpers(content);
    const replacements: Replacement[] = [];
    const stack: VueTemplateNode[] = [ast];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }

      const props = Array.isArray(current.props) ? current.props : [];
      const staticClass = props.find(isVueStaticClassAttribute);
      const bindingClass = props.find(isVueClassBindingDirective);

      const staticRewrite =
        staticClass && typeof staticClass.value?.content === "string"
          ? buildVueStaticClassExpression(staticClass.value.content, classToExpr)
          : undefined;
      const bindingRewrite =
        bindingClass && typeof bindingClass.exp?.content === "string"
          ? rewriteVueBindingExpression(
              bindingClass.exp.content,
              classToExpr,
              classHelpers,
            )
          : undefined;

      if (staticRewrite && bindingClass && typeof bindingClass.exp?.content === "string") {
        const bindingRange = getVueAttributeRange(content, bindingClass);
        const staticRange = staticClass
          ? getVueAttributeRange(content, staticClass)
          : undefined;

        if (bindingRange && staticRange) {
          const dynamicCode =
            bindingRewrite?.code ?? bindingClass.exp.content;
          replacements.push({
            start: bindingRange.start,
            end: bindingRange.end,
            value: ` :class=${wrapVueBindingExpression(`[${staticRewrite.code}, ${dynamicCode}]`)}`,
          });
          replacements.push({
            start: staticRange.start,
            end: staticRange.end,
            value: "",
          });
        }
      } else if (staticRewrite && staticClass) {
        const staticRange = getVueAttributeRange(content, staticClass);
        if (staticRange) {
          replacements.push({
            start: staticRange.start,
            end: staticRange.end,
            value: ` :class=${wrapVueBindingExpression(staticRewrite.code)}`,
          });
        }
      } else if (bindingRewrite?.changed && bindingClass) {
        const bindingRange = getVueAttributeRange(content, bindingClass);
        if (bindingRange) {
          replacements.push({
            start: bindingRange.start,
            end: bindingRange.end,
            value: ` :class=${wrapVueBindingExpression(bindingRewrite.code)}`,
          });
        }
      }

      const children = Array.isArray(current.children) ? current.children : [];
      const branches = Array.isArray(current.branches) ? current.branches : [];
      for (const child of children) {
        if (child && typeof child === "object") {
          stack.push(child as VueTemplateNode);
        }
      }
      for (const branch of branches) {
        if (branch && typeof branch === "object") {
          stack.push(branch as VueTemplateNode);
        }
      }
    }

    if (replacements.length === 0) {
      return content;
    }

    return applyReplacements(content, replacements);
  } catch {
    return content;
  }
}

export async function applyMigrationSuggestions(
  root: string,
  suggestions: MigrationSuggestion[],
): Promise<MigrationApplyResult> {
  let copiedFiles = 0;
  let updatedSourceFiles = 0;

  for (const suggestion of suggestions) {
    try {
      await stat(suggestion.suggestedModuleFile);
    } catch {
      await copyFile(suggestion.file, suggestion.suggestedModuleFile);
      copiedFiles += 1;
    }
  }

  const sourceFiles = await collectSourceFiles(root);

  for (const sourceFile of sourceFiles) {
    const extension = extname(sourceFile);
    let content = await readFile(sourceFile, "utf8");
    const before = content;
    const classToExpr = new Map<string, string>();
    const ambiguousReactClasses = new Set<string>();
    const vueClassToExpr = new Map<string, string>();
    const ambiguousVueClasses = new Set<string>();

    for (const suggestion of suggestions) {
      const sourceDir = dirname(sourceFile);
      const oldImportPath = toImportPath(relative(sourceDir, suggestion.file));
      const newImportPath = toImportPath(
        relative(sourceDir, suggestion.suggestedModuleFile),
      );

      content = replaceQuotedPath(content, oldImportPath, newImportPath);

      if (REACT_SOURCE_EXTENSIONS.has(extension)) {
        const ensured = ensureModuleImportAlias(content, newImportPath);
        content = ensured.content;
        if (ensured.alias) {
          for (const className of suggestion.classNames) {
            registerClassExpression(
              classToExpr,
              ambiguousReactClasses,
              className,
              toStyleAccess(ensured.alias, className),
            );
          }
        }
      }

      if (
        extension === ".vue" &&
        hasQuotedPathReference(content, newImportPath)
      ) {
        const moduleAccessor =
          getVueModuleAccessor(content, newImportPath) ?? "$style";
        for (const className of suggestion.classNames) {
          registerClassExpression(
            vueClassToExpr,
            ambiguousVueClasses,
            className,
            toVueStyleAccess(moduleAccessor, className),
          );
        }
      }
    }

    if (REACT_SOURCE_EXTENSIONS.has(extension)) {
      content = rewriteReactClassNames(content, classToExpr);
    }

    if (extension === ".vue") {
      content = ensureVueModuleStyleBlock(content);
      content = rewriteVueClassBindings(content, vueClassToExpr);
    }

    if (content !== before) {
      await writeFile(sourceFile, content, "utf8");
      updatedSourceFiles += 1;
    }
  }

  return {
    copiedFiles,
    updatedSourceFiles,
  };
}
