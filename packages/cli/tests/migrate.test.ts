import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildMigrationSuggestions } from "../src/commands/migrate.js";

describe("buildMigrationSuggestions", () => {
  it("should collect css/scss files and propose module names", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "recss-migrate-"));

    try {
      await mkdir(resolve(root, "src/components"), { recursive: true });
      await writeFile(
        resolve(root, "src/components/card.scss"),
        ".card { display: block; }\n.card-title { color: red; }",
        "utf8",
      );
      await writeFile(
        resolve(root, "src/components/button.module.scss"),
        ".btn { color: blue; }",
        "utf8",
      );

      const suggestions = await buildMigrationSuggestions(root);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.file.endsWith("card.scss")).toBe(true);
      expect(suggestions[0]?.suggestedModuleFile.endsWith("card.module.scss")).toBe(true);
      expect(suggestions[0]?.classNames).toEqual(["card", "card-title"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
