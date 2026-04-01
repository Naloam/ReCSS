import { copyFile, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";

import { buildMigrationSuggestions, type MigrationSuggestion } from "@recss/core";
import { defineCommand } from "citty";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".vscode"]);

type MigrationApplyResult = {
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
      if ([".vue", ".tsx", ".jsx", ".ts", ".js", ".html"].includes(extension)) {
        files.push(fullPath);
      }
    }
  }

  return files;
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
    let content = await readFile(sourceFile, "utf8");
    const before = content;

    for (const suggestion of suggestions) {
      const sourceDir = dirname(sourceFile);
      const oldImportPath = toImportPath(relative(sourceDir, suggestion.file));
      const newImportPath = toImportPath(relative(sourceDir, suggestion.suggestedModuleFile));
      content = replaceQuotedPath(content, oldImportPath, newImportPath);
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

function renderSuggestions(root: string, suggestions: MigrationSuggestion[]): string {
  const lines: string[] = [];

  lines.push("ReCSS migrate suggestions");
  lines.push("========================");
  lines.push("");

  if (suggestions.length === 0) {
    lines.push("No non-module CSS/SCSS files found.");
    return lines.join("\n");
  }

  for (const item of suggestions) {
    const file = relative(root, item.file) || item.file;
    const moduleFile = relative(root, item.suggestedModuleFile) || item.suggestedModuleFile;

    lines.push(`- ${file}`);
    lines.push(`  -> suggested rename: ${moduleFile}`);
    lines.push(
      `  -> detected classes: ${item.classNames.length > 0 ? item.classNames.join(", ") : "none"}`,
    );
  }

  return lines.join("\n");
}

export const migrateCommand = defineCommand({
  meta: {
    name: "migrate",
    description: "Generate or apply CSS Modules migration suggestions.",
  },
  args: {
    dir: {
      type: "positional",
      default: ".",
      required: false,
      description: "Component directory to inspect.",
    },
    apply: {
      type: "boolean",
      required: false,
      description: "Apply migration by creating .module files and updating imports.",
    },
  },
  async run({ args }): Promise<void> {
    const directory = typeof args.dir === "string" ? args.dir : ".";
    const root = resolve(directory);
    const suggestions = await buildMigrationSuggestions(root);

    if (args.apply === true) {
      const result = await applyMigrationSuggestions(root, suggestions);
      process.stdout.write(
        `[recss] applied migration: copied ${result.copiedFiles} style files, updated ${result.updatedSourceFiles} source files.\n`,
      );
      return;
    }

    process.stdout.write(`${renderSuggestions(root, suggestions)}\n`);
  },
});
