import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

import { defineCommand } from "citty";

export type MigrationSuggestion = {
  file: string;
  suggestedModuleFile: string;
  classNames: string[];
};

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".vscode"]);
const STYLE_EXTENSIONS = new Set([".css", ".scss"]);

function isModuleStyleFile(path: string): boolean {
  return path.endsWith(".module.css") || path.endsWith(".module.scss");
}

async function collectStyleFiles(directory: string): Promise<string[]> {
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

function extractClassNames(css: string): string[] {
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
    description: "Generate CSS Modules migration suggestions (no file writes).",
  },
  args: {
    dir: {
      type: "positional",
      default: ".",
      required: false,
      description: "Component directory to inspect.",
    },
  },
  async run({ args }): Promise<void> {
    const directory = typeof args.dir === "string" ? args.dir : ".";
    const root = resolve(directory);
    const suggestions = await buildMigrationSuggestions(root);

    process.stdout.write(`${renderSuggestions(root, suggestions)}\n`);
  },
});
