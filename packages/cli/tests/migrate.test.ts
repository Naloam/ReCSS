import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { applyMigrationSuggestions } from "../src/commands/migrate.js";

describe("applyMigrationSuggestions", () => {
  it("should create module files and update imports", async () => {
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

      const suggestions = [
        {
          file: resolve(root, "src/components/card.scss"),
          suggestedModuleFile: resolve(root, "src/components/card.module.scss"),
          classNames: ["card", "card-title"],
        },
      ];

      await writeFile(
        resolve(root, "src/components/Card.tsx"),
        'import "./card.scss";\nexport const Card = () => null;\n',
        "utf8",
      );

      const result = await applyMigrationSuggestions(root, suggestions);

      expect(result.copiedFiles).toBe(1);
      expect(result.updatedSourceFiles).toBe(1);

      const updated = await readFile(resolve(root, "src/components/Card.tsx"), "utf8");
      expect(updated).toContain("./card.module.scss");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
