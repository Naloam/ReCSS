import { relative, resolve } from "node:path";

import {
  applyMigrationSuggestions,
  buildMigrationSuggestions,
  type MigrationSuggestion,
} from "@recss/core";
import { defineCommand } from "citty";

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
