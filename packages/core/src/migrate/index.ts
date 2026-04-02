import { copyFile, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";

import { parse as parseBabel, parseExpression } from "@babel/parser";
import { parse as parseVueSfc } from "@vue/compiler-sfc";

import type { MigrationSuggestion } from "../types.js";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".vscode"]);
const STYLE_EXTENSIONS = new Set([".css", ".scss"]);
const KNOWN_CLASS_HELPERS = new Set(["clsx", "cn", "classnames"]);
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

function isModuleStyleFile(path: string): boolean {
  return path.endsWith(".module.css") || path.endsWith(".module.scss");
}

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
        if (!SKIP_DIRS.has(entry.name)) {
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

export function extractClassNames(css: string): string[] {
  const matches = css.matchAll(/\.(?<name>[A-Za-z_][A-Za-z0-9_-]*)/g);
  const classSet = new Set<string>();

  for (const match of matches) {
    const className = match.groups?.name;
    if (className) {
      classSet.add(className);
    }
  }

  return [...classSet].sort();
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
        if (!SKIP_DIRS.has(entry.name)) {
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

function toVueStyleAccess(className: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(className)) {
    return `$style.${className}`;
  }

  return `$style["${className}"]`;
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
    return { content, alias: aliasMatch[1] };
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

function getStaticPropertyKey(node: ReactAstNode): string | undefined {
  if (node.type === "Identifier" && typeof node.name === "string") {
    return node.name;
  }

  if (node.type === "StringLiteral" && typeof node.value === "string") {
    return node.value;
  }

  return undefined;
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
    );
    keyCode = `[${rewrittenKey.code}]`;
    changed ||= rewrittenKey.changed;
  }

  const rewrittenValue = rewriteReactExpression(
    source,
    valueNode,
    classToExpr,
    classHelpers,
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
      );
      const rewrittenAlternate = rewriteReactExpression(
        source,
        alternate,
        classToExpr,
        classHelpers,
      );

      if (!rewrittenConsequent.changed && !rewrittenAlternate.changed) {
        return preserveReactNode(source, expression);
      }

      return {
        changed: true,
        code: `${getReactNodeSource(source, test)} ? ${rewrittenConsequent.code} : ${rewrittenAlternate.code}`,
      };
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
      );
      const rewrittenRight = rewriteReactExpression(
        source,
        right,
        classToExpr,
        classHelpers,
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
        );
        rewrittenElements.push(rewrittenElement.code);
        changed ||= rewrittenElement.changed;
      }

      if (!changed) {
        return preserveReactNode(source, expression);
      }

      return {
        changed: true,
        code: `[${rewrittenElements.join(", ")}]`,
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
      if (
        callee?.type !== "Identifier" ||
        typeof callee.name !== "string" ||
        !classHelpers.has(callee.name)
      ) {
        return preserveReactNode(source, expression);
      }

      const args = Array.isArray(expression.arguments)
        ? (expression.arguments as ReactAstNode[])
        : [];
      const rewrittenArgs = args.map((arg) =>
        rewriteReactExpression(source, arg, classToExpr, classHelpers),
      );
      if (!rewrittenArgs.some((result) => result.changed)) {
        return preserveReactNode(source, expression);
      }

      return {
        changed: true,
        code: `${getReactNodeSource(source, callee)}(${rewrittenArgs.map((result) => result.code).join(", ")})`,
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
    const classHelpers = new Set(KNOWN_CLASS_HELPERS);
    const replacements: Replacement[] = [];

    walkReactAst(ast, (node) => {
      if (node.type === "ImportDeclaration") {
        collectReactClassHelpers(node, classHelpers);
        return;
      }

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

function rewriteVueBindingExpression(
  expression: string,
  classToExpr: Map<string, string>,
): RewriteResult {
  try {
    const ast = parseExpression(expression, {
      plugins: ["typescript"],
    }) as unknown as ReactAstNode;

    return rewriteReactExpression(
      expression,
      ast,
      classToExpr,
      new Set<string>(),
    );
  } catch {
    return {
      changed: false,
      code: expression,
    };
  }
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
          ? rewriteVueBindingExpression(bindingClass.exp.content, classToExpr)
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
    const vueClassToExpr = new Map<string, string>();

    for (const suggestion of suggestions) {
      const sourceDir = dirname(sourceFile);
      const oldImportPath = toImportPath(relative(sourceDir, suggestion.file));
      const newImportPath = toImportPath(
        relative(sourceDir, suggestion.suggestedModuleFile),
      );

      content = replaceQuotedPath(content, oldImportPath, newImportPath);

      if (extension === ".tsx" || extension === ".jsx") {
        const ensured = ensureModuleImportAlias(content, newImportPath);
        content = ensured.content;
        if (ensured.alias) {
          for (const className of suggestion.classNames) {
            if (!classToExpr.has(className)) {
              classToExpr.set(
                className,
                toStyleAccess(ensured.alias, className),
              );
            }
          }
        }
      }

      if (
        extension === ".vue" &&
        hasQuotedPathReference(content, newImportPath)
      ) {
        for (const className of suggestion.classNames) {
          if (!vueClassToExpr.has(className)) {
            vueClassToExpr.set(className, toVueStyleAccess(className));
          }
        }
      }
    }

    if (extension === ".tsx" || extension === ".jsx") {
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
