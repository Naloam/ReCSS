import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  applyMigrationSuggestions,
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

  it("should apply migration and rewrite react className literals", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "recss-core-migrate-apply-"));

    try {
      await mkdir(resolve(root, "src/components"), { recursive: true });
      await writeFile(
        resolve(root, "src/components/card.scss"),
        ".card { color: red; }\n.card-title { color: blue; }",
        "utf8",
      );
      await writeFile(
        resolve(root, "src/components/Card.tsx"),
        'import "./card.scss";\nexport const Card = () => <div className="card card-title" />;\n',
        "utf8",
      );

      const suggestions = await buildMigrationSuggestions(root);
      const result = await applyMigrationSuggestions(root, suggestions);

      expect(result.copiedFiles).toBe(1);
      expect(result.updatedSourceFiles).toBe(1);

      const rewritten = await readFile(resolve(root, "src/components/Card.tsx"), "utf8");
      expect(rewritten).toContain('import styles from "./card.module.scss";');
      expect(rewritten).toContain('className={[styles.card, styles["card-title"]].join(" ")}');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
