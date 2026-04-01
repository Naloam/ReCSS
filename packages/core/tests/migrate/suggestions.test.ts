import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildMigrationSuggestions,
  collectStyleFiles,
  extractClassNames,
} from "../../src/migrate/index.js";

describe("migrate helpers", () => {
  it("should extract class names from css", () => {
    const names = extractClassNames(
      ".card { display: block; } .card-title { color: red; }",
    );

    expect(names).toEqual(["card", "card-title"]);
  });

  it("should collect non-module style files and build suggestions", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "recss-core-migrate-"));

    try {
      await mkdir(resolve(root, "src"), { recursive: true });
      await writeFile(resolve(root, "src/card.scss"), ".card { color: red; }");
      await writeFile(resolve(root, "src/button.module.scss"), ".btn {}");

      const files = await collectStyleFiles(root);
      expect(files.some((file) => file.endsWith("card.scss"))).toBe(true);
      expect(files.some((file) => file.endsWith("button.module.scss"))).toBe(false);

      const suggestions = await buildMigrationSuggestions(root);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.suggestedModuleFile.endsWith("card.module.scss")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
