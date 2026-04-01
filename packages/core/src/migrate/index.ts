import { copyFile, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";

import type { MigrationSuggestion } from "../types.js";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".vscode"]);
const STYLE_EXTENSIONS = new Set([".css", ".scss"]);
const SOURCE_EXTENSIONS = new Set([".vue", ".tsx", ".jsx", ".ts", ".js", ".html"]);

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

function replaceQuotedPath(content: string, fromPath: string, toPath: string): string {
  const escaped = escapeRegExp(fromPath);
  const singleQuoted = new RegExp(`'${escaped}'`, "g");
  const doubleQuoted = new RegExp(`\"${escaped}\"`, "g");

  return content
    .replace(singleQuoted, `'${toPath}'`)
    .replace(doubleQuoted, `"${toPath}"`);
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

    for (const suggestion of suggestions) {
      const sourceDir = dirname(sourceFile);
      const oldImportPath = toImportPath(relative(sourceDir, suggestion.file));
      const newImportPath = toImportPath(relative(sourceDir, suggestion.suggestedModuleFile));

      content = replaceQuotedPath(content, oldImportPath, newImportPath);

      if (extension === ".tsx" || extension === ".jsx") {
        const ensured = ensureModuleImportAlias(content, newImportPath);
        content = ensured.content;
        if (ensured.alias) {
          for (const className of suggestion.classNames) {
            if (!classToExpr.has(className)) {
              classToExpr.set(className, toStyleAccess(ensured.alias, className));
            }
          }
        }
      }
    }

    if (extension === ".tsx" || extension === ".jsx") {
      content = rewriteReactClassNameLiterals(content, classToExpr);
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
