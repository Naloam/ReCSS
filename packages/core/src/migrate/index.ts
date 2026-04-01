import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import type { MigrationSuggestion } from "../types.js";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".vscode"]);
const STYLE_EXTENSIONS = new Set([".css", ".scss"]);

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
